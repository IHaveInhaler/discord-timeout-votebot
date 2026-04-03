const { EmbedBuilder } = require('discord.js');
const { getSettings } = require('./state');

async function auditLog(client, guildId, { action, target, executor, details, color = 0x5865f2 }) {
  const settings = getSettings(guildId);
  if (!settings.auditChannelId) return;

  const channel = client.channels.cache.get(settings.auditChannelId);
  if (!channel) return;

  const timestamp = `<t:${Math.floor(Date.now() / 1000)}:T>`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${timestamp} **${action}**`)
    .setTimestamp();

  if (target) embed.addFields({ name: 'Target', value: `<@${target}>`, inline: true });
  if (executor) embed.addFields({ name: 'By', value: `<@${executor}>`, inline: true });
  if (details) embed.addFields({ name: 'Details', value: details, inline: false });

  channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { auditLog };
