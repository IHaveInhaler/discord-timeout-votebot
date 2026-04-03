const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const { getSettings, getStats, boosterImmunity, activeMutes, scheduleSave } = require('../utils/state');

function setupEvents(client) {
  // Watch for boosts and unauthorized unmutes
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check for boost
    const wasBoosting = oldMember.premiumSince !== null;
    const isBoosting = newMember.premiumSince !== null;

    if (!wasBoosting && isBoosting) {
      const key = `${newMember.guild.id}-${newMember.id}`;
      boosterImmunity.set(key, Date.now() + 60 * 60 * 1000);

      newMember.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff73fa)
            .setTitle('Booster Immunity Granted!')
            .setDescription(`Thanks for boosting **${newMember.guild.name}**! You now have **1 hour of immunity** from vote mutes.`)
            .setTimestamp(),
        ],
      }).catch(() => {});
    }

    // Check for unauthorized unmute
    const wasMuted = oldMember.communicationDisabledUntilTimestamp && oldMember.communicationDisabledUntilTimestamp > Date.now();
    const isNowUnmuted = !newMember.communicationDisabledUntilTimestamp || newMember.communicationDisabledUntilTimestamp <= Date.now();

    if (wasMuted && isNowUnmuted) {
      const muteKey = `${newMember.guild.id}-${newMember.id}`;
      const trackedMute = activeMutes.get(muteKey);
      if (!trackedMute || Date.now() >= trackedMute.expiresAt) return;

      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const auditLogs = await newMember.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberUpdate,
          limit: 5,
        });

        const entry = auditLogs.entries.find(e =>
          e.target.id === newMember.id &&
          e.changes.some(c => c.key === 'communication_disabled_until') &&
          Date.now() - e.createdTimestamp < 5000
        );

        if (!entry || entry.executor.id === client.user.id) return;

        const executor = await newMember.guild.members.fetch(entry.executor.id).catch(() => null);
        if (!executor) return;

        if (executor.permissions.has(PermissionFlagsBits.Administrator)) return;

        getStats(newMember.guild.id).unauthorizedUnmutes++;
        scheduleSave(newMember.guild.id);
        const settings = getSettings(newMember.guild.id);
        const remainingTime = trackedMute.expiresAt - Date.now();

        await newMember.timeout(remainingTime, 'Vote mute restored — unauthorized unmute');

        const penaltyDuration = settings.muteDuration * 60 * 1000;
        await executor.timeout(penaltyDuration, 'Unauthorized removal of vote mute');

        const channel = await newMember.guild.channels.fetch(trackedMute.channelId).catch(() => null);
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Unauthorized Unmute Detected!')
            .setDescription(`**${executor.displayName}** tried to remove **${newMember.displayName}**'s vote mute without admin permissions.`)
            .addFields(
              { name: 'Action Taken', value: `${executor.displayName} has been muted for ${settings.muteDuration} minutes.\n${newMember.displayName}'s mute has been restored.` },
            )
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        }
      } catch {}
    }
  });
}

module.exports = { setupEvents };
