require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
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
  getVoiceConnection,
  StreamType,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");

const ytdl = require("@distube/ytdl-core");
const yts = require("yt-search");

const TOKEN = process.env.DISCORD_TOKEN?.trim();

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in Railway variables.");
  process.exit(1);
}

const prefix = "?";
const DB_PATH = process.env.DATABASE_PATH || "./database.json";
const DB_DIR = path.dirname(DB_PATH);

if (DB_DIR !== "." && !fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(
        {
          users: {},
          warnings: [],
          voiceMaster: {}
        },
        null,
        2
      )
    );
  }

  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {
      users: {},
      warnings: [],
      voiceMaster: {}
    };
  }
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
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember
  ]
});

const musicQueues = new Map();
const snipes = new Map();
const casinoSessions = new Map();
const giveaways = new Map();
const beefSessions = new Map();
const voiceOwners = new Map();

const AUTO_DISCONNECT_TIME = 30 * 1000;

const spamTracker = new Map();

const SECURITY_LOG_CHANNEL_ID = process.env.SECURITY_LOG_CHANNEL_ID || "";

const SECURITY = {
  antiSpam: true,
  antiLinks: true,
  antiMassMention: true,
  autoTimeout: true,
  spamLimit: 5,
  spamTime: 7000,
  timeoutTime: 60 * 1000,
  maxMentions: 5
};

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

function getUser(id) {
  if (!db.users[id]) {
    db.users[id] = {
      cash: 1000,
      bank: 0,
      xp: 0,
      level: 1,
      inventory: [],
      collegeLevel: 0,
      job: "none",
      lastDaily: 0,
      lastWork: 0
    };
    saveDB();
  }

  const user = db.users[id];
  if (!user.inventory) user.inventory = [];
  if (user.collegeLevel === undefined) user.collegeLevel = 0;
  if (!user.job) user.job = "none";
  if (!user.lastDaily) user.lastDaily = 0;
  if (!user.lastWork) user.lastWork = 0;

  return user;
}

function money(n) {
  return `$${Number(n).toLocaleString()}`;
}

function parseTime(t) {
  if (!t) return null;
  const amount = parseInt(t);
  if (!amount) return null;
  const lower = t.toLowerCase();

  if (lower.endsWith("s")) return amount * 1000;
  if (lower.endsWith("m")) return amount * 60 * 1000;
  if (lower.endsWith("h")) return amount * 60 * 60 * 1000;
  if (lower.endsWith("d")) return amount * 24 * 60 * 60 * 1000;

  return amount * 60 * 1000;
}

function createDeck() {
  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
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

async function securityLog(guild, data) {
  if (!SECURITY_LOG_CHANNEL_ID) return;

  const channel = guild.channels.cache.get(SECURITY_LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Security Action Logged")
    .setColor(data.color || "Red")
    .addFields(
      { name: "Action", value: `\`${data.action}\``, inline: true },
      { name: "User", value: `${data.user}\n\`${data.userId}\``, inline: true },
      { name: "Channel", value: `${data.channel}`, inline: true },
      {
        name: "Content",
        value: data.content ? `\`\`\`${data.content.slice(0, 900)}\`\`\`` : "`No content.`"
      },
      { name: "Reason", value: data.reason || "`No reason.`" }
    )
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
}

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  snipes.set(message.channel.id, {
    content: message.content || "No message content.",
    author: message.author.tag,
    avatar: message.author.displayAvatarURL(),
    time: Date.now()
  });
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (newState.channel && db.voiceMaster?.[newState.guild.id]?.joinChannelId === newState.channel.id) {
      const created = await newState.guild.channels.create({
        name: `${newState.member.user.username}'s VC`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parentId || null,
        permissionOverwrites: [
          {
            id: newState.member.id,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers
            ]
          }
        ]
      });

      voiceOwners.set(created.id, newState.member.id);
      await newState.member.voice.setChannel(created).catch(() => {});
    }

    if (oldState.channel && voiceOwners.has(oldState.channel.id) && oldState.channel.members.size === 0) {
      voiceOwners.delete(oldState.channel.id);
      await oldState.channel.delete().catch(() => {});
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

client.on("messageCreate", async message => {
  try {
    if (message.author.bot) return;

    if (message.guild && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const member = message.member;
      const content = message.content.toLowerCase();

      if (SECURITY.antiLinks) {
        const blockedLinks = [
          "discord.gg/",
          "discord.com/invite/",
          "discordapp.com/invite/"
        ];

        if (blockedLinks.some(link => content.includes(link))) {
          await message.delete().catch(() => {});

          if (SECURITY.autoTimeout) {
            await member.timeout(SECURITY.timeoutTime, "Posted invite link").catch(() => {});
          }

          await securityLog(message.guild, {
            action: "Invite Link Deleted + Timeout",
            user: message.author,
            userId: message.author.id,
            channel: message.channel,
            content: message.content,
            reason: "Anti-link detected.",
            color: "Red"
          });

          return;
        }
      }

      if (SECURITY.antiMassMention) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;

        if (mentionCount >= SECURITY.maxMentions || message.mentions.everyone) {
          await message.delete().catch(() => {});

          if (SECURITY.autoTimeout) {
            await member.timeout(SECURITY.timeoutTime, "Mass mention").catch(() => {});
          }

          await securityLog(message.guild, {
            action: "Mass Mention Deleted + Timeout",
            user: message.author,
            userId: message.author.id,
            channel: message.channel,
            content: message.content,
            reason: `Mention count: ${mentionCount}`,
            color: "Orange"
          });

          return;
        }
      }

      if (SECURITY.antiSpam) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();

        const timestamps = (spamTracker.get(key) || []).filter(t => now - t < SECURITY.spamTime);
        timestamps.push(now);
        spamTracker.set(key, timestamps);

        if (timestamps.length >= SECURITY.spamLimit) {
          await message.delete().catch(() => {});

          if (SECURITY.autoTimeout) {
            await member.timeout(SECURITY.timeoutTime, "Message spam").catch(() => {});
          }

          spamTracker.set(key, []);

          await securityLog(message.guild, {
            action: "Spam Deleted + Timeout",
            user: message.author,
            userId: message.author.id,
            channel: message.channel,
            content: message.content,
            reason: `${timestamps.length} messages too fast.`,
            color: "DarkRed"
          });

          return;
        }
      }
    }

    if (!message.content.startsWith(prefix)) return;
    if (!message.guild) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    const user = getUser(message.author.id);

    user.xp += Math.floor(Math.random() * 10) + 5;
    if (user.xp >= user.level * 100) {
      user.xp -= user.level * 100;
      user.level++;
      message.channel.send(`${message.author} leveled up to Level ${user.level}`).catch(() => {});
    }
    saveDB();

    if (command === "cmds" || command === "help") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Commands")
            .setColor("#5865F2")
            .setDescription(`
**Economy**
?balance, ?bal, ?daily, ?work, ?deposit, ?withdraw, ?leaderboard

**Shop / Flex**
?shop, ?buy item, ?inventory, ?inv, ?flex, ?flexon @user

**Casino**
?casino

**College / Jobs**
?college, ?test, ?job list, ?job choose cashier

**Fun**
?freestyle, ?rap, ?coinflip, ?roll, ?avatar

**Giveaway / Roles**
?giveaway 10m Prize, ?reactionrole @role Label

**Moderation**
?admin, ?ban, ?b, ?kick, ?k, ?timeout, ?mute, ?clear, ?lock, ?unlock, ?warn

**Snipes**
?s, ?cs

**VoiceMaster**
?vm setup, ?vc name, ?vc limit, ?vc lock, ?vc unlock, ?vc claim, ?vc kick, ?vc delete

**Music**
?p, ?play, ?pause, ?resume, ?skip, ?stop, ?queue, ?soundtest
            `)
        ]
      });
    }

    if (command === "s") {
      const data = snipes.get(message.channel.id);
      if (!data) return message.reply("Nothing to snipe.");

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Sniped Message")
            .setColor("DarkButNotBlack")
            .setDescription(data.content)
            .setAuthor({ name: data.author, iconURL: data.avatar })
            .setTimestamp(data.time)
        ]
      });
    }

    if (command === "cs") {
      snipes.delete(message.channel.id);
      return message.reply("Snipes cleared.");
    }

    if (command === "balance" || command === "bal") {
      return message.reply(`Cash: **${money(user.cash)}**\nBank: **${money(user.bank)}**\nJob: **${jobs[user.job]?.name || "No Job"}**`);
    }

    if (command === "daily") {
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      if (user.lastDaily && now - user.lastDaily < cooldown) {
        const left = Math.ceil((cooldown - (now - user.lastDaily)) / 3600000);
        return message.reply(`Wait about ${left} hours before claiming daily again.`);
      }

      user.cash += 1000;
      user.lastDaily = now;
      saveDB();
      return message.reply(`You claimed **${money(1000)}**`);
    }

    if (command === "work") {
      const now = Date.now();
      const cooldown = 3000;

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
      const amount = args[0] === "all" ? user.cash : Number(args[0]);
      if (!amount || amount <= 0) return message.reply("Use `?deposit 500`");
      if (user.cash < amount) return message.reply("Not enough cash.");

      user.cash -= amount;
      user.bank += amount;
      saveDB();

      return message.reply(`Deposited **${money(amount)}**`);
    }

    if (command === "withdraw" || command === "with") {
      const amount = args[0] === "all" ? user.bank : Number(args[0]);
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
            .setTitle("Richest Users")
            .setColor("Gold")
            .setDescription(rows.map(([id, u], i) => `**${i + 1}.** <@${id}> — ${money(u.cash + u.bank)}`).join("\n") || "No users yet.")
        ]
      });
    }

    if (command === "shop") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Luxury Shop")
            .setColor("Gold")
            .setDescription(
              Object.entries(shopItems)
                .map(([key, item]) => `**${key}** — ${money(item.price)}\n${item.name}`)
                .join("\n\n") + "\n\nBuy with `?buy itemname`"
            )
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

      return message.reply(`You bought **${item.name}** for **${money(item.price)}**.`);
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

      return message.channel.send(`${message.author} is flexing **${best.item.name}** worth **${money(best.item.price)}**.`);
    }

    if (command === "flexon") {
      const target = message.mentions.users.first();
      if (!target) return message.reply("Use `?flexon @user`.");
      if (!user.inventory.length) return message.reply("You have nothing to flex.");

      const best = user.inventory
        .map(i => ({ key: i, item: shopItems[i] }))
        .filter(x => x.item)
        .sort((a, b) => b.item.price - a.item.price)[0];

      return message.channel.send(`${message.author} flexed **${best.item.name}** on ${target}.`);
    }

    if (command === "college") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("College")
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
              .setTitle("Jobs")
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
            .setTitle(`College Test Level ${nextLevel}`)
            .setColor("Blue")
            .setDescription(test.question)
        ],
        components: [row]
      });
    }

    if (command === "casino") {
      const sessionId = `${message.author.id}-${Date.now()}`;
      casinoSessions.set(sessionId, { userId: message.author.id, bet: 100 });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`casino:${sessionId}`)
        .setPlaceholder("Choose a game")
        .addOptions([
          { label: "Blackjack", value: "blackjack", emoji: "🃏" },
          { label: "Poker", value: "poker", emoji: "♠️" },
          { label: "Slots", value: "slots", emoji: "🎰" },
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
            .setTitle("Casino")
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
            .setTitle("GIVEAWAY")
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

        const channel = await client.channels.fetch(g.channelId).catch(() => null);
        if (!channel) return giveaways.delete(id);

        const giveawayMsg = await channel.messages.fetch(g.messageId).catch(() => null);
        if (!giveawayMsg) return giveaways.delete(id);

        const entries = [...g.entries];

        if (!entries.length) {
          await giveawayMsg.edit({
            embeds: [new EmbedBuilder().setTitle("GIVEAWAY ENDED").setColor("Red").setDescription(`**Prize:** ${g.prize}\nNo one entered.`)],
            components: []
          }).catch(() => {});
          giveaways.delete(id);
          return;
        }

        const winner = entries[Math.floor(Math.random() * entries.length)];

        await giveawayMsg.edit({
          embeds: [new EmbedBuilder().setTitle("GIVEAWAY ENDED").setColor("Green").setDescription(`**Prize:** ${g.prize}\n**Winner:** <@${winner}>`)],
          components: []
        }).catch(() => {});

        channel.send(`<@${winner}> won **${g.prize}**`).catch(() => {});
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
            .setTitle("Freestyle")
            .setColor("DarkRed")
            .setDescription(`**Topic:** ${topic}\n\n${bars.sort(() => Math.random() - 0.5).slice(0, 8).map(x => `> ${x}`).join("\n")}`)
        ]
      });
    }

    if (command === "coinflip") return message.reply(Math.random() < 0.5 ? "Heads" : "Tails");
    if (command === "roll") return message.reply(`You rolled **${Math.floor(Math.random() * 6) + 1}**`);

    if (command === "avatar") {
      const target = message.mentions.users.first() || message.author;
      return message.reply(target.displayAvatarURL({ size: 1024 }));
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
        embeds: [new EmbedBuilder().setTitle("Admin Dashboard").setColor("Red").setDescription("Use the buttons below.")],
        components: [row]
      });
    }

    if (command === "clear") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply("No permission.");
      const amount = Number(args[0]);
      if (!amount) return message.reply("Use `?clear 10`");
      await message.channel.bulkDelete(Math.min(amount, 100), true);
      return message.reply(`Deleted ${Math.min(amount, 100)} messages.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
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

      const reason = args.slice(1).join(" ") || "No reason";
      await member.ban({ reason });
      return message.reply(`Banned ${member.user.tag}`);
    }

    if (command === "kick" || command === "k") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply("No permission.");

      const member = message.mentions.members.first();
      if (!member) return message.reply("Use `?kick @user reason`");

      const reason = args.slice(1).join(" ") || "No reason";
      await member.kick(reason);
      return message.reply(`Kicked ${member.user.tag}`);
    }

    if (command === "timeout" || command === "mute" || command === "time" || command === "t") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply("No permission.");

      const member = message.mentions.members.first();
      if (!member) return message.reply("Use `?timeout @user 10m reason`");

      const duration = parseTime(args[1]) || 10 * 60 * 1000;
      const reason = args.slice(2).join(" ") || "No reason";

      await member.timeout(duration, reason);
      return message.reply(`Timed out ${member.user.tag} for ${args[1] || "10m"}`);
    }

    if (command === "vm") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply("No permission.");

      const sub = args[0]?.toLowerCase();

      if (sub === "setup") {
        const joinChannel = await message.guild.channels.create({
          name: "Join to Create",
          type: ChannelType.GuildVoice
        });

        if (!db.voiceMaster) db.voiceMaster = {};
        db.voiceMaster[message.guild.id] = { joinChannelId: joinChannel.id };
        saveDB();

        return message.reply(`VoiceMaster setup created: ${joinChannel.name}`);
      }

      return message.reply("Use `?vm setup`");
    }

    if (command === "vc") {
      const vc = message.member.voice.channel;
      if (!vc) return message.reply("Join your voice channel first.");

      let ownerId = voiceOwners.get(vc.id);

      if (!ownerId && args[0]?.toLowerCase() === "claim") {
        if (vc.members.has(message.author.id)) {
          voiceOwners.set(vc.id, message.author.id);
          return message.reply("You claimed this VC.");
        }
      }

      if (ownerId !== message.author.id) {
        return message.reply("You are not the owner of this VC. Use `?vc claim` if the owner left.");
      }

      const sub = args[0]?.toLowerCase();

      if (sub === "name") {
        const name = args.slice(1).join(" ");
        if (!name) return message.reply("Use `?vc name new name`");
        await vc.setName(name);
        return message.reply("VC renamed.");
      }

      if (sub === "limit") {
        const limit = Number(args[1]);
        if (Number.isNaN(limit) || limit < 0 || limit > 99) return message.reply("Use `?vc limit 5`");
        await vc.setUserLimit(limit);
        return message.reply(`VC limit set to ${limit}.`);
      }

      if (sub === "lock") {
        await vc.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false });
        return message.reply("VC locked.");
      }

      if (sub === "unlock") {
        await vc.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: true });
        return message.reply("VC unlocked.");
      }

      if (sub === "kick") {
        const target = message.mentions.members.first();
        if (!target) return message.reply("Use `?vc kick @user`");
        if (target.voice.channelId !== vc.id) return message.reply("That user is not in your VC.");
        await target.voice.disconnect();
        return message.reply("User kicked from VC.");
      }

      if (sub === "delete") {
        voiceOwners.delete(vc.id);
        await vc.delete().catch(() => {});
        return;
      }

      return message.reply("Use `?vc name`, `?vc limit`, `?vc lock`, `?vc unlock`, `?vc claim`, `?vc kick`, or `?vc delete`.");
    }

    if (command === "soundtest") {
      const voice = message.member.voice.channel;
      if (!voice) return message.reply("Join VC first.");

      const connection = joinVoiceChannel({
        channelId: voice.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false
      });

      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20000);

      const resource = createAudioResource(
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        {
          inputType: StreamType.Arbitrary,
          inlineVolume: true
        }
      );

      resource.volume.setVolume(1);
      connection.subscribe(player);
      player.play(resource);

      player.on("error", err => console.error("SOUNDTEST PLAYER ERROR:", err.message));
      console.log("SOUNDTEST STARTED");

      return message.reply("Playing sound test. If this is silent, the problem is Railway/permissions/audio packages.");
    }

    if (command === "play" || command === "p") {
      const query = args.join(" ");
      if (!query) return message.reply("Use `?p song name or url`");

      const voice = message.member.voice.channel;
      if (!voice) return message.reply("Join a voice channel first.");

      let queue = musicQueues.get(message.guild.id);

      if (!queue) {
        const player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
          }
        });

        queue = {
          player,
          songs: [],
          connection: null,
          textChannel: message.channel,
          playing: false
        };

        musicQueues.set(message.guild.id, queue);

        player.on(AudioPlayerStatus.Idle, () => {
          queue.playing = false;
          playNext(message.guild.id);
        });

        player.on("error", err => {
          console.error("MUSIC PLAYER ERROR:", err.message);
          queue.playing = false;
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
        const video = results.videos[0];

        if (!video) return message.reply("No song found.");

        song = {
          title: video.title,
          url: video.url,
          requestedBy: message.author.id,
          thumbnail: video.thumbnail || null
        };
      }

      queue.songs.push(song);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("music:pause").setLabel("Pause").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("music:resume").setLabel("Resume").setEmoji("▶️").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("music:skip").setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("music:stop").setLabel("Stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger)
      );

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("Queued")
            .setDescription(`**${song.title}**`)
            .setThumbnail(song.thumbnail)
        ],
        components: [row]
      });

      if (!queue.playing) {
        playNext(message.guild.id);
      }

      return;
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
      q.playing = false;
      q.player.stop();
      getVoiceConnection(message.guild.id)?.destroy();
      musicQueues.delete(message.guild.id);

      return message.reply("Stopped music.");
    }

    if (command === "queue") {
      const q = musicQueues.get(message.guild.id);
      if (!q || (!q.songs.length && !q.playing)) return message.reply("Queue empty.");
      return message.reply(q.songs.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.title}`).join("\n") || "Nothing queued after the current song.");
    }
  } catch (err) {
    console.error("messageCreate error:", err);
    return message.reply("Something broke. Check Railway logs.").catch(() => {});
  }
});

async function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  const song = queue.songs.shift();

  if (!song) {
    queue.playing = false;

    setTimeout(() => {
      const currentQueue = musicQueues.get(guildId);
      if (!currentQueue) return;

      if (!currentQueue.playing && currentQueue.songs.length === 0) {
        currentQueue.textChannel.send("Leaving VC — queue empty.").catch(() => {});
        currentQueue.connection?.destroy();
        musicQueues.delete(guildId);
      }
    }, AUTO_DISCONNECT_TIME);

    return;
  }

  try {
    queue.playing = true;

    await entersState(queue.connection, VoiceConnectionStatus.Ready, 20000);

    const stream = ytdl(song.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25,
      liveBuffer: 4000,
      dlChunkSize: 0
    });

    stream.on("error", err => {
      console.error("YTDL STREAM ERROR:", err.message);
    });

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });

    resource.volume.setVolume(1);

    queue.player.play(resource);

    console.log("NOW PLAYING:", song.title);

    queue.textChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("Now Playing")
          .setDescription(`**${song.title}**\nRequested by <@${song.requestedBy}>`)
          .setURL(song.url)
          .setThumbnail(song.thumbnail)
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
    console.error("PLAY NEXT ERROR:", err.message);
    queue.playing = false;
    playNext(guildId);
  }
}

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.guild) return;

    if (interaction.isButton() && interaction.customId.startsWith("test:")) {
      const [, userId, level, answer] = interaction.customId.split(":");
      if (interaction.user.id !== userId) return interaction.reply({ content: "This test is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      const test = collegeTests[level];

      if (answer === test.correct) {
        user.collegeLevel = Number(level);
        saveDB();

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("Test Passed").setColor("Green").setDescription(`You passed college level **${level}**.`)],
          components: []
        });
      }

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("Test Failed").setColor("Red").setDescription("Wrong answer. Try again with `?test`.")],
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
        embeds: [new EmbedBuilder().setTitle("Casino").setColor("Gold").setDescription(`Current bet: **${money(session.bet)}**\nCash: **${money(user.cash)}**\nPick a game.`)],
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
          new ButtonBuilder().setCustomId(`bjstand:${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Blackjack")
              .setColor("Blue")
              .setDescription(`Bet: **${money(bet)}**\nYour hand: ${cardText(player)} — **${handValue(player)}**\nDealer shows: ${dealer[0].rank}${dealer[0].suit}`)
          ],
          components: [row]
        });
      }

      if (game === "slots") {
        user.cash -= bet;
        const icons = ["🍒", "🍋", "💎", "7️⃣", "⭐", "🔔"];
        const spin = [
          icons[Math.floor(Math.random() * icons.length)],
          icons[Math.floor(Math.random() * icons.length)],
          icons[Math.floor(Math.random() * icons.length)]
        ];

        let win = 0;
        if (spin[0] === spin[1] && spin[1] === spin[2]) win = bet * 5;
        else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) win = Math.floor(bet * 1.5);

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Slots")
              .setColor(win > 0 ? "Green" : "Red")
              .setDescription(`${spin.join(" | ")}\n\n${win > 0 ? `You won **${money(win)}**` : `You lost **${money(bet)}**`}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }

      if (game === "poker") {
        user.cash -= bet;
        const deck = createDeck();
        const player = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        const playerEval = evaluatePoker(player);
        const dealerEval = evaluatePoker(dealer);

        let result = `You lost **${money(bet)}**.`;

        if (playerEval.rank > dealerEval.rank) {
          const win = Math.floor(bet * playerEval.multi) || bet * 2;
          user.cash += win;
          result = `You won **${money(win)}**`;
        } else if (playerEval.rank === dealerEval.rank) {
          user.cash += bet;
          result = "Push. Your bet was returned.";
        }

        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Poker")
              .setColor("Purple")
              .setDescription(`Your hand: ${cardText(player)} — **${playerEval.name}**\nDealer hand: ${cardText(dealer)} — **${dealerEval.name}**\n\n${result}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }

      if (game === "roulette") {
        user.cash -= bet;

        const number = Math.floor(Math.random() * 37);
        const color = number === 0 ? "green" : number % 2 === 0 ? "black" : "red";
        let win = color === "red" ? bet * 2 : 0;

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Roulette")
              .setColor(win > 0 ? "Green" : "Red")
              .setDescription(`Ball landed on **${number} ${color}**\nYou bet red.\n${win > 0 ? `You won **${money(win)}**` : `You lost **${money(bet)}**`}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }

      if (game === "dice") {
        user.cash -= bet;

        const roll = Math.floor(Math.random() * 6) + 1;
        let win = roll >= 4 ? bet * 2 : 0;

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Dice")
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
        let win = cashout < crashPoint ? Math.floor(bet * cashout) : 0;

        user.cash += win;
        saveDB();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Crash")
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

      if (action === "bjhit") {
        session.player.push(session.deck.pop());

        if (handValue(session.player) > 21) {
          casinoSessions.delete(sessionId);

          return interaction.update({
            embeds: [new EmbedBuilder().setTitle("Blackjack").setColor("Red").setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nYou busted and lost **${money(session.bet)}**.`)],
            components: []
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bjhit:${sessionId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bjstand:${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("Blackjack").setColor("Blue").setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nDealer shows: ${session.dealer[0].rank}${session.dealer[0].suit}`)],
          components: [row]
        });
      }

      if (action === "bjstand") {
        const user = getUser(interaction.user.id);

        while (handValue(session.dealer) < 17) session.dealer.push(session.deck.pop());

        const playerVal = handValue(session.player);
        const dealerVal = handValue(session.dealer);

        let result = `You lost **${money(session.bet)}**.`;
        let color = "Red";

        if (dealerVal > 21 || playerVal > dealerVal) {
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
              .setTitle("Blackjack Result")
              .setColor(color)
              .setDescription(`Your hand: ${cardText(session.player)} — **${playerVal}**\nDealer hand: ${cardText(session.dealer)} — **${dealerVal}**\n\n${result}\nCash: **${money(user.cash)}**`)
          ],
          components: []
        });
      }
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
        q.playing = false;
        q.player.stop();
        getVoiceConnection(interaction.guild.id)?.destroy();
        musicQueues.delete(interaction.guild.id);
      }

      return interaction.reply({ content: "Done.", ephemeral: true });
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
    return interaction.reply({ content: "Something broke.", ephemeral: true }).catch(() => {});
  }
});

client.login(TOKEN).catch(err => {
  console.error("Discord login failed. Check DISCORD_TOKEN.");
  console.error(err.message);
  process.exit(1);
});
