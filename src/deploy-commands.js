const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('votemute')
    .setDescription('Start a vote to mute a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to vote mute')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('vm')
    .setDescription('Vote mute settings')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View current vote mute settings'),
    )
    .addSubcommand(sub =>
      sub.setName('configure')
        .setDescription('Configure vote mute settings (Admin only)'),
    )
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Setup guide and compatibility checks'),
    )
    .addSubcommand(sub =>
      sub.setName('theme')
        .setDescription('Change the bot theme (Law & Order, Pirate, WWE, etc.)'),
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Commands registered successfully!');
  } catch (error) {
    console.error(error);
  }
})();
