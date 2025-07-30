// Simple web server for UptimeRobot
const express = require('express');
const app = express();
const PORT = 5000;

// Serve a simple webpage
app.get('/', (req, res) => {
  console.log(`Ping received at ${new Date().toISOString()} from ${req.ip}`);
  res.send('STALKER1 Bot is online!');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web server running on port ${PORT}`);
});