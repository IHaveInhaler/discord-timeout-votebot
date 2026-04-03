const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function mapToObject(map) {
  const obj = {};
  for (const [key, value] of map) {
    obj[key] = value instanceof Map ? mapToObject(value) : value;
  }
  return obj;
}

function objectToMap(obj) {
  const map = new Map();
  for (const [key, value] of Object.entries(obj)) {
    map.set(key, (value && typeof value === 'object' && !Array.isArray(value)) ? objectToMap(value) : value);
  }
  return map;
}

function serializeStats(stats) {
  const users = {};
  for (const [userId, userStats] of stats.users) {
    users[userId] = {
      ...userStats,
      mutedBy: mapToObject(userStats.mutedBy),
      votedAgainst: mapToObject(userStats.votedAgainst),
    };
  }

  return {
    totalVotes: stats.totalVotes,
    totalMutes: stats.totalMutes,
    failedVotes: stats.failedVotes,
    unauthorizedUnmutes: stats.unauthorizedUnmutes,
    muteHistory: stats.muteHistory,
    hourlyMutes: stats.hourlyMutes,
    users,
  };
}

function deserializeStats(raw) {
  const users = new Map();
  if (raw.users) {
    for (const [userId, userStats] of Object.entries(raw.users)) {
      users.set(userId, {
        timesMuted: userStats.timesMuted || 0,
        timesVoted: userStats.timesVoted || 0,
        lastMuted: userStats.lastMuted || null,
        mutedBy: objectToMap(userStats.mutedBy || {}),
        votedAgainst: objectToMap(userStats.votedAgainst || {}),
        muteStreak: userStats.muteStreak || 0,
      });
    }
  }

  return {
    users,
    totalVotes: raw.totalVotes || 0,
    totalMutes: raw.totalMutes || 0,
    failedVotes: raw.failedVotes || 0,
    unauthorizedUnmutes: raw.unauthorizedUnmutes || 0,
    muteHistory: raw.muteHistory || [],
    hourlyMutes: raw.hourlyMutes || new Array(24).fill(0),
  };
}

function saveGuildData(guildId, settings, stats) {
  const filePath = path.join(DATA_DIR, `${guildId}.json`);
  const data = {
    settings,
    stats: serializeStats(stats),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadGuildData(guildId) {
  const filePath = path.join(DATA_DIR, `${guildId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      settings: raw.settings,
      stats: deserializeStats(raw.stats || {}),
    };
  } catch {
    return null;
  }
}

function loadAllGuilds() {
  const results = new Map();
  if (!fs.existsSync(DATA_DIR)) return results;

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const guildId = path.basename(file, '.json');
    const data = loadGuildData(guildId);
    if (data) results.set(guildId, data);
  }
  return results;
}

module.exports = { saveGuildData, loadGuildData, loadAllGuilds };
