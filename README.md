# Vote Mute Bot

A dumb Discord bot that lets your server **vote to mute people**. Think votekick in games, but pettier.

This is literally just a vibe-coded April Fools project (yes, two days late, shut up) because the concept of democratically silencing someone is inherently hilarious. It's not meant to be taken seriously. It's meant to be funny.

## What does it do?

Someone annoying you? Type `/votemute @them` and a vote starts. If enough people agree, they get timed out. Democracy wins. The muted person gets a DM listing everyone who voted against them (because transparency is important, even in chaos).

Oh, and if someone boosts the server after getting muted, they get immunity. Pay-to-win baby.

## Features

- `/votemute @user` - Start a community vote to mute someone
- `/vm view` - Paginated dashboard with stats, leaderboards, and a threat level indicator
- `/vm configure` - Interactive settings menu with ON/OFF confirmations and modals
- `/vm setup` - Multi-page setup wizard with permission checks and mod bot detection
- `/vm theme` - 8 themes that change all bot text (Law & Order, Pirate, WWE, etc.)
- Vote progress bar in the embed
- Configurable everything (threshold, durations, max active votes, cooldowns, min messages)
- Self-muting allowed (the bot roasts you for it, and marks you with "(really?)" in the DM)
- Booster immunity (configurable toggle and duration)
- Unauthorized unmute detection (non-admins who remove a vote mute get muted themselves)
- Immune roles and manager role for bot management
- Random callout messages that roast users based on their stats
- Hall of Shame leaderboards with streaks, rivalries, and fun facts
- Audit log channel for compact moderation logging
- Persistent storage (settings save immediately, stats batch every 60s)
- Bot status shows active chatters with funny messages ("Herding 8 caffeinated cats")
- All bot text stored in editable JSON files

## Setup (read this carefully)

### Step 1: Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name (like "Vote Mute" or whatever)
3. Go to the **Bot** tab on the left sidebar
4. Click **Reset Token** and **copy the token** - you'll need this. Don't share it with anyone. Seriously.
5. Scroll down to **Privileged Gateway Intents** and turn ON:
   - **Server Members Intent** (needed to detect boosts and fetch members)
   - **Message Content Intent** (needed to track who's actively chatting)
6. Save your changes

### Step 2: Get Your Client ID

1. Still in the Developer Portal, go to **General Information** (left sidebar, top option)
2. Copy the **Application ID** - this is your Client ID

### Step 3: Clone and Configure

```bash
git clone <this-repo>
cd "Timeout Bot"
npm install
```

Now create your `.env` file. Copy the example:

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
DISCORD_TOKEN=paste-your-bot-token-here
CLIENT_ID=paste-your-application-id-here
```

**Your `.env` file should look like this (with your actual values):**

```env
DISCORD_TOKEN=DJAJDDKPADDNADDAD.yourtoken
CLIENT_ID=1234567890123456789
```

- `DISCORD_TOKEN` = The bot token from Step 1 (the one you copied when you clicked Reset Token)
- `CLIENT_ID` = The Application ID from Step 2

That's it. Just two values. Nothing else.

### Step 4: Invite the Bot to Your Server

1. Go back to https://discord.com/developers/applications
2. Select your bot application
3. Go to **OAuth2** in the left sidebar
4. Under **OAuth2 URL Generator**:
   - Check the `bot` scope
   - Check the `applications.commands` scope
5. Under **Bot Permissions**, check these boxes:
   - Timeout Members
   - Send Messages
   - Embed Links
   - Read Message History
   - View Audit Log
6. Copy the generated URL at the bottom
7. Paste it in your browser
8. Select the server you want to add it to (you need admin/manage server perms)
9. Click Authorize

### Step 5: Deploy Commands and Start

```bash
# Register the slash commands with Discord (do this once, or after command changes)
npm run deploy

# Start the bot
npm start
```

You should see:

```
Registering slash commands...
Commands registered successfully!
Logged in as YourBot#1234
```

If you get a "disallowed intents" error, go back to Step 1 point 5 and make sure both intents are turned ON.

### Too Lazy for All That? Use Docker

If you need it to be even easier, here's a Docker setup:

```bash
# Make sure you've created your .env file (see Step 3)
# Then just:
docker compose up -d
```

That's it. Slash commands are automatically registered on first run. The `data/` folder is mounted so your stats persist across container restarts.

To stop: `docker compose down`
To see logs: `docker compose logs -f votemute`

### Step 6: Run Setup in Discord

In your server, type `/vm setup` to walk through the setup wizard. It's a multi-page guide that covers:

1. **Permissions** - Verifies the bot has everything it needs (shows checkmarks/crosses)
2. **Watch Channel** - Pick where the bot posts mute announcements, callouts, reminders
3. **Audit Log Channel** - Optional, for compact moderation logs (separate from watch channel)
4. **Wick Warning** - Only shows if Wick bot is detected, with step-by-step whitelisting instructions
5. **Vote Settings** - Review/change threshold, durations, etc. (defaults work fine)
6. **Fun Stuff** - Toggle callouts, reminders, self-mute, pick a theme
7. **Summary** - Shows everything you configured

## Using Other Moderation Bots?

If you use **Wick**, **Dyno**, **Carl-bot**, or similar, you need to whitelist this bot so they don't flag its timeout actions as a nuke attempt:

- **Wick**: Go to wickbot.com/dashboard > your server > Whitelist > Whitelisted Bots > add the bot's user ID
- **Dyno**: Go to dyno.gg/manage > Automod > add to whitelist
- **Carl-bot**: Go to carl.gg/dashboard > Automod > whitelist

You can get the bot's ID from `/vm setup` (Step 1 shows it).

## Themes

The bot has 8 themes that change ALL bot text - vote embeds, DMs, announcements, self-mute roasts, everything (except `/vm setup` and `/vm configure`). Switch with `/vm theme`.

| Theme | Vibe |
|-------|------|
| **Default** | Standard vote mute |
| **Yay/Nay** | Same but with Yay!/Nay! buttons |
| **Law & Order** | "COURT IS NOW IN SESSION" - full legal cosplay |
| **Pirate** | "Walk the plank, scallywag" - arrr |
| **Corporate** | "Per company policy Section 4.2.1..." - dry HR energy |
| **WWE** | "BAH GAWD! SOMEBODY STOP THE MATCH!" - full announcer mode |
| **Nature Documentary** | "And here we observe the herd..." - David Attenborough vibes |
| **Gordon Ramsay** | "THIS CHAT IS RAW! GET OUT OF MY KITCHEN!" |

Themes persist across restarts. You can also create your own by adding a JSON file to `src/text/themes/` - copy any existing theme and edit it.

## Manager Role

You can set a **Manager Role** via `/vm configure`. Users with this role:
- Can use `/vm setup`, `/vm configure`, and `/vm theme`
- Won't be penalized for unauthorized unmutes
- Can cancel active votes
- Bypass initiator and target cooldowns

## Configuration Options

All configurable via `/vm configure`. Toggle settings show current state and give you explicit ON/OFF buttons instead of blind toggling.

| Setting | Default | Description |
|---------|---------|-------------|
| Required % for Vote | 60% | Percentage of active chatters needed to pass |
| Mute Duration | 5 min | How long the mute lasts |
| Vote Duration | 60s | How long the vote stays open |
| Activity Window | 5 min | How far back to look for active chatters |
| Min Messages for Active | 1 | Min messages in the window to count as active |
| Max Active Votes | 1 | How many votes can run simultaneously |
| Initiator Cooldown | OFF | Seconds before a user can start another vote |
| Theme | Default | Bot text theme (use `/vm theme` to change) |
| Allow Self-Mute | ON | Whether users can vote mute themselves |
| Immune Roles | None | Roles that can't be vote muted |
| Manager Role | None | Role that can manage the bot (see above) |
| Boost Immunity | ON | Whether server boosters get immunity |
| Boost Immunity Duration | 60 min | How long boost immunity lasts |
| Periodic Reminders | OFF | Fun tips posted every 2 hours |
| Random Callouts | OFF | Roasts users based on their mute stats every ~45 min |
| Exponential Muting | OFF | Doubles mute duration on repeat mutes within 30 min (capped at 2hrs). This is a terrible idea. |

## Audit Log Channel

Set an audit log channel via `/vm setup` or `/vm configure` for compact one-line entries covering:
- Vote started / passed / expired / cancelled
- User muted
- Unauthorized unmute attempts
- Boost immunity granted

This is separate from the watch channel - the watch channel gets full embeds and announcements, the audit channel gets short logs for moderation tracking.

## Customizing Text & Messages

All the bot's text is stored in easy-to-edit JSON files under `src/text/`. Want to change what the bot says? Just edit the files:

```
src/text/
  activity/
    status_messages.json    - Bot status messages ("Herding 8 caffeinated cats")
  callouts/
    trigger_happy.json      - Roasts for people who vote a lot
    most_muted.json         - Roasts for people who get muted a lot
    rivalry.json            - Messages about vote rivalries
    silent_warrior.json     - Messages about people who vote but never get muted
  reactions/
    self_mute.json          - Default reactions when someone votes to mute themselves
  reminders/
    tips.json               - Periodic tip messages
  themes/
    default.json            - Default theme
    law_and_order.json      - Court/legal theme
    pirate.json             - Pirate theme
    corporate.json          - HR/corporate theme
    wwe.json                - Wrestling announcer theme
    nature.json             - Nature documentary theme
    ramsay.json             - Gordon Ramsay theme
    yay_nay.json            - Yay/Nay button style theme
```

Templates use `{user}` for mentions, `{count}` for numbers, `{target}` for rival mentions, `{n}` for chatter count, `{initiator}` for vote starter, `{duration}` for mute length, `{server}` for server name, and `{executor}` for the person who unmuted. Just edit the JSON files - no code changes needed, just restart the bot.

To create a custom theme, copy any existing theme JSON and save it with a new name. It'll automatically show up in `/vm theme`.

## How Does It Count Active Users?

The bot listens to every message sent in the server. Each time someone sends a message, it records their user ID and a message count. When a vote mute is initiated, the bot looks back within the **Activity Window** (default: 5 minutes) and counts how many unique users sent at least the **Min Messages** threshold (default: 1) during that time.

That's your "active chatters" count. The threshold percentage is applied to that number to figure out how many votes are needed.

**Example:** 10 people chatted in the last 5 minutes, threshold is 60% = **6 votes needed**. If only 2 people chatted, and threshold is above 50%, minimum 2 votes are always required (no solo mutes).

The active chatter count is shown in the dashboard (`/vm view`) and in the vote embed itself so everyone can see the math.

## Data Storage

Guild data is stored in `data/<guild-id>/` with separate files:

```
data/
  <guild-id>/
    settings.json    - Guild configuration (saved immediately on change)
    stats.json       - Vote/mute counters, history, hourly chart (batched every 60s)
    users.json       - Per-user stats, rivalries, streaks (batched every 60s)
```

Old single-file format is auto-migrated on first load.

## Project Structure

```
src/
  index.js              - Entry point, event routing, activity status
  deploy-commands.js    - Slash command registration
  handlers/
    votemute.js         - Vote mute logic, button handling, theme integration
    settings.js         - Dashboard, configure, setup wizard, theme selector
    events.js           - Boost detection, unauthorized unmute protection
  utils/
    state.js            - All shared state, settings, stats tracking
    storage.js          - Persistent JSON file storage (split per type)
    display.js          - Theme loader, activity messages, charts, callouts
    audit.js            - Audit log channel logging
  text/                 - All editable bot text (see Customizing section)
data/                   - Auto-generated guild data (gitignored)
```

## Why?

Because vote muting is stupid, and that's exactly what makes it funny.

---

*Vibe coded with love and questionable judgment.*

*Licensed under MIT - do whatever you want with it.*
