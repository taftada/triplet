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
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const prefix = "?";
const casinoSessions = new Map();

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

/* =======================
   JOB / COLLEGE SYSTEM
======================= */

const jobs = {
  none: { name: "No Job", pay: 150, college: 0 },
  cashier: { name: "Cashier", pay: 350, college: 1 },
  mechanic: { name: "Mechanic", pay: 700, college: 2 },
  developer: { name: "Developer", pay: 1300, college: 3 },
  banker: { name: "Banker", pay: 2200, college: 4 },
  ceo: { name: "CEO", pay: 4000, college: 5 }
};

const collegeTests = {
  1: {
    question: "Level 1 Test: What is 25 + 17?",
    answers: ["42", "38", "41", "47"],
    correct: "42"
  },
  2: {
    question: "Level 2 Test: If you earn $350 for 4 shifts, how much is that?",
    answers: ["$1,400", "$1,200", "$900", "$1,750"],
    correct: "$1,400"
  },
  3: {
    question: "Level 3 Test: What does CPU stand for?",
    answers: ["Central Processing Unit", "Computer Power User", "Control Program Unit", "Core Process Utility"],
    correct: "Central Processing Unit"
  },
  4: {
    question: "Level 4 Test: What is profit?",
    answers: ["Money left after costs", "Money before costs", "Debt", "Taxes"],
    correct: "Money left after costs"
  },
  5: {
    question: "Level 5 Test: What is 15% of 2000?",
    answers: ["300", "200", "150", "500"],
    correct: "300"
  }
};

/* =======================
   CARDS
======================= */

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
  let total = hand.reduce((sum, card) => sum + cardValue(card), 0);
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

/* =======================
   READY
======================= */

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

/* =======================
   COMMANDS
======================= */

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
?balance
?daily
?work
?deposit 500
?withdraw 500
?leaderboard

**Casino**
?casino
Interactive Blackjack, Poker, Slots, Mines

**College / Jobs**
?college
?job list
?job choose cashier
?test

**Moderation**
?ban @user
?kick @user
?clear 10
?lock
?unlock
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

    if (command === "deposit") {
      const amount = Number(args[0]);
      if (!amount || amount <= 0) return message.reply("Use `?deposit 500`");
      if (user.cash < amount) return message.reply("Not enough cash.");

      user.cash -= amount;
      user.bank += amount;
      saveDB();

      return message.reply(`Deposited **${money(amount)}**`);
    }

    if (command === "withdraw") {
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

    if (command === "college") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎓 College")
            .setColor("Blue")
            .setDescription(`
Your college level: **${user.collegeLevel}**

Pass tests to unlock better jobs.

**Jobs**
Level 0: No Job — $150
Level 1: Cashier — $350
Level 2: Mechanic — $700
Level 3: Developer — $1,300
Level 4: Banker — $2,200
Level 5: CEO — $4,000

Use:
\`?test\`
\`?job list\`
\`?job choose developer\`
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
              .setDescription(Object.entries(jobs).map(([key, j]) => `**${key}** — ${money(j.pay)} / requires college level ${j.college}`).join("\n"))
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

      casinoSessions.set(sessionId, {
        userId: message.author.id,
        bet: 100
      });

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
  } catch (err) {
    console.error(err);
    return message.reply("Something broke. Check Railway logs.");
  }
});

/* =======================
   INTERACTIONS
======================= */

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
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Test Passed")
              .setColor("Green")
              .setDescription(`You passed college level **${level}**.`)
          ],
          components: []
        });
      }

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Test Failed")
            .setColor("Red")
            .setDescription(`Wrong answer. Try again with \`?test\`.`)
        ],
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
        embeds: [
          new EmbedBuilder()
            .setTitle("🎰 Casino")
            .setColor("Gold")
            .setDescription(`Current bet: **${money(session.bet)}**\nCash: **${money(user.cash)}**\nPick a game from the menu.`)
        ],
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

      if (user.cash < bet) return interaction.reply({ content: "You do not have enough cash for that bet.", ephemeral: true });

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
              .setDescription(
                `Bet: **${money(bet)}**\n\n` +
                `Your hand: ${cardText(player)} — **${handValue(player)}**\n` +
                `Dealer shows: ${dealer[0].rank}${dealer[0].suit}\n\n` +
                `Dealer hits until 17. Blackjack pays 2x.`
              )
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
              .setTitle("♠️ Realistic Poker")
              .setColor("Purple")
              .setDescription(
                `Bet: **${money(bet)}**\n\n` +
                `Your hand: ${cardText(player)}\n**${playerEval.name}**\n\n` +
                `Dealer hand: ${cardText(dealer)}\n**${dealerEval.name}**\n\n` +
                `${result}\nCash: **${money(user.cash)}**`
              )
          ],
          components: [row]
        });
      }

      if (game === "mines") {
        user.cash -= bet;
        saveDB();

        const mines = new Set();
        while (mines.size < 3) mines.add(Math.floor(Math.random() * 25));

        casinoSessions.set(sessionId, {
          ...session,
          game,
          mines,
          revealed: new Set(),
          active: true
        });

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("💣 Mines")
              .setColor("DarkGold")
              .setDescription(
                `Bet: **${money(bet)}**\nThere are **3 mines**.\nPick tiles. Cash out before you hit a mine.`
              )
          ],
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
            embeds: [
              new EmbedBuilder()
                .setTitle("🃏 Blackjack")
                .setColor("Red")
                .setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\n\nYou busted and lost **${money(session.bet)}**.`)
            ],
            components: []
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bj_hit_${sessionId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bj_stand_${sessionId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🃏 Blackjack")
              .setColor("Blue")
              .setDescription(`Your hand: ${cardText(session.player)} — **${handValue(session.player)}**\nDealer shows: ${session.dealer[0].rank}${session.dealer[0].suit}`)
          ],
          components: [row]
        });
      }

      if (action === "double") {
        if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash to double.", ephemeral: true });

        user.cash -= session.bet;
        session.bet *= 2;
        session.player.push(session.deck.pop());
        saveDB();

        actionResolveBlackjack(interaction, sessionId);
        return;
      }

      if (action === "stand") {
        actionResolveBlackjack(interaction, sessionId);
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("slot_respin_")) {
      const sessionId = interaction.customId.replace("slot_respin_", "");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });
      if (interaction.user.id !== session.userId) return interaction.reply({ content: "This slot game is not yours.", ephemeral: true });

      const user = getUser(interaction.user.id);
      if (user.cash < session.bet) return interaction.reply({ content: "Not enough cash to respin.", ephemeral: true });

      user.cash -= session.bet;
      saveDB();

      return spinSlots(interaction, sessionId, session.bet);
    }

    if (interaction.isButton() && interaction.customId.startsWith("poker_again_")) {
      const sessionId = interaction.customId.replace("poker_again_", "");
      const session = casinoSessions.get(sessionId);
      if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true });

      const fakeSelect = {
        ...interaction,
        values: ["poker"],
        customId: `casino_game_${sessionId}`
      };

      return client.emit("interactionCreate", fakeSelect);
    }

    if (interaction.isButton() && interaction.customId.startsWith("poker_exit_")) {
      casinoSessions.delete(interaction.customId.replace("poker_exit_", ""));
      return interaction.update({ embeds: [new EmbedBuilder().setTitle("Poker closed.").setColor("Red")], components: [] });
    }

    if (interaction.isButton() && interaction.customId.startsWith("mine_")) {
      const [, sessionId, tileRaw] = interaction.customId.split("_");
      const tile = Number(tileRaw);
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
          embeds: [
            new EmbedBuilder()
              .setTitle("💣 Mines Cashout")
              .setColor("Green")
              .setDescription(`You cashed out after **${session.revealed.size}** safe tiles.\nWon **${money(win)}**`)
          ],
          components: []
        });
      }

      if (session.mines.has(tile)) {
        casinoSessions.delete(sessionId);

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("💥 BOOM")
              .setColor("Red")
              .setDescription(`You hit a mine and lost **${money(session.bet)}**.`)
          ],
          components: []
        });
      }

      session.revealed.add(tile);

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("💣 Mines")
            .setColor("DarkGold")
            .setDescription(
              `Safe tiles picked: **${session.revealed.size}**\n` +
              `Current cashout: **${money(Math.floor(session.bet * (1 + session.revealed.size * 0.35)))}**`
            )
        ],
        components: minesRows(sessionId, session.revealed)
      });
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: "Something broke.", ephemeral: true }).catch(() => {});
  }
});

/* =======================
   CASINO HELPERS
======================= */

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
        .setDescription(
          `## ${spin.join(" | ")}\n\n` +
          `Bet: **${money(bet)}**\n` +
          `${win > 0 ? `You won **${money(win)}**` : "You lost."}\n` +
          `Cash: **${money(user.cash)}**`
        )
    ],
    components: [row]
  });
}

async function actionResolveBlackjack(interaction, sessionId) {
  const session = casinoSessions.get(sessionId);
  const user = getUser(interaction.user.id);

  while (handValue(session.dealer) < 17) {
    session.dealer.push(session.deck.pop());
  }

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
        .setDescription(
          `Your hand: ${cardText(session.player)} — **${playerVal}**\n` +
          `Dealer hand: ${cardText(session.dealer)} — **${dealerVal}**\n\n` +
          `${result}\nCash: **${money(user.cash)}**`
        )
    ],
    components: []
  });
}

function minesRows(sessionId, revealed = new Set()) {
  const rows = [];

  for (let r = 0; r < 5; r++) {
    const row = new ActionRowBuilder();

    for (let c = 0; c < 5; c++) {
      const tile = r * 5 + c;

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

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mine_${sessionId}_cashout`)
        .setLabel("Cash Out")
        .setStyle(ButtonStyle.Success)
    )
  );

  return rows.slice(0, 5);
}

client.login(TOKEN);