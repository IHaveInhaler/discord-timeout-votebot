const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { getSettings, getActiveChatters, activeVotes, boosterImmunity, voteCooldowns, activeMutes, reminderChannels, initiatorCooldowns, recordMute, recordFailedVote } = require('../utils/state');

const selfMuteReactions = [
  'Why did they vote to mute themselves?? Down bad fr.',
  'Bro really said "I deserve this" and voted to mute himself.',
  'Self-report of the century. They muted THEMSELVES.',
  'Average "I need a break from talking" enjoyer.',
  'They couldn\'t wait for someone else to do it, huh?',
  'Main character syndrome: even votes to mute themselves for attention.',
  'Most self-aware user in this server.',
];

function buildProgressBar(current, total, barLength = 16) {
  const filled = Math.round((current / total) * barLength);
  const empty = barLength - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

function getVoteLabel(settings, votes, votesNeeded) {
  if (settings.voteStyle === 'yay_nay') {
    return `Yay! Mute em (${votes}/${votesNeeded})`;
  }
  return `Vote to Mute (${votes}/${votesNeeded})`;
}

function getCancelLabel(settings) {
  if (settings.voteStyle === 'yay_nay') {
    return 'Nay!';
  }
  return 'Cancel';
}

function buildVoteEmbed(target, initiator, votes, votesNeeded, voteDuration, activeChattersCount) {
  const voterList = [...votes].map(id => `<@${id}>`).join(', ');
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('Vote Mute')
    .setDescription(`**${initiator.displayName}** has initiated a vote to mute **${target.displayName}**!`)
    .addFields(
      { name: 'Votes', value: `${votes.size}/${votesNeeded}`, inline: true },
      { name: 'Time Remaining', value: `${voteDuration}s`, inline: true },
      { name: 'Active Chatters', value: `${activeChattersCount}`, inline: true },
      { name: 'Progress', value: buildProgressBar(votes.size, votesNeeded) },
      { name: 'Voters', value: voterList || 'None' },
    )
    .setFooter({ text: 'Click the button below to cast your vote' })
    .setTimestamp();
}

async function executeMute(guild, targetId, channel, votes, settings) {
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) return;

  const muteDuration = settings.muteDuration * 60 * 1000;
  const voterMentions = [...votes].map(id => `<@${id}>`).join(', ');

  try {
    await member.timeout(muteDuration, 'Vote muted by community');

    reminderChannels.set(guild.id, channel.id);
    recordMute(guild.id, targetId, votes);

    activeMutes.set(`${guild.id}-${targetId}`, {
      expiresAt: Date.now() + muteDuration,
      channelId: channel.id,
    });
    setTimeout(() => activeMutes.delete(`${guild.id}-${targetId}`), muteDuration);

    voteCooldowns.set(`${guild.id}-${targetId}`, Date.now() + muteDuration);

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('You\'ve been vote muted!')
        .setDescription(`You have been muted in **${guild.name}** for **${settings.muteDuration} minutes** by community vote.`)
        .addFields(
          { name: 'Voted against you', value: voterMentions },
          { name: 'Tip', value: 'Boosting the server after being muted grants you 1 hour of immunity from future vote mutes!' },
        )
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] });
    } catch {}

    const summaryEmbed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle('User Muted')
      .setDescription(`**${member.displayName}** has been muted for **${settings.muteDuration} minutes**.`)
      .addFields({ name: 'Voted by', value: voterMentions })
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
  const cooldownKey = `${guild.id}-${target.id}`;
  const cooldownExpires = voteCooldowns.get(cooldownKey);
  if (!isAdmin && cooldownExpires && Date.now() < cooldownExpires) {
    const remaining = Math.ceil((cooldownExpires - Date.now()) / 60000);
    return interaction.reply({ content: `A vote mute for ${target.displayName} is on cooldown. (${remaining} min remaining)`, flags: 64 });
  }

  // Check initiator cooldown
  if (!isAdmin && settings.initiatorCooldown > 0) {
    const initKey = `${guild.id}-${interaction.user.id}`;
    const initExpires = initiatorCooldowns.get(initKey);
    if (initExpires && Date.now() < initExpires) {
      const remaining = Math.ceil((initExpires - Date.now()) / 1000);
      return interaction.reply({ content: `You need to wait **${remaining}s** before starting another vote.`, flags: 64 });
    }
  }

  // Check max active votes
  const guildVotes = [...activeVotes.entries()].filter(([k]) => k.startsWith(guild.id));
  if (guildVotes.length >= settings.maxActiveVotes) {
    return interaction.reply({ content: `Maximum active votes reached (${settings.maxActiveVotes}). Wait for a current vote to finish.`, flags: 64 });
  }

  const activeChatters = getActiveChatters(guild.id, settings.activityWindow, settings.minMessages);
  const minVotes = settings.threshold > 0.5 ? 2 : 1;
  const votesNeeded = Math.max(minVotes, Math.ceil(activeChatters.length * settings.threshold));
  const votes = new Set([interaction.user.id]);

  const embed = buildVoteEmbed(target, interaction.user, votes, votesNeeded, settings.voteDuration, activeChatters.length);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vm_vote').setLabel(getVoteLabel(settings, votes.size, votesNeeded)).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vm_cancel').setLabel(getCancelLabel(settings)).setStyle(ButtonStyle.Secondary),
  );

  if (votes.size >= votesNeeded) {
    await interaction.reply({ embeds: [embed], components: [] });
    await executeMute(guild, target.id, interaction.channel, votes, settings);
    return;
  }

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  // Self-mute reaction
  if (isSelfMute) {
    const reaction = selfMuteReactions[Math.floor(Math.random() * selfMuteReactions.length)];
    const selfEmbed = new EmbedBuilder()
      .setColor(0xffff00)
      .setDescription(reaction)
      .setTimestamp();
    interaction.channel.send({ embeds: [selfEmbed] }).catch(() => {});
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

  // Set initiator cooldown
  if (settings.initiatorCooldown > 0) {
    initiatorCooldowns.set(`${guild.id}-${interaction.user.id}`, Date.now() + settings.initiatorCooldown * 1000);
  }

  setTimeout(async () => {
    const vote = activeVotes.get(voteKey);
    if (!vote || vote.messageId !== reply.id) return;

    activeVotes.delete(voteKey);
    recordFailedVote(guild.id);

    const expiredEmbed = EmbedBuilder.from(embed)
      .setColor(0x808080)
      .setTitle('Vote Mute Expired')
      .setDescription(`Vote to mute **${target.displayName}** has expired. Only ${votes.size}/${votesNeeded} votes received.`);

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_vote').setLabel('Expired').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    try { await reply.edit({ embeds: [expiredEmbed], components: [disabledRow] }); } catch {}
  }, settings.voteDuration * 1000);
}

async function handleButton(interaction, client) {
  const guild = interaction.guild;

  // Find vote by matching messageId
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

  if (interaction.customId === 'vm_cancel') {
    if (interaction.user.id !== vote.startedBy && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only the initiator or an admin can cancel this vote.', flags: 64 });
    }

    activeVotes.delete(voteKey);

    const cancelEmbed = new EmbedBuilder()
      .setColor(0x808080)
      .setTitle('Vote Mute Cancelled')
      .setDescription('The vote mute has been cancelled.')
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

    // Self-vote on own mute — allow it but roast them
    if (interaction.user.id === vote.targetId) {
      const reaction = selfMuteReactions[Math.floor(Math.random() * selfMuteReactions.length)];
      interaction.channel.send({ embeds: [
        new EmbedBuilder().setColor(0xffff00).setDescription(reaction).setTimestamp(),
      ] }).catch(() => {});
    }

    vote.votes.add(interaction.user.id);
    const settings = getSettings(guild.id);

    if (vote.votes.size >= vote.votesNeeded) {
      activeVotes.delete(voteKey);

      const passedEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Vote Mute Passed!')
        .setDescription(`**${vote.targetTag}** has been muted for ${settings.muteDuration} minutes.`)
        .addFields(
          { name: 'Votes', value: `${vote.votes.size}/${vote.votesNeeded}`, inline: true },
          { name: 'Voters', value: [...vote.votes].map(id => `<@${id}>`).join(', ') },
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
        .setTitle('Vote Mute')
        .setDescription(`**${initiator.displayName}** has initiated a vote to mute **${vote.targetTag}**!`)
        .addFields(
          { name: 'Votes', value: `${vote.votes.size}/${vote.votesNeeded}`, inline: true },
          { name: 'Time Remaining', value: `~${remaining}s`, inline: true },
          { name: 'Progress', value: buildProgressBar(vote.votes.size, vote.votesNeeded) },
          { name: 'Voters', value: voterList },
        )
        .setFooter({ text: 'Click the button below to cast your vote' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vm_vote').setLabel(getVoteLabel(settings, vote.votes.size, vote.votesNeeded)).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('vm_cancel').setLabel(getCancelLabel(settings)).setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ embeds: [updatedEmbed], components: [row] });
    }
  }
}

module.exports = { handleVoteMute, handleButton, executeMute };
