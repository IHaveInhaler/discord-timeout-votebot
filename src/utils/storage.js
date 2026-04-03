const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureGuildDir(guildId) {
  const dir = path.join(DATA_DIR, guildId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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

function serializeUsers(usersMap) {
  const obj = {};
  for (const [userId, userStats] of usersMap) {
    obj[userId] = {
      ...userStats,
      mutedBy: mapToObject(userStats.mutedBy),
      votedAgainst: mapToObject(userStats.votedAgainst),
    };
  }
  return obj;
}

function deserializeUsers(raw) {
  const users = new Map();
  for (const [userId, userStats] of Object.entries(raw)) {
    users.set(userId, {
      timesMuted: userStats.timesMuted || 0,
      timesVoted: userStats.timesVoted || 0,
      lastMuted: userStats.lastMuted || null,
      mutedBy: objectToMap(userStats.mutedBy || {}),
      votedAgainst: objectToMap(userStats.votedAgainst || {}),
      muteStreak: userStats.muteStreak || 0,
    });
  }
  return users;
}

function saveGuildData(guildId, settings, stats) {
  const dir = ensureGuildDir(guildId);

  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));

  fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify({
    totalVotes: stats.totalVotes,
    totalMutes: stats.totalMutes,
    failedVotes: stats.failedVotes,
    unauthorizedUnmutes: stats.unauthorizedUnmutes,
    muteHistory: stats.muteHistory,
    hourlyMutes: stats.hourlyMutes,
  }, null, 2));

  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify(serializeUsers(stats.users), null, 2));
}

function loadGuildData(guildId) {
  const dir = path.join(DATA_DIR, guildId);

  // Migrate from old single-file format
  const legacyPath = path.join(DATA_DIR, `${guildId}.json`);
  if (fs.existsSync(legacyPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
      const result = {
        settings: raw.settings || null,
        stats: {
          users: raw.stats?.users ? deserializeUsers(raw.stats.users) : new Map(),
          totalVotes: raw.stats?.totalVotes || 0,
          totalMutes: raw.stats?.totalMutes || 0,
          failedVotes: raw.stats?.failedVotes || 0,
          unauthorizedUnmutes: raw.stats?.unauthorizedUnmutes || 0,
          muteHistory: raw.stats?.muteHistory || [],
          hourlyMutes: raw.stats?.hourlyMutes || new Array(24).fill(0),
        },
      };
      // Save in new format and remove legacy file
      if (result.settings || result.stats) {
        saveGuildData(guildId, result.settings, result.stats);
      }
      fs.unlinkSync(legacyPath);
      return result;
    } catch {
      return null;
    }
  }

  if (!fs.existsSync(dir)) return null;

  try {
    const settingsPath = path.join(dir, 'settings.json');
    const statsPath = path.join(dir, 'stats.json');
    const usersPath = path.join(dir, 'users.json');

    const settings = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      : null;

    const rawStats = fs.existsSync(statsPath)
      ? JSON.parse(fs.readFileSync(statsPath, 'utf-8'))
      : {};

    const rawUsers = fs.existsSync(usersPath)
      ? JSON.parse(fs.readFileSync(usersPath, 'utf-8'))
      : {};

    return {
      settings,
      stats: {
        users: deserializeUsers(rawUsers),
        totalVotes: rawStats.totalVotes || 0,
        totalMutes: rawStats.totalMutes || 0,
        failedVotes: rawStats.failedVotes || 0,
        unauthorizedUnmutes: rawStats.unauthorizedUnmutes || 0,
        muteHistory: rawStats.muteHistory || [],
        hourlyMutes: rawStats.hourlyMutes || new Array(24).fill(0),
      },
    };
  } catch {
    return null;
  }
}

function loadAllGuilds() {
  const results = new Map();
  if (!fs.existsSync(DATA_DIR)) return results;

  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    // Load from directories (new format)
    if (entry.isDirectory()) {
      const data = loadGuildData(entry.name);
      if (data) results.set(entry.name, data);
    }
    // Load from legacy single files
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const guildId = path.basename(entry.name, '.json');
      if (!results.has(guildId)) {
        const data = loadGuildData(guildId);
        if (data) results.set(guildId, data);
      }
    }
  }
  return results;
}

module.exports = { saveGuildData, loadGuildData, loadAllGuilds };
