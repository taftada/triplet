require("dotenv").config();
const fs = require("fs");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection
} = require("@discordjs/voice");

const play = require("play-dl");

const TOKEN = process.env.DISCORD_TOKEN?.trim();
if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH || "./database.json";

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
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const prefix = "?";
const casinoSessions = new Map();
const giveaways = new Map();
const beefSessions = new Map();
const musicQueues = new Map();

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
  ceo: { name: "CEO", pay: 4000, college: 5 }
};

const collegeTests = {
  1: { question: "What is 25 + 17?", answers: ["42", "38", "41", "47"], correct: "42" },
  2: { question: "If you earn $350 for 4 shifts, how much is that?", answers: ["$1,400", "$1,200", "$900", "$1,750"], correct: "$1,400" },
  3: { question: "What does CPU stand for?", answers: ["Central Processing Unit", "Computer Power User", "Control Program Unit", "Core Process Utility"], correct: "Central Processing Unit" },
  4: { question: "What is profit?", answers: ["Money left after costs", "Money before costs", "Debt", "Taxes"], correct: "Money left after costs" },
  5: { question: "What is 15% of 2000?", answers: ["300", "200", "150", "500"], correct: "300" }
};

const roastLines = [
  "You built like a loading screen that never finishes.",
  "You move like lag in a ranked match.",
  "You got WiFi but still buffering in real life.",
  "You look like your barber rage quit halfway.",
  "You built like a side quest nobody accepted.",
  "You got main character confidence with background character skills.",
  "You the type to lose a 1v1 against yourself.",
  "You built like a broken controller stick drifting left.",
  "You talk like your brain has pop-up ads.",
  "You move like a PowerPoint transition.",
  "You got defeated by the tutorial mission.",
  "You built like a microwave with anxiety.",
  "You got premium excuses and free trial skills.",
  "You dress like your closet hit randomize.",
  "You got folded by common sense."
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

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
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
?casino — Blackjack, Poker, Slots, Mines

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

    if (command === "balance" || command === "bal") {
      return message.reply(`Cash: **${money(user.cash)}**\nBank: **${money(user.bank)}**`);
    }

    if (command === "daily") {
      user.cash += 1000;
      saveDB();
      return message.reply(`You claimed **${money(1000)}**`);
    }

    if (command === "work") {
      const job = jobs[user.job] || jobs.none;
      user.cash += job.pay;
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

      if (!best) return message.reply("You have nothing valuable to flex.");

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
              .setDescription(Object.entries(jobs).map(([key, j]) => `**${key}** — ${money(j.pay)} / college level ${j.college}`).join("\n"))
          ]
        });
      }

      if (sub === "choose") {
        const jobName = args[1]?.toLowerCase();
        const job = jobs[jobName];
        if (!job) return message.reply("That job does not exist. Use `?job list`.");
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
            .setCustomId(`test_${message.author.id}_${nextLevel}_${answer}`)
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
      const sessionId = `${message.author.id}_${Date.now()}`;
      casinoSessions.set(sessionId, { userId: message.author.id, bet: 100 });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`casino_game_${sessionId}`)
        .setPlaceholder("Choose a game")
        .addOptions([
          { label: "Blackjack", value: "blackjack", emoji: "🃏" },
          { label: "Poker", value: "poker", emoji: "♠️" },
          { label: "Slots", value: "slots", emoji: "🎰" },
          { label: "Mines", value: "mines", emoji: "💣" }
        ]);

      const row1 = new ActionRowBuilder().addComponents(menu);
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bet_down_${sessionId}`).setLabel("-100").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`bet_up_${sessionId}`).setLabel("+100").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`bet_half_${sessionId}`).setLabel("Half").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`bet_all_${sessionId}`).setLabel("All In").setStyle(ButtonStyle.Danger)
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
      const embed = new EmbedBuilder()
        .setTitle("🎉 GIVEAWAY")
        .setColor("Gold")
        .setDescription(`**Prize:** ${prize}\n**Ends:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>\n\nClick below to enter.`)
        .setFooter({ text: "0 entries" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`giveaway_${id}`).setLabel("Enter Giveaway").setEmoji("🎉").setStyle(ButtonStyle.Success)
      );

      const msg = await message.channel.send({ embeds: [embed], components: [row] });
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
        new ButtonBuilder().setCustomId(`rr_${role.id}`).setLabel(label).setStyle(ButtonStyle.Primary)
      );

      return message.channel.send({
        embeds: [new EmbedBuilder().setTitle("Reaction Role").setColor("Blue").setDescription(`Click to get/remove ${role}`)],
        components: [row]
      });
    }

    if (command === "admin") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply("No permission.");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin_lock").setLabel("Lock").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("admin_unlock").setLabel("Unlock").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin_slow").setLabel("Slowmode 5s").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin_clear").setLabel("Clear 10").setStyle(ButtonStyle.Primary)
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

    if (command === "play") {
      const query = args.join(" ");
      if (!query) return message.reply("Use `?play song name or url`");
      const voice = message.member.voice.channel;
      if (!voice) return message.reply("Join a voice channel first.");

      let queue = musicQueues.get(message.guild.id);
      if (!queue) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
        queue = { player, songs: [], connection: null, text: message.channel, nowPlaying: null };
        musicQueues.set(message.guild.id, queue);
        player.on(AudioPlayerStatus.Idle, () => playNext(message.guild.id));
        player.on("error", err => {
          console.error(err);
          playNext(message.guild.id);
        });
      }

      const results = await play.search(query, { limit: 1 });
      if (!results.length) return message.reply("No song found.");

      const song = { title: results[0].title, url: results[0].url, requestedBy: message.author.id };
      queue.songs.push(song);

      queue.connection = joinVoiceChannel({
        channelId: voice.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
      });

      queue.connection.subscribe(queue.player);
      message.reply(`Added to queue: **${song.title}**`);
      if (!queue.nowPlaying) playNext(message.guild.id);
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
    return message.reply("Something broke. Check Railway logs.");
  }
});

async function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  const song = queue.songs.shift();
  if (!song) {
    queue.nowPlaying = null;
    return;
  }

  queue.nowPlaying = song;

  const stream = await play.stream(song.url);
  const resource = createAudioResource(stream.stream, { inputType: stream.type });
  queue.player.play(resource);

  queue.text.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎵 Now Playing")
        .setColor("Blue")
        .setDescription(`**${song.title}**\nRequested by <@${song.requestedBy}>`)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("music_pause").setLabel("Pause").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("music_resume").setLabel("Resume").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("music_skip").setLabel("Skip").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("music_stop").setLabel("Stop").setStyle(ButtonStyle.Danger)
      )
    ]
  });
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.guild) return;

    if (interaction.isButton() && interaction.customId.startsWith("test_")) {
      const [, userId, level, answer] = interaction.customId.split("_");
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

    if (interaction.isButton() && interaction.customId.startsWith("bet_")) {
      const parts = interaction.customId.split("_");
      const action = parts[1];
      const sessionId = parts.slice(2).join("_");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Casino session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This casino is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      if (action === "up") session.bet += 100;
      if (action === "down") session.bet = Math.max(100, session.bet - 100);
      if (action === "half") session.bet = Math.max(100, Math.floor(user.cash / 2));
      if (action === "all") session.bet = Math.max(100, user.cash);
      if (session.bet > user.cash) session.bet = user.cash;

      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("🎰 Casino").setColor("Gold").setDescription(`Current bet: **${money(session.bet)}**\nCash: **${money(user.cash)}**\nPick a game.`)],
        components: interaction.message.components
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("casino_game_")) {
      const sessionId = interaction.customId.replace("casino_game_", "");
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
          new ButtonBuilder().setCustomId(`bj_hit_${sessionId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bj_stand_${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bj_double_${sessionId}`).setLabel("Double").setStyle(ButtonStyle.Primary)
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

        const deck = createDeck();
        const player = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
        const playerEval = evaluatePoker(player);
        const dealerEval = evaluatePoker(dealer);

        let result = "You lost.";
        let win = 0;

        if (playerEval.rank > dealerEval.rank) {
          win = Math.floor(bet * playerEval.multi) || bet * 2;
          user.cash += win;
          result = `You won **${money(win)}**`;
        } else if (playerEval.rank === dealerEval.rank) {
          user.cash += bet;
          result = "Push. Your bet was returned.";
        }

        saveDB();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`poker_again_${sessionId}`).setLabel("Play Again").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`poker_exit_${sessionId}`).setLabel("Exit").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("♠️ Poker")
              .setColor("Purple")
              .setDescription(`Bet: **${money(bet)}**\n\nYour hand: ${cardText(player)}\n**${playerEval.name}**\n\nDealer hand: ${cardText(dealer)}\n**${dealerEval.name}**\n\n${result}\nCash: **${money(user.cash)}**`)
          ],
          components: [row]
        });
      }

      if (game === "mines") {
        user.cash -= bet;
        saveDB();

        const mines = new Set();
        while (mines.size < 3) mines.add(Math.floor(Math.random() * 16));

        casinoSessions.set(sessionId, { ...session, game, mines, revealed: new Set(), active: true });

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("💣 Mines").setColor("DarkGold").setDescription(`Bet: **${money(bet)}**\nThere are **3 mines**. Pick tiles or cash out.`)],
          components: minesRows(sessionId)
        });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("bj_")) {
      const parts = interaction.customId.split("_");
      const action = parts[1];
      const sessionId = parts.slice(2).join("_");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Game expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This game is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);

      if (action === "hit") {
        session.player.push(session.deck.pop());
        if (handValue(session.player) > 21) {
          casinoSessions.delete(sessionId);
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle("🃏 Blackjack").setColor("Red").setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nYou busted and lost **${money(session.bet)}**.`)],
            components: []
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bj_hit_${sessionId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bj_stand_${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("🃏 Blackjack").setColor("Blue").setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nDealer shows: ${session.dealer[0].rank}${session.dealer[0].suit}`)],
          components: [row]
        });
      }

      if (action === "double") {
        if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash to double.", ephemeral: true });
        user.cash -= session.bet;
        session.bet *= 2;
        session.player.push(session.deck.pop());
        saveDB();
        return resolveBlackjack(interaction, sessionId);
      }

      if (action === "stand") return resolveBlackjack(interaction, sessionId);
    }

    if (interaction.isButton() && interaction.customId.startsWith("slot_respin_")) {
      const sessionId = interaction.customId.replace("slot_respin_", "");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This slot game is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash.", ephemeral: true });

      user.cash -= session.bet;
      saveDB();

      return spinSlots(interaction, sessionId, session.bet);
    }

    if (interaction.isButton() && interaction.customId.startsWith("poker_again_")) {
      const sessionId = interaction.customId.replace("poker_again_", "");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });

      const user = getUser(interaction.user.id);
      if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash.", ephemeral: true });

      user.cash -= session.bet;
      saveDB();

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

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("♠️ Poker")
            .setColor("Purple")
            .setDescription(`Bet: **${money(session.bet)}**\n\nYour hand: ${cardText(player)}\n**${playerEval.name}**\n\nDealer hand: ${cardText(dealer)}\n**${dealerEval.name}**\n\n${result}\nCash: **${money(user.cash)}**`)
        ],
        components: interaction.message.components
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("mine_")) {
      const [, sessionId, tileRaw] = interaction.customId.split("_");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Game expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This mines game is not yours.", ephemeral: true });

      if (tileRaw === "cashout") {
        const user = getUser(interaction.user.id);
        const multiplier = 1 + session.revealed.size * 0.35;
        const win = Math.floor(session.bet * multiplier);

        user.cash += win;
        saveDB();
        casinoSessions.delete(sessionId);

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("💣 Mines Cashout").setColor("Green").setDescription(`Safe tiles: **${session.revealed.size}**\nWon **${money(win)}**`)],
          components: []
        });
      }

      const tile = Number(tileRaw);
      if (session.mines.has(tile)) {
        casinoSessions.delete(sessionId);
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("💥 BOOM").setColor("Red").setDescription(`You hit a mine and lost **${money(session.bet)}**.`)],
          components: []
        });
      }

      session.revealed.add(tile);

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("💣 Mines")
            .setColor("DarkGold")
            .setDescription(`Safe tiles: **${session.revealed.size}**\nCashout: **${money(Math.floor(session.bet * (1 + session.revealed.size * 0.35)))}**`)
        ],
        components: minesRows(sessionId, session.revealed)
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("giveaway_")) {
      const id = interaction.customId.replace("giveaway_", "");
      const g = giveaways.get(id);
      if (!g) return interaction.reply({ content: "Giveaway ended.", ephemeral: true });

      g.entries.add(interaction.user.id);
      const channel = await client.channels.fetch(g.channelId);
      const msg = await channel.messages.fetch(g.messageId);
      const embed = EmbedBuilder.from(msg.embeds[0]).setFooter({ text: `${g.entries.size} entries` });
      await msg.edit({ embeds: [embed] });

      return interaction.reply({ content: "You entered.", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("rr_")) {
      const roleId = interaction.customId.replace("rr_", "");
      const member = interaction.member;

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        return interaction.reply({ content: "Role removed.", ephemeral: true });
      }

      await member.roles.add(roleId);
      return interaction.reply({ content: "Role added.", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith("admin_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: "No permission.", ephemeral: true });

      if (interaction.customId === "admin_lock") {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        return interaction.reply("Channel locked.");
      }

      if (interaction.customId === "admin_unlock") {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
        return interaction.reply("Channel unlocked.");
      }

      if (interaction.customId === "admin_slow") {
        await interaction.channel.setRateLimitPerUser(5);
        return interaction.reply("Slowmode set to 5 seconds.");
      }

      if (interaction.customId === "admin_clear") {
        await interaction.channel.bulkDelete(10, true);
        return interaction.reply("Deleted 10 messages.");
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("music_")) {
      const q = musicQueues.get(interaction.guild.id);
      if (!q) return interaction.reply({ content: "Nothing playing.", ephemeral: true });

      if (interaction.customId === "music_pause") q.player.pause();
      if (interaction.customId === "music_resume") q.player.unpause();
      if (interaction.customId === "music_skip") q.player.stop();

      if (interaction.customId === "music_stop") {
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
    new ButtonBuilder().setCustomId(`slot_respin_${sessionId}`).setLabel("Respin").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bet_up_${sessionId}`).setLabel("+100 Bet").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bet_down_${sessionId}`).setLabel("-100 Bet").setStyle(ButtonStyle.Secondary)
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

  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();

    for (let c = 0; c < 4; c++) {
      const tile = r * 4 + c;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mine_${sessionId}_${tile}`)
          .setLabel(revealed.has(tile) ? "✅" : "⬜")
          .setStyle(revealed.has(tile) ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(revealed.has(tile))
      );
    }

    rows.push(row);
  }

  const row4 = new ActionRowBuilder();
  for (let tile = 12; tile < 16; tile++) {
    row4.addComponents(
      new ButtonBuilder()
        .setCustomId(`mine_${sessionId}_${tile}`)
        .setLabel(revealed.has(tile) ? "✅" : "⬜")
        .setStyle(revealed.has(tile) ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(revealed.has(tile))
    );
  }
  rows.push(row4);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mine_${sessionId}_cashout`).setLabel("Cash Out").setStyle(ButtonStyle.Success)
    )
  );

  return rows;
}

client.login(TOKEN);