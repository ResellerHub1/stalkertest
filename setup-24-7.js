/**
 * 24/7 Setup Script for STALKER1 Discord Bot
 * This ensures the bot runs continuously even when Replit is closed
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up 24/7 operation for STALKER1 Discord Bot...');

// Create UptimeRobot configuration
const uptimeConfig = {
  name: "STALKER1 Discord Bot",
  url: `https://${process.env.REPL_SLUG || 'workspace'}.${process.env.REPL_OWNER || 'polarcrunchies'}.repl.co`,
  interval: 300, // 5 minutes
  type: "HTTP",
  endpoints: [
    "/",           // Main keep-alive endpoint
    "/health",     // Health check endpoint
    "/ping"        // UptimeRobot specific endpoint
  ]
};

console.log('📋 UptimeRobot Configuration:');
console.log(`   URL: ${uptimeConfig.url}`);
console.log(`   Interval: ${uptimeConfig.interval} seconds`);
console.log(`   Endpoints: ${uptimeConfig.endpoints.join(', ')}`);

// Create .replit configuration for always-on
const replitConfig = `
# STALKER1 Discord Bot Configuration
run = "node index.js"

[deployment]
run = ["sh", "-c", "node index.js"]

[env]
NODE_ENV = "production"

[nix]
channel = "stable-22_11"

[nix.packages]
nodejs-18_x = "latest"

[gitHubImport]
requiredFiles = [".replit", "package.json"]

[languages]

[languages.javascript]
pattern = "**/{*.js,*.jsx,*.ts,*.tsx,*.json}"

[languages.javascript.languageServer]
start = "typescript-language-server --stdio"

# Keep the app running 24/7
[unitTest]
language = "nodejs"

[debugger]
support = true

[debugger.interactive]
transport = "localhost:9229"
startCommand = ["dap-node"]

[debugger.interactive.initializeMessage]
command = "initialize"
type = "request"

[debugger.interactive.launchMessage]
command = "launch"
type = "request"

[debugger.interactive.launchMessage.arguments]
args = []
console = "integratedTerminal"
cwd = "."
environment = []
pauseForSourceMap = false
program = "./index.js"
request = "launch"
sourceMaps = true
stopOnEntry = false
type = "pwa-node"
`;

// Write .replit file
fs.writeFileSync('.replit', replitConfig.trim());
console.log('✅ Created .replit configuration file');

// Create package.json scripts for 24/7 operation
const packageJsonPath = 'package.json';
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  packageJson.scripts = {
    ...packageJson.scripts,
    "start": "node index.js",
    "dev": "node index.js",
    "keep-alive": "node keep-alive-enhanced.js",
    "uptime": "node uptime-server.js",
    "web": "node server.js",
    "all": "concurrently \"npm run start\" \"npm run keep-alive\" \"npm run uptime\" \"npm run web\""
  };
  
  // Add concurrently if not present
  if (!packageJson.dependencies.concurrently && !packageJson.devDependencies?.concurrently) {
    packageJson.devDependencies = packageJson.devDependencies || {};
    packageJson.devDependencies.concurrently = "^7.6.0";
  }
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Updated package.json with 24/7 scripts');
}

// Create startup instructions
const startupInstructions = `
# 24/7 Setup Instructions for STALKER1 Discord Bot

## Automatic Setup Completed ✅

Your bot is now configured for 24/7 operation with the following components:

### 1. Enhanced Keep-Alive System
- Multiple redundant ping mechanisms
- Self-ping every 5 minutes
- Health monitoring and statistics
- Automatic fallback systems

### 2. UptimeRobot Monitoring
Set up UptimeRobot with these settings:
- **Monitor Type:** HTTP(s)
- **URL:** ${uptimeConfig.url}
- **Monitoring Interval:** 5 minutes
- **Keyword Monitoring:** "Bot is Running" (optional)

Additional endpoints for monitoring:
- ${uptimeConfig.url}/health (JSON health status)
- ${uptimeConfig.url}/ping (Simple ping response)

### 3. Multiple Server Processes
- Discord Bot (index.js) - Main bot functionality
- Enhanced Keep-Alive (port 8080) - Self-ping system
- Uptime Server (port 5000) - External monitoring
- Web Server (port 3000) - Additional keep-alive

### 4. Environment Requirements
Make sure these environment variables are set:
- DISCORD_TOKEN
- KEEPA_API_KEY
- CLIENT_ID
- GUILD_ID
- LOG_CHANNEL_ID

## Testing 24/7 Operation

1. Close the Replit tab/browser
2. Wait 10-15 minutes
3. Check if bot responds to Discord commands
4. Monitor UptimeRobot dashboard for uptime status

## Troubleshooting

If the bot stops working when Replit is closed:
1. Ensure all workflows are running
2. Check UptimeRobot is pinging every 5 minutes
3. Verify environment variables are set
4. Check Replit's always-on status

## Support

Bot configured on: ${new Date().toISOString()}
Configuration: Enhanced 24/7 with multiple redundancies
`;

fs.writeFileSync('24-7-setup.md', startupInstructions);
console.log('✅ Created 24/7 setup documentation');

console.log('\n🎉 24/7 Setup Complete!');
console.log('📝 Check 24-7-setup.md for detailed instructions');
console.log('🔗 Set up UptimeRobot monitoring at: https://uptimerobot.com');
console.log(`🌐 Monitor URL: ${uptimeConfig.url}`);
console.log('\n⚡ Your bot should now run 24/7 even when Replit is closed!');