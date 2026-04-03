const { Collection } = require('discord.js');
const { saveGuildData, loadAllGuilds } = require('./storage');

const guildSettings = new Collection();
const recentChatters = new Collection();
const activeVotes = new Collection();
const boosterImmunity = new Collection();
const voteCooldowns = new Collection();
const activeMutes = new Collection();
const muteStats = new Collection();
const reminderChannels = new Collection();

const DEFAULT_SETTINGS = {
  threshold: 0.6,
  muteDuration: 5,
  voteDuration: 60,
  activityWindow: 5,
  immuneRoles: [],
  remindersEnabled: false,
  calloutsEnabled: false,
  voteStyle: 'default',
  allowSelfMute: true,
  maxActiveVotes: 1,
  initiatorCooldown: 0,
  watchChannelId: null,
  minMessages: 1,              // min messages to count as active chatter
};

const initiatorCooldowns = new Collection();

const _pendingSaves = new Set();

function scheduleSave(guildId) {
  _pendingSaves.add(guildId);
}

function saveGuild(guildId) {
  const settings = guildSettings.get(guildId);
  const stats = muteStats.get(guildId);
  if (settings || stats) {
    saveGuildData(guildId, settings || { ...DEFAULT_SETTINGS }, stats || getStats(guildId));
  }
}

// Restore persisted data on startup
const allData = loadAllGuilds();
for (const [guildId, { settings, stats }] of allData) {
  if (settings) guildSettings.set(guildId, { ...DEFAULT_SETTINGS, ...settings });
  if (stats) muteStats.set(guildId, stats);
}

// Flush pending saves every 60 seconds
setInterval(() => {
  for (const guildId of _pendingSaves) {
    saveGuild(guildId);
  }
  _pendingSaves.clear();
}, 60_000);

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

  scheduleSave(guildId);
}

function recordFailedVote(guildId) {
  const stats = getStats(guildId);
  stats.failedVotes++;
  scheduleSave(guildId);
}

function trackChatter(guildId, userId) {
  if (!recentChatters.has(guildId)) {
    recentChatters.set(guildId, new Map());
  }
  const chatters = recentChatters.get(guildId);
  const existing = chatters.get(userId);
  if (existing) {
    existing.count++;
    existing.lastMessage = Date.now();
  } else {
    chatters.set(userId, { count: 1, firstMessage: Date.now(), lastMessage: Date.now() });
  }
}

function getActiveChatters(guildId, windowMinutes, minMessages = 1) {
  const chatters = recentChatters.get(guildId);
  if (!chatters) return [];

  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const active = [];
  for (const [userId, data] of chatters) {
    if (data.lastMessage >= cutoff && data.count >= minMessages) {
      active.push(userId);
    } else if (data.lastMessage < cutoff) {
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
  scheduleSave,
};
