require("dotenv").config();

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
const Database = require("better-sqlite3");

const TOKEN = process.env.DISCORD_TOKEN?.trim();

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const db = new Database(process.env.DATABASE_PATH || "./bot.sqlite");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  cash INTEGER DEFAULT 500,
  bank INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  lastDaily INTEGER DEFAULT 0,
  lastWork INTEGER DEFAULT 0,
  inventory TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId TEXT,
  userId TEXT,
  reason TEXT,
  modId TEXT,
  time INTEGER
);
`);

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
const giveaways = new Map();
const musicQueues = new Map();

function getUser(id) {
  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

  if (!user) {
    db.prepare("INSERT INTO users (id) VALUES (?)").run(id);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }

  user.inventory = JSON.parse(user.inventory || "[]");
  return user;
}

function saveUser(user) {
  db.prepare(`
    UPDATE users
    SET cash = ?, bank = ?, xp = ?, level = ?, lastDaily = ?, lastWork = ?, inventory = ?
    WHERE id = ?
  `).run(
    user.cash,
    user.bank,
    user.xp,
    user.level,
    user.lastDaily,
    user.lastWork,
    JSON.stringify(user.inventory),
    user.id
  );
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

function drawCard() {
  return Math.floor(Math.random() * 10) + 2;
}

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  const user = getUser(message.author.id);

  user.xp += Math.floor(Math.random() * 10) + 5;

  if (user.xp >= user.level * 100) {
    user.xp -= user.level * 100;
    user.level += 1;
    message.channel.send(`${message.author} leveled up to **Level ${user.level}**`);
  }

  saveUser(user);

  if (command === "cmds" || command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("⚡ Command Panel")
      .setColor("#5865F2")
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription("Click a button below to view commands.");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cmds_economy").setLabel("Economy").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cmds_casino").setLabel("Casino").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cmds_mod").setLabel("Moderation").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cmds_fun").setLabel("Fun").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cmds_music").setLabel("Music").setStyle(ButtonStyle.Secondary)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  if (command === "balance" || command === "bal") {
    return message.reply(`Cash: **${money(user.cash)}**\nBank: **${money(user.bank)}**`);
  }

  if (command === "daily") {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return message.reply("You already claimed daily.");

    user.lastDaily = now;
    user.cash += 1000;
    saveUser(user);

    return message.reply(`You claimed **${money(1000)}**`);
  }

  if (command === "work") {
    const now = Date.now();
    if (now - user.lastWork < 300000) return message.reply("Work cooldown.");

    const earned = Math.floor(Math.random() * 500) + 150;
    user.lastWork = now;
    user.cash += earned;
    saveUser(user);

    return message.reply(`You worked and earned **${money(earned)}**`);
  }

  if (command === "deposit" || command === "dep") {
    const amount = Number(args[0]);
    if (!amount || amount <= 0) return message.reply("Use `?deposit 500`");
    if (user.cash < amount) return message.reply("Not enough cash.");

    user.cash -= amount;
    user.bank += amount;
    saveUser(user);

    return message.reply(`Deposited **${money(amount)}**`);
  }

  if (command === "withdraw" || command === "with") {
    const amount = Number(args[0]);
    if (!amount || amount <= 0) return message.reply("Use `?withdraw 500`");
    if (user.bank < amount) return message.reply("Not enough bank money.");

    user.bank -= amount;
    user.cash += amount;
    saveUser(user);

    return message.reply(`Withdrew **${money(amount)}**`);
  }

  if (command === "level" || command === "rank") {
    return message.reply(`Level: **${user.level}**\nXP: **${user.xp}/${user.level * 100}**`);
  }

  if (command === "leaderboard" || command === "lb") {
    const rows = db.prepare("SELECT * FROM users ORDER BY cash + bank DESC LIMIT 10").all();

    const text = rows.map((u, i) => {
      return `**${i + 1}.** <@${u.id}> — ${money(u.cash + u.bank)}`;
    }).join("\n") || "No users yet.";

    return message.reply({
      embeds: [new EmbedBuilder().setTitle("💰 Richest Users").setColor("Gold").setDescription(text)]
    });
  }

  if (command === "shop") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛒 Shop")
          .setColor("Purple")
          .setDescription("`vip` — $5,000\n`rolex` — $15,000\n`penthouse` — $50,000\n\nUse `?buy item`")
      ]
    });
  }

  if (command === "buy") {
    const item = args[0]?.toLowerCase();
    const shop = { vip: 5000, rolex: 15000, penthouse: 50000 };

    if (!shop[item]) return message.reply("Use `?buy vip`, `?buy rolex`, or `?buy penthouse`.");
    if (user.cash < shop[item]) return message.reply("Not enough cash.");

    user.cash -= shop[item];
    user.inventory.push(item);
    saveUser(user);

    return message.reply(`Bought **${item}** for **${money(shop[item])}**`);
  }

  if (command === "inventory" || command === "inv") {
    return message.reply(user.inventory.length ? `Inventory: **${user.inventory.join(", ")}**` : "Inventory empty.");
  }

  if (command === "casino") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`casino_${message.author.id}`)
      .setPlaceholder("Choose a casino game")
      .addOptions([
        { label: "Slots", value: "slots", emoji: "🎰" },
        { label: "Blackjack", value: "blackjack", emoji: "🃏" },
        { label: "Poker", value: "poker", emoji: "♠️" }
      ]);

    return message.reply({
      embeds: [new EmbedBuilder().setTitle("🎰 Casino").setColor("Gold").setDescription("Pick a game below.")],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }

  if (command === "giveaway") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("You need Manage Server permission.");
    }

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
      new ButtonBuilder()
        .setCustomId(`giveaway_${id}`)
        .setLabel("Enter Giveaway")
        .setEmoji("🎉")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    giveaways.set(id, {
      prize,
      messageId: msg.id,
      channelId: message.channel.id,
      entries: new Set()
    });

    setTimeout(async () => {
      const g = giveaways.get(id);
      if (!g) return;

      const channel = await client.channels.fetch(g.channelId);
      const giveawayMsg = await channel.messages.fetch(g.messageId);
      const entries = [...g.entries];

      if (!entries.length) {
        await giveawayMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎉 GIVEAWAY ENDED")
              .setColor("Red")
              .setDescription(`**Prize:** ${g.prize}\nNo one entered.`)
          ],
          components: []
        });

        giveaways.delete(id);
        return;
      }

      const winner = entries[Math.floor(Math.random() * entries.length)];

      await giveawayMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY ENDED")
            .setColor("Green")
            .setDescription(`**Prize:** ${g.prize}\n**Winner:** <@${winner}>`)
        ],
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
      "Built from the dirt, now I walk like a don",
      "No cartoon bars, this is steel in the tone",
      "Mind on the mission, I been locked in my zone",
      "They wanted me quiet, now the speakers on chrome",
      "I do not beg for a seat, I build the throne"
    ];

    const picked = bars.sort(() => Math.random() - 0.5).slice(0, 8);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎤 Freestyle")
          .setColor("DarkRed")
          .setDescription(`**Topic:** ${topic}\n\n${picked.map(x => `> ${x}`).join("\n")}`)
      ]
    });
  }

  if (command === "reactionrole") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return message.reply("No permission.");
    }

    const role = message.mentions.roles.first();
    const label = args.slice(1).join(" ") || role?.name;

    if (!role) return message.reply("Use `?reactionrole @role Label`");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rr_${role.id}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
    );

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Reaction Role")
          .setColor("Blue")
          .setDescription(`Click to get/remove ${role}`)
      ],
      components: [row]
    });
  }

  if (command === "admin") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("No permission.");
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("admin_lock").setLabel("Lock").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("admin_unlock").setLabel("Unlock").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("admin_slow").setLabel("Slowmode 5s").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("admin_clear").setLabel("Clear 10").setStyle(ButtonStyle.Primary)
    );

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛠️ Admin Dashboard")
          .setColor("Red")
          .setDescription("Use the buttons below.")
      ],
      components: [row]
    });
  }

  if (command === "clear") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("No permission.");
    }

    const amount = Number(args[0]);
    if (!amount) return message.reply("Use `?clear 10`");

    await message.channel.bulkDelete(amount, true);
    return message.reply(`Deleted ${amount} messages.`);
  }

  if (command === "lock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("No permission.");
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return message.reply("Channel locked.");
  }

  if (command === "unlock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("No permission.");
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
    return message.reply("Channel unlocked.");
  }

  if (command === "warn") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("No permission.");
    }

    const target = message.mentions.users.first();
    const reason = args.slice(1).join(" ") || "No reason";

    if (!target) return message.reply("Use `?warn @user reason`");

    db.prepare("INSERT INTO warnings (guildId, userId, reason, modId, time) VALUES (?, ?, ?, ?, ?)")
      .run(message.guild.id, target.id, reason, message.author.id, Date.now());

    return message.reply(`Warned ${target.tag}: ${reason}`);
  }

  if (command === "coinflip") {
    return message.reply(Math.random() < 0.5 ? "Heads" : "Tails");
  }

  if (command === "roll") {
    return message.reply(`You rolled **${Math.floor(Math.random() * 6) + 1}**`);
  }

  if (command === "avatar") {
    const target = message.mentions.users.first() || message.author;
    return message.reply(target.displayAvatarURL({ size: 1024 }));
  }

  if (command === "serverinfo") {
    return message.reply(`Server: **${message.guild.name}**\nMembers: **${message.guild.memberCount}**`);
  }

  if (command === "userinfo") {
    const target = message.mentions.users.first() || message.author;
    return message.reply(`User: **${target.tag}**\nID: **${target.id}**`);
  }

  if (command === "play") {
    const query = args.join(" ");
    if (!query) return message.reply("Use `?play song name or url`");

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
        text: message.channel,
        nowPlaying: null
      };

      musicQueues.set(message.guild.id, queue);

      player.on(AudioPlayerStatus.Idle, () => playNext(message.guild.id));

      player.on("error", (err) => {
        console.error(err);
        playNext(message.guild.id);
      });
    }

    const results = await play.search(query, { limit: 1 });
    if (!results.length) return message.reply("No song found.");

    const song = {
      title: results[0].title,
      url: results[0].url,
      requestedBy: message.author.id
    };

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
    q.nowPlaying = null;
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
  const resource = createAudioResource(stream.stream, {
    inputType: stream.type
  });

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
    if (interaction.isButton() && interaction.customId.startsWith("cmds_")) {
      const pages = {
        cmds_economy: [
          "💸 Economy",
          "`?balance`, `?daily`, `?work`, `?deposit`, `?withdraw`, `?leaderboard`, `?shop`, `?buy`, `?inventory`, `?level`"
        ],
        cmds_casino: [
          "🎰 Casino",
          "`?casino` with Slots, Poker, Blackjack Hit/Stand"
        ],
        cmds_mod: [
          "🛡️ Moderation",
          "`?admin`, `?clear`, `?lock`, `?unlock`, `?warn`, `?reactionrole`"
        ],
        cmds_fun: [
          "🎮 Fun",
          "`?freestyle`, `?rap`, `?giveaway`, `?coinflip`, `?roll`, `?avatar`"
        ],
        cmds_music: [
          "🎵 Music",
          "`?play`, `?pause`, `?resume`, `?skip`, `?stop`, `?queue`"
        ]
      };

      const page = pages[interaction.customId];

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(page[0])
            .setColor("#5865F2")
            .setDescription(page[1])
        ],
        components: interaction.message.components
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("giveaway_")) {
      const id = interaction.customId.replace("giveaway_", "");
      const g = giveaways.get(id);

      if (!g) return interaction.reply({ content: "Giveaway ended.", ephemeral: true });

      g.entries.add(interaction.user.id);

      const channel = await client.channels.fetch(g.channelId);
      const msg = await channel.messages.fetch(g.messageId);
      const embed = EmbedBuilder.from(msg.embeds[0]).setFooter({
        text: `${g.entries.size} entries`
      });

      await msg.edit({ embeds: [embed] });

      return interaction.reply({
        content: "You entered.",
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("rr_")) {
      const roleId = interaction.customId.replace("rr_", "");
      const member = interaction.member;

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        return interaction.reply({
          content: "Role removed.",
          ephemeral: true
        });
      }

      await member.roles.add(roleId);

      return interaction.reply({
        content: "Role added.",
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("admin_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: "No permission.", ephemeral: true });
      }

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

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("casino_")) {
      const owner = interaction.customId.split("_")[1];

      if (interaction.user.id !== owner) {
        return interaction.reply({
          content: "This casino menu is not yours.",
          ephemeral: true
        });
      }

      const game = interaction.values[0];

      if (game === "slots") {
        const icons = ["🍒", "🍋", "💎", "7️⃣", "⭐"];
        const spin = [
          icons[Math.floor(Math.random() * icons.length)],
          icons[Math.floor(Math.random() * icons.length)],
          icons[Math.floor(Math.random() * icons.length)]
        ];

        const win = spin[0] === spin[1] && spin[1] === spin[2];

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎰 Slots")
              .setColor(win ? "Green" : "Red")
              .setDescription(`## ${spin.join(" | ")}\n\n${win ? "You won!" : "You lost!"}`)
          ],
          components: []
        });
      }

      if (game === "poker") {
        const hands = [
          "High Card",
          "Pair",
          "Two Pair",
          "Three of a Kind",
          "Straight",
          "Flush",
          "Full House",
          "Royal Flush"
        ];

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("♠️ Poker")
              .setColor("Purple")
              .setDescription(`Your hand: **${hands[Math.floor(Math.random() * hands.length)]}**`)
          ],
          components: []
        });
      }

      if (game === "blackjack") {
        const player = drawCard() + drawCard();
        const dealer = drawCard() + drawCard();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bj_hit_${owner}_${player}_${dealer}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bj_stand_${owner}_${player}_${dealer}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🃏 Blackjack")
              .setColor("Blue")
              .setDescription(`Your hand: **${player}**\nDealer shows: **${dealer}**`)
          ],
          components: [row]
        });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("bj_")) {
      const parts = interaction.customId.split("_");
      const action = parts[1];
      const owner = parts[2];
      let player = Number(parts[3]);
      let dealer = Number(parts[4]);

      if (interaction.user.id !== owner) {
        return interaction.reply({
          content: "This blackjack game is not yours.",
          ephemeral: true
        });
      }

      if (action === "hit") {
        player += drawCard();

        if (player > 21) {
          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("🃏 Blackjack")
                .setColor("Red")
                .setDescription(`Your hand: **${player}**\nDealer hand: **${dealer}**\n\nYou busted.`)
            ],
            components: []
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bj_hit_${owner}_${player}_${dealer}`).setLabel("Hit").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bj_stand_${owner}_${player}_${dealer}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
        );

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🃏 Blackjack")
              .setColor("Blue")
              .setDescription(`Your hand: **${player}**\nDealer shows: **${dealer}**`)
          ],
          components: [row]
        });
      }

      if (action === "stand") {
        while (dealer < 17) dealer += drawCard();

        let result = "You lost.";
        let color = "Red";

        if (dealer > 21 || player > dealer) {
          result = "You won.";
          color = "Green";
        } else if (player === dealer) {
          result = "Tie.";
          color = "Yellow";
        }

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("🃏 Blackjack Result")
              .setColor(color)
              .setDescription(`Your hand: **${player}**\nDealer hand: **${dealer}**\n\n**${result}**`)
          ],
          components: []
        });
      }
    }
  } catch (err) {
    console.error(err);

    return interaction.reply({
      content: "Something went wrong.",
      ephemeral: true
    }).catch(() => {});
  }
});

client.login(TOKEN);