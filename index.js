require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  AuditLogEvent,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection
} = require("@discordjs/voice");

const ytdl = require("@distube/ytdl-core");
const yts = require("yt-search");

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH || "./database.json";
const DB_DIR = path.dirname(DB_PATH);
if (DB_DIR !== "." && !fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function loadDB() { 
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, warnings: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

let db = loadDB();

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const prefix = "?";

const casinoSessions = new Map();
const giveaways = new Map();
const beefSessions = new Map();
const musicQueues = new Map();
const snipes = new Map();
const voiceOwners = new Map();
const vaultPending = new Set();

const AUTO_DISCONNECT_TIME = 30 * 1000; // 30 seconds

const spamTracker = new Map();
const raidTracker = new Map();

const SECURITY_LOG_CHANNEL_ID = "1497696018265800885";

const SECURITY = {
  antiSpam: true,
  antiLinks: true,
  antiMassMention: true,
  autoTimeout: true,
  spamLimit: 5,
  spamTime: 7000,
  timeoutTime: 60 * 1000,
  maxMentions: 5,

  // Extra security log modules
  logMessageDelete: true,
  logMessageEdit: true,
  logJoinLeave: true,
  logRoleChanges: true,
  logBanKick: true,
  raidProtection: true,
  raidJoinLimit: 5,
  raidJoinTime: 10 * 1000
};

async function securityLog(guild, data) {
  if (!SECURITY_LOG_CHANNEL_ID) return;

  const channel = guild.channels.cache.get(SECURITY_LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Security Action Logged")
    .setColor(data.color || "Red")
    .addFields(
      {
        name: "Action",
        value: `\`${data.action}\``,
        inline: true
      },
      {
        name: "User",
        value: `${data.user} \n\`${data.userId}\``,
        inline: true
      },
      {
        name: "Channel",
        value: `${data.channel}`,
        inline: true
      },
      {
        name: "Message Content",
        value: data.content
          ? `\`\`\`${data.content.slice(0, 900)}\`\`\``
          : "`No message content found.`",
        inline: false
      },
      {
        name: "Reason",
        value: data.reason || "`No reason provided.`",
        inline: false
      }
    )
    .setFooter({
      text: `Guild ID: ${guild.id}`
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Jump to Channel")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guild.id}/${data.channelId}`),

    new ButtonBuilder()
      .setCustomId(`security_user_${data.userId}`)
      .setLabel("User Info")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`security_id_${data.userId}`)
      .setLabel("Copy User ID")
      .setStyle(ButtonStyle.Primary)
  );

  channel.send({
    embeds: [embed],
    components: [row]
  }).catch(() => {});
}

const shopItems = {
  vip: { name: "VIP Pass", price: 5000 },
  rolex: { name: "Diamond Rolex", price: 15000 },
  chain: { name: "Iced Out Chain", price: 50000 },
  hellcat: { name: "Hellcat", price: 250000 },
  lambo: { name: "Lamborghini", price: 1000000 },
  mansion: { name: "Mansion", price: 5000000 },
  yacht: { name: "Yacht", price: 25000000 },
  plane: { name: "Private Plane", price: 100000000 },
  jet: { name: "Private Jet", price: 500000000 },
  island: { name: "Private Island", price: 1000000000 },
  tafta: { name: "Tafta God", price: 10000000000 },
  fet: { name: "Fet God", price: 10000000000 },
  pineapple: { name: "Pineapple Tung Tung God", price: 10000000000 }
};

const jobs = {
  none: { name: "No Job", pay: 150, college: 0 },
  cashier: { name: "Cashier", pay: 350, college: 1 },
  mechanic: { name: "Mechanic", pay: 700, college: 2 },
  developer: { name: "Developer", pay: 1300, college: 3 },
  banker: { name: "Banker", pay: 2200, college: 4 },
  ceo: { name: "CEO", pay: 4000, college: 5 },
  cartel: { name: "Cartel Member", pay: 12000000, college: 0, secret: true },
  benjaminNetanyahu: { name: "Benjamin Netanyahu", pay: 1000000000, college: 0, secret: true }
};

const collegeTests = {
  1: { question: "What is 25 + 17?", answers: ["42", "38", "41", "47"], correct: "42" },
  2: { question: "If you earn $350 for 4 shifts, how much is that?", answers: ["$1,400", "$1,200", "$900", "$1,750"], correct: "$1,400" },
  3: { question: "What does CPU stand for?", answers: ["Central Processing Unit", "Computer Power User", "Control Program Unit", "Core Process Utility"], correct: "Central Processing Unit" },
  4: { question: "What is profit?", answers: ["Money left after costs", "Money before costs", "Debt", "Taxes"], correct: "Money left after costs" },
  5: { question: "What is 15% of 2000?", answers: ["300", "200", "150", "500"], correct: "300" }
};

const roastLines = [
  "Shut up nigga you just mad cuz yo Direct TV cable box isn't directly connected to yo TV boy",
  "Shut up nigga you feel burps form in yo throat and piss yo pants boy fuck is you saying",
  "Nigga yo ass barely tipped over a Book in a library and the shelf opened up and revealed a secret base nigga yo ass is the real Bat-Man boy fuck is wrong with you",
  "Yo ass was the most hated fire bender because you'd always bring flame throwers to cheat in Fire Training classes boy",
  "You built like a side quest nobody accepted.",
  "Nigga you was playing agario and got double splitted by a nigga named TimmyTwoThumbs boy you ugly as fuck",
  "Yeah nigga that's why yo phone died in chemistry class boy and you tried to charge it with a professional 5-pin USB MIDI cable and it made yo phone get frost bite boy you dumb as fuck",
  "Yup nigga and that's why you bought a digital alarm clock with wooden electronic LED time display just so you could wake up in case you have a nightmare nigga you dumb as fuck boy",
  "That's why you had to buy a Clear point Elite 0.7millimeter mechanical pencil starter kit because yo best friend stole yo Number 2 pencil during the EOC exams boy you stupid as fuck",
  "That was ass nigga you got a Wilson NFL Super Grip Football just sitting in yo garage boy cuz yo great grandfather played on the Washington Redskins back in the old days boy you ugly as fuck",
  "Nope nigga you got a blue summer sky scented premium yankee candle sitting on yo night stand boy because the smell helps you have lucid dreams nigga you weird as fuck ",
  "That was ass nigga you got a 13 foot long lava lamp just sitting in the middle of yo room boy and yo ass be using that shit as a stripper pole nigga fuck is you talkin bout nigga",
  "That was ass boy you got a Enno Vatti Movies Scratch off Poster stapled to yo ceiling in yo room boy and yo ass be looking up at that shit before you go to bed so you can be inspired to do big things in life dumb ass boy fuck is you sayin",
  "Shut up nigga yo poor ass got a HD Full Screen Welmax galaxy Note 9 screen protector on yo iPhone 4 se boy and whenever you try and play a mobile game yo fingers get cuts and scratches on it boy you dumb as fuck",
  "Nigga you cat fish padestrians on poptropica boy "
];

function getUser(id) {
  if (!db.users[id]) {
    db.users[id] = {
      cash: 1000,
      bank: 0,
      xp: 0,
      level: 1,
      inventory: [],
      collegeLevel: 0,
      job: "none"
    };
    saveDB();
  }

  if (!db.users[id].inventory) db.users[id].inventory = [];
  if (db.users[id].collegeLevel === undefined) db.users[id].collegeLevel = 0;
  if (!db.users[id].job) db.users[id].job = "none";

  return db.users[id];
}

function money(n) {
  return `$${Number(n).toLocaleString()}`;
}

function parseTime(t) {
  const amount = parseInt(t);
  if (!amount) return null;
  if (t.endsWith("s")) return amount * 1000;
  if (t.endsWith("m")) return amount * 60 * 1000;
  if (t.endsWith("h")) return amount * 60 * 60 * 1000;
  if (t.endsWith("d")) return amount * 24 * 60 * 60 * 1000;
  return null;
}

function randomRoast() {
  return roastLines[Math.floor(Math.random() * roastLines.length)];
}

function makeSessionId(userId) {
  return `${userId}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

function createDeck() {
  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }

  return deck.sort(() => Math.random() - 0.5);
}

function cardText(hand) {
  return hand.map(c => `${c.rank}${c.suit}`).join(" ");
}

function cardValue(card) {
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  if (card.rank === "A") return 11;
  return Number(card.rank);
}

function handValue(hand) {
  let total = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter(c => c.rank === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function evaluatePoker(hand) {
  const values = hand.map(c => c.rank);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;

  const countValues = Object.values(counts).sort((a, b) => b - a);
  const isFlush = hand.every(c => c.suit === hand[0].suit);

  const order = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const nums = [...new Set(values.map(v => order.indexOf(v)).sort((a, b) => a - b))];
  const isStraight = nums.length === 5 && nums[4] - nums[0] === 4;

  if (isFlush && isStraight) return { name: "Straight Flush", rank: 8, multi: 8 };
  if (countValues[0] === 4) return { name: "Four of a Kind", rank: 7, multi: 6 };
  if (countValues[0] === 3 && countValues[1] === 2) return { name: "Full House", rank: 6, multi: 4 };
  if (isFlush) return { name: "Flush", rank: 5, multi: 3 };
  if (isStraight) return { name: "Straight", rank: 4, multi: 2.5 };
  if (countValues[0] === 3) return { name: "Three of a Kind", rank: 3, multi: 2 };
  if (countValues[0] === 2 && countValues[1] === 2) return { name: "Two Pair", rank: 2, multi: 1.5 };
  if (countValues[0] === 2) return { name: "Pair", rank: 1, multi: 1.2 };
  return { name: "High Card", rank: 0, multi: 0 };
}

client.once("clientReady", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

// Store last deleted message for ?s / ?cs
client.on("messageDelete", (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  snipes.set(msg.channel.id, {
    content: msg.content || "No text content.",
    author: msg.author.tag,
    authorId: msg.author.id,
    avatar: msg.author.displayAvatarURL?.({ size: 256 }) || null,
    time: Date.now()
  });
});

// VoiceMaster: Join to Create system
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (newState.channel && newState.channel.name === "Join to Create") {
      const vc = await newState.guild.channels.create({
        name: `${newState.member.user.username}'s VC`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parentId || null,
        permissionOverwrites: [
          {
            id: newState.member.id,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers
            ]
          }
        ]
      });

      voiceOwners.set(vc.id, newState.member.id);
      await newState.member.voice.setChannel(vc).catch(() => {});
    }

    if (oldState.channel && voiceOwners.has(oldState.channel.id) && oldState.channel.members.size === 0) {
      voiceOwners.delete(oldState.channel.id);
      await oldState.channel.delete().catch(() => {});
    }
  } catch (err) {
    console.error("VoiceMaster error:", err);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    if (message.guild && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const member = message.member;
      const content = message.content.toLowerCase();

      // ANTI-LINK / DISCORD INVITES
      if (SECURITY.antiLinks) {
        const blockedLinks = [
          "discord.gg/",
          "discord.com/invite/",
          "discordapp.com/invite/"
        ];

        if (blockedLinks.some(link => content.includes(link))) {
          await message.delete().catch(() => {});

          if (SECURITY.autoTimeout) {
            await member.timeout(
              SECURITY.timeoutTime,
              "Posted Discord invite link"
            ).catch(() => {});
          }

          await securityLog(message.guild, {
            action: "Discord Invite Deleted + User Timed Out",
            user: message.author,
            userId: message.author.id,
            channel: message.channel,
            channelId: message.channel.id,
            content: message.content,
            reason: "User posted a Discord invite link.",
            color: "Red"
          });

          return;
        }
      }

      // ANTI-MASS MENTION
      if (SECURITY.antiMassMention) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;

        if (mentionCount >= SECURITY.maxMentions || message.mentions.everyone) {
          await message.delete().catch(() => {});

          if (SECURITY.autoTimeout) {
            await member.timeout(
              SECURITY.timeoutTime,
              "Mass mention / raid ping"
            ).catch(() => {});
          }

          await securityLog(message.guild, {
            action: "Mass Mention Deleted + User Timed Out",
            user: message.author,
            userId: message.author.id,
            channel: message.channel,
            channelId: message.channel.id,
            content: message.content,
            reason: `User mentioned ${mentionCount} users/roles or used everyone/here.`,
            color: "Orange"
          });

          return;
        }
      }

      // ANTI-SPAM
      if (SECURITY.antiSpam) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();

        if (!spamTracker.has(key)) spamTracker.set(key, []);

        const timestamps = spamTracker
          .get(key)
          .filter(time => now - time < SECURITY.spamTime);

        timestamps.push(now);
        spamTracker.set(key, timestamps);

        if (timestamps.length >= SECURITY.spamLimit) {
          await message.delete().catch(() => {});

          if (SECURITY.autoTimeout) {
            await member.timeout(
              SECURITY.timeoutTime,
              "Message spam"
            ).catch(() => {});
          }

          spamTracker.set(key, []);

          await securityLog(message.guild, {
            action: "Spam Detected + User Timed Out",
            user: message.author,
            userId: message.author.id,
            channel: message.channel,
            channelId: message.channel.id,
            content: message.content,
            reason: `User sent ${timestamps.length} messages too fast.`,
            color: "DarkRed"
          });

          return;
        }
      }
    }
if (vaultPending.has(message.author.id)) {
  const vaultCode = message.content.trim().toLowerCase();
  const vaultUser = getUser(message.author.id);

  if (vaultCode === "taftathegoat") {
    vaultUser.job = "cartel";
    vaultPending.delete(message.author.id);
    saveDB();

    await message.author.send(
      "🔓 Vault unlocked: **Cartel Member** — $12,000,000 per `?work`"
    );

    if (message.guild) message.delete().catch(() => {});
    return;
  }

if (vaultCode === "yallniggaspoor") {
  vaultUser.job = "benjaminNetanyahu";
  vaultPending.delete(message.author.id); // THIS WAS MISSING
  saveDB();

  await message.author.send(
    "🔓 Vault unlocked: **Benjamin Netanyahu** — $1,000,000,000 per `?work`"
  );

  if (message.guild) message.delete().catch(() => {});
  return;
}
}

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (command === "shhlolhaha") {
      vaultPending.add(message.author.id);
      if (message.guild) message.delete().catch(() => {});

      return message.author.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔐 Secret Vault")
            .setColor("DarkGold")
            .setDescription("Enter the vault code in the server or DM.\n\n**Hint:** only the chosen know it.")
            .setFooter({ text: "This command is hidden from ?cmds" })
        ]
      }).catch(() => {
        return message.reply("I tried to DM you, but your DMs are closed.");
      });
    }

    if (!message.guild) return;

    if (command === "s" || command === "snipe") {
      const data = snipes.get(message.channel.id);
      if (!data) return message.reply("Nothing to snipe.");

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Sniped Message")
            .setColor("DarkButNotBlack")
            .setDescription(data.content.slice(0, 4000))
            .setAuthor({ name: data.author, iconURL: data.avatar || undefined })
            .setFooter({ text: `Deleted <t:${Math.floor(data.time / 1000)}:R>` })
        ]
      });
    }

    if (command === "cs" || command === "clearsnipe") {
      snipes.delete(message.channel.id);
      return message.reply("Snipes cleared for this channel.");
    }

    if (command === "timeout" || command === "time" || command === "mute" || command === "t") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply("No permission.");
      const member = message.mentions.members.first();
      if (!member) return message.reply("Use `?timeout @user 10m reason`.");
      const duration = parseTime(args[1]) || 60 * 1000;
      const reason = args.slice(2).join(" ") || "No reason";
      await member.timeout(duration, reason);
      return message.reply(`Timed out ${member.user.tag} for **${Math.floor(duration / 1000)}s**.`);
    }

    if (command === "vm") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("No permission.");
      const sub = args[0]?.toLowerCase();
      if (sub !== "setup") return message.reply("Use `?vm setup`.");

      const existing = message.guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name === "Join to Create");
      if (existing) return message.reply(`VoiceMaster already exists: ${existing}`);

      const vc = await message.guild.channels.create({
        name: "Join to Create",
        type: ChannelType.GuildVoice
      });
      return message.reply(`VoiceMaster created: ${vc}`);
    }

    if (command === "vc") {
      const vc = message.member.voice.channel;
      if (!vc) return message.reply("Join your temp VC first.");

      const ownerId = voiceOwners.get(vc.id);
      if (ownerId && ownerId !== message.author.id) return message.reply("You do not own this VC.");
      if (!ownerId) voiceOwners.set(vc.id, message.author.id);

      const sub = args[0]?.toLowerCase();
      if (!sub) return message.reply("Use `?vc name`, `?vc limit`, `?vc lock`, `?vc unlock`, `?vc claim`, `?vc kick`, or `?vc delete`.");

      if (sub === "name") {
        const name = args.slice(1).join(" ");
        if (!name) return message.reply("Use `?vc name new name`.");
        await vc.setName(name);
        return message.reply(`VC renamed to **${name}**.`);
      }

      if (sub === "limit") {
        const limit = Math.max(0, Math.min(99, Number(args[1]) || 0));
        await vc.setUserLimit(limit);
        return message.reply(`VC limit set to **${limit || "unlimited"}**.`);
      }

      if (sub === "lock") {
        await vc.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false });
        return message.reply("VC locked.");
      }

      if (sub === "unlock") {
        await vc.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null });
        return message.reply("VC unlocked.");
      }

      if (sub === "claim") {
        const currentOwner = ownerId ? await message.guild.members.fetch(ownerId).catch(() => null) : null;
        if (currentOwner?.voice?.channelId === vc.id) return message.reply("The owner is still in the VC.");
        voiceOwners.set(vc.id, message.author.id);
        return message.reply("You claimed this VC.");
      }

      if (sub === "kick") {
        const target = message.mentions.members.first();
        if (!target || target.voice.channelId !== vc.id) return message.reply("Mention someone in your VC.");
        await target.voice.disconnect().catch(() => {});
        return message.reply(`Kicked ${target.user.tag} from the VC.`);
      }

      if (sub === "delete") {
        voiceOwners.delete(vc.id);
        await vc.delete().catch(() => {});
        return;
      }
    }

    const user = getUser(message.author.id);

    user.xp += Math.floor(Math.random() * 10) + 5;
    if (user.xp >= user.level * 100) {
      user.xp -= user.level * 100;
      user.level++;
      message.channel.send(`${message.author} leveled up to **Level ${user.level}**`);
    }
    saveDB();

    if (command === "cmds" || command === "help") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚡ Commands")
            .setColor("#5865F2")
            .setDescription(`
**Economy**
?balance, ?daily, ?work, ?deposit, ?withdraw, ?leaderboard

**Shop / Flex**
?shop, ?buy item, ?inventory, ?flex, ?flexon @user

**Casino**
?casino — Blackjack, Poker, Slots, Mines, Roulette, Dice, Crash

**College / Jobs**
?college, ?test, ?job list, ?job choose cashier

**Fun**
?freestyle, ?rap, ?coinflip, ?roll, ?avatar

**Giveaway / Roles**
?giveaway 10m Prize, ?reactionrole @role Label

**Moderation**
?admin, ?ban, ?kick, ?clear, ?lock, ?unlock, ?warn, ?beef @user, ?beef stop

**Music**
?play, ?pause, ?resume, ?skip, ?stop, ?queue
            `)
        ]
      });
    }

    if (command === "securitylogs") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("Only admins can open the security log panel.");
      }

      return message.reply(buildSecurityPanel(message.guild.id));
    }

    if (command === "balance" || command === "bal") {
      return message.reply(`Cash: **${money(user.cash)}**\nBank: **${money(user.bank)}**\nJob: **${jobs[user.job]?.name || "No Job"}**`);
    }

    if (command === "daily") {
      user.cash += 1000;
      saveDB();
      return message.reply(`You claimed **${money(1000)}**`);
    }

 if (command === "work") {
  const now = Date.now();
  const cooldown = 3000; // 3 seconds

  if (user.lastWork && now - user.lastWork < cooldown) {
    const timeLeft = Math.ceil((cooldown - (now - user.lastWork)) / 1000);
    return message.reply(`Wait **${timeLeft}s** before working again.`);
  }

  const job = jobs[user.job] || jobs.none;

  user.cash += job.pay;
  user.lastWork = now;

  saveDB();

  return message.reply(`You worked as **${job.name}** and earned **${money(job.pay)}**`);
}

    if (command === "deposit" || command === "dep") {
      const amount = Number(args[0]);
      if (!amount || amount <= 0) return message.reply("Use `?deposit 500`");
      if (user.cash < amount) return message.reply("Not enough cash.");

      user.cash -= amount;
      user.bank += amount;
      saveDB();

      return message.reply(`Deposited **${money(amount)}**`);
    }

    if (command === "withdraw" || command === "with") {
      const amount = Number(args[0]);
      if (!amount || amount <= 0) return message.reply("Use `?withdraw 500`");
      if (user.bank < amount) return message.reply("Not enough bank money.");

      user.bank -= amount;
      user.cash += amount;
      saveDB();

      return message.reply(`Withdrew **${money(amount)}**`);
    }

    if (command === "leaderboard" || command === "lb") {
      const rows = Object.entries(db.users)
        .sort((a, b) => (b[1].cash + b[1].bank) - (a[1].cash + a[1].bank))
        .slice(0, 10);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("💰 Richest Users")
            .setColor("Gold")
            .setDescription(rows.map(([id, u], i) => `**${i + 1}.** <@${id}> — ${money(u.cash + u.bank)}`).join("\n") || "No users yet.")
        ]
      });
    }

    if (command === "shop") {
      const text = Object.entries(shopItems)
        .map(([key, item]) => `**${key}** — ${money(item.price)}\n${item.name}`)
        .join("\n\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🛒 Luxury Shop")
            .setColor("Gold")
            .setDescription(`${text}\n\nBuy with:\n\`?buy itemname\``)
        ]
      });
    }

    if (command === "buy") {
      const itemKey = args[0]?.toLowerCase();
      if (!itemKey || !shopItems[itemKey]) return message.reply("That item is not in the shop. Use `?shop`.");

      const item = shopItems[itemKey];
      if (user.cash < item.price) return message.reply(`You need **${money(item.price)}** to buy **${item.name}**.`);

      user.cash -= item.price;
      user.inventory.push(itemKey);
      saveDB();

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Purchase Complete")
            .setColor("Green")
            .setDescription(`You bought **${item.name}** for **${money(item.price)}**.`)
        ]
      });
    }

    if (command === "inventory" || command === "inv") {
      if (!user.inventory.length) return message.reply("Your inventory is empty.");

      const items = user.inventory.map(i => shopItems[i]?.name || i).join("\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${message.author.username}'s Inventory`)
            .setColor("Purple")
            .setDescription(items)
        ]
      });
    }

    if (command === "flex") {
      if (!user.inventory.length) return message.reply("You have nothing to flex. Buy something from `?shop`.");

      const best = user.inventory
        .map(i => ({ key: i, item: shopItems[i] }))
        .filter(x => x.item)
        .sort((a, b) => b.item.price - a.item.price)[0];

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💎 FLEX ALERT")
            .setColor("Gold")
            .setDescription(`${message.author} is flexing **${best.item.name}** worth **${money(best.item.price)}**.`)
        ]
      });
    }

    if (command === "flexon") {
      const target = message.mentions.users.first();
      if (!target) return message.reply("Use `?flexon @user`.");
      if (!user.inventory.length) return message.reply("You have nothing to flex. Buy something from `?shop`.");

      const best = user.inventory
        .map(i => ({ key: i, item: shopItems[i] }))
        .filter(x => x.item)
        .sort((a, b) => b.item.price - a.item.price)[0];

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💰 FLEXED ON")
            .setColor("DarkGold")
            .setDescription(`${message.author} just flexed **${best.item.name}** on ${target}.\nValue: **${money(best.item.price)}**`)
        ]
      });
    }

    if (command === "college") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎓 College")
            .setColor("Blue")
            .setDescription(`
Your college level: **${user.collegeLevel}**

Use \`?test\` to unlock better jobs.

Level 0: No Job — $150
Level 1: Cashier — $350
Level 2: Mechanic — $700
Level 3: Developer — $1,300
Level 4: Banker — $2,200
Level 5: CEO — $4,000
            `)
        ]
      });
    }

    if (command === "job") {
      const sub = args[0]?.toLowerCase();

      if (sub === "list") {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("💼 Jobs")
              .setColor("Green")
              .setDescription(
                Object.entries(jobs)
                  .filter(([, j]) => !j.secret)
                  .map(([key, j]) => `**${key}** — ${money(j.pay)} / college level ${j.college}`)
                  .join("\n")
              )
          ]
        });
      }

      if (sub === "choose") {
        const jobName = args[1]?.toLowerCase();
        const job = jobs[jobName];

        if (!job || job.secret) return message.reply("That job does not exist. Use `?job list`.");
        if (user.collegeLevel < job.college) return message.reply(`You need college level **${job.college}** for that job.`);

        user.job = jobName;
        saveDB();
        return message.reply(`You now work as **${job.name}**`);
      }

      return message.reply("Use `?job list` or `?job choose cashier`");
    }

    if (command === "test") {
      const nextLevel = user.collegeLevel + 1;
      const test = collegeTests[nextLevel];
      if (!test) return message.reply("You already completed all college levels.");

      const row = new ActionRowBuilder().addComponents(
        test.answers.map(answer =>
          new ButtonBuilder()
            .setCustomId(`test:${message.author.id}:${nextLevel}:${answer}`)
            .setLabel(answer)
            .setStyle(ButtonStyle.Primary)
        )
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🎓 College Test Level ${nextLevel}`)
            .setColor("Blue")
            .setDescription(test.question)
        ],
        components: [row]
      });
    }

    if (command === "casino") {
      const sessionId = makeSessionId(message.author.id);
      casinoSessions.set(sessionId, { userId: message.author.id, bet: 100 });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`casino:${sessionId}`)
        .setPlaceholder("Choose a game")
        .addOptions([
          { label: "Blackjack", value: "blackjack", emoji: "🃏" },
          { label: "Poker", value: "poker", emoji: "♠️" },
          { label: "Slots", value: "slots", emoji: "🎰" },
          { label: "Mines", value: "mines", emoji: "💣" },
          { label: "Roulette", value: "roulette", emoji: "🔴" },
          { label: "Dice", value: "dice", emoji: "🎲" },
          { label: "Crash", value: "crash", emoji: "📈" }
        ]);

      const row1 = new ActionRowBuilder().addComponents(menu);
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`betdown:${sessionId}`).setLabel("-100").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`betup:${sessionId}`).setLabel("+100").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`bethalf:${sessionId}`).setLabel("Half").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`betall:${sessionId}`).setLabel("All In").setStyle(ButtonStyle.Danger)
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎰 Casino")
            .setColor("Gold")
            .setDescription(`Current bet: **${money(100)}**\nUse buttons to change your bet, then pick a game.`)
        ],
        components: [row1, row2]
      });
    }

    if (command === "giveaway") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply("You need Manage Server permission.");

      const duration = parseTime(args[0]);
      const prize = args.slice(1).join(" ");
      if (!duration || !prize) return message.reply("Use `?giveaway 10m Nitro`");

      const id = Date.now().toString();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`giveaway:${id}`).setLabel("Enter Giveaway").setEmoji("🎉").setStyle(ButtonStyle.Success)
      );

      const msg = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY")
            .setColor("Gold")
            .setDescription(`**Prize:** ${prize}\n**Ends:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>\n\nClick below to enter.`)
            .setFooter({ text: "0 entries" })
        ],
        components: [row]
      });

      giveaways.set(id, { prize, messageId: msg.id, channelId: message.channel.id, entries: new Set() });

      setTimeout(async () => {
        const g = giveaways.get(id);
        if (!g) return;

        const channel = await client.channels.fetch(g.channelId);
        const giveawayMsg = await channel.messages.fetch(g.messageId);
        const entries = [...g.entries];

        if (!entries.length) {
          await giveawayMsg.edit({
            embeds: [new EmbedBuilder().setTitle("🎉 GIVEAWAY ENDED").setColor("Red").setDescription(`**Prize:** ${g.prize}\nNo one entered.`)],
            components: []
          });
          giveaways.delete(id);
          return;
        }

        const winner = entries[Math.floor(Math.random() * entries.length)];

        await giveawayMsg.edit({
          embeds: [new EmbedBuilder().setTitle("🎉 GIVEAWAY ENDED").setColor("Green").setDescription(`**Prize:** ${g.prize}\n**Winner:** <@${winner}>`)],
          components: []
        });

        channel.send(`🎉 <@${winner}> won **${g.prize}**`);
        giveaways.delete(id);
      }, duration);

      return message.reply("Giveaway started.");
    }

    if (command === "freestyle" || command === "rap") {
      const topic = args.join(" ") || "the city";
      const bars = [
        "Came from the shade, now the whole block glow",
        "I move lowkey but the whole room know",
        "Pressure on my name, still I never move slow",
        "Money talk clean when the pockets on pro",
        "Cold with the pen, every line got frost",
        "Took a few losses, turned pain into boss",
        "They chase fake clout, I chase weight and cost",
        "Built from the dirt, now I walk like a don"
      ];

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎤 Freestyle")
            .setColor("DarkRed")
            .setDescription(`**Topic:** ${topic}\n\n${bars.sort(() => Math.random() - 0.5).slice(0, 8).map(x => `> ${x}`).join("\n")}`)
        ]
      });
    }

    if (command === "reactionrole") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return message.reply("No permission.");

      const role = message.mentions.roles.first();
      const label = args.slice(1).join(" ") || role?.name;
      if (!role) return message.reply("Use `?reactionrole @role Label`");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr:${role.id}`).setLabel(label).setStyle(ButtonStyle.Primary)
      );

      return message.channel.send({
        embeds: [new EmbedBuilder().setTitle("Reaction Role").setColor("Blue").setDescription(`Click to get/remove ${role}`)],
        components: [row]
      });
    }

    if (command === "admin") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply("No permission.");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:lock").setLabel("Lock").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("admin:unlock").setLabel("Unlock").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin:slow").setLabel("Slowmode 5s").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:clear").setLabel("Clear 10").setStyle(ButtonStyle.Primary)
      );

      return message.reply({
        embeds: [new EmbedBuilder().setTitle("🛠️ Admin Dashboard").setColor("Red").setDescription("Use the buttons below.")],
        components: [row]
      });
    }

    if (command === "beef") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("Only admins can use this.");

      const sub = args[0]?.toLowerCase();
      const key = `${message.guild.id}_${message.channel.id}`;

      if (sub === "stop") {
        const session = beefSessions.get(key);
        if (!session) return message.reply("No beef is running in this channel.");
        clearInterval(session.interval);
        beefSessions.delete(key);
        return message.reply("Beef stopped.");
      }

      const target = message.mentions.users.first();
      if (!target) return message.reply("Use `?beef @user` or `?beef stop`.");
      if (target.bot) return message.reply("Do not beef bots.");
      if (beefSessions.has(key)) return message.reply("Beef is already running here. Use `?beef stop` first.");

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔥 Beef Started")
            .setColor("Red")
            .setDescription(`${target}, admin started beef.\n\n> ${randomRoast()}`)
            .setFooter({ text: "Use ?beef stop to stop it." })
        ]
      });

      const interval = setInterval(() => {
        message.channel.send(`🔥 ${target}\n> ${randomRoast()}`).catch(() => {});
      }, 12000);

      beefSessions.set(key, { targetId: target.id, interval });
      return;
    }

    if (command === "clear") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply("No permission.");
      const amount = Number(args[0]);
      if (!amount) return message.reply("Use `?clear 10`");
      await message.channel.bulkDelete(amount, true);
      return message.reply(`Deleted ${amount} messages.`);
    }

    if (command === "lock") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("No permission.");
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply("Channel locked.");
    }

    if (command === "unlock") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("No permission.");
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
      return message.reply("Channel unlocked.");
    }

    if (command === "warn") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply("No permission.");

      const target = message.mentions.users.first();
      const reason = args.slice(1).join(" ") || "No reason";
      if (!target) return message.reply("Use `?warn @user reason`");

      db.warnings.push({ guildId: message.guild.id, userId: target.id, reason, modId: message.author.id, time: Date.now() });
      saveDB();

      return message.reply(`Warned ${target.tag}: ${reason}`);
    }

    if (command === "ban" || command === "b") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("No permission.");

      const member = message.mentions.members.first();
      if (!member) return message.reply("Use `?ban @user reason`");

      await member.ban({ reason: args.slice(1).join(" ") || "No reason" });
      return message.reply(`Banned ${member.user.tag}`);
    }

    if (command === "kick" || command === "k") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply("No permission.");

      const member = message.mentions.members.first();
      if (!member) return message.reply("Use `?kick @user reason`");

      await member.kick(args.slice(1).join(" ") || "No reason");
      return message.reply(`Kicked ${member.user.tag}`);
    }

    if (command === "coinflip") return message.reply(Math.random() < 0.5 ? "Heads" : "Tails");
    if (command === "roll") return message.reply(`You rolled **${Math.floor(Math.random() * 6) + 1}**`);

    if (command === "avatar") {
      const target = message.mentions.users.first() || message.author;
      return message.reply(target.displayAvatarURL({ size: 1024 }));
    }

    if (command === "play" || command === "p") {
      const query = args.join(" ");
      if (!query) return message.reply("Use `?p song name or YouTube URL`.");

      const voice = message.member.voice.channel;
      if (!voice) return message.reply("Join a voice channel first.");

      let queue = musicQueues.get(message.guild.id);

      if (!queue) {
        const player = createAudioPlayer({
          behaviors: { noSubscriber: NoSubscriberBehavior.Play }
        });

        queue = {
          player,
          songs: [],
          connection: null,
          textChannel: message.channel,
          nowPlaying: null,
          playing: false
        };

        musicQueues.set(message.guild.id, queue);

        player.on(AudioPlayerStatus.Idle, () => {
          queue.playing = false;
          queue.nowPlaying = null;
          playNext(message.guild.id);
        });

        player.on("error", err => {
          console.error("Music player error:", err);
          queue.playing = false;
          queue.nowPlaying = null;
          playNext(message.guild.id);
        });
      }

      queue.textChannel = message.channel;
      queue.connection = joinVoiceChannel({
        channelId: voice.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false
      });

      queue.connection.subscribe(queue.player);

      let song;
      if (ytdl.validateURL(query)) {
        const info = await ytdl.getInfo(query);
        song = {
          title: info.videoDetails.title,
          url: info.videoDetails.video_url,
          requestedBy: message.author.id,
          thumbnail: info.videoDetails.thumbnails?.at(-1)?.url || null
        };
      } else {
        const results = await yts(query);
        const video = results.videos?.[0];
        if (!video) return message.reply("No song found.");
        song = {
          title: video.title,
          url: video.url,
          requestedBy: message.author.id,
          thumbnail: video.thumbnail || null
        };
      }

      queue.songs.push(song);
      await message.reply(`Queued: **${song.title}**`);

      if (!queue.playing && !queue.nowPlaying) playNext(message.guild.id);
    }

    if (command === "pause") {
      const q = musicQueues.get(message.guild.id);
      if (!q) return message.reply("Nothing playing.");
      q.player.pause();
      return message.reply("Paused.");
    }

    if (command === "resume") {
      const q = musicQueues.get(message.guild.id);
      if (!q) return message.reply("Nothing playing.");
      q.player.unpause();
      return message.reply("Resumed.");
    }

    if (command === "skip") {
      const q = musicQueues.get(message.guild.id);
      if (!q) return message.reply("Nothing playing.");
      q.player.stop();
      return message.reply("Skipped.");
    }

    if (command === "stop") {
      const q = musicQueues.get(message.guild.id);
      if (!q) return message.reply("Nothing playing.");

      q.songs = [];
      q.player.stop();
      getVoiceConnection(message.guild.id)?.destroy();
      musicQueues.delete(message.guild.id);

      return message.reply("Stopped music.");
    }

    if (command === "queue") {
      const q = musicQueues.get(message.guild.id);
      if (!q || !q.songs.length) return message.reply("Queue empty.");
      return message.reply(q.songs.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.title}`).join("\n"));
    }
  } catch (err) {
    console.error(err);
    return message.reply("Something broke. Check Railway logs.").catch(() => {});
  }
});

async function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  const song = queue.songs.shift();
  if (!song) {
    queue.nowPlaying = null;
    queue.playing = false;

    setTimeout(() => {
      const currentQueue = musicQueues.get(guildId);
      if (!currentQueue) return;

      if (!currentQueue.songs.length && !currentQueue.playing && !currentQueue.nowPlaying) {
        currentQueue.textChannel?.send("🔌 Leaving voice channel — queue is empty.").catch(() => {});
        currentQueue.connection?.destroy();
        musicQueues.delete(guildId);
      }
    }, AUTO_DISCONNECT_TIME);

    return;
  }

  try {
    queue.nowPlaying = song;
    queue.playing = true;

    const stream = ytdl(song.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25,
      liveBuffer: 1 << 25
    });

    stream.on("error", err => {
      console.error("YouTube stream error:", err.message);
      queue.playing = false;
      queue.nowPlaying = null;
      playNext(guildId);
    });

    const resource = createAudioResource(stream);
    queue.player.play(resource);

    const thumbnail = song.thumbnail || "https://cdn-icons-png.flaticon.com/512/727/727245.png";

    queue.textChannel?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setAuthor({ name: "Now Playing", iconURL: thumbnail })
          .setTitle(song.title)
          .setURL(song.url)
          .setThumbnail(thumbnail)
          .setDescription(`Requested by <@${song.requestedBy}>`)
          .setFooter({ text: "Triplet Music Player" })
          .setTimestamp()
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("music:pause").setLabel("Pause").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("music:resume").setLabel("Resume").setEmoji("▶️").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("music:skip").setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("music:stop").setLabel("Stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger)
        )
      ]
    }).catch(() => {});
  } catch (err) {
    console.error("playNext error:", err);
    queue.playing = false;
    queue.nowPlaying = null;
    playNext(guildId);
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.guild) return;

    if (interaction.isButton() && interaction.customId.startsWith("security_toggle_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "Only admins can change security settings.", ephemeral: true });
      }

      const key = interaction.customId.replace("security_toggle_", "");
      if (!(key in SECURITY)) {
        return interaction.reply({ content: "Unknown security setting.", ephemeral: true });
      }

      SECURITY[key] = !SECURITY[key];
      return interaction.update(buildSecurityPanel(interaction.guild.id));
    }

    if (interaction.isButton() && interaction.customId.startsWith("security_user_")) {
      const userId = interaction.customId.replace("security_user_", "");
      const member = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!member) {
        return interaction.reply({ content: `Could not find user with ID: \`${userId}\``, ephemeral: true });
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("👤 Security User Info")
            .setColor("Blue")
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
              { name: "User", value: `${member.user}`, inline: true },
              { name: "Username", value: `\`${member.user.tag}\``, inline: true },
              { name: "User ID", value: `\`${member.user.id}\``, inline: false },
              { name: "Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true },
              { name: "Account Created", value: `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`, inline: true }
            )
            .setTimestamp()
        ],
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("security_id_")) {
      const userId = interaction.customId.replace("security_id_", "");
      return interaction.reply({ content: `User ID: \`${userId}\``, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("test:")) {
      const [, userId, level, answer] = interaction.customId.split(":");
      if (interaction.user.id !== userId) return interaction.reply({ content: "This test is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      const test = collegeTests[level];

      if (answer === test.correct) {
        user.collegeLevel = Number(level);
        saveDB();

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("✅ Test Passed").setColor("Green").setDescription(`You passed college level **${level}**.`)],
          components: []
        });
      }

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("❌ Test Failed").setColor("Red").setDescription("Wrong answer. Try again with `?test`.")],
        components: []
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("bet")) {
      const [action, sessionId] = interaction.customId.split(":");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Casino session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This casino is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);

      if (action === "betup") session.bet += 100;
      if (action === "betdown") session.bet = Math.max(100, session.bet - 100);
      if (action === "bethalf") session.bet = Math.max(100, Math.floor(user.cash / 2));
      if (action === "betall") session.bet = Math.max(100, user.cash);
      if (session.bet > user.cash) session.bet = user.cash;

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("🎰 Casino").setColor("Gold").setDescription(`Current bet: **${money(session.bet)}**\nCash: **${money(user.cash)}**\nPick a game.`)],
        components: interaction.message.components
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("casino:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Casino session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This casino is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      const bet = session.bet;
      const game = interaction.values[0];

      if (user.cash < bet) return interaction.reply({ content: "You do not have enough cash.", ephemeral: true });

      if (game === "blackjack") {
        user.cash -= bet;
        saveDB();

        const deck = createDeck();
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        casinoSessions.set(sessionId, { ...session, game, deck, player, dealer });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bjhit:${sessionId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bjstand:${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bjdouble:${sessionId}`).setLabel("Double").setStyle(ButtonStyle.Primary)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🃏 Blackjack")
              .setColor("Blue")
              .setDescription(`Bet: **${money(bet)}**\nYour hand: ${cardText(player)} — **${handValue(player)}**\nDealer shows: ${dealer[0].rank}${dealer[0].suit}`)
          ],
          components: [row]
        });
      }

      if (game === "slots") {
        user.cash -= bet;
        saveDB();
        return spinSlots(interaction, sessionId, bet);
      }

      if (game === "poker") {
        user.cash -= bet;
        saveDB();
        return playPoker(interaction, sessionId);
      }

      if (game === "mines") {
        casinoSessions.set(sessionId, { ...session, game: "mines_setup", minesCount: 3 });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`minesminus:${sessionId}`).setLabel("- Mine").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`minesplus:${sessionId}`).setLabel("+ Mine").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`minesstart:${sessionId}`).setLabel("Start Mines").setStyle(ButtonStyle.Success)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("💣 Mines Setup")
              .setColor("DarkGold")
              .setDescription(`Bet: **${money(bet)}**\nMines: **3**\n\nMore mines = bigger cashout.`)
          ],
          components: [row]
        });
      }

      if (game === "roulette") {
        user.cash -= bet;

        const number = Math.floor(Math.random() * 37);
        const color = number === 0 ? "green" : number % 2 === 0 ? "black" : "red";

        let win = 0;
        if (color === "red") win = bet * 2;

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔴 Roulette")
              .setColor(win > 0 ? "Green" : "Red")
              .setDescription(`Ball landed on **${number} ${color}**\nYou bet red.\n${win > 0 ? `You won **${money(win)}**` : `You lost **${money(bet)}**`}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }

      if (game === "dice") {
        user.cash -= bet;

        const roll = Math.floor(Math.random() * 6) + 1;
        let win = 0;
        if (roll >= 4) win = bet * 2;

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎲 Dice")
              .setColor(win > 0 ? "Green" : "Red")
              .setDescription(`You rolled **${roll}**\nWin on 4, 5, or 6.\n${win > 0 ? `You won **${money(win)}**` : `You lost **${money(bet)}**`}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }

      if (game === "crash") {
        user.cash -= bet;

        const crashPoint = Number((Math.random() * 4 + 1).toFixed(2));
        const cashout = Number((Math.random() * 3 + 1).toFixed(2));

        let win = 0;
        if (cashout < crashPoint) win = Math.floor(bet * cashout);

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("📈 Crash")
              .setColor(win > 0 ? "Green" : "Red")
              .setDescription(`Crash point: **${crashPoint}x**\nYour cashout: **${cashout}x**\n${win > 0 ? `You won **${money(win)}**` : `You crashed and lost **${money(bet)}**`}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("bj")) {
      const [action, sessionId] = interaction.customId.split(":");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Game expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This game is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);

      if (action === "bjhit") {
        session.player.push(session.deck.pop());

        if (handValue(session.player) > 21) {
          casinoSessions.delete(sessionId);

          return interaction.update({
            embeds: [new EmbedBuilder().setTitle("🃏 Blackjack").setColor("Red").setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nYou busted and lost **${money(session.bet)}**.`)],
            components: []
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bjhit:${sessionId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bjstand:${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("🃏 Blackjack").setColor("Blue").setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nDealer shows: ${session.dealer[0].rank}${session.dealer[0].suit}`)],
          components: [row]
        });
      }

      if (action === "bjdouble") {
        if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash to double.", ephemeral: true });

        user.cash -= session.bet;
        session.bet *= 2;
        session.player.push(session.deck.pop());
        saveDB();

        return resolveBlackjack(interaction, sessionId);
      }

      if (action === "bjstand") {
        return resolveBlackjack(interaction, sessionId);
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("slotrespin:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This slot game is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash.", ephemeral: true });

      user.cash -= session.bet;
      saveDB();

      return spinSlots(interaction, sessionId, session.bet);
    }

    if (interaction.isButton() && interaction.customId.startsWith("pokeragain:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });

      const user = getUser(interaction.user.id);
      if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash.", ephemeral: true });

      user.cash -= session.bet;
      saveDB();

      return playPoker(interaction, sessionId);
    }

    if (interaction.isButton() && interaction.customId.startsWith("pokerexit:")) {
      const sessionId = interaction.customId.split(":")[1];
      casinoSessions.delete(sessionId);
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Poker closed.").setColor("Red")], components: [] });
    }

    if (interaction.isButton() && interaction.customId.startsWith("minesminus:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This game is not yours.", ephemeral: true });

      session.minesCount = Math.max(1, session.minesCount - 1);
      return updateMinesSetup(interaction, sessionId);
    }

    if (interaction.isButton() && interaction.customId.startsWith("minesplus:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This game is not yours.", ephemeral: true });

      session.minesCount = Math.min(10, session.minesCount + 1);
      return updateMinesSetup(interaction, sessionId);
    }

    if (interaction.isButton() && interaction.customId.startsWith("minesstart:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      const user = getUser(interaction.user.id);

      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This game is not yours.", ephemeral: true });
      if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash.", ephemeral: true });

      user.cash -= session.bet;
      saveDB();

      const mines = new Set();
      while (mines.size < session.minesCount) mines.add(Math.floor(Math.random() * 16));

      session.game = "mines";
      session.mines = mines;
      session.revealed = new Set();

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("💣 Mines").setColor("DarkGold").setDescription(`Bet: **${money(session.bet)}**\nMines: **${session.minesCount}**\nPick tiles. Cash out before you hit a mine.`)],
        components: minesRows(sessionId, session.revealed)
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("minepick:")) {
      const [, sessionId, tileRaw] = interaction.customId.split(":");
      const tile = Number(tileRaw);
      const session = casinoSessions.get(sessionId);

      if (!session) return interaction.reply({ content: "Game expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This mines game is not yours.", ephemeral: true });

      if (session.mines.has(tile)) {
        casinoSessions.delete(sessionId);

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("💥 BOOM").setColor("Red").setDescription(`You hit a mine and lost **${money(session.bet)}**.`)],
          components: []
        });
      }

      session.revealed.add(tile);

      const multiplier = 1 + session.revealed.size * (0.25 + session.minesCount * 0.08);
      const cashout = Math.floor(session.bet * multiplier);

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("💣 Mines").setColor("DarkGold").setDescription(`Mines: **${session.minesCount}**\nSafe tiles: **${session.revealed.size}**\nCurrent cashout: **${money(cashout)}**`)],
        components: minesRows(sessionId, session.revealed)
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("minecash:")) {
      const sessionId = interaction.customId.split(":")[1];
      const session = casinoSessions.get(sessionId);
      const user = getUser(interaction.user.id);

      if (!session) return interaction.reply({ content: "Game expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This mines game is not yours.", ephemeral: true });

      const multiplier = 1 + session.revealed.size * (0.25 + session.minesCount * 0.08);
      const win = Math.floor(session.bet * multiplier);

      user.cash += win;
      saveDB();
      casinoSessions.delete(sessionId);

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("💰 Mines Cashout").setColor("Green").setDescription(`Mines: **${session.minesCount}**\nSafe tiles: **${session.revealed.size}**\nYou won **${money(win)}**\nCash: **${money(user.cash)}**`)],
        components: []
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("giveaway:")) {
      const id = interaction.customId.split(":")[1];
      const g = giveaways.get(id);
      if (!g) return interaction.reply({ content: "Giveaway ended.", ephemeral: true });

      g.entries.add(interaction.user.id);

      const channel = await client.channels.fetch(g.channelId);
      const msg = await channel.messages.fetch(g.messageId);
      const embed = EmbedBuilder.from(msg.embeds[0]).setFooter({ text: `${g.entries.size} entries` });

      await msg.edit({ embeds: [embed] });

      return interaction.reply({ content: "You entered.", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("rr:")) {
      const roleId = interaction.customId.split(":")[1];
      const member = interaction.member;

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        return interaction.reply({ content: "Role removed.", ephemeral: true });
      }

      await member.roles.add(roleId);
      return interaction.reply({ content: "Role added.", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("admin:")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: "No permission.", ephemeral: true });
      }

      const action = interaction.customId.split(":")[1];

      if (action === "lock") {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        return interaction.reply("Channel locked.");
      }

      if (action === "unlock") {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
        return interaction.reply("Channel unlocked.");
      }

      if (action === "slow") {
        await interaction.channel.setRateLimitPerUser(5);
        return interaction.reply("Slowmode set to 5 seconds.");
      }

      if (action === "clear") {
        await interaction.channel.bulkDelete(10, true);
        return interaction.reply("Deleted 10 messages.");
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("music:")) {
      const q = musicQueues.get(interaction.guild.id);
      if (!q) return interaction.reply({ content: "Nothing playing.", ephemeral: true });

      const action = interaction.customId.split(":")[1];

      if (action === "pause") q.player.pause();
      if (action === "resume") q.player.unpause();
      if (action === "skip") q.player.stop();

      if (action === "stop") {
        q.songs = [];
        q.player.stop();
        getVoiceConnection(interaction.guild.id)?.destroy();
        musicQueues.delete(interaction.guild.id);
      }

      return interaction.reply({ content: "Done.", ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: "Something broke.", ephemeral: true }).catch(() => {});
  }
});

function updateMinesSetup(interaction, sessionId) {
  const session = casinoSessions.get(sessionId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`minesminus:${sessionId}`).setLabel("- Mine").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`minesplus:${sessionId}`).setLabel("+ Mine").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`minesstart:${sessionId}`).setLabel("Start Mines").setStyle(ButtonStyle.Success)
  );

  return interaction.update({
    embeds: [new EmbedBuilder().setTitle("💣 Mines Setup").setColor("DarkGold").setDescription(`Bet: **${money(session.bet)}**\nMines: **${session.minesCount}**\nMore mines = more risk = bigger cashout.`)],
    components: [row]
  });
}

function spinSlots(interaction, sessionId, bet) {
  const session = casinoSessions.get(sessionId);
  const user = getUser(interaction.user.id);

  const icons = ["🍒", "🍋", "💎", "7️⃣", "⭐", "🔔"];
  const spin = [
    icons[Math.floor(Math.random() * icons.length)],
    icons[Math.floor(Math.random() * icons.length)],
    icons[Math.floor(Math.random() * icons.length)]
  ];

  let win = 0;
  if (spin[0] === spin[1] && spin[1] === spin[2]) win = bet * 5;
  else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) win = Math.floor(bet * 1.5);

  if (win > 0) {
    user.cash += win;
    saveDB();
  }

  casinoSessions.set(sessionId, { ...session, game: "slots" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`slotrespin:${sessionId}`).setLabel("Respin").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`betup:${sessionId}`).setLabel("+100 Bet").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`betdown:${sessionId}`).setLabel("-100 Bet").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎰 Slots")
        .setColor(win > 0 ? "Green" : "Red")
        .setDescription(`## ${spin.join(" | ")}\n\nBet: **${money(bet)}**\n${win > 0 ? `You won **${money(win)}**` : "You lost."}\nCash: **${money(user.cash)}**`)
    ],
    components: [row]
  });
}

function playPoker(interaction, sessionId) {
  const session = casinoSessions.get(sessionId);
  const user = getUser(interaction.user.id);
  const deck = createDeck();

  const player = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

  const playerEval = evaluatePoker(player);
  const dealerEval = evaluatePoker(dealer);

  let result = "You lost.";

  if (playerEval.rank > dealerEval.rank) {
    const win = Math.floor(session.bet * playerEval.multi) || session.bet * 2;
    user.cash += win;
    result = `You won **${money(win)}**`;
  } else if (playerEval.rank === dealerEval.rank) {
    user.cash += session.bet;
    result = "Push. Your bet was returned.";
  }

  saveDB();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pokeragain:${sessionId}`).setLabel("Play Again").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pokerexit:${sessionId}`).setLabel("Exit").setStyle(ButtonStyle.Danger)
  );

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("♠️ Poker")
        .setColor("Purple")
        .setDescription(`Bet: **${money(session.bet)}**\n\nYour hand: ${cardText(player)}\n**${playerEval.name}**\n\nDealer hand: ${cardText(dealer)}\n**${dealerEval.name}**\n\n${result}\nCash: **${money(user.cash)}**`)
    ],
    components: [row]
  });
}

async function resolveBlackjack(interaction, sessionId) {
  const session = casinoSessions.get(sessionId);
  const user = getUser(interaction.user.id);

  while (handValue(session.dealer) < 17) session.dealer.push(session.deck.pop());

  const playerVal = handValue(session.player);
  const dealerVal = handValue(session.dealer);

  let result = `You lost **${money(session.bet)}**.`;
  let color = "Red";

  if (playerVal > 21) {
    result = `You busted and lost **${money(session.bet)}**.`;
  } else if (dealerVal > 21 || playerVal > dealerVal) {
    const win = session.bet * 2;
    user.cash += win;
    result = `You won **${money(win)}**`;
    color = "Green";
  } else if (playerVal === dealerVal) {
    user.cash += session.bet;
    result = "Push. Your bet was returned.";
    color = "Yellow";
  }

  saveDB();
  casinoSessions.delete(sessionId);

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("🃏 Blackjack Result")
        .setColor(color)
        .setDescription(`Your hand: ${cardText(session.player)} — **${playerVal}**\nDealer hand: ${cardText(session.dealer)} — **${dealerVal}**\n\n${result}\nCash: **${money(user.cash)}**`)
    ],
    components: []
  });
}

function minesRows(sessionId, revealed = new Set()) {
  const rows = [];

  for (let r = 0; r < 4; r++) {
    const row = new ActionRowBuilder();

    for (let c = 0; c < 4; c++) {
      const tile = r * 4 + c;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`minepick:${sessionId}:${tile}`)
          .setLabel(revealed.has(tile) ? "✅" : "⬜")
          .setStyle(revealed.has(tile) ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(revealed.has(tile))
      );
    }

    rows.push(row);
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`minecash:${sessionId}`).setLabel("Cash Out").setStyle(ButtonStyle.Success)
    )
  );

  return rows;
}


function buildSecurityPanel(guildId) {
  const row1 = new ActionRowBuilder().addComponents(
    securityToggleButton("antiSpam", "Anti-Spam"),
    securityToggleButton("antiLinks", "Anti-Link"),
    securityToggleButton("antiMassMention", "Mass Mention"),
    securityToggleButton("autoTimeout", "Auto Timeout")
  );

  const row2 = new ActionRowBuilder().addComponents(
    securityToggleButton("logMessageDelete", "Delete Logs"),
    securityToggleButton("logMessageEdit", "Edit Logs"),
    securityToggleButton("logJoinLeave", "Join/Leave"),
    securityToggleButton("raidProtection", "Raid Protect")
  );

  const row3 = new ActionRowBuilder().addComponents(
    securityToggleButton("logRoleChanges", "Role Logs"),
    securityToggleButton("logBanKick", "Ban/Kick Logs")
  );

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("🛡️ Triplet Security Control Panel")
        .setColor("DarkBlue")
        .setDescription(
          `**Anti-Spam:** ${statusEmoji(SECURITY.antiSpam)}\n` +
          `**Anti-Link:** ${statusEmoji(SECURITY.antiLinks)}\n` +
          `**Anti-Mass Mention:** ${statusEmoji(SECURITY.antiMassMention)}\n` +
          `**Auto Timeout:** ${statusEmoji(SECURITY.autoTimeout)}\n` +
          `**Message Delete Logs:** ${statusEmoji(SECURITY.logMessageDelete)}\n` +
          `**Message Edit Logs:** ${statusEmoji(SECURITY.logMessageEdit)}\n` +
          `**Join / Leave Logs:** ${statusEmoji(SECURITY.logJoinLeave)}\n` +
          `**Role Logs:** ${statusEmoji(SECURITY.logRoleChanges)}\n` +
          `**Ban / Kick Logs:** ${statusEmoji(SECURITY.logBanKick)}\n` +
          `**Raid Protection:** ${statusEmoji(SECURITY.raidProtection)}\n\n` +
          `Spam timeout: **${Math.floor(SECURITY.timeoutTime / 1000)} seconds**\n` +
          `Log channel: <#${SECURITY_LOG_CHANNEL_ID}>`
        )
        .setFooter({ text: `Guild ID: ${guildId}` })
        .setTimestamp()
    ],
    components: [row1, row2, row3]
  };
}

function statusEmoji(value) {
  return value ? "✅ Enabled" : "❌ Disabled";
}

function securityToggleButton(key, label) {
  return new ButtonBuilder()
    .setCustomId(`security_toggle_${key}`)
    .setLabel(`${SECURITY[key] ? "Disable" : "Enable"} ${label}`)
    .setStyle(SECURITY[key] ? ButtonStyle.Danger : ButtonStyle.Success);
}

function safeLogChannelId(guild) {
  return SECURITY_LOG_CHANNEL_ID || guild.systemChannelId || guild.channels.cache.first()?.id;
}

client.on("voiceStateUpdate", (oldState) => {
  const queue = musicQueues.get(oldState.guild.id);
  if (!queue) return;

  const channelId = queue.connection?.joinConfig?.channelId;
  if (!channelId) return;

  const channel = oldState.guild.channels.cache.get(channelId);
  if (!channel) return;

  const nonBots = channel.members.filter(m => !m.user.bot);

  if (nonBots.size === 0) {
    queue.text.send("👋 Everyone left — disconnecting.").catch(() => {});
    queue.connection?.destroy();
    musicQueues.delete(oldState.guild.id);
  }
});

client.on("messageDelete", async (message) => {
  try {
    if (!SECURITY.logMessageDelete) return;
    if (!message.guild || message.author?.bot) return;

    await securityLog(message.guild, {
      action: "Message Deleted",
      user: message.author || "Unknown User",
      userId: message.author?.id || "Unknown",
      channel: message.channel,
      channelId: message.channel.id,
      content: message.content || "Message content unavailable.",
      reason: "A message was deleted.",
      color: "Red"
    });
  } catch (err) {
    console.error("messageDelete log error:", err);
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    if (!SECURITY.logMessageEdit) return;
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    await securityLog(newMessage.guild, {
      action: "Message Edited",
      user: newMessage.author,
      userId: newMessage.author.id,
      channel: newMessage.channel,
      channelId: newMessage.channel.id,
      content: `Old: ${oldMessage.content || "Unavailable"}\n\nNew: ${newMessage.content || "Unavailable"}`,
      reason: "A message was edited.",
      color: "Yellow"
    });
  } catch (err) {
    console.error("messageUpdate log error:", err);
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    if (SECURITY.logJoinLeave) {
      await securityLog(member.guild, {
        action: "Member Joined",
        user: member.user,
        userId: member.user.id,
        channel: "Server Join",
        channelId: safeLogChannelId(member.guild),
        content: `Account Created: <t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`,
        reason: "User joined the server.",
        color: "Green"
      });
    }

    if (!SECURITY.raidProtection) return;

    const guildId = member.guild.id;
    const now = Date.now();
    const recentJoins = (raidTracker.get(guildId) || []).filter(t => now - t < SECURITY.raidJoinTime);
    recentJoins.push(now);
    raidTracker.set(guildId, recentJoins);

    if (recentJoins.length >= SECURITY.raidJoinLimit) {
      await securityLog(member.guild, {
        action: "Raid Protection Triggered",
        user: member.user,
        userId: member.user.id,
        channel: "Raid Protection",
        channelId: safeLogChannelId(member.guild),
        content: `${recentJoins.length} users joined within ${SECURITY.raidJoinTime / 1000} seconds.`,
        reason: "Possible raid detected.",
        color: "DarkRed"
      });
    }
  } catch (err) {
    console.error("guildMemberAdd log error:", err);
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    if (!SECURITY.logJoinLeave && !SECURITY.logBanKick) return;

    let action = "Member Left";
    let reason = "User left the server.";

    if (SECURITY.logBanKick) {
      const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick }).catch(() => null);
      const entry = logs?.entries?.first();
      if (entry && entry.target?.id === member.user.id && Date.now() - entry.createdTimestamp < 5000) {
        action = "User Kicked";
        reason = `Kicked by: ${entry.executor} (${entry.executor.id})\nReason: ${entry.reason || "No reason found."}`;
      }
    }

    await securityLog(member.guild, {
      action,
      user: member.user,
      userId: member.user.id,
      channel: "Server Leave",
      channelId: safeLogChannelId(member.guild),
      content: `${member.user.tag} left or was removed from the server.`,
      reason,
      color: action === "User Kicked" ? "Red" : "Orange"
    });
  } catch (err) {
    console.error("guildMemberRemove log error:", err);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!newMember.guild) return;
    const guild = newMember.guild;
    const logs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    if (SECURITY.logRoleChanges && oldMember.nickname !== newMember.nickname) {
      await securityLog(guild, {
        action: "Nickname Updated",
        user: newMember.user,
        userId: newMember.user.id,
        channel: "Member Update",
        channelId: safeLogChannelId(guild),
        content: `Old Nickname: ${oldMember.nickname || oldMember.user.username}\nNew Nickname: ${newMember.nickname || newMember.user.username}`,
        reason: `Updated by: ${executor}`,
        color: "Blue"
      });
    }

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;
    if (SECURITY.logBanKick && oldTimeout !== newTimeout) {
      await securityLog(guild, {
        action: newTimeout && newTimeout > Date.now() ? "User Timed Out" : "User Untimed Out",
        user: newMember.user,
        userId: newMember.user.id,
        channel: "Moderation",
        channelId: safeLogChannelId(guild),
        content: newTimeout && newTimeout > Date.now() ? `Timeout Until: <t:${Math.floor(newTimeout / 1000)}:F>` : "Timeout was removed.",
        reason: `Updated by: ${executor}`,
        color: newTimeout && newTimeout > Date.now() ? "Red" : "Green"
      });
    }

    if (!SECURITY.logRoleChanges) return;

    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    for (const role of addedRoles.values()) {
      await securityLog(guild, {
        action: "Role Added To User",
        user: newMember.user,
        userId: newMember.user.id,
        channel: "Role Update",
        channelId: safeLogChannelId(guild),
        content: `Role Added: ${role.name}\nRole ID: ${role.id}`,
        reason: `Added by: ${executor}`,
        color: "Green"
      });
    }

    for (const role of removedRoles.values()) {
      await securityLog(guild, {
        action: "Role Removed From User",
        user: newMember.user,
        userId: newMember.user.id,
        channel: "Role Update",
        channelId: safeLogChannelId(guild),
        content: `Role Removed: ${role.name}\nRole ID: ${role.id}`,
        reason: `Removed by: ${executor}`,
        color: "Orange"
      });
    }
  } catch (err) {
    console.error("guildMemberUpdate log error:", err);
  }
});

client.on("roleCreate", async (role) => {
  try {
    if (!SECURITY.logRoleChanges) return;
    const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    await securityLog(role.guild, {
      action: "Role Created",
      user: entry?.executor || role.guild.members.me.user,
      userId: entry?.executor?.id || role.guild.members.me.id,
      channel: "Role System",
      channelId: safeLogChannelId(role.guild),
      content: `Role Name: ${role.name}\nRole ID: ${role.id}\nColor: ${role.hexColor}\nMentionable: ${role.mentionable}`,
      reason: `Created by: ${executor}`,
      color: "Green"
    });
  } catch (err) {
    console.error("roleCreate log error:", err);
  }
});

client.on("roleDelete", async (role) => {
  try {
    if (!SECURITY.logRoleChanges) return;
    const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    await securityLog(role.guild, {
      action: "Role Deleted",
      user: entry?.executor || role.guild.members.me.user,
      userId: entry?.executor?.id || role.guild.members.me.id,
      channel: "Role System",
      channelId: safeLogChannelId(role.guild),
      content: `Deleted Role: ${role.name}\nRole ID: ${role.id}`,
      reason: `Deleted by: ${executor}`,
      color: "Red"
    });
  } catch (err) {
    console.error("roleDelete log error:", err);
  }
});

client.on("roleUpdate", async (oldRole, newRole) => {
  try {
    if (!SECURITY.logRoleChanges) return;
    if (oldRole.permissions.bitfield === newRole.permissions.bitfield && oldRole.name === newRole.name) return;

    const logs = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    let changes = "";
    if (oldRole.name !== newRole.name) changes += `Name Changed: ${oldRole.name} → ${newRole.name}\n`;
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes += `Permissions Updated.\nOld Permissions Bitfield: ${oldRole.permissions.bitfield}\nNew Permissions Bitfield: ${newRole.permissions.bitfield}`;
    }

    await securityLog(newRole.guild, {
      action: "Role / Permission Updated",
      user: entry?.executor || newRole.guild.members.me.user,
      userId: entry?.executor?.id || newRole.guild.members.me.id,
      channel: "Role Permissions",
      channelId: safeLogChannelId(newRole.guild),
      content: changes || "Role was updated.",
      reason: `Updated by: ${executor}`,
      color: "Yellow"
    });
  } catch (err) {
    console.error("roleUpdate log error:", err);
  }
});

client.on("channelCreate", async (channel) => {
  try {
    if (!SECURITY.logRoleChanges || !channel.guild) return;
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    await securityLog(channel.guild, {
      action: "Channel Created",
      user: entry?.executor || channel.guild.members.me.user,
      userId: entry?.executor?.id || channel.guild.members.me.id,
      channel: channel,
      channelId: channel.id,
      content: `Channel Name: ${channel.name}\nChannel ID: ${channel.id}\nType: ${channel.type}`,
      reason: `Created by: ${executor}`,
      color: "Green"
    });
  } catch (err) {
    console.error("channelCreate log error:", err);
  }
});

client.on("channelDelete", async (channel) => {
  try {
    if (!SECURITY.logRoleChanges || !channel.guild) return;
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    await securityLog(channel.guild, {
      action: "Channel Deleted",
      user: entry?.executor || channel.guild.members.me.user,
      userId: entry?.executor?.id || channel.guild.members.me.id,
      channel: "Deleted Channel",
      channelId: safeLogChannelId(channel.guild),
      content: `Deleted Channel Name: ${channel.name}\nChannel ID: ${channel.id}\nType: ${channel.type}`,
      reason: `Deleted by: ${executor}`,
      color: "Red"
    });
  } catch (err) {
    console.error("channelDelete log error:", err);
  }
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
  try {
    if (!SECURITY.logRoleChanges || !newChannel.guild) return;
    const logs = await newChannel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelUpdate }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    let changes = "";
    if (oldChannel.name !== newChannel.name) changes += `Name Changed: ${oldChannel.name} → ${newChannel.name}\n`;
    if (oldChannel.permissionOverwrites.cache.size !== newChannel.permissionOverwrites.cache.size) changes += "Permission overwrites changed.\n";
    if (oldChannel.topic !== newChannel.topic) changes += `Topic Changed:\nOld: ${oldChannel.topic || "None"}\nNew: ${newChannel.topic || "None"}\n`;
    if (!changes) changes = "Channel settings or permissions were updated.";

    await securityLog(newChannel.guild, {
      action: "Channel / Permission Updated",
      user: entry?.executor || newChannel.guild.members.me.user,
      userId: entry?.executor?.id || newChannel.guild.members.me.id,
      channel: newChannel,
      channelId: newChannel.id,
      content: changes,
      reason: `Updated by: ${executor}`,
      color: "Yellow"
    });
  } catch (err) {
    console.error("channelUpdate log error:", err);
  }
});

client.on("guildBanAdd", async (ban) => {
  try {
    if (!SECURITY.logBanKick) return;
    const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    await securityLog(ban.guild, {
      action: "User Banned",
      user: ban.user,
      userId: ban.user.id,
      channel: "Moderation",
      channelId: safeLogChannelId(ban.guild),
      content: `Banned User: ${ban.user.tag}`,
      reason: `Banned by: ${executor}\nReason: ${ban.reason || "No reason found."}`,
      color: "Red"
    });
  } catch (err) {
    console.error("guildBanAdd log error:", err);
  }
});

client.on("guildBanRemove", async (ban) => {
  try {
    if (!SECURITY.logBanKick) return;
    const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanRemove }).catch(() => null);
    const entry = logs?.entries?.first();
    const executor = entry?.executor ? `${entry.executor} (${entry.executor.id})` : "Unknown";

    await securityLog(ban.guild, {
      action: "User Unbanned",
      user: ban.user,
      userId: ban.user.id,
      channel: "Moderation",
      channelId: safeLogChannelId(ban.guild),
      content: `Unbanned User: ${ban.user.tag}`,
      reason: `Unbanned by: ${executor}`,
      color: "Green"
    });
  } catch (err) {
    console.error("guildBanRemove log error:", err);
  }
});

client.login(TOKEN).catch(err => {
  console.error("Discord login failed. Check DISCORD_TOKEN.");
  console.error(err.message);
  process.exit(1);
});