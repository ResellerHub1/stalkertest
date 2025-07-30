/**
 * Enhanced seller tracking system for Discord bot
 * This module ensures all sellers from all users are properly checked
 * with persistent timestamps to prevent duplicate processing
 */

const fs = require('fs');
const path = require('path');
const { getUserData, saveUserData } = require('./userData');
const { getSellerProductsWithKeepa } = require('./keepa_product_tracker');
const { formatProductNotification } = require('./messageUtils');

// Path for storing last check timestamps
const lastSellerCheckPath = path.join(__dirname, '../data/seller_check_timestamps.json');

// In-memory cache of last check timestamps
let lastSellerCheck = {};

/**
 * Load cached products for a seller from the combined cache
 * @param {string} sellerId - Amazon seller ID
 * @returns {Array} - Array of cached products
 */
function loadCachedProducts(sellerId) {
    // Try different cache locations
    const cachePaths = [
        path.join(__dirname, '../data/cache', `${sellerId}_co.uk.json`),
        path.join(__dirname, '../data/inventory_cache', `${sellerId}_combined.json`)
    ];
    
    for (const cachePath of cachePaths) {
        if (fs.existsSync(cachePath)) {
            try {
                const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                
                // Handle different cache formats
                let products = [];
                if (Array.isArray(cacheData)) {
                    products = cacheData;
                } else if (cacheData.products) {
                    // Handle object format with products property
                    products = Object.values(cacheData.products);
                } else if (cacheData.data && Array.isArray(cacheData.data)) {
                    products = cacheData.data;
                }
                
                console.log(`📂 Loaded ${products.length} cached products for seller ${sellerId} from ${path.basename(cachePath)}`);
                return products;
            } catch (error) {
                console.log(`⚠️ Error reading cache ${cachePath}: ${error.message}`);
                continue;
            }
        }
    }
    
    console.log(`📭 No cached products found for seller ${sellerId}`);
    return [];
}

// Load timestamps if file exists
try {
    if (fs.existsSync(lastSellerCheckPath)) {
        lastSellerCheck = JSON.parse(fs.readFileSync(lastSellerCheckPath, 'utf8'));
        console.log(`📂 Loaded last seller check timestamps for ${Object.keys(lastSellerCheck).length} sellers`);
    }
} catch (err) {
    console.error(`❌ Error loading seller check timestamps: ${err.message}`);
    lastSellerCheck = {};
}

/**
 * Process a single seller for all users who track it
 * @param {Object} client - Discord client for sending DMs 
 * @param {string} sellerId - Amazon seller ID to check
 * @param {Object} sellerToUsers - Mapping of users who track this seller
 * @param {boolean} forceRefresh - Whether to force refresh the cache
 * @param {Object} results - Results object to update
 * @returns {Promise<boolean>} - Success status
 */
async function processSingleSeller(client, sellerId, sellerToUsers, forceRefresh, results) {
    try {
        // Double-check that this is a valid seller ID in our system
        if (!sellerToUsers[sellerId] || !Array.isArray(sellerToUsers[sellerId]) || sellerToUsers[sellerId].length === 0) {
            console.log(`⚠️ Skipping seller ${sellerId} - not tracked by any users in our system`);
            return false;
        }

        console.log(`🔍 Processing seller ${sellerId} (tracked by ${sellerToUsers[sellerId]?.length || 0} users)`);
        
        // Load cached products from our cache system
        console.log(`🔄 Loading cached products for seller ${sellerId}...`);
        const products = loadCachedProducts(sellerId);
        
        console.log(`✅ Using ${products.length} cached products (Keepa API reserved for individual product verification)`);
        
        // Note: Keepa API verification is available but disabled for bulk operations to preserve tokens
        // Individual products will be verified with Keepa when users specifically request them
        
        // Save check results for reporting
        if (!results.checkedSellers[sellerId]) {
            results.checkedSellers[sellerId] = {
                name: products[0]?.seller_name || 'Unknown',
                totalProducts: products.length,
                newProducts: 0
            };
        }
        
        console.log(`✅ Found ${products.length} products for seller ${sellerId}`);
        
        // Process each user who tracks this seller
        for (const userId of sellerToUsers[sellerId] || []) {
            const userRecord = getUserData(userId);
            
            // Validate this user is tracking this seller in userData
            if (!userRecord || !userRecord.trackedSellers || !userRecord.trackedSellers.includes(sellerId)) {
                console.log(`⚠️ User ${userId} is not officially tracking seller ${sellerId} in userData - skipping`);
                continue;
            }
            
            // Initialize seen ASINs array if it doesn't exist
            if (!userRecord.seenASINs[sellerId]) {
                userRecord.seenASINs[sellerId] = [];
            }
            
            // Check if this is a first-time check for this seller (empty seenASINs array)
            const isFirstCheck = userRecord.seenASINs[sellerId].length === 0;
            
            if (isFirstCheck) {
                console.log(`🔄 First-time check for seller ${sellerId} (user ${userId}) - caching all products without notifications`);
                
                // Add all products to seenASINs without sending notifications
                let newCount = 0;
                products.forEach(product => {
                    if (product?.asin && !userRecord.seenASINs[sellerId].includes(product.asin)) {
                        userRecord.seenASINs[sellerId].push(product.asin);
                        newCount++;
                    }
                });
                
                // Save the updated data
                if (newCount > 0) {
                    saveUserData();
                    console.log(`✅ Silently cached ${newCount} products for seller ${sellerId} (first-time check for user ${userId})`);
                }
                
                continue;
            }
            
            // For subsequent checks, only process if we have a valid user to notify
            const user = await client.users.fetch(userId).catch((error) => {
                console.log(`⚠️ Failed to fetch user ${userId}:`, error.message);
                return null;
            });
            if (!user) {
                console.log(`⚠️ Could not fetch user ${userId} for notifications - user may have left Discord or blocked the bot`);
                continue;
            }
            
            console.log(`✅ Successfully fetched user ${user.tag} (${userId}) for notifications`);
            
            // Filter out products the user has already seen
            const newProducts = products.filter(product => 
                product?.asin && !userRecord.seenASINs[sellerId].includes(product.asin)
            );
            
            // Update check results
            results.newProductsFound += newProducts.length;
            results.checkedSellers[sellerId].newProducts += newProducts.length;
            
            // Process each new product
            for (const product of newProducts) {
                // Add to seen ASINs to avoid future notifications
                if (product.asin) {
                    userRecord.seenASINs[sellerId].push(product.asin);
                }
                
                // Create and send notification using our enhanced system
                try {
                    const { sendProductNotification } = require('./messageUtils');
                    
                    // Use the enhanced notification system that handles both DM and channel notifications
                    await sendProductNotification(user, product, sellerId);
                } catch (notificationError) {
                    console.error(`⚠️ Error sending notification to user ${userId}:`, notificationError.message);
                    console.error(notificationError);
                }
            }
            
            // Save updated seenASINs if any new products were found
            if (newProducts.length > 0) {
                saveUserData();
                console.log(`✅ Added ${newProducts.length} new products to seenASINs for user ${userId} and seller ${sellerId}`);
            }
        }
        
        return true;
    } catch (error) {
        console.error(`❌ Error processing seller ${sellerId}:`, error.message);
        return false;
    }
}

/**
 * Check all sellers tracked by all users
 * @param {Object} client - Discord client
 * @param {boolean} forceRefresh - Whether to force refresh the cache
 * @param {boolean} checkAllSellers - Whether to check all sellers regardless of time since last check
 */
async function checkAllSellers(client, forceRefresh = false, checkAllSellers = true) {
    try {
        console.log(`📋 Check parameters: forceRefresh=${forceRefresh}, checkAllSellers=${checkAllSellers}`);
        
        // First, discover all Discord server members to ensure we have everyone
        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const members = await guild.members.fetch();
            
            console.log(`🔍 Discovered ${members.size} total members in Discord server`);
            
            let newMembersFound = 0;
            
            // Check each Discord member and ensure they're in our system
            for (const [userId, member] of members) {
                if (!member.user.bot) { // Skip bots
                    const currentUserData = getUserData();
                    if (!currentUserData[userId]) {
                        console.log(`➕ Found new member not in tracking system: ${member.user.tag} (${userId})`);
                        
                        // Only add them if they're truly new - don't overwrite existing data
                        getUserData(userId, member);
                        newMembersFound++;
                    } else {
                        // CRITICAL: Only update role, never overwrite tracking data
                        const existingData = currentUserData[userId];
                        
                        // Preserve existing tracking data while updating role
                        if (member && member.roles && member.roles.cache) {
                            const roles = member.roles.cache;
                            let newMembership = 'Basic';
                            
                            if (roles.some(role => role.name === 'Chiefs')) {
                                newMembership = 'Chiefs';
                            } else if (roles.some(role => role.name === 'Gold')) {
                                newMembership = 'Gold';
                            } else if (roles.some(role => role.name === 'Silver')) {
                                newMembership = 'Silver';
                            }
                            
                            // Only update membership, preserve everything else
                            if (existingData.membership !== newMembership) {
                                existingData.membership = newMembership;
                                console.log(`🔄 Updated membership for ${member.user.tag} to ${newMembership}`);
                            }
                        }
                    }
                }
            }
            
            if (newMembersFound > 0) {
                console.log(`✅ Added ${newMembersFound} new members to tracking system`);
                saveUserData();
            }
        } catch (memberError) {
            console.error(`⚠️ Error discovering server members:`, memberError.message);
        }
        
        // Initialize global tracking data if needed
        if (typeof global.latestSellerData === 'undefined') {
            global.latestSellerData = {};
        }
        
        // Gather all unique sellers in the system
        const allSellers = new Set();
        const userData = getUserData();
        
        // Build seller list from all users
        for (const userId in userData) {
            // Initialize global tracking for this user if needed
            if (!global.latestSellerData[userId]) {
                global.latestSellerData[userId] = { trackedSellers: [] };
            }
            
            // Make sure the user has a trackedSellers array
            if (!userData[userId].trackedSellers) {
                userData[userId].trackedSellers = [];
                saveUserData();
            }
            
            // Update global tracking with latest from userData
            if (userData[userId].trackedSellers && Array.isArray(userData[userId].trackedSellers)) {
                global.latestSellerData[userId].trackedSellers = [...userData[userId].trackedSellers];
            }
            
            console.log(`👥 User ${userId} has ${userData[userId].trackedSellers?.length || 0} sellers`);
            if (userData[userId].trackedSellers && Array.isArray(userData[userId].trackedSellers)) {
                userData[userId].trackedSellers.forEach(sellerId => {
                    allSellers.add(sellerId);
                    console.log(`➕ Added seller ${sellerId} from user ${userId}`);
                });
            }
        }
        
        // For debug output, log all sellers found
        const sellerArray = Array.from(allSellers);
        console.log(`🔍 Found ${allSellers.size} unique sellers to check: ${sellerArray.join(', ')}`);
        
        // Initialize results tracking
        const results = {
            userCount: Object.keys(userData).length,
            sellerCount: sellerArray.length,
            newProductsFound: 0,
            checkedSellers: {},
            skippedSellers: {}
        };
        
        // Build a mapping of seller IDs to users who track them
        const sellerToUsers = {};
        for (const userId in userData) {
            if (userData[userId].trackedSellers && userData[userId].trackedSellers.length > 0) {
                for (const sellerId of userData[userId].trackedSellers) {
                    if (!sellerToUsers[sellerId]) {
                        sellerToUsers[sellerId] = [];
                    }
                    sellerToUsers[sellerId].push(userId);
                }
            }
        }
        
        // Process each seller in sequence
        console.log(`🔄 Checking all sellers in the system (${sellerArray.length} total)`);
        console.log(`⏳ Starting to process ${sellerArray.length} sellers one by one`);
        
        const now = Date.now();
        const hourMs = 60 * 60 * 1000; // Milliseconds in an hour
        
        for (let sellerIndex = 0; sellerIndex < sellerArray.length; sellerIndex++) {
            const sellerId = sellerArray[sellerIndex];
            
            // Skip sellers that were checked recently unless forced
            const lastCheck = lastSellerCheck[sellerId] || 0;
            const timeSinceLastCheck = now - lastCheck;
            
            if (!forceRefresh && !checkAllSellers && timeSinceLastCheck < hourMs) {
                const minutesAgo = Math.floor(timeSinceLastCheck / (60 * 1000));
                console.log(`⏭️ Skipping seller ${sellerId} - checked ${minutesAgo} minutes ago, less than 1 hour`);
                
                results.skippedSellers[sellerId] = {
                    reason: `Checked ${minutesAgo} minutes ago`,
                    lastCheck: new Date(lastCheck).toISOString()
                };
                
                continue;
            }
            
            // Mark this seller as checked now
            lastSellerCheck[sellerId] = now;
            
            // Save timestamp immediately to avoid duplicate processing if system crashes
            try {
                fs.writeFileSync(lastSellerCheckPath, JSON.stringify(lastSellerCheck, null, 2));
            } catch (saveError) {
                console.error(`❌ Failed to save seller check timestamp: ${saveError.message}`);
            }
            
            // Process this seller
            console.log(`🔍 Checking seller ${sellerId} (${sellerIndex + 1}/${sellerArray.length}) (tracked by ${sellerToUsers[sellerId]?.length || 0} users)`);
            await processSingleSeller(client, sellerId, sellerToUsers, forceRefresh, results);
            
            // Add a delay between seller checks to avoid overwhelming rate limits
            // Only add delay if this isn't the last seller
            if (sellerIndex < sellerArray.length - 1) {
                console.log(`⏱️ Adding small delay before checking next seller...`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
            }
        }
        
        // Final save of check timestamps
        try {
            fs.writeFileSync(lastSellerCheckPath, JSON.stringify(lastSellerCheck, null, 2));
            console.log(`💾 Saved last check times for ${Object.keys(lastSellerCheck).length} sellers`);
        } catch (saveError) {
            console.error(`❌ Failed to save seller check timestamps: ${saveError.message}`);
        }
        
        // Log results
        console.log(`✅ Check complete! Found ${results.newProductsFound} new products from ${Object.keys(results.checkedSellers).length} sellers`);
        
        return results;
    } catch (error) {
        console.error('❌ Fatal error in checkAllSellers:', error);
        return { error: error.message };
    }
}

module.exports = {
    checkAllSellers,
    processSingleSeller
};