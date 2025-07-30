/**
 * Keep-alive server for Discord bot
 * This creates a simple HTTP server that can be pinged to keep the bot running
 */

const http = require('http');
const PORT = 5000; // Always use port 5000 on Replit

// Prevent duplicate server instances
let server;

function startServer() {
  // Check if a server is already running on this port
  const testServer = http.createServer();
  
  testServer.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`ℹ️ Port ${PORT} is already in use, keep-alive server already running`);
    } else {
      console.error(`❌ Error checking port: ${err.message}`);
    }
    testServer.close();
  });
  
  testServer.once('listening', () => {
    // If we get here, port is available
    testServer.close(() => {
      // Create the actual server
      server = http.createServer((req, res) => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        
        // Current uptime in hours
        const uptime = process.uptime() / 3600;
        
        // Log ping for debugging
        console.log(`📡 Keep-alive server pinged at ${new Date().toISOString()} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
        
        res.end(`Discord Bot is alive and well!\nUptime: ${uptime.toFixed(2)} hours`);
      });
      
      // Start the server
      server.listen(PORT, () => {
        console.log(`🌐 Keep-alive server running on port ${PORT}`);
        console.log(`📝 Set up a service like UptimeRobot to ping this URL every 5 minutes`);
      });
    });
  });
  
  // Test if port is available
  testServer.listen(PORT);
}

startServer();

module.exports = { startServer };