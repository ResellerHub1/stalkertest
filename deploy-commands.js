require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ensureDirectoryExists } = require('./utils/fileUtils');

// Ensure commands directory exists
const commandsPath = path.join(__dirname, 'commands');
ensureDirectoryExists(commandsPath);

const commands = [];
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`📝 Loading ${commandFiles.length} command(s) from ${commandsPath}`);

for (const file of commandFiles) {
    try {
        const command = require(`./commands/${file}`);
        if ('data' in command && typeof command.data.toJSON === 'function') {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️ The command at ${file} is missing a required "data" property or toJSON method.`);
        }
    } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
    }
}

// Check if token is set
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Missing DISCORD_TOKEN in .env file');
    process.exit(1);
}

// Retrieve client ID from environment or prompt user
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Check if IDs are available
if (!clientId) {
    console.error('❌ CLIENT_ID is not set in .env file');
    process.exit(1);
}

if (!guildId) {
    console.error('❌ GUILD_ID is not set in .env file');
    process.exit(1);
}

console.log(`📝 Using CLIENT_ID: ${clientId}`);
console.log(`📝 Using GUILD_ID: ${guildId}`);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔁 Refreshing application (/) commands...');

        try {
            // First try to register commands for the guild
            console.log(`🔄 Registering commands for guild ID: ${guildId}...`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`✅ Slash commands registered for guild ID: ${guildId}`);
        } catch (guildError) {
            console.warn(`⚠️ Failed to register commands for guild. Error: ${guildError.message}`);
            console.log('🌐 Attempting to register commands globally...');
            
            try {
                // If guild registration fails, try global registration
                await rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commands }
                );
                console.log('✅ Slash commands registered globally.');
            } catch (globalError) {
                console.error('❌ Failed to register commands globally:', globalError);
                throw globalError;
            }
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
