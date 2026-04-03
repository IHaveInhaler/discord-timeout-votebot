const path = require('path');
const textDir = path.join(__dirname, '..', 'text');

const statusMessages = require(path.join(textDir, 'activity', 'status_messages.json'));
const reminderTips = require(path.join(textDir, 'reminders', 'tips.json'));
const selfMuteReactions = require(path.join(textDir, 'reactions', 'self_mute.json'));

const calloutTemplates = {
  triggerHappy: require(path.join(textDir, 'callouts', 'trigger_happy.json')),
  mostMuted: require(path.join(textDir, 'callouts', 'most_muted.json')),
  rivalry: require(path.join(textDir, 'callouts', 'rivalry.json')),
  silentWarrior: require(path.join(textDir, 'callouts', 'silent_warrior.json')),
};

function getActivityMessage(totalChatters) {
  const thresholds = Object.keys(statusMessages)
    .filter(k => k !== 'default')
    .map(Number)
    .sort((a, b) => a - b);

  for (const threshold of thresholds) {
    if (totalChatters <= threshold) {
      return statusMessages[String(threshold)].replace('{n}', totalChatters);
    }
  }
  return (statusMessages.default || `Watching ${totalChatters} chatters`).replace('{n}', totalChatters);
}

function buildBarChart(data, labels, maxWidth = 14) {
  const max = Math.max(...data, 1);
  const lines = ['```'];
  for (let i = 0; i < data.length; i++) {
    const barLen = Math.round((data[i] / max) * maxWidth);
    const bar = barLen > 0 ? '\u2593'.repeat(barLen) : ' ';
    const pad = ' '.repeat(maxWidth - barLen);
    const count = String(data[i]).padStart(3);
    lines.push(`${labels[i]} \u2502${bar}${pad}\u2502 ${count}`);
  }
  lines.push('```');
  return lines.join('\n');
}

module.exports = {
  getActivityMessage,
  buildBarChart,
  reminderTips,
  calloutTemplates,
  selfMuteReactions,
};
