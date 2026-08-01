require("dotenv").config();

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// -----------------------------
// Environment configuration
// -----------------------------
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DETENTION_ROLE_ID = process.env.DETENTION_ROLE_ID;
const CLIPS_CHANNEL_ID = process.env.CLIPS_CHANNEL_ID || "";
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "";
const BOT_COLOR = process.env.BOT_COLOR || "#6D28D9";
const PORT = Number(process.env.PORT || 10000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "university-data.json");

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !DETENTION_ROLE_ID) {
  console.error(
    "Missing required environment variables. Required: DISCORD_TOKEN, CLIENT_ID, GUILD_ID, DETENTION_ROLE_ID"
  );
  process.exit(1);
}

// -----------------------------
// Lightweight persistent storage
// -----------------------------
fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultData = {
  reputation: {},
  lastRepGiven: {},
  clips: {},
  detentionTimers: {},
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      return structuredClone(defaultData);
    }

    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...structuredClone(defaultData),
      ...parsed,
      reputation: parsed.reputation || {},
      lastRepGiven: parsed.lastRepGiven || {},
      clips: parsed.clips || {},
      detentionTimers: parsed.detentionTimers || {},
    };
  } catch (error) {
    console.error("Failed to load data file:", error);
    return structuredClone(defaultData);
  }
}

let data = loadData();

function saveData() {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryFile, DATA_FILE);
}

function getRep(userId) {
  return Number(data.reputation[userId] || 0);
}

function setRep(userId, amount) {
  data.reputation[userId] = Math.max(0, Number(amount) || 0);
  saveData();
}

function isStaff(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID))
  );
}

function parseDuration(input) {
  if (!input) return null;

  const match = /^(\d+)\s*(m|h|d)$/i.exec(input.trim());
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (value < 1) return null;

  const multipliers = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  const milliseconds = value * multipliers[unit];
  const max = 30 * 86_400_000;

  if (milliseconds > max) return null;
  return milliseconds;
}

function formatDuration(milliseconds) {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(milliseconds / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(milliseconds / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

// -----------------------------
// Discord client
// -----------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// -----------------------------
// Slash commands
// -----------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("detention")
    .setDescription("Place a student in detention.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("student")
        .setDescription("The student being sent to detention.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Examples: 10m, 2h, 1d. Maximum: 30d.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why the student is being sent to detention.")
        .setRequired(true)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a student from detention.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("student")
        .setDescription("The student to release.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Optional release reason.")
        .setRequired(false)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("rep")
    .setDescription("Give a student one reputation point.")
    .addUserOption((option) =>
      option
        .setName("student")
        .setDescription("The student receiving reputation.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why they deserve reputation.")
        .setRequired(false)
        .setMaxLength(150)
    ),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a Discord University student profile.")
    .addUserOption((option) =>
      option
        .setName("student")
        .setDescription("The student to view.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the campus reputation leaderboard."),

  new SlashCommandBuilder()
    .setName("clip")
    .setDescription("Submit a Roblox or Discord clip.")
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("A direct link to the clip.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("caption")
        .setDescription("A short caption for the clip.")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Choose a clip category.")
        .setRequired(true)
        .addChoices(
          { name: "😂 Funny", value: "funny" },
          { name: "💀 Wild", value: "wild" },
          { name: "🔥 Viral", value: "viral" },
          { name: "🎮 Roblox", value: "roblox" }
        )
    ),

  new SlashCommandBuilder()
    .setName("topclips")
    .setDescription("View the most-liked campus clips."),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View the Discord University bot commands."),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether the bot is online."),
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });
  console.log(`Registered ${commands.length} guild command(s).`);
}

// -----------------------------
// Detention scheduling
// -----------------------------
const activeDetentionTimeouts = new Map();

function clearDetentionTimeout(userId) {
  const timeout = activeDetentionTimeouts.get(userId);
  if (timeout) clearTimeout(timeout);
  activeDetentionTimeouts.delete(userId);
}

function scheduleDetentionRelease(guildId, userId, releaseAt) {
  clearDetentionTimeout(userId);

  const remaining = releaseAt - Date.now();

  if (remaining <= 0) {
    releaseFromDetention(guildId, userId, "Detention sentence completed.").catch(
      console.error
    );
    return;
  }

  // Node timers cannot safely hold extremely large values.
  const safeDelay = Math.min(remaining, 2_147_000_000);

  const timeout = setTimeout(async () => {
    if (releaseAt > Date.now() + 2_000) {
      scheduleDetentionRelease(guildId, userId, releaseAt);
      return;
    }

    await releaseFromDetention(
      guildId,
      userId,
      "Detention sentence completed."
    ).catch(console.error);
  }, safeDelay);

  activeDetentionTimeouts.set(userId, timeout);
}

async function releaseFromDetention(guildId, userId, reason) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    delete data.detentionTimers[userId];
    saveData();
    return false;
  }

  if (member.roles.cache.has(DETENTION_ROLE_ID)) {
    await member.roles.remove(DETENTION_ROLE_ID, reason);
  }

  delete data.detentionTimers[userId];
  saveData();
  clearDetentionTimeout(userId);
  return true;
}

async function restoreDetentionTimers() {
  for (const [userId, detention] of Object.entries(data.detentionTimers)) {
    scheduleDetentionRelease(
      detention.guildId || GUILD_ID,
      userId,
      Number(detention.releaseAt)
    );
  }
}

// -----------------------------
// Interaction handling
// -----------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith("clip_like:")) return;

      const messageId = interaction.customId.split(":")[1];
      const clip = data.clips[messageId];

      if (!clip) {
        await interaction.reply({
          content: "That clip is no longer being tracked.",
          ephemeral: true,
        });
        return;
      }

      clip.voters = Array.isArray(clip.voters) ? clip.voters : [];
      const voterIndex = clip.voters.indexOf(interaction.user.id);

      if (voterIndex >= 0) {
        clip.voters.splice(voterIndex, 1);
      } else {
        clip.voters.push(interaction.user.id);
      }

      clip.likes = clip.voters.length;
      saveData();

      const button = new ButtonBuilder()
        .setCustomId(`clip_like:${messageId}`)
        .setLabel(`Campus Likes: ${clip.likes}`)
        .setEmoji("🔥")
        .setStyle(ButtonStyle.Primary);

      await interaction.update({
        components: [new ActionRowBuilder().addComponents(button)],
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
      await interaction.reply({
        content: `🏓 Pong! ${client.ws.ping}ms`,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setColor(BOT_COLOR)
        .setTitle("🎓 Discord University Bot")
        .setDescription("The important campus commands.")
        .addFields(
          {
            name: "🚨 Staff",
            value:
              "`/detention` — Send a student to detention\n`/release` — Release a student early",
          },
          {
            name: "⭐ Reputation",
            value:
              "`/rep` — Give reputation\n`/profile` — View a student profile\n`/leaderboard` — Campus rankings",
          },
          {
            name: "🎥 Clips",
            value:
              "`/clip` — Submit a clip\n`/topclips` — View the top clips",
          }
        )
        .setFooter({ text: "Discord University" });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (interaction.commandName === "detention") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      const user = interaction.options.getUser("student", true);
      const durationInput = interaction.options.getString("duration", true);
      const reason = interaction.options.getString("reason", true);
      const duration = parseDuration(durationInput);

      if (!duration) {
        await interaction.editReply(
          "Invalid duration. Use formats such as `10m`, `2h`, or `1d`. Maximum: 30 days."
        );
        return;
      }

      if (user.bot) {
        await interaction.editReply("Bots cannot be sent to detention.");
        return;
      }

      if (user.id === interaction.user.id) {
        await interaction.editReply("You cannot send yourself to detention.");
        return;
      }

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        await interaction.editReply("That student is not in the server.");
        return;
      }

      const detentionRole = interaction.guild.roles.cache.get(
        DETENTION_ROLE_ID
      );

      if (!detentionRole) {
        await interaction.editReply(
          "The detention role could not be found. Check `DETENTION_ROLE_ID`."
        );
        return;
      }

      const botMember = interaction.guild.members.me;
      if (
        !botMember ||
        botMember.roles.highest.comparePositionTo(detentionRole) <= 0
      ) {
        await interaction.editReply(
          "Move the bot role above the detention role in Server Settings → Roles."
        );
        return;
      }

      if (!member.manageable) {
        await interaction.editReply(
          "I cannot manage that student. Their highest role may be above mine."
        );
        return;
      }

      await member.roles.add(
        detentionRole,
        `Detention by ${interaction.user.tag}: ${reason}`
      );

      const releaseAt = Date.now() + duration;
      data.detentionTimers[user.id] = {
        guildId: interaction.guild.id,
        releaseAt,
        reason,
        moderatorId: interaction.user.id,
      };
      saveData();
      scheduleDetentionRelease(interaction.guild.id, user.id, releaseAt);

      const embed = new EmbedBuilder()
        .setColor("#DC2626")
        .setTitle("🚨 DETENTION NOTICE")
        .setDescription(`${user} has been sent to campus detention.`)
        .addFields(
          { name: "Student", value: `${user}`, inline: true },
          {
            name: "Sentence",
            value: formatDuration(duration),
            inline: true,
          },
          {
            name: "Release",
            value: `<t:${Math.floor(releaseAt / 1000)}:R>`,
            inline: true,
          },
          { name: "Reason", value: reason },
          { name: "Staff Member", value: `${interaction.user}` }
        )
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: "Discord University • Behave on campus" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "release") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      const user = interaction.options.getUser("student", true);
      const reason =
        interaction.options.getString("reason") ||
        "Released early by campus staff.";

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        await interaction.editReply("That student is not in the server.");
        return;
      }

      if (!member.roles.cache.has(DETENTION_ROLE_ID)) {
        await interaction.editReply(`${user} is not currently in detention.`);
        return;
      }

      await releaseFromDetention(interaction.guild.id, user.id, reason);

      const embed = new EmbedBuilder()
        .setColor("#22C55E")
        .setTitle("✅ STUDENT RELEASED")
        .setDescription(`${user} has been released from detention.`)
        .addFields(
          { name: "Reason", value: reason },
          { name: "Released By", value: `${interaction.user}` }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "rep") {
      const user = interaction.options.getUser("student", true);
      const reason =
        interaction.options.getString("reason") || "A respected student.";

      if (user.bot) {
        await interaction.reply({
          content: "You cannot give reputation to a bot.",
          ephemeral: true,
        });
        return;
      }

      if (user.id === interaction.user.id) {
        await interaction.reply({
          content: "You cannot give reputation to yourself.",
          ephemeral: true,
        });
        return;
      }

      const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
      const lastGiven = Number(data.lastRepGiven[cooldownKey] || 0);
      const cooldown = 12 * 60 * 60 * 1000;
      const availableAt = lastGiven + cooldown;

      if (Date.now() < availableAt && !isStaff(interaction.member)) {
        await interaction.reply({
          content: `You can give reputation again <t:${Math.floor(
            availableAt / 1000
          )}:R>.`,
          ephemeral: true,
        });
        return;
      }

      setRep(user.id, getRep(user.id) + 1);
      data.lastRepGiven[cooldownKey] = Date.now();
      saveData();

      const embed = new EmbedBuilder()
        .setColor("#FACC15")
        .setTitle("⭐ REPUTATION AWARDED")
        .setDescription(`${interaction.user} gave ${user} **+1 reputation**.`)
        .addFields(
          { name: "Reason", value: reason },
          { name: "New Reputation", value: `${getRep(user.id)}`, inline: true }
        )
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "profile") {
      const user =
        interaction.options.getUser("student") || interaction.user;
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      const all = Object.entries(data.reputation).sort(
        (a, b) => Number(b[1]) - Number(a[1])
      );
      const rankIndex = all.findIndex(([id]) => id === user.id);
      const rank = rankIndex >= 0 ? `#${rankIndex + 1}` : "Unranked";
      const rep = getRep(user.id);

      let status = "Freshman";
      if (rep >= 100) status = "Valedictorian";
      else if (rep >= 50) status = "Graduate";
      else if (rep >= 25) status = "Senior";
      else if (rep >= 10) status = "Junior";
      else if (rep >= 5) status = "Sophomore";

      const submittedClips = Object.values(data.clips).filter(
        (clip) => clip.authorId === user.id
      );
      const clipLikes = submittedClips.reduce(
        (sum, clip) => sum + Number(clip.likes || 0),
        0
      );

      const embed = new EmbedBuilder()
        .setColor(BOT_COLOR)
        .setTitle(`🎓 ${user.username}'s Student Profile`)
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(
          { name: "Campus Rank", value: rank, inline: true },
          { name: "Reputation", value: `${rep}`, inline: true },
          { name: "Student Status", value: status, inline: true },
          {
            name: "Clips Submitted",
            value: `${submittedClips.length}`,
            inline: true,
          },
          { name: "Clip Likes", value: `${clipLikes}`, inline: true },
          {
            name: "Joined Campus",
            value: member?.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
              : "Unknown",
            inline: true,
          }
        )
        .setFooter({ text: "Discord University Student Records" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      await interaction.deferReply();

      const entries = Object.entries(data.reputation)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 10);

      if (!entries.length) {
        await interaction.editReply(
          "Nobody has earned campus reputation yet."
        );
        return;
      }

      const lines = [];
      for (let index = 0; index < entries.length; index += 1) {
        const [userId, rep] = entries[index];
        const user = await client.users.fetch(userId).catch(() => null);
        const medal =
          index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `**${index + 1}.**`;
        lines.push(`${medal} ${user ? user.username : "Unknown Student"} — **${rep} rep**`);
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🏆 Campus Reputation Leaderboard")
        .setDescription(lines.join("\n"))
        .setFooter({ text: "Discord University" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "clip") {
      await interaction.deferReply({ ephemeral: true });

      const link = interaction.options.getString("link", true);
      const caption = interaction.options.getString("caption", true);
      const category = interaction.options.getString("category", true);

      let url;
      try {
        url = new URL(link);
      } catch {
        await interaction.editReply("Please provide a valid clip URL.");
        return;
      }

      if (!["http:", "https:"].includes(url.protocol)) {
        await interaction.editReply("The clip must use an HTTP or HTTPS link.");
        return;
      }

      const targetChannel = CLIPS_CHANNEL_ID
        ? interaction.guild.channels.cache.get(CLIPS_CHANNEL_ID)
        : interaction.channel;

      if (!targetChannel || !targetChannel.isTextBased()) {
        await interaction.editReply(
          "The clips channel could not be found. Check `CLIPS_CHANNEL_ID`."
        );
        return;
      }

      const categoryLabels = {
        funny: "😂 Funny",
        wild: "💀 Wild",
        viral: "🔥 Viral",
        roblox: "🎮 Roblox",
      };

      const embed = new EmbedBuilder()
        .setColor("#8B5CF6")
        .setTitle(`${categoryLabels[category] || "🎥 Clip"} • Campus Submission`)
        .setDescription(caption)
        .addFields(
          { name: "Submitted By", value: `${interaction.user}`, inline: true },
          { name: "Watch", value: `[Open Clip](${link})`, inline: true }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: "Vote using the button below" })
        .setTimestamp();

      const placeholderButton = new ButtonBuilder()
        .setCustomId("clip_like:pending")
        .setLabel("Campus Likes: 0")
        .setEmoji("🔥")
        .setStyle(ButtonStyle.Primary);

      const message = await targetChannel.send({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(placeholderButton),
        ],
      });

      const realButton = new ButtonBuilder()
        .setCustomId(`clip_like:${message.id}`)
        .setLabel("Campus Likes: 0")
        .setEmoji("🔥")
        .setStyle(ButtonStyle.Primary);

      await message.edit({
        components: [new ActionRowBuilder().addComponents(realButton)],
      });

      data.clips[message.id] = {
        messageId: message.id,
        channelId: targetChannel.id,
        guildId: interaction.guild.id,
        authorId: interaction.user.id,
        caption,
        link,
        category,
        likes: 0,
        voters: [],
        createdAt: Date.now(),
      };
      saveData();

      await interaction.editReply(
        `Your clip was submitted in ${targetChannel}.`
      );
      return;
    }

    if (interaction.commandName === "topclips") {
      const clips = Object.values(data.clips)
        .sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0))
        .slice(0, 10);

      if (!clips.length) {
        await interaction.reply("No campus clips have been submitted yet.");
        return;
      }

      const lines = clips.map((clip, index) => {
        const jumpLink = `https://discord.com/channels/${clip.guildId}/${clip.channelId}/${clip.messageId}`;
        return `**${index + 1}.** [${clip.caption}](${jumpLink}) — 🔥 **${clip.likes || 0}** • <@${clip.authorId}>`;
      });

      const embed = new EmbedBuilder()
        .setColor("#EC4899")
        .setTitle("🎥 Top Campus Clips")
        .setDescription(lines.join("\n"))
        .setFooter({ text: "Ranked by campus likes" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Interaction error:", error);

    const message =
      "Something went wrong while running that command. Check the Render logs.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => {});
    } else {
      await interaction
        .reply({ content: message, ephemeral: true })
        .catch(() => {});
    }
  }
});

// -----------------------------
// Startup
// -----------------------------
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  await restoreDetentionTimers();
  console.log("Discord University systems are ready.");
});

client.on(Events.Error, console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const app = express();
app.get("/", (_req, res) => {
  res.status(200).send("Discord University bot is online.");
});
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    discordReady: client.isReady(),
    uptime: process.uptime(),
  });
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web server listening on port ${PORT}.`);
});

(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
})();
