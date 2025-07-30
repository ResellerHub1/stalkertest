/**
 * Enhanced Keep-Alive System for Discord Bot
 * This creates multiple redundant keep-alive mechanisms for 24/7 operation
 */

const express = require('express');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 8080;

// Track uptime and ping statistics
let startTime = new Date();
let lastPingTime = null;
let pingCount = 0;
let failedPings = 0;

// Enable trust proxy for proper IP detection
app.set('trust proxy', true);

// Simple health check endpoint
app.get('/', (req, res) => {
  const uptimeMs = Date.now() - startTime.getTime();
  const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>STALKER1 Bot - Enhanced Keep-Alive</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; background: #f0f0f0; margin: 0; padding: 20px; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #333; }
          .status { color: green; font-weight: bold; font-size: 24px; margin: 20px 0; }
          .stats { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px auto; max-width: 600px; }
          .stat-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .error { color: red; }
          .success { color: green; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 STALKER1 Discord Bot</h1>
          <div class="status">✅ Enhanced Keep-Alive Active</div>
          <div class="stats">
            <div class="stat-row"><span><strong>Uptime:</strong></span><span>${uptimeHours} hours</span></div>
            <div class="stat-row"><span><strong>Total Pings:</strong></span><span class="success">${pingCount}</span></div>
            <div class="stat-row"><span><strong>Failed Pings:</strong></span><span class="error">${failedPings}</span></div>
            <div class="stat-row"><span><strong>Success Rate:</strong></span><span>${pingCount > 0 ? Math.round(((pingCount - failedPings) / pingCount) * 100) : 0}%</span></div>
            <div class="stat-row"><span><strong>Last Ping:</strong></span><span>${lastPingTime ? lastPingTime.toLocaleString() : 'None yet'}</span></div>
          </div>
          <p>🔄 Self-pinging every 5 minutes for 24/7 operation</p>
          <p>📡 Multiple redundant ping methods active</p>
          <p>🚀 Optimized for Replit hosting</p>
        </div>
      </body>
    </html>
  `);
  
  // Log ping from external sources
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  console.log(`📡 Keep-alive ping received from ${clientIP} at ${new Date().toISOString()}`);
  lastPingTime = new Date();
  pingCount++;
});

// Health check endpoint for monitoring services
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Date.now() - startTime.getTime(),
    timestamp: new Date().toISOString(),
    pings: pingCount,
    failures: failedPings
  });
});

// Ping endpoint specifically for UptimeRobot
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
  console.log(`🔔 UptimeRobot ping received at ${new Date().toISOString()}`);
});

// Multiple self-ping strategies
function performSelfPing() {
  console.log(`🔄 Enhanced self-ping at ${new Date().toISOString()}`);
  
  // Strategy 1: Local ping to own server
  pingLocal();
  
  // Strategy 2: External ping (delayed to avoid conflicts)
  setTimeout(pingExternal, 2000);
  
  // Strategy 3: Fallback ping (further delayed)
  setTimeout(pingFallback, 5000);
}

function pingLocal() {
  const localReq = http.get('http://localhost:8080/health', (res) => {
    console.log(`✅ Local ping successful (${res.statusCode})`);
    lastPingTime = new Date();
    pingCount++;
  });
  
  localReq.on('error', (err) => {
    console.log(`⚠️ Local ping failed: ${err.message}`);
    failedPings++;
  });
  
  localReq.setTimeout(10000, () => {
    localReq.destroy();
    console.log(`⚠️ Local ping timeout`);
    failedPings++;
  });
}

function pingExternal() {
  // Get Replit URL from environment or construct it
  let replicURL;
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    replicURL = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  } else {
    // Fallback URL
    replicURL = 'https://workspace.polarcrunchies.repl.co';
  }
  
  const extReq = https.get(replicURL, (res) => {
    console.log(`✅ External ping successful (${res.statusCode})`);
    lastPingTime = new Date();
    pingCount++;
  });
  
  extReq.on('error', (err) => {
    console.log(`⚠️ External ping failed: ${err.message}`);
    failedPings++;
  });
  
  extReq.setTimeout(15000, () => {
    extReq.destroy();
    console.log(`⚠️ External ping timeout`);
    failedPings++;
  });
}

function pingFallback() {
  // Ping the web server on port 3000 as fallback
  const fallbackReq = http.get('http://localhost:3000', (res) => {
    console.log(`✅ Fallback ping successful (${res.statusCode})`);
    lastPingTime = new Date();
    pingCount++;
  });
  
  fallbackReq.on('error', (err) => {
    console.log(`⚠️ Fallback ping failed: ${err.message}`);
    failedPings++;
  });
  
  fallbackReq.setTimeout(10000, () => {
    fallbackReq.destroy();
    console.log(`⚠️ Fallback ping timeout`);
    failedPings++;
  });
}

// Start the enhanced keep-alive server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Enhanced Keep-Alive server running on port ${PORT}`);
  console.log(`🌐 Access URL: https://${process.env.REPL_SLUG || 'workspace'}.${process.env.REPL_OWNER || 'polarcrunchies'}.repl.co`);
  
  // Set up multiple ping intervals
  setInterval(performSelfPing, 5 * 60 * 1000); // Every 5 minutes
  setInterval(performSelfPing, 10 * 60 * 1000); // Every 10 minutes (backup)
  
  // Initial ping after startup
  setTimeout(performSelfPing, 15000);
  
  console.log(`⏰ Self-ping intervals configured for 24/7 operation`);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('🛑 Enhanced Keep-Alive server shutting down...');
  server.close(() => {
    console.log('✅ Enhanced Keep-Alive server closed');
    process.exit(0);
  });
});

module.exports = app;