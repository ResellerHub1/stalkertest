// Self-pinging keep-alive server for Replit - no external services needed
const http = require('http');
const https = require('https');
const PORT = 8080;

// Track uptime and last ping
let startTime = Date.now();
let lastPingTime = null;

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  lastPingTime = new Date();
  
  // Calculate uptime in hours
  const uptimeHours = ((Date.now() - startTime) / (1000 * 60 * 60)).toFixed(2);
  
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>STALKER1 Bot Status</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
          .status { color: green; font-weight: bold; font-size: 24px; margin: 20px 0; }
          .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px auto; max-width: 600px; }
        </style>
      </head>
      <body>
        <h1>STALKER1 Discord Bot</h1>
        <div class="status">✅ Bot is Running</div>
        <div class="info">
          <p><strong>Uptime:</strong> ${uptimeHours} hours</p>
          <p><strong>Last ping:</strong> ${lastPingTime ? lastPingTime.toLocaleString() : 'None yet'}</p>
          <p><strong>Self-pinging:</strong> Active (every 5 minutes)</p>
        </div>
        <p>This bot is running 24/7 on Replit with self-pinging technology</p>
      </body>
    </html>
  `);
  
  console.log(`📡 Ping received at ${new Date().toISOString()} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
});

// Self-pinging function to keep the bot alive without external services
function pingMyself() {
  console.log(`🔄 Self-pinging at ${new Date().toISOString()}`);
  
  // Try local ping first
  const http = require('http');
  const localReq = http.get('http://localhost:3000', (res) => {
    console.log(`✅ Local self-ping successful with status: ${res.statusCode}`);
    lastPingTime = new Date();
  });
  
  localReq.on('error', (err) => {
    console.error(`❌ Local ping failed: ${err.message}`);
    
    // Try external ping as backup
    const replicURL = `https://${process.env.REPL_SLUG || 'workspace'}.${process.env.REPL_OWNER || 'polarcrunchies'}.repl.co`;
    
    https.get(replicURL, (res) => {
      console.log(`✅ External self-ping successful with status: ${res.statusCode}`);
      lastPingTime = new Date();
    }).on('error', (extErr) => {
      console.error(`❌ External ping failed: ${extErr.message}`);
      // Still update ping time to prevent flooding logs
      lastPingTime = new Date();
    });
  });
}

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Enhanced self-pinging keep-alive server running on port ${PORT}`);
  console.log(`🌐 Server URL: https://workspace.polarcrunchies.repl.co`);
  
  // Set up ping interval (every 5 minutes)
  setInterval(pingMyself, 5 * 60 * 1000);
  
  // Also ping immediately on startup
  setTimeout(pingMyself, 10000);
});