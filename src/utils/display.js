// Fun activity status messages based on chatter count
const activityMessages = [
  (n) => n === 0 ? 'Tumbleweeds rolling by...' : null,
  (n) => n === 1 ? 'Watching 1 lonely soul type' : null,
  (n) => n <= 3 ? `Babysitting ${n} gremlins` : null,
  (n) => n <= 6 ? `Supervising ${n} potential criminals` : null,
  (n) => n <= 10 ? `Herding ${n} caffeinated cats` : null,
  (n) => n <= 15 ? `Refereeing ${n} keyboard warriors` : null,
  (n) => n <= 25 ? `Wrangling ${n} unhinged individuals` : null,
  (n) => n <= 50 ? `Losing control of ${n} absolute menaces` : null,
  (n) => `Praying for ${n} chaotic souls`,
];

function getActivityMessage(totalChatters) {
  for (const fn of activityMessages) {
    const msg = fn(totalChatters);
    if (msg) return msg;
  }
  return `Watching ${totalChatters} chatters`;
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

const reminderTips = [
  'Did you know? You can vote to mute annoying people with `/votemute`! Democracy has never been this petty.',
  'Fun fact: Boosting the server after getting muted gives you 1 hour of immunity. Pay-to-win is alive and well.',
  'PSA: If you unmute someone without admin perms, YOU get muted instead. Think twice, hero.',
  'Reminder: `/vm view` shows the hall of shame. Check if you made the leaderboard!',
  'Pro tip: The more people chatting, the more votes needed to mute someone. Safety in numbers... or chaos.',
  'Did you know? Vote mute has immune roles. Some people are simply above the law.',
  'Hot take: If you keep getting vote muted, maybe it\'s not everyone else who\'s the problem.',
  'Friendly reminder: You can\'t vote mute bots. We\'re untouchable. Fear us.',
  'Statistics show that 100% of muted users did something to deserve it. (Source: trust me bro)',
  'The vote mute cooldown exists because some of you would mute the same person on repeat. You know who you are.',
];

// Callout templates — {user} = mention, {count} = number, {target} = their most targeted person
const calloutTemplates = {
  triggerHappy: [
    '{user} has voted to mute **{count}** people. Someone stop this menace before they strike again.',
    'Breaking news: {user} has cast **{count}** mute votes. At this point they should just become a mod.',
    'Friendly PSA: {user} has silenced **{count}** souls. Are they a hero or a villain? You decide.',
    '{user} out here with **{count}** votes cast. Bro thinks they\'re the mute police.',
    'Somebody check on {user}... they\'ve voted to mute **{count}** people. That\'s not normal behavior.',
  ],
  mostMuted: [
    '{user} has been muted **{count}** times. At some point you gotta ask... is it everyone else, or is it you?',
    'Hall of shame update: {user} just hit **{count}** mutes. A true legend of getting told to shut up.',
    '{user} — muted **{count}** times and counting. Maybe try whispering?',
    'World record attempt? {user} has been muted **{count}** times. Keep going champ.',
    'If getting muted was a sport, {user} would be an Olympic athlete with **{count}** medals.',
  ],
  rivalry: [
    '{user} has voted against {target} **{count}** times. This is personal at this point.',
    'The beef between {user} and {target} is REAL. **{count}** mute votes and counting.',
    'Someone get {user} and {target} couples therapy. **{count}** votes against each other is unhinged.',
  ],
  silentWarrior: [
    '{user} has voted to mute **{count}** people but has NEVER been muted. Untouchable.',
    'How does {user} have **{count}** mute votes but zero mutes received? Teach us your ways.',
  ],
};

module.exports = {
  getActivityMessage,
  buildBarChart,
  reminderTips,
  calloutTemplates,
};
