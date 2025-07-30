// Simple Express server for UptimeRobot
const express = require('express');
const app = express();
const PORT = 3000;

// Serve static HTML file
app.use(express.static('./'));

// Endpoint for UptimeRobot to ping
app.get('/ping', (req, res) => {
  console.log(`Ping received at ${new Date().toISOString()} from ${req.ip}`);
  res.send('OK');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ Web server running on port ${PORT}`);
  console.log(`📌 Access URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
});