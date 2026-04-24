require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN?.trim();

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in Railway Variables");
  process.exit(1);
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

const prefix = ",";

client.once("ready", () => {
  console.log(`Bot online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  try {
    if (command === "ping") {
      return message.reply("Pong!");
    }

    if (command === "help") {
      const embed = new EmbedBuilder()
        .setTitle("Triplet Bot Commands")
        .setColor("Blue")
        .setDescription(`
**Moderation**
\`,b @user reason\` - Ban user
\`,k @user reason\` - Kick user
\`,r @user @role\` - Give role

**Fun**
\`,casino slots\`
\`,casino blackjack\`
\`,casino poker\`

**Other**
\`,ping\`
\`,help\`
        `);

      return message.reply({ embeds: [embed] });
    }

    if (command === "b") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return message.reply("You do not have permission to ban members.");
      }

      const member = message.mentions.members.first();
      if (!member) return message.reply("Mention someone to ban.");

      const reason = args.slice(1).join(" ") || "No reason given";
      await member.ban({ reason });

      return message.reply(`Banned ${member.user.tag}. Reason: ${reason}`);
    }

    if (command === "k") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return message.reply("You do not have permission to kick members.");
      }

      const member = message.mentions.members.first();
      if (!member) return message.reply("Mention someone to kick.");

      const reason = args.slice(1).join(" ") || "No reason given";
      await member.kick(reason);

      return message.reply(`Kicked ${member.user.tag}. Reason: ${reason}`);
    }

    if (command === "r") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return message.reply("You do not have permission to manage roles.");
      }

      const member = message.mentions.members.first();
      const role = message.mentions.roles.first();

      if (!member) return message.reply("Mention a user.");
      if (!role) return message.reply("Mention a role.");

      await member.roles.add(role);
      return message.reply(`Gave ${role.name} to ${member.user.tag}.`);
    }

    if (command === "casino") {
      const game = args[0]?.toLowerCase();

      if (!game) {
        return message.reply("Pick a game: `slots`, `blackjack`, or `poker`.");
      }

      if (game === "slots") {
        const icons = ["🍒", "🍋", "💎", "7️⃣", "⭐"];
        const spin = [
          icons[Math.floor(Math.random() * icons.length)],
          icons[Math.floor(Math.random() * icons.length)],
          icons[Math.floor(Math.random() * icons.length)]
        ];

        const won = spin[0] === spin[1] && spin[1] === spin[2];

        return message.reply(`${spin.join(" | ")}\n${won ? "You won!" : "You lost!"}`);
      }

      if (game === "blackjack") {
        const player = Math.floor(Math.random() * 11) + 10;
        const dealer = Math.floor(Math.random() * 11) + 10;

        let result = "You lost!";
        if (player > dealer && player <= 21) result = "You won!";
        if (player === dealer) result = "Tie!";

        return message.reply(`Your hand: ${player}\nDealer hand: ${dealer}\n${result}`);
      }

      if (game === "poker") {
        const hands = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House"];
        const hand = hands[Math.floor(Math.random() * hands.length)];

        return message.reply(`Your poker hand: **${hand}**`);
      }

      return message.reply("Invalid casino game. Use `slots`, `blackjack`, or `poker`.");
    }
  } catch (error) {
    console.error(error);
    return message.reply("Something went wrong. Check Railway logs.");
  }
});

client.login(TOKEN);