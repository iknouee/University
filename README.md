# Discord University Bot

A focused Discord.js v14 bot built for the Discord University server.

## Included commands

### Campus staff
- `/detention student duration reason`
- `/release student reason`

### Reputation
- `/rep student reason`
- `/profile`
- `/leaderboard`

### Clips
- `/clip link caption category`
- `/topclips`

### Utility
- `/help`
- `/ping`

## Discord Developer Portal

Enable these privileged gateway intents:

1. **Server Members Intent**
2. **Message Content Intent**

Invite the bot with these permissions:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Manage Roles
- Use Application Commands

The bot's role must be placed **above the Detention role**.

## Render setup

1. Upload these files to a GitHub repository.
2. Create a new **Web Service** on Render.
3. Connect the GitHub repository.
4. Use:
   - Build command: `npm install`
   - Start command: `npm start`
5. Add all required variables from `.env.example`.

### Persistent data

Reputation, clips and detention timers are stored in a JSON file.

Render's normal filesystem can reset after redeploys. For reliable persistence:

1. Add a Render Persistent Disk.
2. Mount it at `/var/data`.
3. Set `DATA_DIR=/var/data`.

Without a persistent disk, the bot still works, but saved data may reset after a redeploy.

## Duration examples

- `10m`
- `2h`
- `1d`

Maximum detention duration: 30 days.