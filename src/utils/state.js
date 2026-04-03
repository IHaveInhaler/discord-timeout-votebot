const { Collection } = require('discord.js');

// Per-guild settings
const guildSettings = new Collection();

// Track recent chatters per guild: Map<guildId, Map<userId, timestamp>>
const recentChatters = new Collection();

// Active vote sessions
const activeVotes = new Collection();

// Booster immunity: Map<key, expiresAt>
const boosterImmunity = new Collection();

// Cooldowns for being targeted
const voteCooldowns = new Collection();

// Track active vote-muted users for unauthorized unmute detection
const activeMutes = new Collection();

// Mute statistics per guild
const muteStats = new Collection();

// Track reminder channels per guild
const reminderChannels = new Collection();

const DEFAULT_SETTINGS = {
  threshold: 0.6,
  muteDuration: 5,
  voteDuration: 60,
  activityWindow: 5,
  immuneRoles: [],
  remindersEnabled: false,
  calloutsEnabled: false,
  voteStyle: 'default',       // 'default' = "Vote to Mute", 'yay_nay' = "Yay / Nay"
  maxActiveVotes: 1,          // max concurrent votes in a guild
  initiatorCooldown: 0,       // seconds before a user can start another vote (0 = off)
  botChannelId: null,         // channel where bot posts announcements/reminders (null = any)
};

// Initiator cooldowns: Map<`${guildId}-${userId}`, expiresAt>
const initiatorCooldowns = new Collection();

function getSettings(guildId) {
  return guildSettings.get(guildId) || { ...DEFAULT_SETTINGS };
}

function getStats(guildId) {
  if (!muteStats.has(guildId)) {
    muteStats.set(guildId, {
      users: new Map(),
      totalVotes: 0,
      totalMutes: 0,
      failedVotes: 0,
      unauthorizedUnmutes: 0,
      muteHistory: [],
      hourlyMutes: new Array(24).fill(0),
    });
  }
  return muteStats.get(guildId);
}

function recordMute(guildId, targetId, voterIds) {
  const stats = getStats(guildId);
  stats.totalMutes++;
  stats.totalVotes += voterIds.size;

  const hour = new Date().getUTCHours();
  stats.hourlyMutes[hour]++;

  stats.muteHistory.push({ targetId, voterIds: [...voterIds], timestamp: Date.now() });
  if (stats.muteHistory.length > 50) stats.muteHistory.shift();

  if (!stats.users.has(targetId)) {
    stats.users.set(targetId, { timesMuted: 0, timesVoted: 0, lastMuted: null, mutedBy: new Map(), votedAgainst: new Map(), muteStreak: 0 });
  }
  const targetStats = stats.users.get(targetId);
  targetStats.timesMuted++;
  targetStats.lastMuted = Date.now();
  targetStats.muteStreak++;

  for (const voterId of voterIds) {
    targetStats.mutedBy.set(voterId, (targetStats.mutedBy.get(voterId) || 0) + 1);
  }

  for (const voterId of voterIds) {
    if (!stats.users.has(voterId)) {
      stats.users.set(voterId, { timesMuted: 0, timesVoted: 0, lastMuted: null, mutedBy: new Map(), votedAgainst: new Map(), muteStreak: 0 });
    }
    const voterStats = stats.users.get(voterId);
    voterStats.timesVoted++;
    voterStats.votedAgainst.set(targetId, (voterStats.votedAgainst.get(targetId) || 0) + 1);
  }
}

function recordFailedVote(guildId) {
  const stats = getStats(guildId);
  stats.failedVotes++;
}

function trackChatter(guildId, userId) {
  if (!recentChatters.has(guildId)) {
    recentChatters.set(guildId, new Map());
  }
  recentChatters.get(guildId).set(userId, Date.now());
}

function getActiveChatters(guildId, windowMinutes) {
  const chatters = recentChatters.get(guildId);
  if (!chatters) return [];

  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const active = [];
  for (const [userId, timestamp] of chatters) {
    if (timestamp >= cutoff) {
      active.push(userId);
    } else {
      chatters.delete(userId);
    }
  }
  return active;
}

module.exports = {
  guildSettings,
  recentChatters,
  activeVotes,
  boosterImmunity,
  voteCooldowns,
  activeMutes,
  muteStats,
  reminderChannels,
  initiatorCooldowns,
  DEFAULT_SETTINGS,
  getSettings,
  getStats,
  recordMute,
  recordFailedVote,
  trackChatter,
  getActiveChatters,
};
