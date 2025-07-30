/**
 * Simple uptime server for Discord bot
 * Designed specifically to work with UptimeRobot on Replit
 */

const express = require('express');
const app = express();
const PORT = 5000; // Replit standard port

// Add a simple landing page that confirms the bot is running
app.get('/', (req, res) => {
  const uptime = process.uptime() / 3600; // uptime in hours
  console.log(`🔔 Ping received from ${req.ip} at ${new Date().toISOString()}`);
  
  // Send a simple HTML page that shows the bot is running
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>STALKER1 Bot Status</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
          .status { color: green; font-weight: bold; }
          .uptime { margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>STALKER1 Bot Status</h1>
        <div class="status">✅ Bot is running</div>
        <div class="uptime">Uptime: ${uptime.toFixed(2)} hours</div>
      </body>
    </html>
  `);
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Uptime server running on port ${PORT}`);
  console.log(`📡 Monitor URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
});

module.exports = server;