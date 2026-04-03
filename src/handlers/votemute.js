const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { getSettings, getStats, getActiveChatters, activeVotes, boosterImmunity, voteCooldowns, activeMutes, reminderChannels, initiatorCooldowns, recordMute, recordFailedVote } = require('../utils/state');
const { getTheme, getSelfMuteReactions } = require('../utils/display');
const { auditLog } = require('../utils/audit');

let _client = null;
function setClient(client) { _client = client; }

function buildProgressBar(current, total, barLength = 16) {
  const filled = Math.round((current / total) * barLength);
  const empty = barLength - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

function getEffectiveMuteDuration(guild, targetId, settings) {
  let muteMins = settings.muteDuration;
  if (settings.exponentialMuting) {
    const stats = getStats(guild.id);
    const userStats = stats.users.get(targetId);
    if (userStats && userStats.lastMuted) {
      const timeSinceLastMute = Date.now() - userStats.lastMuted;
      if (timeSinceLastMute < 30 * 60 * 1000) {
        const multiplier = Math.pow(2, userStats.muteStreak);
        muteMins = Math.min(settings.muteDuration * multiplier, 120);
      } else {
        userStats.muteStreak = 0;
      }
    }
  }
  return muteMins;
}

function t(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, val);
  }
  return result;
}

function buildVoteEmbed(target, initiator, votes, votesNeeded, voteDuration, activeChattersCount, theme) {
  const voterList = [...votes].map(id => `<@${id}>`).join(', ');
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle(theme.voteTitle)
    .setDescription(t(theme.voteDescription, { initiator: initiator.displayName, target: target.displayName }))
    .addFields(
      { name: 'Votes', value: `${votes.size}/${votesNeeded}`, inline: true },
      { name: 'Time Remaining', value: `${voteDuration}s`, inline: true },
      { name: theme.activeLabel, value: `${activeChattersCount}`, inline: true },
      { name: theme.progressLabel, value: buildProgressBar(votes.size, votesNeeded) },
      { name: theme.votersLabel, value: voterList || 'None' },
    )
    .setFooter({ text: theme.footerText })
    .setTimestamp();
}

async function executeMute(guild, targetId, channel, votes, settings) {
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) return;

  const theme = getTheme(settings.theme);
  const muteMins = getEffectiveMuteDuration(guild, targetId, settings);
  const muteDuration = muteMins * 60 * 1000;

  // Build voter list with (really?) for self-voters
  const voterMentions = [...votes].map(id => {
    const mention = `<@${id}>`;
    return id === targetId ? `${mention} *(really?)*` : mention;
  }).join(', ');

  try {
    await member.timeout(muteDuration, 'Vote muted by community');

    reminderChannels.set(guild.id, channel.id);
    recordMute(guild.id, targetId, votes);

    const durationDisplay = muteMins !== settings.muteDuration ? `${muteMins} min (exponential)` : `${muteMins} min`;
    auditLog(_client, guild.id, {
      action: 'MUTED',
      target: targetId,
      details: `${votes.size} votes \u2022 ${durationDisplay}`,
      color: 0xff4444,
    });

    activeMutes.set(`${guild.id}-${targetId}`, {
      expiresAt: Date.now() + muteDuration,
      channelId: channel.id,
    });
    setTimeout(() => activeMutes.delete(`${guild.id}-${targetId}`), muteDuration);

    voteCooldowns.set(`${guild.id}-${targetId}`, Date.now() + muteDuration);

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle(theme.dmTitle)
        .setDescription(t(theme.dmDescription, { server: guild.name, duration: muteMins, target: member.displayName }))
        .addFields(
          { name: theme.dmVotersLabel, value: voterMentions },
          { name: 'Tip', value: theme.dmTip },
        )
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] });
    } catch {}

    const summaryEmbed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle(theme.userMutedTitle)
      .setDescription(t(theme.userMutedDescription, { target: member.displayName, duration: muteMins }))
      .addFields({ name: theme.dmVotersLabel, value: voterMentions })
      .setTimestamp();

    await channel.send({ embeds: [summaryEmbed] });
  } catch {
    await channel.send(`Failed to mute ${member.displayName}. Make sure I have the **Timeout Members** permission and my role is above theirs.`);
  }
}

async function handleVoteMute(interaction) {
  const target = interaction.options.getUser('user');
  const guild = interaction.guild;
  const settings = getSettings(guild.id);
  const theme = getTheme(settings.theme);

  if (target.bot) {
    return interaction.reply({ content: 'You cannot vote mute a bot.', flags: 64 });
  }

  const isSelfMute = target.id === interaction.user.id;

  if (isSelfMute && !settings.allowSelfMute) {
    return interaction.reply({ content: 'Self-muting is disabled on this server.', flags: 64 });
  }

  const targetMember = await guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: 'That user is not in this server.', flags: 64 });
  }

  if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'You cannot vote mute an administrator.', flags: 64 });
  }

  if (settings.immuneRoles.length > 0 && targetMember.roles.cache.some(r => settings.immuneRoles.includes(r.id))) {
    return interaction.reply({ content: `${target.displayName} has an immune role and cannot be vote muted.`, flags: 64 });
  }

  const immunityKey = `${guild.id}-${target.id}`;
  const immunityExpires = boosterImmunity.get(immunityKey);
  if (immunityExpires && Date.now() < immunityExpires) {
    const remaining = Math.ceil((immunityExpires - Date.now()) / 60000);
    return interaction.reply({ content: `${target.displayName} has booster immunity! (${remaining} min remaining)`, flags: 64 });
  }

  const isAdmin = interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
  const isManager = settings.managerRoleId && interaction.member.roles.cache.has(settings.managerRoleId);
  const cooldownKey = `${guild.id}-${target.id}`;
  const cooldownExpires = voteCooldowns.get(cooldownKey);
  if (!isAdmin && !isManager && cooldownExpires && Date.now() < cooldownExpires) {
    const remaining = Math.ceil((cooldownExpires - Date.now()) / 60000);
    return interaction.reply({ content: `A vote mute for ${target.displayName} is on cooldown. (${remaining} min remaining)`, flags: 64 });
  }

  if (!isAdmin && !isManager && settings.initiatorCooldown > 0) {
    const initKey = `${guild.id}-${interaction.user.id}`;
    const initExpires = initiatorCooldowns.get(initKey);
    if (initExpires && Date.now() < initExpires) {
      const remaining = Math.ceil((initExpires - Date.now()) / 1000);
      return interaction.reply({ content: `You need to wait **${remaining}s** before starting another vote.`, flags: 64 });
    }
  }

  const guildVotes = [...activeVotes.entries()].filter(([k]) => k.startsWith(guild.id));
  if (guildVotes.length >= settings.maxActiveVotes) {
    return interaction.reply({ content: `Maximum active votes reached (${settings.maxActiveVotes}). Wait for a current vote to finish.`, flags: 64 });
  }

  const activeChatters = getActiveChatters(guild.id, settings.activityWindow, settings.minMessages);
  const minVotes = settings.threshold > 0.5 ? 2 : 1;
  const votesNeeded = Math.max(minVotes, Math.ceil(activeChatters.length * settings.threshold));
  const votes = new Set([interaction.user.id]);

  const embed = buildVoteEmbed(target, interaction.user, votes, votesNeeded, settings.voteDuration, activeChatters.length, theme);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vm_vote').setLabel(t(theme.voteButton, { votes: votes.size, needed: votesNeeded })).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vm_cancel').setLabel(theme.cancelButton).setStyle(ButtonStyle.Secondary),
  );

  if (votes.size >= votesNeeded) {
    await interaction.reply({ embeds: [embed], components: [] });
    await executeMute(guild, target.id, interaction.channel, votes, settings);
    return;
  }

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  if (isSelfMute) {
    const reactions = getSelfMuteReactions(settings.theme);
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    interaction.channel.send({ embeds: [
      new EmbedBuilder().setColor(0xffff00).setDescription(reaction).setTimestamp(),
    ] }).catch(() => {});
  }

  const voteKey = `${guild.id}-${target.id}`;
  activeVotes.set(voteKey, {
    guildId: guild.id,
    targetId: target.id,
    targetTag: target.displayName,
    votes,
    startedBy: interaction.user.id,
    startedAt: Date.now(),
    messageId: reply.id,
    channelId: interaction.channel.id,
    votesNeeded,
  });

  auditLog(_client, guild.id, {
    action: 'VOTE STARTED',
    target: target.id,
    executor: interaction.user.id,
    details: `${votesNeeded} votes needed \u2022 ${settings.voteDuration}s`,
    color: 0xffa500,
  });

  if (settings.initiatorCooldown > 0) {
    initiatorCooldowns.set(`${guild.id}-${interaction.user.id}`, Date.now() + settings.initiatorCooldown * 1000);
  }

  setTimeout(async () => {
    const vote = activeVotes.get(voteKey);
    if (!vote || vote.messageId !== reply.id) return;

    activeVotes.delete(voteKey);
    recordFailedVote(guild.id);

    auditLog(_client, guild.id, {
      action: 'VOTE EXPIRED',
      target: target.id,
      details: `${votes.size}/${votesNeeded} votes`,
      color: 0x808080,
    });

    const expiredEmbed = EmbedBuilder.from(embed)
      .setColor(0x808080)
      .setTitle(theme.voteExpired)
      .setDescription(t(theme.voteExpiredDescription, { target: target.displayName, votes: votes.size, needed: votesNeeded }));

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_vote').setLabel('Expired').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    try { await reply.edit({ embeds: [expiredEmbed], components: [disabledRow] }); } catch {}
  }, settings.voteDuration * 1000);
}

async function handleButton(interaction, client) {
  const guild = interaction.guild;

  let voteKey = null;
  let vote = null;
  for (const [key, v] of activeVotes) {
    if (v.messageId === interaction.message.id) {
      voteKey = key;
      vote = v;
      break;
    }
  }

  if (!vote) {
    return interaction.reply({ content: 'This vote has expired.', flags: 64 });
  }

  const settings = getSettings(guild.id);
  const theme = getTheme(settings.theme);

  if (interaction.customId === 'vm_cancel') {
    const isAdmin = interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
    const isManager = settings.managerRoleId && interaction.member.roles.cache.has(settings.managerRoleId);
    if (interaction.user.id !== vote.startedBy && !isAdmin && !isManager) {
      return interaction.reply({ content: 'Only the initiator, an admin, or a bot manager can cancel this vote.', flags: 64 });
    }

    activeVotes.delete(voteKey);

    auditLog(_client, guild.id, {
      action: 'VOTE CANCELLED',
      target: vote.targetId,
      executor: interaction.user.id,
      color: 0x808080,
    });

    const cancelEmbed = new EmbedBuilder()
      .setColor(0x808080)
      .setTitle(theme.voteCancelled)
      .setDescription('The vote has been cancelled.')
      .setTimestamp();

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_vote').setLabel('Cancelled').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    await interaction.update({ embeds: [cancelEmbed], components: [disabledRow] });
    return;
  }

  if (interaction.customId === 'vm_vote') {
    if (vote.votes.has(interaction.user.id)) {
      return interaction.reply({ content: 'You have already voted.', flags: 64 });
    }

    if (interaction.user.id === vote.targetId) {
      const reactions = getSelfMuteReactions(settings.theme);
      const reaction = reactions[Math.floor(Math.random() * reactions.length)];
      interaction.channel.send({ embeds: [
        new EmbedBuilder().setColor(0xffff00).setDescription(reaction).setTimestamp(),
      ] }).catch(() => {});
    }

    vote.votes.add(interaction.user.id);

    if (vote.votes.size >= vote.votesNeeded) {
      activeVotes.delete(voteKey);

      const effectiveDuration = getEffectiveMuteDuration(guild, vote.targetId, settings);
      const passedEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(theme.votePassed)
        .setDescription(t(theme.votePassedDescription, { target: vote.targetTag, duration: effectiveDuration }))
        .addFields(
          { name: 'Votes', value: `${vote.votes.size}/${vote.votesNeeded}`, inline: true },
          { name: theme.votersLabel, value: [...vote.votes].map(id => `<@${id}>`).join(', ') },
        )
        .setTimestamp();

      await interaction.update({ embeds: [passedEmbed], components: [] });
      await executeMute(guild, vote.targetId, interaction.channel, vote.votes, settings);
    } else {
      const elapsed = Math.floor((Date.now() - vote.startedAt) / 1000);
      const remaining = Math.max(0, settings.voteDuration - elapsed);
      const initiator = await client.users.fetch(vote.startedBy);
      const voterList = [...vote.votes].map(id => `<@${id}>`).join(', ');

      const updatedEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle(theme.voteTitle)
        .setDescription(t(theme.voteDescription, { initiator: initiator.displayName, target: vote.targetTag }))
        .addFields(
          { name: 'Votes', value: `${vote.votes.size}/${vote.votesNeeded}`, inline: true },
          { name: 'Time Remaining', value: `~${remaining}s`, inline: true },
          { name: theme.progressLabel, value: buildProgressBar(vote.votes.size, vote.votesNeeded) },
          { name: theme.votersLabel, value: voterList },
        )
        .setFooter({ text: theme.footerText })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vm_vote').setLabel(t(theme.voteButton, { votes: vote.votes.size, needed: vote.votesNeeded })).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('vm_cancel').setLabel(theme.cancelButton).setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ embeds: [updatedEmbed], components: [row] });
    }
  }
}

module.exports = { handleVoteMute, handleButton, executeMute, setClient };
