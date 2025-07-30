// Load environment variables from .env file
require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ensureDirectoryExists } = require('./utils/fileUtils');
const { checkAllSellers } = require('./utils/seller_tracker');

const Database = require('@replit/database');
const db = new Database();

// Start our keep-alive server to ensure 24/7 uptime
// First try the enhanced keep-alive server, fall back to the original one if needed
try {
  require('./replit-keep-alive');
  console.log('✅ Enhanced keep-alive server started successfully');
} catch (error) {
  console.log('⚠️ Enhanced keep-alive not available, using standard server');
  try {
    require('./keep-alive');
    console.log('✅ Standard keep-alive server started successfully');
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.log('ℹ️ Keep-alive server already running');
    } else {
      console.error('❌ Error starting keep-alive server:', error.message);
    }
  }
}

// Log the environment variable status (redacted for security)
console.log('🔐 Environment Check:');
console.log(`DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? '✅ Set' : '❌ Not set'}`);
console.log(`KEEPA_API_KEY: ${process.env.KEEPA_API_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`LOG_CHANNEL_ID: ${process.env.LOG_CHANNEL_ID ? '✅ Set' : '❌ Not set'}`);
console.log(`CLIENT_ID: ${process.env.CLIENT_ID}`);
console.log(`GUILD_ID: ${process.env.GUILD_ID}`);

// Make sure the secrets from .env file are available, load them from environment if needed
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not set in environment variables');
}

if (!process.env.KEEPA_API_KEY) {
    console.error('❌ KEEPA_API_KEY is not set in environment variables');
}

if (!process.env.LOG_CHANNEL_ID) {
    console.error('❌ LOG_CHANNEL_ID is not set in environment variables');
}

// Ensure data directory exists
ensureDirectoryExists(path.join(__dirname, 'data'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
ensureDirectoryExists(commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`📝 Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ The command at ${filePath} is missing required "data" or "execute" property.`);
    }
}

// Initialize global tracking data
global.latestSellerData = {};

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('🧪 Ready event triggered. Preparing to run Keepa checks...');

    // Initialize global tracking from userData to ensure consistency
    try {
        const { getUserData } = require('./utils/userData');
        const { autoRestoreTrackingData, validateDataIntegrity } = require('./utils/dataRecovery');
        
        // First, attempt automated data recovery
        const restoredCount = autoRestoreTrackingData();
        if (restoredCount > 0) {
            console.log(`🔧 Automatically restored tracking data for ${restoredCount} users`);
        }
        
        // Validate data integrity
        const integrityIssues = validateDataIntegrity();
        
        const allUserData = getUserData();
        
        // Create global copy of latest tracking data
        for (const userId in allUserData) {
            if (allUserData[userId].trackedSellers && Array.isArray(allUserData[userId].trackedSellers)) {
                global.latestSellerData[userId] = {
                    trackedSellers: [...allUserData[userId].trackedSellers]
                };
            }
        }
        
        console.log(`🔄 Initialized global tracking data for ${Object.keys(global.latestSellerData).length} users`);
    } catch (error) {
        console.error('❌ Error initializing global tracking data:', error);
    }
    
    // Check all sellers on startup to ensure full caching
    try {
        console.log('🔍 Running an initial check of all tracked sellers...');
        
        // Check all sellers with forceRefresh=true and checkAllSellers=true
        await checkAllSellers(client, true, true);
        console.log('✅ Initial seller inventory check completed.');
    } catch (error) {
        console.error('❌ Error during initial seller check:', error);
    }

    // 🕒 Run seller check every hour
    const checkInterval = 60 * 60 * 1000; // 1 hour in milliseconds
    console.log(`⏰ Setting up seller check interval: ${checkInterval}ms`);
    
    setInterval(() => {
        console.log('🔁 Running scheduled seller check...');
        try {
            checkAllSellers(client, false, true);
        } catch (error) {
            console.error('❌ Error during scheduled seller check:', error);
        }
    }, checkInterval);
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing command ${interaction.commandName}:`, error);
        
        // Enhanced error handling with timeout protection
        const errorMessage = '⚠️ There was an error executing that command.';
        
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage, ephemeral: true });
            } else {
                // Interaction already replied, send as DM
                const user = await interaction.client.users.fetch(interaction.user.id);
                await user.send(errorMessage);
            }
        } catch (responseError) {
            console.error('❌ Failed to send error response:', responseError);
            // Last resort: try to send DM
            try {
                const user = await interaction.client.users.fetch(interaction.user.id);
                await user.send('Error occurred with command execution. Please check bot logs.');
            } catch (dmError) {
                console.error('❌ Failed to send error DM:', dmError);
            }
        }
    }
});

// Add error handlers for the client
client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

client.on('shardError', error => {
    console.error('❌ Discord websocket error:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Login the bot
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});
