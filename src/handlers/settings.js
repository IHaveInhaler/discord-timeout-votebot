const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { getSettings, guildSettings, getStats, getActiveChatters, activeVotes, activeMutes, reminderChannels, scheduleSave } = require('../utils/state');
const { buildBarChart, getActivityMessage } = require('../utils/display');


function buildNavButtons(currentPage) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vm_dash_0')
      .setLabel('\uD83C\uDFE0 Overview')
      .setStyle(currentPage === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId('vm_dash_1')
      .setLabel('\uD83D\uDCCA Statistics')
      .setStyle(currentPage === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId('vm_dash_2')
      .setLabel('\uD83C\uDFC6 Leaderboards')
      .setStyle(currentPage === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentPage === 2),
  );
}

function buildDashboardPages(guildId, settings) {
  const stats = getStats(guildId);
  const activeChatters = getActiveChatters(guildId, settings.activityWindow, settings.minMessages);
  const minVotes = settings.threshold > 0.5 ? 2 : 1;
  const votesNeeded = Math.max(minVotes, Math.ceil(activeChatters.length * settings.threshold));

  // === PAGE 0: Overview ===
  const immuneRolesDisplay = settings.immuneRoles.length
    ? settings.immuneRoles.map(id => `<@&${id}>`).join(', ')
    : 'None';

  const threatLevels = [
    { max: 0, label: 'GHOST TOWN', emoji: '\uD83C\uDFDA\uFE0F', color: 0x808080 },
    { max: 3, label: 'CHILL VIBES', emoji: '\u2744\uFE0F', color: 0x00ff88 },
    { max: 6, label: 'GETTING SPICY', emoji: '\uD83C\uDF36\uFE0F', color: 0xffaa00 },
    { max: 10, label: 'CHAOS BREWING', emoji: '\u26A0\uFE0F', color: 0xff6600 },
    { max: 20, label: 'ABSOLUTE MAYHEM', emoji: '\uD83D\uDD25', color: 0xff0000 },
    { max: Infinity, label: 'DEFCON 1', emoji: '\u2622\uFE0F', color: 0xff00ff },
  ];
  const threat = threatLevels.find(t => activeChatters.length <= t.max);

  const overviewEmbed = new EmbedBuilder()
    .setColor(threat.color)
    .setTitle(`${threat.emoji} Vote Mute Dashboard ${threat.emoji}`)
    .setDescription(`**Server Threat Level: ${threat.label}**\n\`\`\`\n${getActivityMessage(activeChatters.length)}\n\`\`\``)
    .addFields(
      { name: '\uD83D\uDCCA Current Status', value: [
        `**Active Chatters:** ${activeChatters.length}`,
        `**Votes Needed Now:** ${votesNeeded}`,
        `**Active Votes:** ${[...activeVotes.entries()].filter(([k]) => k.startsWith(guildId)).length}/${settings.maxActiveVotes}`,
        `**Active Mutes:** ${[...activeMutes.entries()].filter(([k]) => k.startsWith(guildId)).length}`,
      ].join('\n'), inline: true },
      { name: '\u2699\uFE0F Settings', value: [
        `**Threshold:** ${Math.round(settings.threshold * 100)}%`,
        `**Mute Duration:** ${settings.muteDuration} min`,
        `**Vote Duration:** ${settings.voteDuration}s`,
        `**Activity Window:** ${settings.activityWindow} min`,
      ].join('\n'), inline: true },
      { name: '\uD83D\uDEE1\uFE0F Immune Roles', value: immuneRolesDisplay },
    )
    .setFooter({ text: 'Page 1/3 \u2022 Use buttons to navigate' })
    .setTimestamp();

  // === PAGE 1: Statistics ===
  const successRate = stats.totalMutes + stats.failedVotes > 0
    ? Math.round((stats.totalMutes / (stats.totalMutes + stats.failedVotes)) * 100)
    : 0;
  const avgVotesPerMute = stats.totalMutes > 0
    ? (stats.totalVotes / stats.totalMutes).toFixed(1)
    : '0';
  const totalMinutesMuted = stats.totalMutes * settings.muteDuration;

  const statsEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('\uD83D\uDCCA All-Time Statistics')
    .addFields(
      { name: 'Total Mutes', value: `**${stats.totalMutes}**`, inline: true },
      { name: 'Total Votes Cast', value: `**${stats.totalVotes}**`, inline: true },
      { name: 'Failed Votes', value: `**${stats.failedVotes}**`, inline: true },
      { name: 'Success Rate', value: `**${successRate}%**`, inline: true },
      { name: 'Avg Votes/Mute', value: `**${avgVotesPerMute}**`, inline: true },
      { name: 'Unauthorized Unmutes', value: `**${stats.unauthorizedUnmutes}**`, inline: true },
      { name: 'Total Silence Time', value: `**${totalMinutesMuted}** minutes (${(totalMinutesMuted / 60).toFixed(1)} hours)`, inline: false },
    );

  if (stats.totalMutes > 0) {
    const blocks = [];
    const blockLabels = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-00'];
    for (let i = 0; i < 24; i += 4) {
      blocks.push(stats.hourlyMutes.slice(i, i + 4).reduce((a, b) => a + b, 0));
    }
    const chart = buildBarChart(blocks, blockLabels, 10);
    statsEmbed.addFields({ name: '\uD83D\uDD52 Mutes by Time of Day (GMT)', value: chart });
  }

  // Recent mute history
  if (stats.muteHistory.length > 0) {
    const recent = stats.muteHistory.slice(-5).reverse();
    const historyLines = recent.map(h => {
      const timeAgo = Math.floor((Date.now() - h.timestamp) / 60000);
      const timeStr = timeAgo < 1 ? 'just now' : timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;
      return `<@${h.targetId}> \u2014 ${timeStr} (${h.voterIds.length} votes)`;
    });
    statsEmbed.addFields({ name: '\uD83D\uDCDC Recent Mutes', value: historyLines.join('\n') });
  }

  statsEmbed.setFooter({ text: 'Page 2/3 \u2022 Use buttons to navigate' }).setTimestamp();

  // === PAGE 2: Leaderboards ===
  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49', '4.', '5.'];

  const mostMuted = [...stats.users.entries()]
    .filter(([, s]) => s.timesMuted > 0)
    .sort((a, b) => b[1].timesMuted - a[1].timesMuted)
    .slice(0, 5);

  const mutedList = mostMuted.length
    ? mostMuted.map(([id, s], i) => `${medals[i]} <@${id}> \u2014 muted **${s.timesMuted}x**${s.muteStreak > 1 ? ` (\uD83D\uDD25 ${s.muteStreak} streak!)` : ''}`).join('\n')
    : '*No one has been muted yet. Suspicious...*';

  const mostTriggerHappy = [...stats.users.entries()]
    .filter(([, s]) => s.timesVoted > 0)
    .sort((a, b) => b[1].timesVoted - a[1].timesVoted)
    .slice(0, 5);

  const voterList = mostTriggerHappy.length
    ? mostTriggerHappy.map(([id, s], i) => `${medals[i]} <@${id}> \u2014 **${s.timesVoted}** votes cast`).join('\n')
    : '*No votes cast yet. Too peaceful.*';

  const silentWarriors = [...stats.users.entries()]
    .filter(([, s]) => s.timesVoted >= 2 && s.timesMuted === 0)
    .sort((a, b) => b[1].timesVoted - a[1].timesVoted)
    .slice(0, 3);

  const silentList = silentWarriors.length
    ? silentWarriors.map(([id, s], i) => `${medals[i]} <@${id}> \u2014 **${s.timesVoted}** votes, **0** mutes received`).join('\n')
    : '*Everyone who votes also gets voted on. Karma.*';

  const mostTimeMuted = [...stats.users.entries()]
    .filter(([, s]) => s.timesMuted > 0)
    .sort((a, b) => b[1].timesMuted - a[1].timesMuted)
    .slice(0, 3);

  const timeList = mostTimeMuted.length
    ? mostTimeMuted.map(([id, s], i) => {
        const mins = s.timesMuted * settings.muteDuration;
        const display = mins >= 60 ? `${(mins / 60).toFixed(1)} hrs` : `${mins} min`;
        return `${medals[i]} <@${id}> \u2014 **${display}** in the shadow realm`;
      }).join('\n')
    : '*The shadow realm is empty... for now.*';

  let topRivalry = null;
  let topRivalryCount = 0;
  for (const [, userStats] of stats.users) {
    if (userStats.votedAgainst) {
      for (const [targetId, count] of userStats.votedAgainst) {
        if (count > topRivalryCount) {
          topRivalryCount = count;
          // need to find who this voter is
          for (const [uid, us] of stats.users) {
            if (us.votedAgainst && us.votedAgainst.get(targetId) === count) {
              topRivalry = { voter: uid, target: targetId, count };
              break;
            }
          }
        }
      }
    }
  }

  const leaderboardEmbed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle('\uD83C\uDFC6 Hall of Shame & Glory')
    .addFields(
      { name: '\uD83D\uDD07 Most Muted', value: mutedList, inline: true },
      { name: '\u2694\uFE0F Most Trigger-Happy', value: voterList, inline: true },
      { name: '\uD83D\uDC7B Silent Warriors', value: silentList },
      { name: '\u23F0 Most Time in Shadow Realm', value: timeList },
    );

  if (topRivalry) {
    leaderboardEmbed.addFields({
      name: '\uD83C\uDFAF Top Rivalry',
      value: `<@${topRivalry.voter}> voted against <@${topRivalry.target}> **${topRivalry.count}** times. Get a room.`,
    });
  }

  // Fun facts
  const funFacts = [];
  if (stats.totalMutes > 0) {
    const mostMutedUser = mostMuted[0];
    if (mostMutedUser && mostMutedUser[1].timesMuted >= 3) {
      funFacts.push(`<@${mostMutedUser[0]}> has spent **${mostMutedUser[1].timesMuted * settings.muteDuration} minutes** in timeout. Maybe consider a lifestyle change?`);
    }
    if (stats.unauthorizedUnmutes > 0) {
      funFacts.push(`**${stats.unauthorizedUnmutes}** people tried to be heroes and unmute someone. They learned the hard way.`);
    }
    if (stats.failedVotes > stats.totalMutes) {
      funFacts.push(`More votes have failed than succeeded. This server is too forgiving.`);
    }
    if (stats.totalMutes > stats.failedVotes * 2) {
      funFacts.push(`This server mutes people at an alarming rate. Seek help.`);
    }
    if (silentWarriors.length > 0) {
      funFacts.push(`${silentWarriors.length} people have voted to mute others but never been muted themselves. Untouchable legends.`);
    }
  }

  if (funFacts.length > 0) {
    leaderboardEmbed.addFields({ name: '\uD83D\uDCA1 Fun Facts', value: funFacts.join('\n') });
  }

  leaderboardEmbed.setFooter({ text: 'Page 3/3 \u2022 Use buttons to navigate' }).setTimestamp();

  return [overviewEmbed, statsEmbed, leaderboardEmbed];
}

async function handleVmSettings(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    return handleView(interaction);
  }

  if (subcommand === 'configure') {
    return handleConfigure(interaction);
  }

  if (subcommand === 'setup') {
    return handleSetup(interaction);
  }
}

async function handleSetup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Only administrators can run setup.', flags: 64 });
  }

  const guild = interaction.guild;
  const me = guild.members.me;
  const settings = getSettings(guild.id);

  // Permission checks
  const requiredPerms = [
    { flag: PermissionFlagsBits.ModerateMembers, name: 'Timeout Members' },
    { flag: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
    { flag: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
    { flag: PermissionFlagsBits.ViewAuditLog, name: 'View Audit Log' },
    { flag: PermissionFlagsBits.ReadMessageHistory, name: 'Read Message History' },
  ];
  const permChecks = requiredPerms.map(p => `${me.permissions.has(p.flag) ? '\u2705' : '\u274C'} ${p.name}`);
  const allPermsOk = requiredPerms.every(p => me.permissions.has(p.flag));

  // Role hierarchy
  const botRole = me.roles.highest;
  const roleStatus = botRole.position > 1
    ? `\u2705 **${botRole.name}** at position ${botRole.position}/${guild.roles.cache.size - 1}`
    : '\u26A0\uFE0F Bot role is very low — move it higher';

  // Detect moderation bots
  const knownBots = [
    { name: 'Wick', ids: ['536991182035746816'], guide: 'wickbot.com/dashboard > Whitelist > Whitelisted Bots' },
    { name: 'Dyno', ids: ['155149108183695360'], guide: 'dyno.gg/manage > Automod > Whitelist' },
    { name: 'MEE6', ids: ['159985870458322944'], guide: 'No action needed usually' },
    { name: 'Carl-bot', ids: ['235148962103951360'], guide: 'carl.gg/dashboard > Automod > Whitelist' },
  ];
  const detectedBots = [];
  for (const bot of knownBots) {
    for (const id of bot.ids) {
      if (await guild.members.fetch(id).catch(() => null)) { detectedBots.push(bot); break; }
    }
  }

  // Current settings summary
  const channelDisplay = settings.botChannelId ? `<#${settings.botChannelId}>` : 'Not set (uses any channel)';

  const embed = new EmbedBuilder()
    .setColor(allPermsOk ? 0x5865f2 : 0xff4444)
    .setTitle('\uD83D\uDD27 Vote Mute Setup Wizard')
    .setDescription('Welcome! Use the buttons below to configure your bot step by step.')
    .addFields(
      { name: '\uD83D\uDD10 Permissions', value: permChecks.join('\n') },
      { name: '\uD83D\uDCCB Role Hierarchy', value: roleStatus },
      { name: '\uD83E\uDD16 Bot ID (for whitelisting)', value: `\`${me.id}\`` },
      { name: '\u2699\uFE0F Current Settings', value: [
        `**Threshold:** ${Math.round(settings.threshold * 100)}%`,
        `**Mute Duration:** ${settings.muteDuration} min`,
        `**Vote Duration:** ${settings.voteDuration}s`,
        `**Max Active Votes:** ${settings.maxActiveVotes}`,
        `**Initiator Cooldown:** ${settings.initiatorCooldown ? settings.initiatorCooldown + 's' : 'OFF'}`,
        `**Vote Style:** ${settings.voteStyle === 'yay_nay' ? 'Yay/Nay' : 'Default'}`,
        `**Bot Channel:** ${channelDisplay}`,
        `**Reminders:** ${settings.remindersEnabled ? 'ON' : 'OFF'}`,
        `**Callouts:** ${settings.calloutsEnabled ? 'ON' : 'OFF'}`,
      ].join('\n') },
    );

  if (detectedBots.length > 0) {
    embed.addFields({
      name: '\u26A0\uFE0F Moderation Bots Detected',
      value: detectedBots.map(b => `**${b.name}** — ${b.guide}`).join('\n'),
    });
  } else {
    embed.addFields({ name: '\u2705 No Mod Bot Conflicts', value: 'No known moderation bots detected.' });
  }

  embed.setFooter({ text: 'Use the buttons below to configure settings or select a bot channel' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vm_setup_defaults').setLabel('Use Defaults').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('vm_setup_configure').setLabel('Open Configure').setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('vm_setup_channel')
      .setPlaceholder('Select bot channel (announcements, reminders, callouts)')
      .setChannelTypes(ChannelType.GuildText),
  );

  return interaction.reply({ embeds: [embed], components: [row1, row2], flags: 64 });
}

async function handleSetupButton(interaction) {
  if (interaction.customId === 'vm_setup_defaults') {
    const { DEFAULT_SETTINGS } = require('../utils/state');
    const settings = { ...DEFAULT_SETTINGS };
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('\u2705 Defaults Applied')
      .setDescription('All settings have been reset to defaults. Use `/vm configure` to tweak individual settings anytime.');

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (interaction.customId === 'vm_setup_configure') {
    // Just redirect them to configure
    return handleConfigure(interaction);
  }
}

async function handleSetupChannel(interaction) {
  if (interaction.customId !== 'vm_setup_channel') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Only administrators can change settings.', flags: 64 });
  }

  const channelId = interaction.values[0];
  const settings = getSettings(interaction.guild.id);
  settings.botChannelId = channelId;
  guildSettings.set(interaction.guild.id, settings);
  scheduleSave(interaction.guild.id);
  reminderChannels.set(interaction.guild.id, channelId);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('\u2705 Bot Channel Set')
    .setDescription(`All bot announcements, reminders, and callouts will now go to <#${channelId}>.`);

  return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleView(interaction) {
  const settings = getSettings(interaction.guild.id);
  const pages = buildDashboardPages(interaction.guild.id, settings);

  return interaction.reply({
    embeds: [pages[0]],
    components: [buildNavButtons(0)],
    flags: 64,
  });
}

async function handleDashboardButton(interaction) {
  const page = parseInt(interaction.customId.replace('vm_dash_', ''), 10);
  const settings = getSettings(interaction.guild.id);
  const pages = buildDashboardPages(interaction.guild.id, settings);

  await interaction.update({
    embeds: [pages[page]],
    components: [buildNavButtons(page)],
  });
}

async function handleConfigure(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Only administrators can change vote mute settings.', flags: 64 });
  }

  const settings = getSettings(interaction.guild.id);

  const immuneDisplay = settings.immuneRoles.length
    ? settings.immuneRoles.map(id => `<@&${id}>`).join(', ')
    : 'None';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Vote Mute Configuration')
    .setDescription('Select a setting to change from the menu below.')
    .addFields(
      { name: 'Required % for Vote', value: `${Math.round(settings.threshold * 100)}%`, inline: true },
      { name: 'Mute Duration', value: `${settings.muteDuration} min`, inline: true },
      { name: 'Vote Duration', value: `${settings.voteDuration}s`, inline: true },
      { name: 'Activity Window', value: `${settings.activityWindow} min`, inline: true },
      { name: 'Immune Roles', value: immuneDisplay },
    );

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('vm_config_select')
      .setPlaceholder('Choose a setting to change...')
      .addOptions(
        { label: 'Required % for Vote', description: `Currently: ${Math.round(settings.threshold * 100)}%`, value: 'threshold' },
        { label: 'Mute Duration', description: `Currently: ${settings.muteDuration} min`, value: 'mute_duration' },
        { label: 'Vote Duration', description: `Currently: ${settings.voteDuration}s`, value: 'vote_duration' },
        { label: 'Activity Window', description: `Currently: ${settings.activityWindow} min`, value: 'activity_window' },
        { label: 'Immune Roles', description: `Currently: ${settings.immuneRoles.length} role(s)`, value: 'immune_roles' },
        { label: 'Periodic Reminders', description: `Currently: ${settings.remindersEnabled ? 'ON' : 'OFF'}`, value: 'reminders' },
        { label: 'Random Callouts', description: `Currently: ${settings.calloutsEnabled ? 'ON' : 'OFF'}`, value: 'callouts' },
        { label: 'Vote Button Style', description: `Currently: ${settings.voteStyle === 'yay_nay' ? 'Yay/Nay' : 'Vote to Mute'}`, value: 'vote_style' },
        { label: 'Max Active Votes', description: `Currently: ${settings.maxActiveVotes}`, value: 'max_active_votes' },
        { label: 'Initiator Cooldown', description: `Currently: ${settings.initiatorCooldown ? settings.initiatorCooldown + 's' : 'OFF'}`, value: 'initiator_cooldown' },
        { label: 'Allow Self-Mute', description: `Currently: ${settings.allowSelfMute ? 'ON' : 'OFF'}`, value: 'allow_self_mute' },
        { label: 'Min Messages for Active', description: `Currently: ${settings.minMessages}`, value: 'min_messages' },
      ),
  );

  return interaction.reply({ embeds: [embed], components: [selectMenu], flags: 64 });
}

async function handleSelectMenu(interaction) {
  if (interaction.customId === 'vm_immune_roles') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only administrators can change settings.', flags: 64 });
    }

    const settings = getSettings(interaction.guild.id);
    settings.immuneRoles = interaction.values;
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const rolesDisplay = settings.immuneRoles.length
      ? settings.immuneRoles.map(id => `<@&${id}>`).join(', ')
      : 'None';

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setting Updated')
      .setDescription(`**Immune Roles** set to: ${rolesDisplay}`)
      .addFields(
        { name: 'Required % for Vote', value: `${Math.round(settings.threshold * 100)}%`, inline: true },
        { name: 'Mute Duration', value: `${settings.muteDuration} min`, inline: true },
        { name: 'Vote Duration', value: `${settings.voteDuration}s`, inline: true },
        { name: 'Activity Window', value: `${settings.activityWindow} min`, inline: true },
        { name: 'Immune Roles', value: rolesDisplay },
      );

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (interaction.customId !== 'vm_config_select') return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Only administrators can change settings.', flags: 64 });
  }

  const selected = interaction.values[0];

  if (selected === 'reminders') {
    const settings = getSettings(interaction.guild.id);
    settings.remindersEnabled = !settings.remindersEnabled;
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    if (settings.remindersEnabled) {
      reminderChannels.set(interaction.guild.id, interaction.channel.id);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setting Updated')
      .setDescription(`**Periodic Reminders** are now **${settings.remindersEnabled ? 'ON' : 'OFF'}**${settings.remindersEnabled ? '\nReminders will be sent to this channel every 2 hours.' : ''}`);

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (selected === 'allow_self_mute') {
    const settings = getSettings(interaction.guild.id);
    settings.allowSelfMute = !settings.allowSelfMute;
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setting Updated')
      .setDescription(`**Allow Self-Mute** is now **${settings.allowSelfMute ? 'ON' : 'OFF'}**${settings.allowSelfMute ? '\nUsers can initiate vote mutes on themselves. Chaos.' : ''}`);

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (selected === 'vote_style') {
    const settings = getSettings(interaction.guild.id);
    settings.voteStyle = settings.voteStyle === 'yay_nay' ? 'default' : 'yay_nay';
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const styleName = settings.voteStyle === 'yay_nay' ? 'Yay / Nay' : 'Vote to Mute';
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setting Updated')
      .setDescription(`**Vote Button Style** is now **${styleName}**`);

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (selected === 'callouts') {
    const settings = getSettings(interaction.guild.id);
    settings.calloutsEnabled = !settings.calloutsEnabled;
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    if (settings.calloutsEnabled) {
      reminderChannels.set(interaction.guild.id, interaction.channel.id);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setting Updated')
      .setDescription(`**Random Callouts** are now **${settings.calloutsEnabled ? 'ON' : 'OFF'}**${settings.calloutsEnabled ? '\nThe bot will randomly call out users based on their mute stats every ~45 minutes.' : ''}`);

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (selected === 'immune_roles') {
    const roleSelect = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('vm_immune_roles')
        .setPlaceholder('Select immune roles (or deselect all to clear)')
        .setMinValues(0)
        .setMaxValues(10),
    );

    return interaction.reply({ content: 'Select the roles that should be immune to vote mutes:', components: [roleSelect], flags: 64 });
  }

  const labels = {
    threshold: { title: 'Required % for Vote', placeholder: 'Enter percentage (1-100)', min: '1', max: '100' },
    mute_duration: { title: 'Mute Duration (minutes)', placeholder: 'Enter minutes (1-60)', min: '1', max: '60' },
    vote_duration: { title: 'Vote Duration (seconds)', placeholder: 'Enter seconds (10-300)', min: '10', max: '300' },
    activity_window: { title: 'Activity Window (minutes)', placeholder: 'Enter minutes (1-30)', min: '1', max: '30' },
    max_active_votes: { title: 'Max Active Votes', placeholder: 'Enter number (1-10)', min: '1', max: '10' },
    initiator_cooldown: { title: 'Initiator Cooldown (seconds)', placeholder: 'Enter seconds (0=off, max 600)', min: '0', max: '600' },
    min_messages: { title: 'Min Messages for Active', placeholder: 'Enter number (1-20)', min: '1', max: '20' },
  };

  const info = labels[selected];

  const modal = new ModalBuilder()
    .setCustomId(`vm_config_modal_${selected}`)
    .setTitle(`Edit: ${info.title}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(`${info.title} (${info.min}-${info.max})`)
          .setPlaceholder(info.placeholder)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3),
      ),
    );

  await interaction.showModal(modal);
}

async function handleModal(interaction) {
  if (!interaction.customId.startsWith('vm_config_modal_')) return;

  const setting = interaction.customId.replace('vm_config_modal_', '');
  const rawValue = parseInt(interaction.fields.getTextInputValue('value'), 10);

  if (isNaN(rawValue)) {
    return interaction.reply({ content: 'Please enter a valid number.', flags: 64 });
  }

  const limits = {
    threshold: { min: 1, max: 100 },
    mute_duration: { min: 1, max: 60 },
    vote_duration: { min: 10, max: 300 },
    activity_window: { min: 1, max: 30 },
    max_active_votes: { min: 1, max: 10 },
    initiator_cooldown: { min: 0, max: 600 },
    min_messages: { min: 1, max: 20 },
  };

  const { min, max } = limits[setting];
  if (rawValue < min || rawValue > max) {
    return interaction.reply({ content: `Value must be between ${min} and ${max}.`, flags: 64 });
  }

  const settings = getSettings(interaction.guild.id);

  const settingNames = {
    threshold: 'Required % for Vote',
    mute_duration: 'Mute Duration',
    vote_duration: 'Vote Duration',
    activity_window: 'Activity Window',
    max_active_votes: 'Max Active Votes',
    initiator_cooldown: 'Initiator Cooldown',
    min_messages: 'Min Messages for Active',
  };

  let displayValue;
  if (setting === 'threshold') {
    settings.threshold = rawValue / 100;
    displayValue = `${rawValue}%`;
  } else if (setting === 'mute_duration') {
    settings.muteDuration = rawValue;
    displayValue = `${rawValue} min`;
  } else if (setting === 'vote_duration') {
    settings.voteDuration = rawValue;
    displayValue = `${rawValue}s`;
  } else if (setting === 'activity_window') {
    settings.activityWindow = rawValue;
    displayValue = `${rawValue} min`;
  } else if (setting === 'max_active_votes') {
    settings.maxActiveVotes = rawValue;
    displayValue = `${rawValue}`;
  } else if (setting === 'initiator_cooldown') {
    settings.initiatorCooldown = rawValue;
    displayValue = rawValue === 0 ? 'OFF' : `${rawValue}s`;
  } else if (setting === 'min_messages') {
    settings.minMessages = rawValue;
    displayValue = `${rawValue}`;
  }

  guildSettings.set(interaction.guild.id, settings);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Setting Updated')
    .setDescription(`**${settingNames[setting]}** has been set to **${displayValue}**`)
    .addFields(
      { name: 'Required % for Vote', value: `${Math.round(settings.threshold * 100)}%`, inline: true },
      { name: 'Mute Duration', value: `${settings.muteDuration} min`, inline: true },
      { name: 'Vote Duration', value: `${settings.voteDuration}s`, inline: true },
      { name: 'Activity Window', value: `${settings.activityWindow} min`, inline: true },
    );

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('vm_config_select')
      .setPlaceholder('Change another setting...')
      .addOptions(
        { label: 'Required % for Vote', description: `Currently: ${Math.round(settings.threshold * 100)}%`, value: 'threshold' },
        { label: 'Mute Duration', description: `Currently: ${settings.muteDuration} min`, value: 'mute_duration' },
        { label: 'Vote Duration', description: `Currently: ${settings.voteDuration}s`, value: 'vote_duration' },
        { label: 'Activity Window', description: `Currently: ${settings.activityWindow} min`, value: 'activity_window' },
      ),
  );

  await interaction.reply({ embeds: [embed], components: [selectMenu], flags: 64 });
}

module.exports = { handleVmSettings, handleSelectMenu, handleModal, handleDashboardButton, handleSetupButton, handleSetupChannel };
