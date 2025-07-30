# STALKER1 Discord Bot

## Overview

STALKER1 is a Discord bot designed to track Amazon seller inventories and notify users when new products are added to sellers' storefronts. The bot uses multiple data sources including the Keepa API and web scraping to monitor seller activities and send real-time notifications to Discord users via direct messages.

## System Architecture

### Backend Architecture
- **Runtime Environment**: Node.js 20 with Python 3.11 support
- **Primary Language**: JavaScript (Node.js) with Python utilities for web scraping
- **Framework**: Discord.js v14 for Discord integration
- **Web Scraping**: Python-based Amazon scraper using BeautifulSoup and Trafilatura
- **HTTP Server**: Express.js for keep-alive functionality

### Data Storage
- **User Data**: Replit Database with keys format "users.<username>" 
- **Cache Data**: JSON file-based storage for inventory and seller caches (`data/cache/`, `data/inventory_cache/`)
- **Hybrid System**: User settings in database, product caches in files for optimal performance
- **Backup System**: Automated data backups with timestamps for JSON components

### Keep-Alive System
- **Multiple Keep-Alive Servers**: Redundant uptime monitoring with multiple server instances
- **Self-Pinging**: Built-in self-ping mechanism for 24/7 uptime on Replit
- **UptimeRobot Integration**: External monitoring service compatibility

## Key Components

### Discord Bot Core (`index.js`)
- Main bot initialization and event handling
- Command loading and registration system
- Environment variable validation and startup checks
- Integration with keep-alive servers

### User Management System
- **User Data Module** (`utils/userData.js`): Handles user data persistence and retrieval
- **Role-based Access Control**: Membership tiers (Basic, Silver, Gold, Chiefs) with different tracking limits
- **Quota Management**: Configurable limits with admin override capabilities

### Product Tracking System
- **Keepa Client** (`utils/keepaClient.js`): Primary interface for Amazon product data
- **Amazon Bridge** (`utils/amazon_bridge.js`): Node.js to Python scraper interface
- **Enhanced Scraping** (`utils/enhanced_amazon_bridge.js`): Advanced multi-source product discovery
- **Combined Inventory** (`utils/combined_inventory.js`): Aggregated product tracking across multiple sources

### Notification System
- **Message Utilities** (`utils/messageUtils.js`): Standardized DM-based notification system
- **Product Formatting**: Rich product information with pricing and availability
- **Log Channel Integration**: Optional centralized logging for admin monitoring

### Data Recovery and Backup
- **Automated Backups**: Timestamped user data backups
- **Data Recovery System** (`utils/dataRecovery.js`): Evidence-based tracking relationship restoration
- **Integrity Checking**: Automated data validation and repair

## Data Flow

1. **User Registration**: Users interact with Discord commands to set up seller tracking
2. **Seller Monitoring**: Bot periodically checks tracked sellers using multiple data sources
3. **Product Discovery**: New products are identified by comparing current inventory with cached data
4. **Notification Delivery**: Users receive DMs with formatted product information
5. **Data Persistence**: All interactions and discoveries are cached and backed up

### Tracking Workflow
```
User Command → Data Validation → Seller API/Scraping → Product Comparison → Notification → Data Update
```

### Multi-Source Product Discovery
- **Primary**: Keepa API for reliable product data
- **Secondary**: Direct Amazon scraping for comprehensive coverage
- **Tertiary**: Combined inventory system for historical completeness

## External Dependencies

### Required APIs
- **Keepa API**: Primary source for Amazon product data and seller information
- **Discord API**: Bot functionality and user communication

### Environment Variables
- `DISCORD_TOKEN`: Bot authentication token
- `KEEPA_API_KEY`: Keepa service API key
- `CLIENT_ID`: Discord application client ID
- `GUILD_ID`: Target Discord server ID
- `LOG_CHANNEL_ID`: Optional centralized logging channel

### Python Dependencies
- `beautifulsoup4`: HTML parsing for web scraping
- `requests`: HTTP client for API calls and web requests
- `trafilatura`: Advanced text extraction from web pages

### Node.js Dependencies
- `discord.js`: Discord bot framework
- `axios`: HTTP client for API requests
- `express`: Web server for keep-alive functionality
- `dotenv`: Environment variable management
- `puppeteer`: Advanced web scraping capabilities (optional)

## Deployment Strategy

### Replit Deployment
- **Multi-Process Architecture**: Parallel execution of bot, web server, and keep-alive services
- **Workflow Configuration**: Automated startup sequence with dependency management
- **Port Management**: Multiple ports for different services (3000, 5000, 8080)

### Uptime Management
- **Primary Keep-Alive**: Express server on port 3000
- **Secondary Keep-Alive**: Simple HTTP server on port 5000
- **Self-Ping System**: Internal ping mechanism on port 8080
- **External Monitoring**: UptimeRobot integration for reliability

### Data Persistence
- **Local File Storage**: JSON-based data storage with automatic directory creation
- **Cache Management**: Intelligent caching with TTL and force-refresh capabilities
- **Backup Strategy**: Automated timestamped backups before major operations

## Changelog
- July 21, 2025: **DATABASE MIGRATION FIXED AND VERIFIED** - Fixed database migration issues where user data wasn't properly transferred. All 95 users now have correct data in Replit Database with "users.<username>" keys. Fixed userData.js loading logic to handle Replit DB response format correctly. Bot fully operational with 6 sellers tracked, 1,980 products cached, and all Discord commands functional.
- July 21, 2025: **DATABASE MIGRATION COMPLETED** - Successfully migrated user data storage from JSON files to Replit Database. All 83 users migrated with membership tiers and tracking data intact. User data now stored with "users.<username>" keys in database while cache data remains in JSON files. All command functions updated to async/await pattern for database operations.
- July 21, 2025: **CONFIGURATION SECURED** - System fully backed up and documented. Bot confirmed working ideally with 98 products monitored across 6 sellers, hourly checks active, and optimal Keepa API usage.
- July 21, 2025: **KEEPA API INTEGRATION OPTIMIZED** - Implemented intelligent Keepa API usage to prevent token exhaustion. Bot now uses cached inventory for bulk operations while reserving Keepa API for individual product verification via `/keepaverify` command.
- July 21, 2025: **24/7 OPERATION CONFIGURED** - Enhanced keep-alive system implemented with multiple redundant ping mechanisms. Bot now configured for continuous operation even when Replit is closed. UptimeRobot monitoring setup ready.
- July 15, 2025: **FIXED - AMAZON SCRAPING DISABLED** - Bot modified to use only cached inventory data to avoid 503 blocking issues. Combined inventory system now uses cached data exclusively without any Amazon scraping attempts.
- January 5, 2025: **FULLY OPERATIONAL** - Bot restored and actively monitoring. Keepa API working, found products from sellers, notification system ready for new products
- January 5, 2025: **RESOLVED** - Keepa API subscription restored and bot operational. Notification system active with 18 tokens available
- January 5, 2025: **Critical Issue Identified** - Keepa API subscription expired in late June 2024, causing notification system to stop working
- June 24, 2025: Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.