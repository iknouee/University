require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");

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

// ============================================================
// Environment
// ============================================================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const DETENTION_ROLE_ID = process.env.DETENTION_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "";

const CLIPS_CHANNEL_ID = process.env.CLIPS_CHANNEL_ID || "";
const ANNOUNCEMENTS_CHANNEL_ID = process.env.ANNOUNCEMENTS_CHANNEL_ID || "";
const CAMPUS_NEWS_CHANNEL_ID = process.env.CAMPUS_NEWS_CHANNEL_ID || "";
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID || "";
const HOMEWORK_CHANNEL_ID = process.env.HOMEWORK_CHANNEL_ID || "";
const FEATURED_CLIPS_CHANNEL_ID = process.env.FEATURED_CLIPS_CHANNEL_ID || "";

const FRESHMAN_ROLE_ID = process.env.FRESHMAN_ROLE_ID || "";
const SOPHOMORE_ROLE_ID = process.env.SOPHOMORE_ROLE_ID || "";
const JUNIOR_ROLE_ID = process.env.JUNIOR_ROLE_ID || "";
const SENIOR_ROLE_ID = process.env.SENIOR_ROLE_ID || "";
const GRADUATE_ROLE_ID = process.env.GRADUATE_ROLE_ID || "";
const VALEDICTORIAN_ROLE_ID = process.env.VALEDICTORIAN_ROLE_ID || "";

const BOT_COLOR = process.env.BOT_COLOR || "#6D28D9";
const PORT = Number(process.env.PORT || 10000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "university-data.json");

const required = {
  DISCORD_TOKEN: TOKEN,
  CLIENT_ID,
  GUILD_ID,
  DETENTION_ROLE_ID,
};

for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

// ============================================================
// Data
// ============================================================
fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultData = {
  reputation: {},
  warnings: {},
  attendance: {},
  students: {},
  clips: {},
  homework: {},
  detentionTimers: {},
  lastRepGiven: {},
  xp: {},
  lastXpMessage: {},
  customRanks: {},
  badges: {},
  shopPurchases: {},
  dailyStats: {},
  challengeClaims: {},
  scheduledPosts: {
    leaderboardDate: "",
    campusNewsDate: "",
  },
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
      warnings: parsed.warnings || {},
      attendance: parsed.attendance || {},
      students: parsed.students || {},
      clips: parsed.clips || {},
      homework: parsed.homework || {},
      detentionTimers: parsed.detentionTimers || {},
      lastRepGiven: parsed.lastRepGiven || {},
      xp: parsed.xp || {},
      lastXpMessage: parsed.lastXpMessage || {},
      customRanks: parsed.customRanks || {},
      badges: parsed.badges || {},
      shopPurchases: parsed.shopPurchases || {},
      dailyStats: parsed.dailyStats || {},
      challengeClaims: parsed.challengeClaims || {},
      scheduledPosts: {
        ...defaultData.scheduledPosts,
        ...(parsed.scheduledPosts || {}),
      },
    };
  } catch (error) {
    console.error("Failed to load data:", error);
    return structuredClone(defaultData);
  }
}

let data = loadData();

function saveData() {
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getRep(userId) {
  return Number(data.reputation[userId] || 0);
}

function setRep(userId, amount) {
  data.reputation[userId] = Math.max(0, Number(amount) || 0);
}

function isStaff(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID))
  );
}

function parseDuration(input, maximumDays = 30) {
  const match = /^(\d+)\s*(m|h|d)$/i.exec(String(input || "").trim());
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
  const maximum = maximumDays * 86_400_000;

  return milliseconds <= maximum ? milliseconds : null;
}

function formatDuration(milliseconds) {
  if (milliseconds < 3_600_000) {
    const minutes = Math.round(milliseconds / 60_000);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  if (milliseconds < 86_400_000) {
    const hours = Math.round(milliseconds / 3_600_000);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.round(milliseconds / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function getStudentStatus(reputation) {
  if (reputation >= 100) return "Valedictorian";
  if (reputation >= 50) return "Graduate";
  if (reputation >= 25) return "Senior";
  if (reputation >= 10) return "Junior";
  if (reputation >= 5) return "Sophomore";
  return "Freshman";
}

function medal(index) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `**${index + 1}.**`;
}


function getXp(userId) {
  return Number(data.xp[userId] || 0);
}

function getLevelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function getXpForNextLevel(level) {
  return Math.pow(level + 1, 2) * 100;
}

function getUserBadges(userId) {
  data.badges[userId] ||= [];
  return data.badges[userId];
}

function addBadge(userId, badge) {
  const badges = getUserBadges(userId);
  if (!badges.includes(badge)) {
    badges.push(badge);
    saveData();
    return true;
  }
  return false;
}

function getDailyStats(userId) {
  const date = todayKey();
  const current = data.dailyStats[userId];

  if (!current || current.date !== date) {
    data.dailyStats[userId] = {
      date,
      clips: 0,
      repGiven: 0,
      attendance: false,
    };
  }

  return data.dailyStats[userId];
}

function getDailyChallenge() {
  const challenges = [
    {
      key: "attendance",
      title: "Perfect Attendance",
      description: "Use `/attendance` today.",
      reward: 5,
    },
    {
      key: "clip",
      title: "Campus Creator",
      description: "Submit one clip using `/clip` today.",
      reward: 8,
    },
    {
      key: "rep",
      title: "Support a Student",
      description: "Give reputation to another student today.",
      reward: 5,
    },
  ];

  const dayNumber = Math.floor(Date.now() / 86_400_000);
  return challenges[dayNumber % challenges.length];
}

function hasCompletedChallenge(userId, challenge) {
  const stats = getDailyStats(userId);

  if (challenge.key === "attendance") return stats.attendance;
  if (challenge.key === "clip") return stats.clips >= 1;
  if (challenge.key === "rep") return stats.repGiven >= 1;
  return false;
}

const SHOP_ITEMS = {
  clown: {
    name: "🤡 Class Clown Badge",
    price: 25,
    badge: "🤡 Class Clown",
  },
  celebrity: {
    name: "🌟 Campus Celebrity Badge",
    price: 75,
    badge: "🌟 Campus Celebrity",
  },
  legend: {
    name: "👑 Campus Legend Badge",
    price: 200,
    badge: "👑 Campus Legend",
  },
};

// ============================================================
// Client
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ============================================================
// Commands
// ============================================================
const commands = [
  new SlashCommandBuilder()
    .setName("detention")
    .setDescription("Place a student in detention.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Examples: 10m, 2h, 1d")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a student from detention.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Release reason").setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Give a student an official warning.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
        .setMaxLength(400)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a student's warnings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("suspend")
    .setDescription("Temporarily suspend a student.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Examples: 10m, 2h, 1d. Maximum 28d")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("expel")
    .setDescription("Kick a student from Discord University.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason")
        .setRequired(true)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("announcement")
    .setDescription("Post a university announcement.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Announcement title")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addStringOption((option) =>
      option
        .setName("ping")
        .setDescription("Optional ping")
        .addChoices(
          { name: "No ping", value: "none" },
          { name: "@everyone", value: "everyone" },
          { name: "@here", value: "here" }
        )
    ),

  new SlashCommandBuilder()
    .setName("rep")
    .setDescription("Give a student one reputation point.")
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason").setMaxLength(150)
    ),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a student profile.")
    .addUserOption((option) =>
      option.setName("student").setDescription("Student")
    ),

  new SlashCommandBuilder()
    .setName("enroll")
    .setDescription("Create your Discord University student record.")
    .addStringOption((option) =>
      option
        .setName("major")
        .setDescription("Choose a major")
        .setRequired(true)
        .addChoices(
          { name: "🎥 Roblox Clips", value: "Roblox Clips" },
          { name: "😂 Funny Moments", value: "Funny Moments" },
          { name: "👑 Discord Fame", value: "Discord Fame" },
          { name: "📈 Server Growth", value: "Server Growth" },
          { name: "🤖 Discord Bots", value: "Discord Bots" },
          { name: "🎭 Campus Chaos", value: "Campus Chaos" }
        )
    )
    .addStringOption((option) =>
      option.setName("bio").setDescription("Short student bio").setMaxLength(200)
    ),

  new SlashCommandBuilder()
    .setName("transcript")
    .setDescription("View a student's complete university transcript.")
    .addUserOption((option) =>
      option.setName("student").setDescription("Student")
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the reputation leaderboard."),

  new SlashCommandBuilder()
    .setName("attendance")
    .setDescription("Claim your daily attendance reward."),

  new SlashCommandBuilder()
    .setName("clip")
    .setDescription("Submit a Roblox or Discord clip.")
    .addStringOption((option) =>
      option.setName("link").setDescription("Clip URL").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("caption")
        .setDescription("Caption")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Category")
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
    .setDescription("View the top campus clips."),

  new SlashCommandBuilder()
    .setName("assignhomework")
    .setDescription("Assign a campus challenge.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Assignment title")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("task")
        .setDescription("Instructions")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("deadline")
        .setDescription("Examples: 2h, 1d, 7d")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("reward")
        .setDescription("Reputation reward")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("homework")
    .setDescription("View active homework assignments."),

  new SlashCommandBuilder()
    .setName("completehomework")
    .setDescription("Mark a student's homework as complete.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("assignment_id")
        .setDescription("Assignment ID")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("campusnews")
    .setDescription("Post campus news now.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("setrep")
    .setDescription("Set a student's reputation to an exact amount.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("New reputation amount")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(1000000)
    ),

  new SlashCommandBuilder()
    .setName("giverep")
    .setDescription("Give a student extra reputation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to add")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    ),

  new SlashCommandBuilder()
    .setName("removerep")
    .setDescription("Remove reputation from a student.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to remove")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    ),

  new SlashCommandBuilder()
    .setName("resetrep")
    .setDescription("Reset a student's reputation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setrank")
    .setDescription("Assign any server role as a student's displayed rank.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Rank role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clearrank")
    .setDescription("Remove a student's custom displayed rank.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName("student").setDescription("Student").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("View a student's rank, XP and reputation.")
    .addUserOption((option) =>
      option.setName("student").setDescription("Student")
    ),

  new SlashCommandBuilder()
    .setName("badges")
    .setDescription("View a student's achievement badges.")
    .addUserOption((option) =>
      option.setName("student").setDescription("Student")
    ),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View the campus reputation shop."),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy a campus badge using reputation.")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Shop item")
        .setRequired(true)
        .addChoices(
          { name: "🤡 Class Clown Badge — 25 rep", value: "clown" },
          { name: "🌟 Campus Celebrity Badge — 75 rep", value: "celebrity" },
          { name: "👑 Campus Legend Badge — 200 rep", value: "legend" }
        )
    ),

  new SlashCommandBuilder()
    .setName("challenge")
    .setDescription("View today's campus challenge."),

  new SlashCommandBuilder()
    .setName("claimchallenge")
    .setDescription("Claim today's completed challenge reward."),

  new SlashCommandBuilder()
    .setName("halloffame")
    .setDescription("View the top 25 students of all time."),

  new SlashCommandBuilder()
    .setName("featureclip")
    .setDescription("Feature a submitted clip.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Clip message ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unfeatureclip")
    .setDescription("Remove a clip's featured status.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Clip message ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("deleteclip")
    .setDescription("Delete a clip submission.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Clip message ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clipstats")
    .setDescription("View stats for a submitted clip.")
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Clip message ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("View the Discord University admin dashboard.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

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

// ============================================================
// Automatic reputation roles
// ============================================================
const reputationRoles = [
  { threshold: 100, roleId: VALEDICTORIAN_ROLE_ID },
  { threshold: 50, roleId: GRADUATE_ROLE_ID },
  { threshold: 25, roleId: SENIOR_ROLE_ID },
  { threshold: 10, roleId: JUNIOR_ROLE_ID },
  { threshold: 5, roleId: SOPHOMORE_ROLE_ID },
  { threshold: 0, roleId: FRESHMAN_ROLE_ID },
].filter((entry) => entry.roleId);

async function syncReputationRole(member) {
  if (!member || member.user.bot || reputationRoles.length === 0) return;

  const reputation = getRep(member.id);
  const target = reputationRoles.find(
    (entry) => reputation >= entry.threshold
  );

  const configuredRoleIds = reputationRoles.map((entry) => entry.roleId);
  const rolesToRemove = configuredRoleIds.filter(
    (roleId) => roleId !== target?.roleId && member.roles.cache.has(roleId)
  );

  if (rolesToRemove.length > 0) {
    await member.roles
      .remove(rolesToRemove, "Automatic reputation rank update")
      .catch(console.error);
  }

  if (target?.roleId && !member.roles.cache.has(target.roleId)) {
    await member.roles
      .add(target.roleId, "Automatic reputation rank update")
      .catch(console.error);
  }
}

// ============================================================
// Detention scheduling
// ============================================================
const detentionTimeouts = new Map();

function clearDetentionTimer(userId) {
  const timer = detentionTimeouts.get(userId);
  if (timer) clearTimeout(timer);
  detentionTimeouts.delete(userId);
}

async function releaseFromDetention(guildId, userId, reason) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);

  if (member?.roles.cache.has(DETENTION_ROLE_ID)) {
    await member.roles.remove(DETENTION_ROLE_ID, reason).catch(console.error);
  }

  delete data.detentionTimers[userId];
  clearDetentionTimer(userId);
  saveData();
}

function scheduleDetentionRelease(guildId, userId, releaseAt) {
  clearDetentionTimer(userId);

  const remaining = releaseAt - Date.now();

  if (remaining <= 0) {
    releaseFromDetention(
      guildId,
      userId,
      "Detention sentence completed."
    ).catch(console.error);
    return;
  }

  const safeDelay = Math.min(remaining, 2_147_000_000);

  const timeout = setTimeout(() => {
    if (releaseAt > Date.now() + 2_000) {
      scheduleDetentionRelease(guildId, userId, releaseAt);
      return;
    }

    releaseFromDetention(
      guildId,
      userId,
      "Detention sentence completed."
    ).catch(console.error);
  }, safeDelay);

  detentionTimeouts.set(userId, timeout);
}

async function restoreDetentionTimers() {
  for (const [userId, record] of Object.entries(data.detentionTimers)) {
    scheduleDetentionRelease(
      record.guildId || GUILD_ID,
      userId,
      Number(record.releaseAt)
    );
  }
}

// ============================================================
// Leaderboard and campus news
// ============================================================
async function createLeaderboardEmbed(guild) {
  const entries = Object.entries(data.reputation)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 10);

  const lines = [];

  for (let index = 0; index < entries.length; index += 1) {
    const [userId, reputation] = entries[index];
    const member = await guild.members.fetch(userId).catch(() => null);

    lines.push(
      `${medal(index)} ${member || `<@${userId}>`} — **${reputation} rep**`
    );
  }

  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("🏆 Daily Campus Leaderboard")
    .setDescription(
      lines.length ? lines.join("\n") : "Nobody has earned reputation yet."
    )
    .setFooter({ text: "Discord University • Updated daily" })
    .setTimestamp();
}

async function createCampusNewsEmbed(guild) {
  const sortedReputation = Object.entries(data.reputation).sort(
    (a, b) => Number(b[1]) - Number(a[1])
  );

  const topStudentId = sortedReputation[0]?.[0];
  const topStudent = topStudentId
    ? await guild.members.fetch(topStudentId).catch(() => null)
    : null;

  const topClip = Object.values(data.clips).sort(
    (a, b) => Number(b.likes || 0) - Number(a.likes || 0)
  )[0];

  const activeHomework = Object.values(data.homework).filter(
    (assignment) => Number(assignment.deadline) > Date.now()
  ).length;

  return new EmbedBuilder()
    .setColor(BOT_COLOR)
    .setTitle("📰 Discord University Campus News")
    .addFields(
      {
        name: "👑 Top Student",
        value: topStudent
          ? `${topStudent} with **${getRep(topStudent.id)} reputation**`
          : "No ranked student yet.",
      },
      {
        name: "🎥 Top Clip",
        value: topClip
          ? `[${topClip.caption}](https://discord.com/channels/${topClip.guildId}/${topClip.channelId}/${topClip.messageId}) — 🔥 **${topClip.likes || 0}**`
          : "No clips have been submitted yet.",
      },
      {
        name: "📚 Active Homework",
        value: `${activeHomework} active assignment${
          activeHomework === 1 ? "" : "s"
        }.`,
      },
      {
        name: "🎓 Campus Reminder",
        value:
          "Post clips, complete homework and help other students to build your reputation.",
      }
    )
    .setFooter({ text: "Discord University" })
    .setTimestamp();
}

async function postDailyContent(force = false) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;

  const date = todayKey();

  if (
    LEADERBOARD_CHANNEL_ID &&
    (force || data.scheduledPosts.leaderboardDate !== date)
  ) {
    const channel = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID);

    if (channel?.isTextBased()) {
      await channel
        .send({ embeds: [await createLeaderboardEmbed(guild)] })
        .catch(console.error);

      data.scheduledPosts.leaderboardDate = date;
    }
  }

  if (
    CAMPUS_NEWS_CHANNEL_ID &&
    (force || data.scheduledPosts.campusNewsDate !== date)
  ) {
    const channel = guild.channels.cache.get(CAMPUS_NEWS_CHANNEL_ID);

    if (channel?.isTextBased()) {
      await channel
        .send({ embeds: [await createCampusNewsEmbed(guild)] })
        .catch(console.error);

      data.scheduledPosts.campusNewsDate = date;
    }
  }

  saveData();
}

function startDailyScheduler() {
  setInterval(() => {
    const now = new Date();

    if (now.getUTCHours() >= 9) {
      postDailyContent(false).catch(console.error);
    }
  }, 10 * 60 * 1000);
}

// ============================================================
// Interaction handling
// ============================================================
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

    const commandName = interaction.commandName;

    if (commandName === "ping") {
      await interaction.reply({
        content: `🏓 Pong! ${client.ws.ping}ms`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === "help") {
      const embed = new EmbedBuilder()
        .setColor(BOT_COLOR)
        .setTitle("🎓 Discord University Bot")
        .addFields(
          {
            name: "🚨 Staff",
            value:
              "`/detention` `/release` `/warn` `/warnings` `/suspend` `/expel` `/announcement`",
          },
          {
            name: "⭐ Students",
            value:
              "`/enroll` `/profile` `/transcript` `/rep` `/leaderboard` `/attendance`",
          },
          {
            name: "🎥 Campus",
            value: "`/clip` `/topclips` `/homework`",
          },
          {
            name: "📚 Staff Activities",
            value:
              "`/assignhomework` `/completehomework` `/campusnews` `/dashboard`",
          },
          {
            name: "👑 V3 Administration",
            value:
              "`/setrep` `/giverep` `/removerep` `/resetrep` `/setrank` `/clearrank`",
          },
          {
            name: "🏆 V3 Student Features",
            value:
              "`/rank` `/badges` `/shop` `/buy` `/challenge` `/claimchallenge` `/halloffame`",
          },
          {
            name: "🎬 V3 Clip Staff",
            value:
              "`/featureclip` `/unfeatureclip` `/deleteclip` `/clipstats`",
          }
        )
        .setFooter({ text: "Discord University" });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === "warn") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser("student", true);
      const reason = interaction.options.getString("reason", true);

      if (user.bot || user.id === interaction.user.id) {
        await interaction.reply({
          content: "Choose a valid student.",
          ephemeral: true,
        });
        return;
      }

      data.warnings[user.id] ||= [];
      data.warnings[user.id].push({
        reason,
        moderatorId: interaction.user.id,
        createdAt: Date.now(),
      });

      saveData();

      const warningCount = data.warnings[user.id].length;

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("⚠️ SCHOOL WARNING")
        .setDescription(`${user} has received an official warning.`)
        .addFields(
          { name: "Reason", value: reason },
          { name: "Total Warnings", value: `${warningCount}`, inline: true },
          { name: "Issued By", value: `${interaction.user}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await user.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    if (commandName === "warnings") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser("student", true);
      const warnings = data.warnings[user.id] || [];

      const description = warnings.length
        ? warnings
            .slice(-10)
            .map(
              (warning, index) =>
                `**${index + 1}.** ${warning.reason}\nIssued <t:${Math.floor(
                  warning.createdAt / 1000
                )}:R> by <@${warning.moderatorId}>`
            )
            .join("\n\n")
        : "This student has no warnings.";

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle(`⚠️ ${user.username}'s Warnings`)
        .setDescription(description)
        .setFooter({ text: `${warnings.length} total warning(s)` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (commandName === "suspend") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      const user = interaction.options.getUser("student", true);
      const duration = parseDuration(
        interaction.options.getString("duration", true),
        28
      );
      const reason = interaction.options.getString("reason", true);

      if (!duration) {
        await interaction.editReply(
          "Invalid duration. Use `10m`, `2h`, or `1d`. Maximum: 28 days."
        );
        return;
      }

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member || !member.moderatable) {
        await interaction.editReply(
          "I cannot suspend that student. Check the bot role hierarchy."
        );
        return;
      }

      await member.timeout(
        duration,
        `Suspended by ${interaction.user.tag}: ${reason}`
      );

      const embed = new EmbedBuilder()
        .setColor("#7C3AED")
        .setTitle("⏸️ STUDENT SUSPENDED")
        .setDescription(`${user} has been temporarily suspended.`)
        .addFields(
          { name: "Duration", value: formatDuration(duration), inline: true },
          { name: "Reason", value: reason },
          { name: "Staff Member", value: `${interaction.user}` }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === "expel") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      const user = interaction.options.getUser("student", true);
      const reason = interaction.options.getString("reason", true);

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member || !member.kickable) {
        await interaction.editReply(
          "I cannot expel that student. Check the bot role hierarchy."
        );
        return;
      }

      await user
        .send(
          `You were expelled from **${interaction.guild.name}**.\nReason: ${reason}`
        )
        .catch(() => {});

      await member.kick(`Expelled by ${interaction.user.tag}: ${reason}`);

      const embed = new EmbedBuilder()
        .setColor("#991B1B")
        .setTitle("🚪 STUDENT EXPELLED")
        .setDescription(
          `**${user.tag}** has been expelled from Discord University.`
        )
        .addFields(
          { name: "Reason", value: reason },
          { name: "Staff Member", value: `${interaction.user}` }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === "announcement") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const title = interaction.options.getString("title", true);
      const message = interaction.options.getString("message", true);
      const ping = interaction.options.getString("ping") || "none";

      const channel = ANNOUNCEMENTS_CHANNEL_ID
        ? interaction.guild.channels.cache.get(ANNOUNCEMENTS_CHANNEL_ID)
        : interaction.channel;

      if (!channel?.isTextBased()) {
        await interaction.reply({
          content: "The announcements channel could not be found.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(BOT_COLOR)
        .setTitle(`📢 ${title}`)
        .setDescription(message)
        .setFooter({
          text: `Posted by ${interaction.user.username} • Discord University`,
        })
        .setTimestamp();

      const content =
        ping === "everyone" ? "@everyone" : ping === "here" ? "@here" : null;

      await channel.send({
        content,
        embeds: [embed],
        allowedMentions: {
          parse: ping === "none" ? [] : [ping],
        },
      });

      await interaction.reply({
        content: `Announcement posted in ${channel}.`,
        ephemeral: true,
      });

      return;
    }

    if (commandName === "detention") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      const user = interaction.options.getUser("student", true);
      const duration = parseDuration(
        interaction.options.getString("duration", true),
        30
      );
      const reason = interaction.options.getString("reason", true);

      if (!duration) {
        await interaction.editReply(
          "Invalid duration. Use `10m`, `2h`, or `1d`. Maximum: 30 days."
        );
        return;
      }

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      const detentionRole = interaction.guild.roles.cache.get(
        DETENTION_ROLE_ID
      );

      if (!member || !detentionRole) {
        await interaction.editReply(
          "The student or detention role could not be found."
        );
        return;
      }

      if (!member.manageable) {
        await interaction.editReply(
          "I cannot manage that student. Move the bot role higher."
        );
        return;
      }

      if (
        interaction.guild.members.me.roles.highest.comparePositionTo(
          detentionRole
        ) <= 0
      ) {
        await interaction.editReply(
          "Move the bot role above the detention role."
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
          { name: "Sentence", value: formatDuration(duration), inline: true },
          {
            name: "Release",
            value: `<t:${Math.floor(releaseAt / 1000)}:R>`,
            inline: true,
          },
          { name: "Reason", value: reason },
          { name: "Staff Member", value: `${interaction.user}` }
        )
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === "release") {
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

      if (!member?.roles.cache.has(DETENTION_ROLE_ID)) {
        await interaction.editReply(`${user} is not in detention.`);
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

    if (commandName === "enroll") {
      const major = interaction.options.getString("major", true);
      const bio =
        interaction.options.getString("bio") || "No student bio provided.";

      data.students[interaction.user.id] = {
        major,
        bio,
        enrolledAt: Date.now(),
      };

      saveData();

      const embed = new EmbedBuilder()
        .setColor(BOT_COLOR)
        .setTitle("🎓 ENROLLMENT COMPLETE")
        .setDescription(
          `${interaction.user} is now officially enrolled at Discord University.`
        )
        .addFields(
          { name: "Major", value: major, inline: true },
          {
            name: "Student Status",
            value: getStudentStatus(getRep(interaction.user.id)),
            inline: true,
          },
          { name: "Bio", value: bio }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "rep") {
      const user = interaction.options.getUser("student", true);
      const reason =
        interaction.options.getString("reason") ||
        "Helped the campus community.";

      if (user.bot || user.id === interaction.user.id) {
        await interaction.reply({
          content: "Choose another real student.",
          ephemeral: true,
        });
        return;
      }

      const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
      const lastGiven = Number(data.lastRepGiven[cooldownKey] || 0);
      const availableAt = lastGiven + 12 * 60 * 60 * 1000;

      if (!isStaff(interaction.member) && Date.now() < availableAt) {
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
      getDailyStats(interaction.user.id).repGiven += 1;
      saveData();

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (member) {
        await syncReputationRole(member);
      }

      const embed = new EmbedBuilder()
        .setColor("#FACC15")
        .setTitle("⭐ REPUTATION AWARDED")
        .setDescription(`${interaction.user} gave ${user} **+1 reputation**.`)
        .addFields(
          { name: "Reason", value: reason },
          {
            name: "New Reputation",
            value: `${getRep(user.id)}`,
            inline: true,
          },
          {
            name: "Rank",
            value: getStudentStatus(getRep(user.id)),
            inline: true,
          }
        )
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "attendance") {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const date = todayKey();

      if (data.attendance[key]?.date === date) {
        await interaction.reply({
          content: "You already checked in today. Come back tomorrow.",
          ephemeral: true,
        });
        return;
      }

      const previous = data.attendance[key];
      const streak = Number(previous?.streak || 0) + 1;
      const reward = Math.min(5, 1 + Math.floor(streak / 7));

      data.attendance[key] = {
        date,
        streak,
      };

      getDailyStats(interaction.user.id).attendance = true;
      setRep(interaction.user.id, getRep(interaction.user.id) + reward);
      saveData();

      const member = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);

      if (member) {
        await syncReputationRole(member);
      }

      const embed = new EmbedBuilder()
        .setColor("#22C55E")
        .setTitle("✅ DAILY ATTENDANCE")
        .setDescription(
          `${interaction.user} attended campus today and earned **+${reward} reputation**.`
        )
        .addFields(
          {
            name: "Attendance Streak",
            value: `${streak} day(s)`,
            inline: true,
          },
          {
            name: "Total Reputation",
            value: `${getRep(interaction.user.id)}`,
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "profile" || commandName === "transcript") {
      const user =
        interaction.options.getUser("student") || interaction.user;

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      const reputation = getRep(user.id);
      const warnings = data.warnings[user.id] || [];
      const student = data.students[user.id];
      const xp = getXp(user.id);
      const level = getLevelFromXp(xp);
      const customRank = data.customRanks[user.id];
      const badges = getUserBadges(user.id);

      const clips = Object.values(data.clips).filter(
        (clip) => clip.authorId === user.id
      );

      const clipLikes = clips.reduce(
        (total, clip) => total + Number(clip.likes || 0),
        0
      );

      const ranking = Object.entries(data.reputation).sort(
        (a, b) => Number(b[1]) - Number(a[1])
      );

      const rankIndex = ranking.findIndex(([userId]) => userId === user.id);

      const embed = new EmbedBuilder()
        .setColor(BOT_COLOR)
        .setTitle(
          commandName === "transcript"
            ? `📜 ${user.username}'s Transcript`
            : `🎓 ${user.username}'s Student Profile`
        )
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(
          {
            name: "Campus Rank",
            value: rankIndex >= 0 ? `#${rankIndex + 1}` : "Unranked",
            inline: true,
          },
          {
            name: "Reputation",
            value: `${reputation}`,
            inline: true,
          },
          {
            name: "Student Status",
            value: getStudentStatus(reputation),
            inline: true,
          },
          {
            name: "Assigned Rank",
            value: customRank?.roleId
              ? `<@&${customRank.roleId}>`
              : "No custom rank",
            inline: true,
          },
          {
            name: "Level / XP",
            value: `Level **${level}** • ${xp}/${getXpForNextLevel(level)} XP`,
            inline: true,
          },
          {
            name: "Major",
            value: student?.major || "Not enrolled",
            inline: true,
          },
          {
            name: "Clips / Likes",
            value: `${clips.length} / ${clipLikes}`,
            inline: true,
          },
          {
            name: "Warnings",
            value: `${warnings.length}`,
            inline: true,
          },
          {
            name: "Joined Campus",
            value: member?.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
              : "Unknown",
            inline: true,
          },
          {
            name: "Enrolled",
            value: student?.enrolledAt
              ? `<t:${Math.floor(student.enrolledAt / 1000)}:D>`
              : "Not enrolled",
            inline: true,
          }
        );

      if (badges.length > 0) {
        embed.addFields({
          name: "Achievement Badges",
          value: badges.slice(0, 15).join(" • "),
        });
      }

      if (student?.bio) {
        embed.addFields({
          name: "Student Bio",
          value: student.bio,
        });
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "leaderboard") {
      await interaction.reply({
        embeds: [await createLeaderboardEmbed(interaction.guild)],
      });
      return;
    }

    if (commandName === "clip") {
      await interaction.deferReply({ ephemeral: true });

      const link = interaction.options.getString("link", true);
      const caption = interaction.options.getString("caption", true);
      const category = interaction.options.getString("category", true);

      try {
        const parsedUrl = new URL(link);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        await interaction.editReply(
          "Please provide a valid HTTP or HTTPS clip URL."
        );
        return;
      }

      const channel = CLIPS_CHANNEL_ID
        ? interaction.guild.channels.cache.get(CLIPS_CHANNEL_ID)
        : interaction.channel;

      if (!channel?.isTextBased()) {
        await interaction.editReply("The clips channel could not be found.");
        return;
      }

      const labels = {
        funny: "😂 Funny",
        wild: "💀 Wild",
        viral: "🔥 Viral",
        roblox: "🎮 Roblox",
      };

      const embed = new EmbedBuilder()
        .setColor("#8B5CF6")
        .setTitle(`${labels[category]} • Campus Submission`)
        .setDescription(caption)
        .addFields(
          {
            name: "Submitted By",
            value: `${interaction.user}`,
            inline: true,
          },
          {
            name: "Watch",
            value: `[Open Clip](${link})`,
            inline: true,
          }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      const placeholderButton = new ButtonBuilder()
        .setCustomId("clip_like:pending")
        .setLabel("Campus Likes: 0")
        .setEmoji("🔥")
        .setStyle(ButtonStyle.Primary);

      const message = await channel.send({
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

      getDailyStats(interaction.user.id).clips += 1;

      data.clips[message.id] = {
        messageId: message.id,
        channelId: channel.id,
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

      await interaction.editReply(`Your clip was submitted in ${channel}.`);
      return;
    }

    if (commandName === "topclips") {
      const clips = Object.values(data.clips)
        .sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0))
        .slice(0, 10);

      const description = clips.length
        ? clips
            .map(
              (clip, index) =>
                `**${index + 1}.** [${clip.caption}](https://discord.com/channels/${clip.guildId}/${clip.channelId}/${clip.messageId}) — 🔥 **${clip.likes || 0}** • <@${clip.authorId}>`
            )
            .join("\n")
        : "No campus clips have been submitted.";

      const embed = new EmbedBuilder()
        .setColor("#EC4899")
        .setTitle("🎥 Top Campus Clips")
        .setDescription(description)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "assignhomework") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const title = interaction.options.getString("title", true);
      const task = interaction.options.getString("task", true);
      const duration = parseDuration(
        interaction.options.getString("deadline", true),
        30
      );
      const reward = interaction.options.getInteger("reward", true);

      if (!duration) {
        await interaction.reply({
          content: "Invalid deadline. Use `2h`, `1d`, or `7d`.",
          ephemeral: true,
        });
        return;
      }

      const assignmentId = Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();

      const deadline = Date.now() + duration;

      data.homework[assignmentId] = {
        id: assignmentId,
        title,
        task,
        reward,
        deadline,
        assignedBy: interaction.user.id,
        completedBy: [],
        createdAt: Date.now(),
      };

      saveData();

      const channel = HOMEWORK_CHANNEL_ID
        ? interaction.guild.channels.cache.get(HOMEWORK_CHANNEL_ID)
        : interaction.channel;

      if (!channel?.isTextBased()) {
        await interaction.reply({
          content: "The homework channel could not be found.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor("#2563EB")
        .setTitle(`📚 HOMEWORK: ${title}`)
        .setDescription(task)
        .addFields(
          {
            name: "Assignment ID",
            value: `\`${assignmentId}\``,
            inline: true,
          },
          {
            name: "Reward",
            value: `+${reward} reputation`,
            inline: true,
          },
          {
            name: "Deadline",
            value: `<t:${Math.floor(deadline / 1000)}:R>`,
            inline: true,
          }
        )
        .setFooter({
          text: `Assigned by ${interaction.user.username}`,
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      await interaction.reply({
        content: `Homework posted in ${channel}.`,
        ephemeral: true,
      });

      return;
    }

    if (commandName === "homework") {
      const assignments = Object.values(data.homework)
        .filter((assignment) => Number(assignment.deadline) > Date.now())
        .sort((a, b) => Number(a.deadline) - Number(b.deadline))
        .slice(0, 10);

      const description = assignments.length
        ? assignments
            .map(
              (assignment) =>
                `**${assignment.title}** — \`${assignment.id}\`\n${assignment.task}\nReward: **+${assignment.reward} rep** • Due <t:${Math.floor(assignment.deadline / 1000)}:R>`
            )
            .join("\n\n")
        : "There is no active homework.";

      const embed = new EmbedBuilder()
        .setColor("#2563EB")
        .setTitle("📚 Active Homework")
        .setDescription(description)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "completehomework") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const assignmentId = interaction.options
        .getString("assignment_id", true)
        .toUpperCase();

      const user = interaction.options.getUser("student", true);
      const assignment = data.homework[assignmentId];

      if (!assignment) {
        await interaction.reply({
          content: "That assignment ID could not be found.",
          ephemeral: true,
        });
        return;
      }

      assignment.completedBy ||= [];

      if (assignment.completedBy.includes(user.id)) {
        await interaction.reply({
          content: "That student has already received this reward.",
          ephemeral: true,
        });
        return;
      }

      assignment.completedBy.push(user.id);
      setRep(user.id, getRep(user.id) + Number(assignment.reward));
      saveData();

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (member) {
        await syncReputationRole(member);
      }

      const embed = new EmbedBuilder()
        .setColor("#22C55E")
        .setTitle("✅ HOMEWORK COMPLETED")
        .setDescription(
          `${user} completed **${assignment.title}** and earned **+${assignment.reward} reputation**.`
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (
      ["setrep", "giverep", "removerep", "resetrep"].includes(commandName)
    ) {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser("student", true);
      const oldAmount = getRep(user.id);
      let newAmount = oldAmount;

      if (commandName === "setrep") {
        newAmount = interaction.options.getInteger("amount", true);
      } else if (commandName === "giverep") {
        newAmount =
          oldAmount + interaction.options.getInteger("amount", true);
      } else if (commandName === "removerep") {
        newAmount =
          oldAmount - interaction.options.getInteger("amount", true);
      } else {
        newAmount = 0;
      }

      setRep(user.id, newAmount);
      saveData();

      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (member) await syncReputationRole(member);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FACC15")
            .setTitle("⭐ REPUTATION UPDATED")
            .setDescription(`${user}'s reputation was updated.`)
            .addFields(
              { name: "Previous", value: `${oldAmount}`, inline: true },
              { name: "New", value: `${getRep(user.id)}`, inline: true },
              {
                name: "Automatic Status",
                value: getStudentStatus(getRep(user.id)),
                inline: true,
              },
              { name: "Updated By", value: `${interaction.user}` }
            )
            .setTimestamp(),
        ],
      });
      return;
    }

    if (commandName === "setrank") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser("student", true);
      const role = interaction.options.getRole("role", true);
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

      if (!member) {
        await interaction.reply({
          content: "That student is not in the server.",
          ephemeral: true,
        });
        return;
      }

      if (role.id === interaction.guild.id || role.managed) {
        await interaction.reply({
          content: "Choose a normal server role, not @everyone or a managed role.",
          ephemeral: true,
        });
        return;
      }

      const botMember = interaction.guild.members.me;
      if (!botMember || botMember.roles.highest.comparePositionTo(role) <= 0) {
        await interaction.reply({
          content: "Move the bot role above the selected rank role.",
          ephemeral: true,
        });
        return;
      }

      const oldRank = data.customRanks[user.id];
      if (
        oldRank?.roleId &&
        oldRank.roleId !== role.id &&
        member.roles.cache.has(oldRank.roleId)
      ) {
        await member.roles
          .remove(oldRank.roleId, "Custom rank changed")
          .catch(() => {});
      }

      await member.roles.add(role, `Custom rank set by ${interaction.user.tag}`);

      data.customRanks[user.id] = {
        roleId: role.id,
        roleName: role.name,
        setBy: interaction.user.id,
        setAt: Date.now(),
      };
      saveData();

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(role.color || BOT_COLOR)
            .setTitle("🎓 CUSTOM RANK ASSIGNED")
            .setDescription(`${user} has been assigned the rank ${role}.`)
            .addFields({
              name: "Profile Display",
              value: "This role will now appear as their assigned rank on `/profile`, `/transcript`, and `/rank`.",
            })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (commandName === "clearrank") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser("student", true);
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);
      const rank = data.customRanks[user.id];

      if (!rank) {
        await interaction.reply({
          content: "That student does not have a custom rank.",
          ephemeral: true,
        });
        return;
      }

      if (member?.roles.cache.has(rank.roleId)) {
        await member.roles
          .remove(rank.roleId, "Custom rank cleared")
          .catch(() => {});
      }

      delete data.customRanks[user.id];
      saveData();

      await interaction.reply({
        content: `${user}'s custom rank has been cleared.`,
      });
      return;
    }

    if (commandName === "rank") {
      const user =
        interaction.options.getUser("student") || interaction.user;
      const rep = getRep(user.id);
      const xp = getXp(user.id);
      const level = getLevelFromXp(xp);
      const customRank = data.customRanks[user.id];

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(BOT_COLOR)
            .setTitle(`🎓 ${user.username}'s Campus Rank`)
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .addFields(
              {
                name: "Assigned Rank",
                value: customRank?.roleId
                  ? `<@&${customRank.roleId}>`
                  : "No custom rank",
                inline: true,
              },
              {
                name: "Automatic Status",
                value: getStudentStatus(rep),
                inline: true,
              },
              { name: "Reputation", value: `${rep}`, inline: true },
              {
                name: "Level",
                value: `${level}`,
                inline: true,
              },
              {
                name: "XP Progress",
                value: `${xp}/${getXpForNextLevel(level)}`,
                inline: true,
              }
            )
            .setTimestamp(),
        ],
      });
      return;
    }

    if (commandName === "badges") {
      const user =
        interaction.options.getUser("student") || interaction.user;
      const badges = getUserBadges(user.id);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#F59E0B")
            .setTitle(`🎖️ ${user.username}'s Badges`)
            .setDescription(
              badges.length
                ? badges.join("\n")
                : "This student has not unlocked any badges yet."
            )
            .setTimestamp(),
        ],
      });
      return;
    }

    if (commandName === "shop") {
      const lines = Object.entries(SHOP_ITEMS).map(
        ([key, item]) =>
          `**${item.name}** — ${item.price} reputation\nBuy with \`/buy item:${key}\``
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#10B981")
            .setTitle("🛒 Campus Reputation Shop")
            .setDescription(lines.join("\n\n"))
            .setFooter({
              text: `Your balance: ${getRep(interaction.user.id)} reputation`,
            }),
        ],
      });
      return;
    }

    if (commandName === "buy") {
      const itemKey = interaction.options.getString("item", true);
      const item = SHOP_ITEMS[itemKey];

      if (!item) {
        await interaction.reply({
          content: "That shop item does not exist.",
          ephemeral: true,
        });
        return;
      }

      const badges = getUserBadges(interaction.user.id);
      if (badges.includes(item.badge)) {
        await interaction.reply({
          content: "You already own that badge.",
          ephemeral: true,
        });
        return;
      }

      const balance = getRep(interaction.user.id);
      if (balance < item.price) {
        await interaction.reply({
          content: `You need ${item.price} reputation, but you only have ${balance}.`,
          ephemeral: true,
        });
        return;
      }

      setRep(interaction.user.id, balance - item.price);
      addBadge(interaction.user.id, item.badge);
      saveData();

      const member = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (member) await syncReputationRole(member);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#10B981")
            .setTitle("✅ SHOP PURCHASE")
            .setDescription(
              `${interaction.user} purchased **${item.name}** for **${item.price} reputation**.`
            )
            .addFields({
              name: "Remaining Reputation",
              value: `${getRep(interaction.user.id)}`,
            })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (commandName === "challenge") {
      const challenge = getDailyChallenge();
      const completed = hasCompletedChallenge(
        interaction.user.id,
        challenge
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#3B82F6")
            .setTitle(`🎯 Daily Challenge: ${challenge.title}`)
            .setDescription(challenge.description)
            .addFields(
              {
                name: "Reward",
                value: `+${challenge.reward} reputation`,
                inline: true,
              },
              {
                name: "Status",
                value: completed ? "✅ Completed" : "⏳ In progress",
                inline: true,
              }
            )
            .setFooter({
              text: "Use /claimchallenge after completing it.",
            }),
        ],
      });
      return;
    }

    if (commandName === "claimchallenge") {
      const challenge = getDailyChallenge();
      const claimKey = `${todayKey()}:${interaction.user.id}`;

      if (data.challengeClaims[claimKey]) {
        await interaction.reply({
          content: "You already claimed today's challenge.",
          ephemeral: true,
        });
        return;
      }

      if (!hasCompletedChallenge(interaction.user.id, challenge)) {
        await interaction.reply({
          content: `You have not completed today's challenge: **${challenge.title}**.`,
          ephemeral: true,
        });
        return;
      }

      data.challengeClaims[claimKey] = true;
      setRep(
        interaction.user.id,
        getRep(interaction.user.id) + challenge.reward
      );
      addBadge(interaction.user.id, "🎯 Challenge Completed");
      saveData();

      const member = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (member) await syncReputationRole(member);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#22C55E")
            .setTitle("🎯 CHALLENGE REWARD CLAIMED")
            .setDescription(
              `${interaction.user} earned **+${challenge.reward} reputation** for completing **${challenge.title}**.`
            )
            .setTimestamp(),
        ],
      });
      return;
    }

    if (commandName === "halloffame") {
      const entries = Object.entries(data.reputation)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 25);

      const lines = entries.map(
        ([userId, rep], index) =>
          `${medal(index)} <@${userId}> — **${rep} rep**`
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFD700")
            .setTitle("👑 Discord University Hall of Fame")
            .setDescription(
              lines.length ? lines.join("\n") : "No students are ranked yet."
            )
            .setFooter({ text: "Top 25 students of all time" })
            .setTimestamp(),
        ],
      });
      return;
    }

    if (
      ["featureclip", "unfeatureclip", "deleteclip", "clipstats"].includes(
        commandName
      )
    ) {
      const messageId = interaction.options.getString("message_id", true);
      const clip = data.clips[messageId];

      if (!clip) {
        await interaction.reply({
          content: "That clip message ID is not being tracked.",
          ephemeral: true,
        });
        return;
      }

      if (commandName === "clipstats") {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#EC4899")
              .setTitle("🎬 Clip Statistics")
              .setDescription(clip.caption)
              .addFields(
                { name: "Author", value: `<@${clip.authorId}>`, inline: true },
                {
                  name: "Campus Likes",
                  value: `${clip.likes || 0}`,
                  inline: true,
                },
                {
                  name: "Featured",
                  value: clip.featured ? "Yes" : "No",
                  inline: true,
                },
                {
                  name: "Original",
                  value: `[Open Submission](https://discord.com/channels/${clip.guildId}/${clip.channelId}/${clip.messageId})`,
                }
              )
              .setTimestamp(),
          ],
        });
        return;
      }

      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      if (commandName === "featureclip") {
        clip.featured = true;
        clip.featuredAt = Date.now();
        clip.featuredBy = interaction.user.id;

        if (FEATURED_CLIPS_CHANNEL_ID) {
          const featuredChannel = interaction.guild.channels.cache.get(
            FEATURED_CLIPS_CHANNEL_ID
          );

          if (featuredChannel?.isTextBased()) {
            await featuredChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor("#FFD700")
                  .setTitle("🌟 FEATURED CAMPUS CLIP")
                  .setDescription(clip.caption)
                  .addFields(
                    { name: "Creator", value: `<@${clip.authorId}>`, inline: true },
                    {
                      name: "Campus Likes",
                      value: `${clip.likes || 0}`,
                      inline: true,
                    },
                    {
                      name: "Watch",
                      value: `[Open Clip](${clip.link})`,
                    }
                  )
                  .setTimestamp(),
              ],
            });
          }
        }

        addBadge(clip.authorId, "🌟 Featured Creator");
        saveData();

        await interaction.reply({
          content: `Clip \`${messageId}\` is now featured.`,
        });
        return;
      }

      if (commandName === "unfeatureclip") {
        clip.featured = false;
        saveData();

        await interaction.reply({
          content: `Clip \`${messageId}\` is no longer featured.`,
        });
        return;
      }

      if (commandName === "deleteclip") {
        const channel = interaction.guild.channels.cache.get(clip.channelId);
        if (channel?.isTextBased()) {
          const message = await channel.messages
            .fetch(messageId)
            .catch(() => null);
          if (message) await message.delete().catch(() => {});
        }

        delete data.clips[messageId];
        saveData();

        await interaction.reply({
          content: `Clip \`${messageId}\` was deleted from the database.`,
          ephemeral: true,
        });
        return;
      }
    }

    if (commandName === "dashboard") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const today = todayKey();
      const attendanceToday = Object.values(data.attendance).filter(
        (record) => record.date === today
      ).length;
      const activeDetentions = Object.keys(data.detentionTimers).length;
      const activeHomework = Object.values(data.homework).filter(
        (assignment) => Number(assignment.deadline) > Date.now()
      ).length;
      const totalWarnings = Object.values(data.warnings).reduce(
        (total, warnings) => total + warnings.length,
        0
      );
      const featuredClips = Object.values(data.clips).filter(
        (clip) => clip.featured
      ).length;

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(BOT_COLOR)
            .setTitle("📊 Discord University Dashboard")
            .addFields(
              {
                name: "Enrolled Students",
                value: `${Object.keys(data.students).length}`,
                inline: true,
              },
              {
                name: "Tracked Students",
                value: `${Object.keys(data.reputation).length}`,
                inline: true,
              },
              {
                name: "Attendance Today",
                value: `${attendanceToday}`,
                inline: true,
              },
              {
                name: "Submitted Clips",
                value: `${Object.keys(data.clips).length}`,
                inline: true,
              },
              {
                name: "Featured Clips",
                value: `${featuredClips}`,
                inline: true,
              },
              {
                name: "Active Homework",
                value: `${activeHomework}`,
                inline: true,
              },
              {
                name: "Total Warnings",
                value: `${totalWarnings}`,
                inline: true,
              },
              {
                name: "Active Detentions",
                value: `${activeDetentions}`,
                inline: true,
              },
              {
                name: "Custom Ranks",
                value: `${Object.keys(data.customRanks).length}`,
                inline: true,
              }
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }

    if (commandName === "campusnews") {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: "You are not campus staff.",
          ephemeral: true,
        });
        return;
      }

      const channel = CAMPUS_NEWS_CHANNEL_ID
        ? interaction.guild.channels.cache.get(CAMPUS_NEWS_CHANNEL_ID)
        : interaction.channel;

      if (!channel?.isTextBased()) {
        await interaction.reply({
          content: "The campus news channel could not be found.",
          ephemeral: true,
        });
        return;
      }

      await channel.send({
        embeds: [await createCampusNewsEmbed(interaction.guild)],
      });

      await interaction.reply({
        content: `Campus news posted in ${channel}.`,
        ephemeral: true,
      });

      return;
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

// ============================================================
// Chat XP and automatic achievements
// ============================================================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const userId = message.author.id;
    const lastAward = Number(data.lastXpMessage[userId] || 0);

    if (Date.now() - lastAward < 60_000) return;

    const oldXp = getXp(userId);
    const oldLevel = getLevelFromXp(oldXp);
    const gained = 5 + Math.floor(Math.random() * 6);
    const newXp = oldXp + gained;
    const newLevel = getLevelFromXp(newXp);

    data.xp[userId] = newXp;
    data.lastXpMessage[userId] = Date.now();

    if (newLevel > oldLevel) {
      addBadge(userId, `⭐ Reached Level ${newLevel}`);

      await message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(BOT_COLOR)
              .setTitle("⭐ LEVEL UP")
              .setDescription(
                `${message.author} reached **Level ${newLevel}** at Discord University!`
              )
              .setTimestamp(),
          ],
        })
        .catch(() => {});
    }

    const clips = Object.values(data.clips).filter(
      (clip) => clip.authorId === userId
    );
    const likes = clips.reduce(
      (total, clip) => total + Number(clip.likes || 0),
      0
    );

    if (clips.length >= 1) addBadge(userId, "🎥 First Clip");
    if (likes >= 100) addBadge(userId, "🔥 100 Clip Likes");
    if (getRep(userId) >= 100) addBadge(userId, "🎓 Graduate");
    if ((data.attendance[`${message.guild.id}:${userId}`]?.streak || 0) >= 7) {
      addBadge(userId, "📅 7 Day Attendance");
    }

    saveData();
  } catch (error) {
    console.error("XP system error:", error);
  }
});

// ============================================================
// Startup
// ============================================================
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  await restoreDetentionTimers();
  startDailyScheduler();
  await postDailyContent(false);

  console.log("Discord University v3 is ready.");
});

client.on(Events.Error, console.error);

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const app = express();

app.get("/", (_request, response) => {
  response.status(200).send("Discord University bot v3 is online.");
});

app.get("/health", (_request, response) => {
  response.status(200).json({
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
