require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
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

const play = require("play-dl");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const prefix = "?";

const musicQueues = new Map();
const snipes = new Map();
const voiceOwners = new Map();

const AUTO_DISCONNECT = 30000;

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

//
// SNIPES
//

client.on("messageDelete", msg => {
  if (!msg.guild || msg.author?.bot) return;

  snipes.set(msg.channel.id, {
    content: msg.content,
    author: msg.author.tag,
    time: Date.now()
  });
});

//
// VOICE MASTER AUTO CREATE
//

client.on("voiceStateUpdate", async (oldState, newState) => {
  const channel = newState.channel;

  if (!channel) return;

  if (channel.name === "Join to Create") {
    const vc = await channel.guild.channels.create({
      name: `${newState.member.user.username}'s VC`,
      type: ChannelType.GuildVoice,
      parent: channel.parent
    });

    voiceOwners.set(vc.id, newState.member.id);

    await newState.member.voice.setChannel(vc);
  }

  if (
    oldState.channel &&
    voiceOwners.has(oldState.channel.id) &&
    oldState.channel.members.size === 0
  ) {
    oldState.channel.delete().catch(() => {});
    voiceOwners.delete(oldState.channel.id);
  }
});

//
// COMMANDS
//

client.on("messageCreate", async message => {
  if (message.author.bot) return;

  if (!message.content.startsWith(prefix)) return;

  const args = message.content
    .slice(prefix.length)
    .trim()
    .split(/ +/);

  const command = args.shift().toLowerCase();

  //
  // SNIPE
  //

  if (command === "s") {
    const data = snipes.get(message.channel.id);

    if (!data) {
      return message.reply("Nothing to snipe.");
    }

    const embed = new EmbedBuilder()
      .setTitle("Sniped Message")
      .setDescription(data.content)
      .setFooter({
        text: `Author: ${data.author}`
      })
      .setTimestamp(data.time);

    return message.channel.send({
      embeds: [embed]
    });
  }

  if (command === "cs") {
    snipes.delete(message.channel.id);

    return message.reply("Snipes cleared.");
  }

  //
  // MODERATION
  //

  if (command === "ban") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.BanMembers
      )
    ) {
      return message.reply("No permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply("Mention a user.");
    }

    await member.ban();

    return message.reply(`Banned ${member.user.tag}`);
  }

  if (command === "kick") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.KickMembers
      )
    ) {
      return message.reply("No permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply("Mention a user.");
    }

    await member.kick();

    return message.reply(`Kicked ${member.user.tag}`);
  }

  if (command === "timeout") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    ) {
      return message.reply("No permission.");
    }

    const member = message.mentions.members.first();

    if (!member) {
      return message.reply("Mention user.");
    }

    const time = parseInt(args[1]) || 60000;

    await member.timeout(time);

    return message.reply(`Timed out ${member.user.tag}`);
  }

  //
  // VOICEMASTER COMMANDS
  //

  if (command === "vm") {
    if (args[0] === "setup") {
      await message.guild.channels.create({
        name: "Join to Create",
        type: ChannelType.GuildVoice
      });

      return message.reply("VoiceMaster created.");
    }
  }

  if (command === "vc") {
    const vc = message.member.voice.channel;

    if (!vc) return message.reply("Join VC.");

    const owner = voiceOwners.get(vc.id);

    if (owner !== message.member.id) {
      return message.reply("You are not owner.");
    }

    if (args[0] === "name") {
      vc.setName(args.slice(1).join(" "));
    }

    if (args[0] === "limit") {
      vc.setUserLimit(parseInt(args[1]));
    }

    if (args[0] === "lock") {
      vc.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          Connect: false
        }
      );
    }

    if (args[0] === "unlock") {
      vc.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          Connect: true
        }
      );
    }

    if (args[0] === "delete") {
      vc.delete();
      voiceOwners.delete(vc.id);
    }
  }

  //
  // MUSIC
  //

  if (command === "play" || command === "p") {
    const query = args.join(" ");

    if (!query) {
      return message.reply("Provide song.");
    }

    const voice = message.member.voice.channel;

    if (!voice) {
      return message.reply("Join VC.");
    }

    let queue = musicQueues.get(message.guild.id);

    if (!queue) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber:
            NoSubscriberBehavior.Play
        }
      });

      queue = {
        player,
        songs: [],
        connection: null,
        textChannel: message.channel
      };

      musicQueues.set(
        message.guild.id,
        queue
      );

      player.on(
        AudioPlayerStatus.Idle,
        () => playNext(message.guild.id)
      );
    }

    const result = await play.search(
      query,
      { limit: 1 }
    );

    if (!result.length) {
      return message.reply(
        "No song found."
      );
    }

    const song = {
      title: result[0].title,
      url: result[0].url
    };

    queue.songs.push(song);

    queue.connection =
      joinVoiceChannel({
        channelId: voice.id,
        guildId:
          message.guild.id,
        adapterCreator:
          message.guild
            .voiceAdapterCreator
      });

    queue.connection.subscribe(
      queue.player
    );

    message.reply(
      `Queued: ${song.title}`
    );

    if (
      queue.songs.length === 1
    ) {
      playNext(message.guild.id);
    }
  }

  if (command === "skip") {
    const q = musicQueues.get(
      message.guild.id
    );

    if (!q)
      return message.reply(
        "Nothing playing."
      );

    q.player.stop();

    message.reply("Skipped.");
  }

  if (command === "pause") {
    const q = musicQueues.get(
      message.guild.id
    );

    if (!q)
      return message.reply(
        "Nothing playing."
      );

    q.player.pause();

    message.reply("Paused.");
  }

  if (command === "resume") {
    const q = musicQueues.get(
      message.guild.id
    );

    if (!q)
      return message.reply(
        "Nothing playing."
      );

    q.player.unpause();

    message.reply("Resumed.");
  }

  if (command === "stop") {
    const q = musicQueues.get(
      message.guild.id
    );

    if (!q)
      return message.reply(
        "Nothing playing."
      );

    q.songs = [];

    q.player.stop();

    getVoiceConnection(
      message.guild.id
    )?.destroy();

    musicQueues.delete(
      message.guild.id
    );

    message.reply("Stopped.");
  }
});

//
// PLAY NEXT
//

async function playNext(
  guildId
) {
  const queue =
    musicQueues.get(guildId);

  if (!queue) return;

  const song =
    queue.songs.shift();

  if (!song) {
    setTimeout(() => {
      const current =
        musicQueues.get(
          guildId
        );

      if (
        current &&
        current.songs.length === 0
      ) {
        current.connection?.destroy();

        musicQueues.delete(
          guildId
        );
      }
    }, AUTO_DISCONNECT);

    return;
  }

  const stream =
    await play.stream(
      song.url
    );

  const resource =
    createAudioResource(
      stream.stream,
      {
        inputType:
          stream.type
      }
    );

  queue.player.play(
    resource
  );

  queue.textChannel.send(
    `Now playing: ${song.title}`
  );
}

const TOKEN = process.env.DISCORD_TOKEN?.trim();

if (!TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN in Railway variables.");
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Discord login failed.");
  console.error(err.message);
  process.exit(1);
});