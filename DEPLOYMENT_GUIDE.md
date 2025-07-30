# STALKER1 Bot - Deployment Guide

## Current Configuration (SECURED)
This bot is currently running in an optimal configuration. Follow this guide to maintain or redeploy.

## Environment Variables Required
```
DISCORD_TOKEN=your_discord_bot_token
KEEPA_API_KEY=your_keepa_api_key
CLIENT_ID=1372191753083293867
GUILD_ID=1347719666524491826
LOG_CHANNEL_ID=your_admin_channel_id
```

## File Structure (Critical Files)
```
├── index.js                    # Main bot entry point
├── commands/                   # Slash command handlers
│   ├── stalk.js               # Add sellers to track
│   ├── deletestalk.js         # Remove sellers
│   ├── keepaverify.js         # Individual product verification
│   └── [other commands]
├── utils/                     # Core functionality
│   ├── seller_tracker.js     # Main monitoring logic
│   ├── keepa_product_tracker.js # Keepa API integration
│   ├── userData.js            # User data management
│   └── messageUtils.js        # Notification system
├── data/                      # Data storage
│   ├── userData.json          # User configurations
│   ├── cache/                 # Cached product inventory
│   └── [other data files]
└── keep-alive-enhanced.js     # 24/7 uptime system
```

## Startup Sequence
1. **DiscordBot workflow**: Runs `node index.js`
2. **EnhancedKeepAlive workflow**: Runs `node keep-alive-enhanced.js`  
3. **UptimeServer workflow**: Runs `node webserver.js`
4. **WebServer workflow**: Runs `node server.js`

## Key Configuration Settings
- **Monitoring Interval**: 3600000ms (1 hour)
- **Keepa API Usage**: Individual verification only (bulk disabled)
- **Cache Strategy**: File-based JSON storage
- **Notification Method**: Discord DMs + admin channel logging
- **Uptime Strategy**: Multiple redundant keep-alive servers

## Optimal Operating Parameters
- **Sellers Monitored**: 6 active sellers
- **Products Cached**: 98 total products
- **Active Users**: 2 users configured
- **Check Strategy**: Cached inventory comparison
- **Token Management**: Keepa tokens preserved for `/keepaverify`

## To Redeploy Exactly
1. Copy all files from current working directory
2. Set environment variables exactly as configured
3. Start all 4 workflows in order
4. Verify bot responds to `/sellersstalked` command
5. Confirm hourly monitoring begins automatically

## Maintenance Notes
- Keep cache files intact for continuity
- Monitor keep-alive server logs for uptime issues
- Use `/keepaverify` for individual product testing
- Avoid bulk Keepa API operations to preserve tokens

**This configuration has been tested and confirmed working ideally.**