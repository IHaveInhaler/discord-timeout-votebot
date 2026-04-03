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

  if (subcommand === 'theme') {
    return handleTheme(interaction);
  }
}

const WICK_ID = '536991182035746816';

function getSetupPages(hasWick) {
  const pages = ['permissions', 'watch_channel', 'audit_channel'];
  if (hasWick) pages.push('wick');
  pages.push('vote_settings', 'fun_stuff', 'summary');
  return pages;
}

function buildSetupPage(pageName, guild, settings, pages) {
  const me = guild.members.me;
  const pageNum = pages.indexOf(pageName) + 1;
  const totalPages = pages.length;
  const prevPage = pages[pages.indexOf(pageName) - 1];
  const nextPage = pages[pages.indexOf(pageName) + 1];

  if (pageName === 'permissions') {
    const requiredPerms = [
      { flag: PermissionFlagsBits.ModerateMembers, name: 'Timeout Members' },
      { flag: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
      { flag: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
      { flag: PermissionFlagsBits.ViewAuditLog, name: 'View Audit Log' },
      { flag: PermissionFlagsBits.ReadMessageHistory, name: 'Read Message History' },
    ];
    const permChecks = requiredPerms.map(p => `${me.permissions.has(p.flag) ? '\u2705' : '\u274C'} ${p.name}`);
    const allPermsOk = requiredPerms.every(p => me.permissions.has(p.flag));
    const botRole = me.roles.highest;
    const roleStatus = botRole.position > 1
      ? `\u2705 **${botRole.name}** at position ${botRole.position}/${guild.roles.cache.size - 1}`
      : '\u26A0\uFE0F Bot role is very low \u2014 move it higher to mute more users';

    const embed = new EmbedBuilder()
      .setColor(allPermsOk ? 0x5865f2 : 0xff4444)
      .setTitle(`\uD83D\uDD27 Setup Wizard \u2014 Step ${pageNum}/${totalPages}: Permissions`)
      .setDescription(allPermsOk
        ? '\u2705 **All permissions look good!** You\'re ready to proceed.'
        : '\u274C **Some permissions are missing.** Fix these before continuing or the bot won\'t work properly.')
      .addFields(
        { name: '\uD83D\uDD10 Required Permissions', value: permChecks.join('\n') },
        { name: '\uD83D\uDCCB Role Hierarchy', value: roleStatus },
        { name: '\uD83E\uDD16 Bot ID', value: `\`${me.id}\`\nCopy this to whitelist in other moderation bots.` },
      )
      .setFooter({ text: `Step ${pageNum} of ${totalPages} \u2022 Permissions are essential \u2014 fix any \u274C before continuing` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${nextPage}`).setLabel('Next \u2192').setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [row] };
  }

  if (pageName === 'watch_channel') {
    const channelDisplay = settings.watchChannelId ? `<#${settings.watchChannelId}>` : '\u274C **Not set yet**';

    const embed = new EmbedBuilder()
      .setColor(settings.watchChannelId ? 0x00ff88 : 0xff4444)
      .setTitle(`\uD83D\uDD27 Setup Wizard \u2014 Step ${pageNum}/${totalPages}: Watch Channel`)
      .setDescription('**This is essential.** Pick the channel where the bot will post mute announcements, reminders, callouts, and other messages.')
      .addFields(
        { name: '\uD83D\uDCFA Current Watch Channel', value: channelDisplay },
        { name: '\u2139\uFE0F What goes here?', value: 'Mute results, unauthorized unmute alerts, periodic tips, random callouts, and other bot messages.' },
      )
      .setFooter({ text: `Step ${pageNum} of ${totalPages} \u2022 This setting is required` });

    const channelRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('vm_setup_channel')
        .setPlaceholder('Select watch channel...')
        .setChannelTypes(ChannelType.GuildText),
    );
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${prevPage}`).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`vm_setup_goto_${nextPage}`).setLabel('Next \u2192').setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [channelRow, navRow] };
  }

  if (pageName === 'audit_channel') {
    const auditDisplay = settings.auditChannelId ? `<#${settings.auditChannelId}>` : 'Not set (optional)';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`\uD83D\uDD27 Setup Wizard \u2014 Step ${pageNum}/${totalPages}: Audit Log Channel`)
      .setDescription('**Optional.** Pick a channel for short audit logs. This is separate from the watch channel \u2014 it only gets compact one-line entries for mutes, unmutes, votes, and boosts.')
      .addFields(
        { name: '\uD83D\uDCDD Current Audit Channel', value: auditDisplay },
        { name: '\u2139\uFE0F Watch Channel vs Audit Channel', value: '**Watch Channel** = full embeds, announcements, callouts\n**Audit Channel** = compact logs for moderation tracking' },
      )
      .setFooter({ text: `Step ${pageNum} of ${totalPages} \u2022 Optional \u2014 skip if you don't need audit logs` });

    const channelRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('vm_setup_audit_channel')
        .setPlaceholder('Select audit log channel (optional)...')
        .setChannelTypes(ChannelType.GuildText),
    );
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${prevPage}`).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`vm_setup_goto_${nextPage}`).setLabel(settings.auditChannelId ? 'Next \u2192' : 'Skip \u2192').setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [channelRow, navRow] };
  }

  if (pageName === 'wick') {
    const embed = new EmbedBuilder()
      .setColor(0xff6600)
      .setTitle(`\u26A0\uFE0F Setup Wizard \u2014 Step ${pageNum}/${totalPages}: Wick Detected!`)
      .setDescription('**Wick Bot** is in this server. If you don\'t whitelist this bot, Wick may flag its timeout actions as a nuke attempt and punish the bot or strip its permissions.')
      .addFields(
        { name: '\uD83D\uDEE1\uFE0F What to do', value: [
          '1. Go to **wickbot.com/dashboard**',
          '2. Select this server',
          '3. Go to **Whitelist** \u2192 **Whitelisted Bots**',
          `4. Add this bot's ID: \`${me.id}\``,
          '5. Save',
        ].join('\n') },
        { name: '\u2753 What happens if I don\'t?', value: 'Wick may detect the bot timing out users and treat it as a raid/nuke. It could strip the bot\'s roles, ban it, or lock the server. **Don\'t skip this.**' },
        { name: '\uD83D\uDD17 Direct Link', value: 'wickbot.com/dashboard' },
      )
      .setFooter({ text: `Step ${pageNum} of ${totalPages} \u2022 This is important if you use Wick` });

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${prevPage}`).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`vm_setup_goto_${nextPage}`).setLabel('Done, Next \u2192').setStyle(ButtonStyle.Success),
    );
    return { embeds: [embed], components: [navRow] };
  }

  if (pageName === 'vote_settings') {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`\uD83D\uDD27 Setup Wizard \u2014 Step ${pageNum}/${totalPages}: Vote Settings`)
      .setDescription('These control how voting works. The defaults are sensible but you can tweak them.')
      .addFields(
        { name: '\uD83D\uDCCA Vote Threshold', value: `**${Math.round(settings.threshold * 100)}%** of active chatters needed to pass\n*Default: 60%*`, inline: true },
        { name: '\u23F1\uFE0F Vote Duration', value: `**${settings.voteDuration}s** to cast votes\n*Default: 60s*`, inline: true },
        { name: '\uD83D\uDD07 Mute Duration', value: `**${settings.muteDuration} min** timeout\n*Default: 5 min*`, inline: true },
        { name: '\uD83D\uDCAC Min Messages', value: `**${settings.minMessages}** msg(s) to count as active\n*Default: 1*`, inline: true },
        { name: '\uD83D\uDD52 Activity Window', value: `**${settings.activityWindow} min** lookback\n*Default: 5 min*`, inline: true },
        { name: '\u2139\uFE0F', value: 'Use `/vm configure` to change these values anytime.' },
      )
      .setFooter({ text: `Step ${pageNum} of ${totalPages} \u2022 Defaults work fine \u2014 tweak later with /vm configure` });

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${prevPage}`).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_setup_configure').setLabel('Change These Now').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`vm_setup_goto_${nextPage}`).setLabel('Keep Defaults & Next \u2192').setStyle(ButtonStyle.Success),
    );
    return { embeds: [embed], components: [navRow] };
  }

  if (pageName === 'fun_stuff') {
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`\uD83D\uDD27 Setup Wizard \u2014 Step ${pageNum}/${totalPages}: Fun Stuff`)
      .setDescription('These are optional but make the bot way more entertaining.')
      .addFields(
        { name: `\uD83D\uDCE2 Random Callouts ${settings.calloutsEnabled ? '\u2705' : '\u274C'}`, value: 'Bot randomly roasts users based on their mute stats every ~45 min.', inline: true },
        { name: `\uD83D\uDCA1 Periodic Tips ${settings.remindersEnabled ? '\u2705' : '\u274C'}`, value: 'Sends funny vote mute tips every 2 hours.', inline: true },
        { name: `\uD83C\uDFAD Theme: ${settings.theme}`, value: 'Use `/vm theme` to change', inline: true },
        { name: `\uD83E\uDD21 Allow Self-Mute ${settings.allowSelfMute ? '\u2705' : '\u274C'}`, value: 'Let users vote mute themselves (bot roasts them for it).', inline: true },
      )
      .setFooter({ text: `Step ${pageNum} of ${totalPages} \u2022 Optional \u2014 toggle these anytime with /vm configure` });

    const toggleRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_setup_toggle_callouts').setLabel(`Callouts: ${settings.calloutsEnabled ? 'ON' : 'OFF'}`).setStyle(settings.calloutsEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_setup_toggle_reminders').setLabel(`Tips: ${settings.remindersEnabled ? 'ON' : 'OFF'}`).setStyle(settings.remindersEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_setup_goto_theme').setLabel(`Theme: ${settings.theme}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vm_setup_toggle_selfmute').setLabel(`Self-Mute: ${settings.allowSelfMute ? 'ON' : 'OFF'}`).setStyle(settings.allowSelfMute ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${prevPage}`).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`vm_setup_goto_${nextPage}`).setLabel('Next \u2192').setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [toggleRow, navRow] };
  }

  if (pageName === 'summary') {
    const channelDisplay = settings.watchChannelId ? `<#${settings.watchChannelId}>` : '\u274C Not set';

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('\u2705 Setup Complete!')
      .setDescription('You\'re all set. Here\'s a summary of your configuration:')
      .addFields(
        { name: '\uD83D\uDCFA Watch Channel', value: channelDisplay, inline: true },
        { name: '\uD83D\uDCCA Threshold', value: `${Math.round(settings.threshold * 100)}%`, inline: true },
        { name: '\uD83D\uDD07 Mute Duration', value: `${settings.muteDuration} min`, inline: true },
        { name: '\u23F1\uFE0F Vote Duration', value: `${settings.voteDuration}s`, inline: true },
        { name: '\uD83D\uDD52 Activity Window', value: `${settings.activityWindow} min`, inline: true },
        { name: '\uD83D\uDCAC Min Messages', value: `${settings.minMessages}`, inline: true },
        { name: '\uD83C\uDFAD Vote Style', value: settings.theme, inline: true },
        { name: '\uD83D\uDCE2 Callouts', value: settings.calloutsEnabled ? 'ON' : 'OFF', inline: true },
        { name: '\uD83D\uDCA1 Tips', value: settings.remindersEnabled ? 'ON' : 'OFF', inline: true },
        { name: '\u2139\uFE0F What now?', value: [
          '**`/votemute @user`** \u2014 Start a vote',
          '**`/vm view`** \u2014 See the dashboard',
          '**`/vm configure`** \u2014 Change settings anytime',
        ].join('\n') },
      )
      .setFooter({ text: 'Setup complete \u2022 Have fun muting people' });

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vm_setup_goto_${prevPage}`).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_setup_done').setLabel('\u2705 Done!').setStyle(ButtonStyle.Success),
    );
    return { embeds: [embed], components: [navRow] };
  }
}

async function handleSetup(interaction) {
  const setupSettings = getSettings(interaction.guild.id);
  const hasPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    (setupSettings.managerRoleId && interaction.member.roles.cache.has(setupSettings.managerRoleId));
  if (!hasPerms) {
    return interaction.reply({ content: 'Only administrators or bot managers can run setup.', flags: 64 });
  }

  const hasWick = !!(await interaction.guild.members.fetch(WICK_ID).catch(() => null));
  const pages = getSetupPages(hasWick);
  const settings = getSettings(interaction.guild.id);
  const page = buildSetupPage(pages[0], interaction.guild, settings, pages);
  return interaction.reply({ ...page, flags: 64 });
}

async function handleSetupButton(interaction) {
  const btnSettings = getSettings(interaction.guild.id);
  const hasBtnPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    (btnSettings.managerRoleId && interaction.member.roles.cache.has(btnSettings.managerRoleId));
  if (!hasBtnPerms) {
    return interaction.reply({ content: 'Only administrators or bot managers can use setup.', flags: 64 });
  }

  const id = interaction.customId;
  const settings = getSettings(interaction.guild.id);
  const hasWick = !!(interaction.guild.members.cache.get(WICK_ID));
  const pages = getSetupPages(hasWick);

  // Theme button from fun_stuff page — open theme selector instead of navigating
  if (id === 'vm_setup_goto_theme') {
    return handleTheme(interaction);
  }

  // Navigation: goto page
  const gotoMatch = id.match(/^vm_setup_goto_(.+)$/);
  if (gotoMatch) {
    const page = buildSetupPage(gotoMatch[1], interaction.guild, settings, pages);
    return interaction.update({ ...page });
  }

  // Toggles on fun_stuff page
  if (id === 'vm_setup_toggle_callouts') {
    settings.calloutsEnabled = !settings.calloutsEnabled;
    if (settings.calloutsEnabled && settings.watchChannelId) {
      reminderChannels.set(interaction.guild.id, settings.watchChannelId);
    }
  } else if (id === 'vm_setup_toggle_reminders') {
    settings.remindersEnabled = !settings.remindersEnabled;
    if (settings.remindersEnabled && settings.watchChannelId) {
      reminderChannels.set(interaction.guild.id, settings.watchChannelId);
    }
  } else if (id === 'vm_setup_toggle_selfmute') {
    settings.allowSelfMute = !settings.allowSelfMute;
  } else if (id === 'vm_setup_configure') {
    return handleConfigure(interaction);
  } else if (id === 'vm_setup_done') {
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('\uD83C\uDF89 All done!')
      .setDescription('Your bot is ready. Go mute someone with `/votemute @user`!');
    return interaction.update({ embeds: [embed], components: [] });
  } else if (id.startsWith('vm_boost_') || id.startsWith('vm_toggle_')) {
    // All ON/OFF confirm buttons from /vm configure
    if (id === 'vm_boost_on') settings.boostImmunity = true;
    else if (id === 'vm_boost_off') settings.boostImmunity = false;
    else if (id === 'vm_toggle_reminders_on') { settings.remindersEnabled = true; if (settings.watchChannelId) reminderChannels.set(interaction.guild.id, settings.watchChannelId); }
    else if (id === 'vm_toggle_reminders_off') settings.remindersEnabled = false;
    else if (id === 'vm_toggle_callouts_on') { settings.calloutsEnabled = true; if (settings.watchChannelId) reminderChannels.set(interaction.guild.id, settings.watchChannelId); }
    else if (id === 'vm_toggle_callouts_off') settings.calloutsEnabled = false;
    else if (id === 'vm_toggle_selfmute_on') settings.allowSelfMute = true;
    else if (id === 'vm_toggle_selfmute_off') settings.allowSelfMute = false;

    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const labels = {
      vm_boost_on: 'Boost Immunity', vm_boost_off: 'Boost Immunity',
      vm_toggle_reminders_on: 'Periodic Reminders', vm_toggle_reminders_off: 'Periodic Reminders',
      vm_toggle_callouts_on: 'Random Callouts', vm_toggle_callouts_off: 'Random Callouts',
      vm_toggle_selfmute_on: 'Allow Self-Mute', vm_toggle_selfmute_off: 'Allow Self-Mute',
    };
    const isOn = id.endsWith('_on');
    const embed = new EmbedBuilder()
      .setColor(isOn ? 0x00ff00 : 0xff4444)
      .setTitle('Setting Updated')
      .setDescription(`**${labels[id]}** is now **${isOn ? 'ON' : 'OFF'}**`);
    return interaction.update({ embeds: [embed], components: [] });
  }

  guildSettings.set(interaction.guild.id, settings);
  scheduleSave(interaction.guild.id);

  // Re-render fun_stuff page for toggles
  const page = buildSetupPage('fun_stuff', interaction.guild, settings, pages);
  return interaction.update({ ...page });
}

async function handleSetupChannel(interaction) {
  const chSettings = getSettings(interaction.guild.id);
  const hasChPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    (chSettings.managerRoleId && interaction.member.roles.cache.has(chSettings.managerRoleId));
  if (!hasChPerms) {
    return interaction.reply({ content: 'Only administrators or bot managers can change settings.', flags: 64 });
  }

  const channelId = interaction.values[0];
  const settings = getSettings(interaction.guild.id);
  const hasWick = !!(interaction.guild.members.cache.get(WICK_ID));
  const pages = getSetupPages(hasWick);

  if (interaction.customId === 'vm_setup_channel') {
    settings.watchChannelId = channelId;
    reminderChannels.set(interaction.guild.id, channelId);
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);
    const page = buildSetupPage('watch_channel', interaction.guild, settings, pages);
    return interaction.update({ ...page });
  }

  if (interaction.customId === 'vm_setup_audit_channel') {
    settings.auditChannelId = channelId;
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);
    const page = buildSetupPage('audit_channel', interaction.guild, settings, pages);
    return interaction.update({ ...page });
  }
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
  const cfgSettings = getSettings(interaction.guild.id);
  const hasCfgPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    (cfgSettings.managerRoleId && interaction.member.roles.cache.has(cfgSettings.managerRoleId));
  if (!hasCfgPerms) {
    return interaction.reply({ content: 'Only administrators or bot managers can change vote mute settings.', flags: 64 });
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
        { label: 'Theme', description: `Currently: ${settings.theme} (use /vm theme)`, value: 'theme_info' },
        { label: 'Max Active Votes', description: `Currently: ${settings.maxActiveVotes}`, value: 'max_active_votes' },
        { label: 'Initiator Cooldown', description: `Currently: ${settings.initiatorCooldown ? settings.initiatorCooldown + 's' : 'OFF'}`, value: 'initiator_cooldown' },
        { label: 'Allow Self-Mute', description: `Currently: ${settings.allowSelfMute ? 'ON' : 'OFF'}`, value: 'allow_self_mute' },
        { label: 'Min Messages for Active', description: `Currently: ${settings.minMessages}`, value: 'min_messages' },
        { label: 'Manager Role', description: `Currently: ${settings.managerRoleId ? 'Set' : 'None'}`, value: 'manager_role' },
        { label: 'Boost Immunity', description: `Currently: ${settings.boostImmunity ? settings.boostImmunityDuration + ' min' : 'OFF'}`, value: 'boost_immunity' },
        { label: 'Boost Immunity Duration', description: `Currently: ${settings.boostImmunityDuration} min`, value: 'boost_duration' },
      ),
  );

  return interaction.reply({ embeds: [embed], components: [selectMenu], flags: 64 });
}

async function handleSelectMenu(interaction) {
  // Manager role select
  if (interaction.customId === 'vm_manager_role') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only administrators can change settings.', flags: 64 });
    }
    const settings = getSettings(interaction.guild.id);
    settings.managerRoleId = interaction.values[0] || null;
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const display = settings.managerRoleId ? `<@&${settings.managerRoleId}>` : 'None';
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setting Updated')
      .setDescription(`**Manager Role** set to: ${display}\nThis role can use /vm setup, /vm configure, and won't be penalized for unauthorized unmutes.`);
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // Theme select
  if (interaction.customId === 'vm_theme_select') {
    const themeSettings = getSettings(interaction.guild.id);
    const hasThemePerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
      (themeSettings.managerRoleId && interaction.member.roles.cache.has(themeSettings.managerRoleId));
    if (!hasThemePerms) {
      return interaction.reply({ content: 'Only administrators or bot managers can change the theme.', flags: 64 });
    }
    const settings = getSettings(interaction.guild.id);
    settings.theme = interaction.values[0];
    guildSettings.set(interaction.guild.id, settings);
    scheduleSave(interaction.guild.id);

    const { getTheme } = require('../utils/display');
    const theme = getTheme(settings.theme);
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Theme Updated!')
      .setDescription(`Theme set to **${settings.theme}**\n\nPreview: *${theme.voteDescription.replace('{initiator}', 'Someone').replace('{target}', 'Someone Else')}*`);
    return interaction.reply({ embeds: [embed], flags: 64 });
  }
  if (interaction.customId === 'vm_immune_roles') {
    const irSettings = getSettings(interaction.guild.id);
    const hasIrPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
      (irSettings.managerRoleId && interaction.member.roles.cache.has(irSettings.managerRoleId));
    if (!hasIrPerms) {
      return interaction.reply({ content: 'Only administrators or bot managers can change settings.', flags: 64 });
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

  const csSettings = getSettings(interaction.guild.id);
  const hasCsPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    (csSettings.managerRoleId && interaction.member.roles.cache.has(csSettings.managerRoleId));
  if (!hasCsPerms) {
    return interaction.reply({ content: 'Only administrators or bot managers can change settings.', flags: 64 });
  }

  const selected = interaction.values[0];

  if (selected === 'reminders') {
    const settings = getSettings(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Periodic Reminders')
      .setDescription(`Currently: **${settings.remindersEnabled ? 'ON' : 'OFF'}**\n\nSend funny vote mute tips in chat every 2 hours?`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_toggle_reminders_on').setLabel('ON').setStyle(settings.remindersEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_toggle_reminders_off').setLabel('OFF').setStyle(!settings.remindersEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
    );
    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }

  if (selected === 'allow_self_mute') {
    const settings = getSettings(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Allow Self-Mute')
      .setDescription(`Currently: **${settings.allowSelfMute ? 'ON' : 'OFF'}**\n\nLet users initiate vote mutes on themselves? (The bot will roast them for it.)`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_toggle_selfmute_on').setLabel('ON').setStyle(settings.allowSelfMute ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_toggle_selfmute_off').setLabel('OFF').setStyle(!settings.allowSelfMute ? ButtonStyle.Danger : ButtonStyle.Secondary),
    );
    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }

  if (selected === 'theme_info') {
    return interaction.reply({ content: 'Use `/vm theme` to browse and select a theme.', flags: 64 });
  }

  if (selected === 'manager_role') {
    const roleSelect = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('vm_manager_role')
        .setPlaceholder('Select manager role (can use setup/configure, bypass unmute penalty)')
        .setMinValues(0)
        .setMaxValues(1),
    );
    return interaction.reply({ content: 'Select the bot manager role:', components: [roleSelect], flags: 64 });
  }

  if (selected === 'boost_immunity') {
    const settings = getSettings(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Boost Immunity')
      .setDescription(`Currently: **${settings.boostImmunity ? 'ON' : 'OFF'}**${settings.boostImmunity ? ` (${settings.boostImmunityDuration} min)` : ''}\n\nShould server boosters get temporary immunity from vote mutes?`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_boost_on').setLabel('ON').setStyle(settings.boostImmunity ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_boost_off').setLabel('OFF').setStyle(!settings.boostImmunity ? ButtonStyle.Danger : ButtonStyle.Secondary),
    );

    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }

  if (selected === 'callouts') {
    const settings = getSettings(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Random Callouts')
      .setDescription(`Currently: **${settings.calloutsEnabled ? 'ON' : 'OFF'}**\n\nBot randomly roasts users based on their mute stats every ~45 minutes.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vm_toggle_callouts_on').setLabel('ON').setStyle(settings.calloutsEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vm_toggle_callouts_off').setLabel('OFF').setStyle(!settings.calloutsEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
    );
    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
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
    boost_duration: { title: 'Boost Immunity Duration (min)', placeholder: 'Enter minutes (1-1440)', min: '1', max: '1440' },
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
    boost_duration: { min: 1, max: 1440 },
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
    boost_duration: 'Boost Immunity Duration',
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
  } else if (setting === 'boost_duration') {
    settings.boostImmunityDuration = rawValue;
    displayValue = `${rawValue} min`;
  }

  guildSettings.set(interaction.guild.id, settings);
  scheduleSave(interaction.guild.id);

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

async function handleTheme(interaction) {
  const hasPerms = interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    (getSettings(interaction.guild.id).managerRoleId && interaction.member.roles.cache.has(getSettings(interaction.guild.id).managerRoleId));

  if (!hasPerms) {
    return interaction.reply({ content: 'Only administrators or bot managers can change the theme.', flags: 64 });
  }

  const settings = getSettings(interaction.guild.id);
  const { AVAILABLE_THEMES, getTheme } = require('../utils/display');

  const themeDescriptions = {
    default: 'Standard vote mute',
    yay_nay: 'Yay! / Nay! buttons',
    law_and_order: 'Court is in session, Your Honor',
    pirate: 'Walk the plank, scallywag',
    corporate: 'Per company policy Section 4.2.1...',
    wwe: 'BAH GAWD! SOMEBODY STOP THE MATCH!',
    nature: 'And here we observe the herd...',
    ramsay: 'THIS CHAT IS RAW! GET OUT!',
  };

  const options = AVAILABLE_THEMES.map(name => ({
    label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: themeDescriptions[name] || name,
    value: name,
    default: name === settings.theme,
  }));

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('\uD83C\uDFAD Theme Selector')
    .setDescription(`Current theme: **${settings.theme}**\n\nPick a theme below to change how the bot talks. Themes affect vote embeds, DMs, announcements, and self-mute reactions.`)
    .setFooter({ text: 'Themes do not affect /vm setup or /vm configure' });

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('vm_theme_select')
      .setPlaceholder('Select a theme...')
      .addOptions(options),
  );

  return interaction.reply({ embeds: [embed], components: [selectMenu], flags: 64 });
}

module.exports = { handleVmSettings, handleTheme, handleSelectMenu, handleModal, handleDashboardButton, handleSetupButton, handleSetupChannel };
