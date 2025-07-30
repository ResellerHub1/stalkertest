// Simple reliable keep-alive server for Replit
const express = require('express');
const app = express();
const PORT = 3000;

// Serve static HTML file
app.get('/', (req, res) => {
  res.send('Bot is online!');
  console.log(`Ping received from ${req.ip} at ${new Date().toISOString()}`);
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Keep-alive server running on port ${PORT}`);
});