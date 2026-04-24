require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const prefix = process.env.PREFIX || ",";
const queues = new Map();

client.once("ready", () => {
  console.log(`${client.user.tag} is online`);
});

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      songs: [],
      player: createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play
        }
      }),
      connection: null,
      volume: 1,
      current: null,
      textChannel: null
    });
  }

  return queues.get(guildId);
}

async function playSong(message, queue) {
  const song = queue.songs.shift();

  if (!song) {
    queue.current = null;
    return;
  }

  queue.current = song;

  try {
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });

    resource.volume.setVolume(queue.volume);

    queue.player.play(resource);
    queue.connection.subscribe(queue.player);

    const embed = new EmbedBuilder()
      .setTitle("🎵 Now Playing")
      .setDescription(`[${song.title}](${song.url})`)
      .addFields(
        { name: "Volume", value: `${Math.round(queue.volume * 100)}%`, inline: true },
        { name: "Requested by", value: song.requestedBy, inline: true }
      )
      .setColor("Purple");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("music_pause")
        .setLabel("Pause")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("music_resume")
        .setLabel("Resume")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("music_skip")
        .setLabel("Skip")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("music_voldown")
        .setLabel("Vol -")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("music_volup")
        .setLabel("Vol +")
        .setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({
      embeds: [embed],
      components: [row]
    });
  } catch (err) {
    console.log(err);
    message.channel.send("I could not play that song.");
    playSong(message, queue);
  }
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const queue = queues.get(interaction.guild.id);

  if (!queue) {
    return interaction.reply({
      content: "Nothing is playing.",
      ephemeral: true
    });
  }

  if (interaction.customId === "music_pause") {
    queue.player.pause();
    return interaction.reply({ content: "Paused.", ephemeral: true });
  }

  if (interaction.customId === "music_resume") {
    queue.player.unpause();
    return interaction.reply({ content: "Resumed.", ephemeral: true });
  }

  if (interaction.customId === "music_skip") {
    queue.player.stop();
    return interaction.reply({ content: "Skipped.", ephemeral: true });
  }

  if (interaction.customId === "music_volup") {
    queue.volume = Math.min(queue.volume + 0.1, 2);
    return interaction.reply({
      content: `Volume: ${Math.round(queue.volume * 100)}%`,
      ephemeral: true
    });
  }

  if (interaction.customId === "music_voldown") {
    queue.volume = Math.max(queue.volume - 0.1, 0.1);
    return interaction.reply({
      content: `Volume: ${Math.round(queue.volume * 100)}%`,
      ephemeral: true
    });
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  const member =
    message.mentions.members.first() ||
    message.guild.members.cache.get(args[0]);

  if (command === "ping") {
    return message.reply("pong");
  }

  if (command === "help") {
    return message.reply(`
**Commands**
\`,ping\`
\`,b @user reason\`
\`,k @user reason\`
\`,mute @user minutes\`
\`,unmute @user\`
\`,purge amount\`
\`,lock\`
\`,unlock\`
\`,r @user @role\`

**Casino**
\`,casino slots\`
\`,casino blackjack\`
\`,casino poker\`
\`,casino holdem\`

**Music**
\`,play song name or url\`
\`,skip\`
\`,pause\`
\`,resume\`
\`,stop\`
\`,volume 50\`
\`,queue\`
`);
  }

  if (command === "play") {
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
      return message.reply("Join a voice channel first.");
    }

    const query = args.join(" ");

    if (!query) {
      return message.reply("Type a song name or URL.");
    }

    const queue = getQueue(message.guild.id);
    queue.textChannel = message.channel;

    if (!queue.connection) {
      queue.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
      });
    }

    let song;

    try {
      if (play.yt_validate(query) === "video") {
        const info = await play.video_info(query);
        song = {
          title: info.video_details.title,
          url: info.video_details.url,
          requestedBy: message.author.tag
        };
      } else {
        const results = await play.search(query, {
          limit: 1,
          source: { youtube: "video" }
        });

        if (!results.length) {
          return message.reply("I could not find that song.");
        }

        song = {
          title: results[0].title,
          url: results[0].url,
          requestedBy: message.author.tag
        };
      }

      queue.songs.push(song);

      message.reply(`Added to queue: **${song.title}**`);

      if (queue.player.state.status !== AudioPlayerStatus.Playing) {
        playSong(message, queue);
      }
    } catch (err) {
      console.log(err);
      return message.reply("Something went wrong finding that song.");
    }
  }

  if (command === "skip") {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("Nothing is playing.");

    queue.player.stop();
    return message.reply("Skipped.");
  }

  if (command === "pause") {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("Nothing is playing.");

    queue.player.pause();
    return message.reply("Paused.");
  }

  if (command === "resume") {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("Nothing is playing.");

    queue.player.unpause();
    return message.reply("Resumed.");
  }

  if (command === "stop") {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("Nothing is playing.");

    queue.songs = [];
    queue.player.stop();

    const connection = getVoiceConnection(message.guild.id);
    if (connection) connection.destroy();

    queues.delete(message.guild.id);

    return message.reply("Stopped music and left the voice channel.");
  }

  if (command === "volume") {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("Nothing is playing.");

    const amount = parseInt(args[0]);

    if (!amount || amount < 1 || amount > 200) {
      return message.reply("Use a number from 1 to 200.");
    }

    queue.volume = amount / 100;

    return message.reply(`Volume set to ${amount}%`);
  }

  if (command === "queue") {
    const queue = queues.get(message.guild.id);

    if (!queue || (!queue.current && queue.songs.length === 0)) {
      return message.reply("The queue is empty.");
    }

    const songs = queue.songs
      .slice(0, 10)
      .map((song, index) => `${index + 1}. ${song.title}`)
      .join("\n");

    return message.reply(`
**Now Playing:** ${queue.current ? queue.current.title : "Nothing"}
**Up Next:**
${songs || "Nothing"}
`);
  }

  if (command === "b" || command === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply("You need Ban Members permission.");
    }

    if (!member) return message.reply("Mention someone to ban.");

    const reason = args.slice(1).join(" ") || "No reason given";
    await member.ban({ reason });

    return message.reply(`Banned ${member.user.tag}`);
  }

  if (command === "k" || command === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply("You need Kick Members permission.");
    }

    if (!member) return message.reply("Mention someone to kick.");

    const reason = args.slice(1).join(" ") || "No reason given";
    await member.kick(reason);

    return message.reply(`Kicked ${member.user.tag}`);
  }

  if (command === "mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("You need Moderate Members permission.");
    }

    if (!member) return message.reply("Mention someone to mute.");

    const minutes = parseInt(args[1]) || 10;
    await member.timeout(minutes * 60 * 1000);

    return message.reply(`Muted ${member.user.tag} for ${minutes} minutes.`);
  }

  if (command === "unmute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("You need Moderate Members permission.");
    }

    if (!member) return message.reply("Mention someone to unmute.");

    await member.timeout(null);

    return message.reply(`Unmuted ${member.user.tag}`);
  }

  if (command === "purge") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("You need Manage Messages permission.");
    }

    const amount = parseInt(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply("Type a number from 1 to 100.");
    }

    await message.channel.bulkDelete(amount, true);

    return message.channel.send(`Deleted ${amount} messages.`);
  }

  if (command === "lock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("You need Manage Channels permission.");
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false
    });

    return message.reply("Channel locked.");
  }

  if (command === "unlock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("You need Manage Channels permission.");
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: true
    });

    return message.reply("Channel unlocked.");
  }

  if (command === "r" || command === "role") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return message.reply("You need Manage Roles permission.");
    }

    if (!member) return message.reply("Mention a user.");

    const role = message.mentions.roles.first();

    if (!role) return message.reply("Mention a role.");

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      return message.reply(`Removed ${role.name} from ${member.user.tag}`);
    } else {
      await member.roles.add(role);
      return message.reply(`Gave ${role.name} to ${member.user.tag}`);
    }
  }

  if (command === "casino") {
    const game = args[0]?.toLowerCase();

    if (!game) {
      return message.reply("Choose a game: slots, blackjack, poker, or holdem");
    }

    if (game === "slots") {
      const symbols = ["🍒", "🍋", "💎", "7️⃣", "🍀"];
      const s1 = symbols[Math.floor(Math.random() * symbols.length)];
      const s2 = symbols[Math.floor(Math.random() * symbols.length)];
      const s3 = symbols[Math.floor(Math.random() * symbols.length)];

      if (s1 === s2 && s2 === s3) {
        return message.reply(`🎰 ${s1} ${s2} ${s3}\nYou won the jackpot!`);
      }

      return message.reply(`🎰 ${s1} ${s2} ${s3}\nYou lost. Try again.`);
    }

    if (game === "blackjack") {
      const player = Math.floor(Math.random() * 11) + 16;
      const dealer = Math.floor(Math.random() * 11) + 16;

      if (player > 21) {
        return message.reply(`🃏 You: ${player}\nDealer: ${dealer}\nYou busted!`);
      }

      if (dealer > 21 || player > dealer) {
        return message.reply(`🃏 You: ${player}\nDealer: ${dealer}\nYou win!`);
      }

      if (player === dealer) {
        return message.reply(`🃏 You: ${player}\nDealer: ${dealer}\nTie game.`);
      }

      return message.reply(`🃏 You: ${player}\nDealer: ${dealer}\nDealer wins.`);
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
        "Four of a Kind",
        "Straight Flush"
      ];

      const player = hands[Math.floor(Math.random() * hands.length)];
      const dealer = hands[Math.floor(Math.random() * hands.length)];

      return message.reply(`♠️ Poker\nYou: ${player}\nDealer: ${dealer}`);
    }

    if (game === "holdem" || game === "texas") {
      const outcomes = [
        "You won with a Flush!",
        "You lost to a Full House!",
        "You won with a Straight!",
        "Dealer had better cards.",
        "You hit a lucky pair!"
      ];

      const result = outcomes[Math.floor(Math.random() * outcomes.length)];

      return message.reply(`🂡 Texas Hold'em\n${result}`);
    }

    return message.reply("Game not found. Use: slots, blackjack, poker, or holdem");
  }
});

client.on("error", console.error);
client.login(process.env.TOKEN);