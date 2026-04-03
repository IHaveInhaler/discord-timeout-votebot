const { Client, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const { recentChatters, getSettings, getActiveChatters, getStats, reminderChannels, trackChatter } = require('./utils/state');
const { getActivityMessage, reminderTips, calloutTemplates } = require('./utils/display');
const { handleVoteMute, handleButton, setClient } = require('./handlers/votemute');
const { handleVmSettings, handleTheme, handleSelectMenu, handleModal, handleDashboardButton, handleSetupButton, handleSetupChannel } = require('./handlers/settings');
const { setupEvents } = require('./handlers/events');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});

// Track chatters on every message
client.on('messageCreate', (message) => {
  if (message.author.bot || !message.guild) return;
  trackChatter(message.guild.id, message.author.id);
});

// Route all interactions
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'votemute') {
        await handleVoteMute(interaction);
      } else if (interaction.commandName === 'vm') {
        await handleVmSettings(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith('vm_dash_')) {
        await handleDashboardButton(interaction);
      } else if (interaction.customId.startsWith('vm_setup_')) {
        await handleSetupButton(interaction);
      } else if (interaction.customId.startsWith('vm_boost_') || interaction.customId.startsWith('vm_toggle_')) {
        await handleSetupButton(interaction);
      } else {
        await handleButton(interaction, client);
      }
    } else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isChannelSelectMenu()) {
      await handleSetupChannel(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const reply = { content: 'Something went wrong!', flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// Pass client to votemute for audit logging
setClient(client);

// Setup boost/unmute detection events
setupEvents(client);

// Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Update activity status every 30 seconds
  const updateActivity = () => {
    let totalChatters = 0;
    for (const [guildId] of recentChatters) {
      const settings = getSettings(guildId);
      totalChatters += getActiveChatters(guildId, settings.activityWindow, settings.minMessages).length;
    }
    const message = getActivityMessage(totalChatters);
    client.user.setActivity(message, { type: ActivityType.Custom });
  };
  updateActivity();
  setInterval(updateActivity, 30_000);

  // Send periodic reminders every 2 hours
  setInterval(() => {
    for (const [guildId, channelId] of reminderChannels) {
      const settings = getSettings(guildId);
      if (!settings.remindersEnabled) continue;

      const channel = client.channels.cache.get(channelId);
      if (!channel) continue;

      const tip = reminderTips[Math.floor(Math.random() * reminderTips.length)];
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('Vote Mute Tip')
        .setDescription(tip)
        .setFooter({ text: 'Disable with /vm configure > Reminders' })
        .setTimestamp();

      channel.send({ embeds: [embed] }).catch(() => {});
    }
  }, 2 * 60 * 60 * 1000);

  // Random callouts every 45 minutes
  setInterval(() => {
    for (const [guildId, channelId] of reminderChannels) {
      const settings = getSettings(guildId);
      if (!settings.calloutsEnabled) continue;

      const stats = getStats(guildId);
      if (stats.totalMutes === 0) continue;

      const channel = client.channels.cache.get(channelId);
      if (!channel) continue;

      // Pick a random callout type based on available data
      const candidates = [];

      // Trigger happy
      const triggerHappy = [...stats.users.entries()]
        .filter(([, s]) => s.timesVoted >= 3)
        .sort((a, b) => b[1].timesVoted - a[1].timesVoted);
      if (triggerHappy.length > 0) {
        const [id, s] = triggerHappy[Math.floor(Math.random() * Math.min(triggerHappy.length, 3))];
        const tmpl = calloutTemplates.triggerHappy[Math.floor(Math.random() * calloutTemplates.triggerHappy.length)];
        candidates.push(tmpl.replace('{user}', `<@${id}>`).replace('{count}', s.timesVoted));
      }

      // Most muted
      const mostMuted = [...stats.users.entries()]
        .filter(([, s]) => s.timesMuted >= 2)
        .sort((a, b) => b[1].timesMuted - a[1].timesMuted);
      if (mostMuted.length > 0) {
        const [id, s] = mostMuted[Math.floor(Math.random() * Math.min(mostMuted.length, 3))];
        const tmpl = calloutTemplates.mostMuted[Math.floor(Math.random() * calloutTemplates.mostMuted.length)];
        candidates.push(tmpl.replace('{user}', `<@${id}>`).replace('{count}', s.timesMuted));
      }

      // Rivalry
      for (const [userId, userStats] of stats.users) {
        if (userStats.votedAgainst) {
          for (const [targetId, count] of userStats.votedAgainst) {
            if (count >= 2) {
              const tmpl = calloutTemplates.rivalry[Math.floor(Math.random() * calloutTemplates.rivalry.length)];
              candidates.push(tmpl.replace('{user}', `<@${userId}>`).replace('{target}', `<@${targetId}>`).replace('{count}', count));
            }
          }
        }
      }

      // Silent warriors
      const warriors = [...stats.users.entries()]
        .filter(([, s]) => s.timesVoted >= 3 && s.timesMuted === 0);
      if (warriors.length > 0) {
        const [id, s] = warriors[Math.floor(Math.random() * warriors.length)];
        const tmpl = calloutTemplates.silentWarrior[Math.floor(Math.random() * calloutTemplates.silentWarrior.length)];
        candidates.push(tmpl.replace('{user}', `<@${id}>`).replace('{count}', s.timesVoted));
      }

      if (candidates.length === 0) continue;

      const message = candidates[Math.floor(Math.random() * candidates.length)];
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('\uD83D\uDCE2 Community Callout')
        .setDescription(message)
        .setFooter({ text: 'Disable with /vm configure > Callouts' })
        .setTimestamp();

      channel.send({ embeds: [embed] }).catch(() => {});
    }
  }, 45 * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
