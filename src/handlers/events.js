const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const { getSettings, getStats, boosterImmunity, activeMutes, scheduleSave } = require('../utils/state');
const { getTheme } = require('../utils/display');
const { auditLog } = require('../utils/audit');

function setupEvents(client) {
  // Watch for boosts and unauthorized unmutes
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check for boost
    const wasBoosting = oldMember.premiumSince !== null;
    const isBoosting = newMember.premiumSince !== null;

    if (!wasBoosting && isBoosting) {
      const settings = getSettings(newMember.guild.id);
      if (!settings.boostImmunity) return;

      const duration = settings.boostImmunityDuration * 60 * 1000;
      const key = `${newMember.guild.id}-${newMember.id}`;
      boosterImmunity.set(key, Date.now() + duration);

      newMember.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff73fa)
            .setTitle('Booster Immunity Granted!')
            .setDescription(`Thanks for boosting **${newMember.guild.name}**! You now have **${settings.boostImmunityDuration} minutes of immunity** from vote mutes.`)
            .setTimestamp(),
        ],
      }).catch(() => {});

      auditLog(client, newMember.guild.id, {
        action: 'BOOST IMMUNITY',
        target: newMember.id,
        details: '1 hour immunity granted',
        color: 0xff73fa,
      });
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

        const settings = getSettings(newMember.guild.id);

        // Allow admins and bot manager role
        if (executor.permissions.has(PermissionFlagsBits.Administrator)) return;
        if (settings.managerRoleId && executor.roles.cache.has(settings.managerRoleId)) return;

        getStats(newMember.guild.id).unauthorizedUnmutes++;
        scheduleSave(newMember.guild.id);
        const theme = getTheme(settings.theme);
        const remainingTime = trackedMute.expiresAt - Date.now();

        await newMember.timeout(remainingTime, 'Vote mute restored — unauthorized unmute');

        const penaltyDuration = settings.muteDuration * 60 * 1000;
        await executor.timeout(penaltyDuration, 'Unauthorized removal of vote mute');

        auditLog(client, newMember.guild.id, {
          action: 'UNAUTHORIZED UNMUTE',
          target: newMember.id,
          executor: executor.id,
          details: `${executor.displayName} tried to unmute ${newMember.displayName} \u2022 Both penalized`,
          color: 0xff0000,
        });

        const channel = await newMember.guild.channels.fetch(trackedMute.channelId).catch(() => null);
        if (channel) {
          const desc = theme.unauthorizedUnmuteDescription
            .replace('{executor}', executor.displayName)
            .replace('{target}', newMember.displayName);
          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(theme.unauthorizedUnmuteTitle)
            .setDescription(desc)
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
