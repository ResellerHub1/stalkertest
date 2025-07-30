const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ensureJsonFileExists } = require('./fileUtils');
const { formatProductNotification } = require('./messageUtils');

// Import the Amazon scrapers and other utilities
const amazonScraper = require('./amazon_bridge');
const { getEnhancedSellerProducts } = require('./enhanced_amazon_bridge');
const { getKeepaSellerProductsDirectly } = require('./keepa_direct_search');

// Import combined inventory (needs to be after our exports to avoid circular dependency)
let combinedInventory;
setTimeout(() => {
    combinedInventory = require('./combined_inventory_fixed');
}, 0);

// Object to track when we last checked each seller
// This helps prevent checking the same seller too frequently
const lastSellerCheckPath = path.join(__dirname, '../data/seller_check_timestamps.json');
let lastSellerCheck = {};

// Load last seller check timestamps if they exist
try {
    if (fs.existsSync(lastSellerCheckPath)) {
        lastSellerCheck = JSON.parse(fs.readFileSync(lastSellerCheckPath, 'utf8'));
        console.log(`📂 Loaded last seller check timestamps for ${Object.keys(lastSellerCheck).length} sellers`);
    }
} catch (error) {
    console.log(`⚠️ Error loading seller check timestamps: ${error.message}`);
    lastSellerCheck = {};
}

const userDataPath = path.join(__dirname, '../data/userData.json');
let userData = ensureJsonFileExists(userDataPath, {});

const saveUserData = () => {
    try {
        fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
        console.log('💾 User data saved successfully');
    } catch (error) {
        console.error('❌ Error saving user data:', error);
    }
};

const getUserData = (userId, member = null) => {
    if (!userData[userId]) {
        userData[userId] = {
            membership: 'Basic',
            trackedSellers: [],
            seenASINs: {}
        };
    }

    // Handle data structure migration
    if (userData[userId].sellers && !userData[userId].trackedSellers) {
        userData[userId].trackedSellers = userData[userId].sellers;
        delete userData[userId].sellers;
        saveUserData();
    }

    if (member?.roles?.cache) {
        const roleNames = member.roles.cache.map(role => role.name);
        console.log(`👤 ${member.user.username} has roles:`, roleNames);

        const roleTiers = ['Chiefs', 'Gold', 'Silver'];
        const matched = roleTiers.find(tier => roleNames.includes(tier));
        userData[userId].membership = matched ?? 'Basic';
    } else {
        console.log('⚠️ No member.roles.cache found');
    }

    return userData[userId];
};

// Helper function to get seller name
const getSellerName = async (sellerId) => {
    try {
        // First try getting from Keepa
        const apiKey = process.env.KEEPA_API_KEY;
        if (!apiKey) {
            throw new Error('No Keepa API key available');
        }

        // Use Keepa API to get seller info
        const response = await axios.get('https://api.keepa.com/seller', {
            params: {
                key: apiKey,
                domain: 3, // UK: 3
                seller: sellerId
            }
        });

        if (response.data && response.data.sellers && response.data.sellers[sellerId]) {
            console.log(`✅ Found seller data from Keepa for ${sellerId}`);
            return response.data.sellers[sellerId].name;
        }
        
        throw new Error('Seller not found in Keepa response');
    } catch (error) {
        console.log(`⚠️ Error getting seller name from Keepa: ${error.message}`);
        
        // Try fallback to Amazon scraper
        try {
            return await amazonScraper.getSellerName(sellerId, 'co.uk');
        } catch (fallbackError) {
            console.log(`⚠️ Error in fallback to Amazon scraper: ${fallbackError.message}`);
            return null;
        }
    }
};

/**
 * Fetch all products from a seller's inventory
 * @param {string} sellerId - Amazon seller ID
 * @param {boolean} forceRefresh - Whether to force refresh the cache
 * @returns {Promise<Array>} - Array of products
 */
const fetchSellerInventory = async (sellerId, forceRefresh = false) => {
    try {
        console.log(`🔍 Getting inventory for seller ${sellerId}`);
        
        // Use the combined inventory approach if available, 
        // otherwise fallback to direct approaches
        if (combinedInventory) {
            return await combinedInventory.getCompleteInventory(sellerId, forceRefresh);
        } else {
            console.log(`⚠️ Combined inventory not yet loaded, falling back to direct methods`);
            
            // Use cached inventory as primary source since Amazon is blocking
            console.log(`🔍 Using cached inventory for ${sellerId}...`);
            const cachePath = path.join(__dirname, '../data/cache');
            
            if (fs.existsSync(cachePath)) {
                const cacheFiles = fs.readdirSync(cachePath).filter(f => f.startsWith(sellerId + '_'));
                
                if (cacheFiles.length > 0) {
                    try {
                        const cacheFile = cacheFiles[0];
                        const cacheData = JSON.parse(fs.readFileSync(path.join(cachePath, cacheFile), 'utf8'));
                        
                        let products = [];
                        if (cacheData.products) {
                            // New cache format with products object
                            products = Object.values(cacheData.products).map(product => ({
                                asin: product.asin,
                                title: product.title || 'Unknown Title',
                                link: product.link || `https://www.amazon.co.uk/dp/${product.asin}`,
                                marketplace: 'UK',
                                seller_id: sellerId,
                                seller_name: product.seller_name || cacheData.sellerName || 'Unknown',
                                price_text: product.price_text || 'Price not available',
                                source: 'cache'
                            }));
                        } else if (Array.isArray(cacheData)) {
                            // Old cache format with array
                            products = cacheData.map(product => ({
                                asin: product.asin,
                                title: product.title || 'Unknown Title',
                                link: product.link || `https://www.amazon.co.uk/dp/${product.asin}`,
                                marketplace: 'UK',
                                seller_id: sellerId,
                                seller_name: product.seller_name || 'Unknown',
                                price_text: product.price_text || 'Price not available',
                                source: 'cache'
                            }));
                        }
                        
                        if (products.length > 0) {
                            console.log(`✅ Found ${products.length} products from cache`);
                            return products;
                        }
                    } catch (error) {
                        console.log(`⚠️ Error reading cache: ${error.message}`);
                    }
                }
            }
            
            // Only try Keepa API if we have no cached data
            try {
                console.log(`🔍 Trying Keepa API for ${sellerId}...`);
                const apiKey = process.env.KEEPA_API_KEY;
                if (apiKey) {
                    // Try to get seller information first
                    const sellerResponse = await axios.get('https://api.keepa.com/seller', {
                        params: {
                            key: apiKey,
                            domain: 3, // UK
                            seller: sellerId
                        },
                        timeout: 30000
                    });
                    
                    if (sellerResponse.data && sellerResponse.data.sellers && sellerResponse.data.sellers[sellerId]) {
                        console.log(`✅ Found seller data from Keepa for ${sellerId}`);
                        // Return empty array since we can't get products directly via Keepa API
                        return [];
                    }
                }
            } catch (error) {
                console.log(`⚠️ Keepa API error: ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`);
            }
            
            // Return empty array if all attempts fail
            console.log(`⚠️ All product fetching methods failed for ${sellerId}`);
            return [];
        }
    } catch (e) {
        console.error(`❌ Fatal error in fetchSellerInventory:`, e);
        return [];
    }
};

/**
 * Check all users' tracked sellers for new products
 * @param {Object} client - Discord client
 * @param {boolean} forceRefresh - Whether to force refresh the cache
 * @param {boolean} checkAllSellers - Whether to check all sellers, including ones that we may skip normally
 */
/**
 * Process a single seller for all users who track it
 * This dedicated function ensures each seller is fully processed
 * @param {Object} client - Discord client for DM sending
 * @param {string} sellerId - The Amazon seller ID to process
 * @param {Object} sellerToUsers - Mapping of which users track this seller
 * @param {boolean} forceRefresh - Whether to force refresh cache
 * @param {Object} checkResults - Results object to update with findings
 * @returns {Promise<void>}
 */
const processSingleSeller = async (client, sellerId, sellerToUsers, forceRefresh, checkResults) => {
    try {
        console.log(`🔄 Processing seller ${sellerId} (tracked by ${sellerToUsers[sellerId]?.length || 0} users)`);
        
        // Mark this seller as checked at this time to prevent skipping in future checks
        lastSellerCheck[sellerId] = Date.now();
        
        // Get all products from the seller using our enhanced approach
        const products = await fetchSellerInventory(sellerId, forceRefresh);
        
        // Store check results for summary
        if (!checkResults.checkedSellers[sellerId]) {
            checkResults.checkedSellers[sellerId] = {
                name: products[0]?.seller_name || 'Unknown',
                totalProducts: products.length,
                newProducts: 0
            };
        }
        
        console.log(`✅ Found ${products.length} products for seller ${sellerId}`);
        
        // Update each user who tracks this seller
        for (const userId of sellerToUsers[sellerId] || []) {
            const userRecord = getUserData(userId);
            
            // Initialize seen ASINs array if it doesn't exist
            if (!userRecord.seenASINs[sellerId]) {
                userRecord.seenASINs[sellerId] = [];
            }
            
            // Check if this is a first-time check for this seller (empty seenASINs array)
            const isFirstCheck = userRecord.seenASINs[sellerId].length === 0;
            
            if (isFirstCheck) {
                console.log(`🔄 First-time check for seller ${sellerId} (user ${userId}) - caching all products without sending notifications`);
                
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
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) {
                console.log(`⚠️ Could not fetch user ${userId} for notifications`);
                continue;
            }
            
            // Filter out products the user has already seen and verify products are active
            const newProducts = products.filter(product => {
                // Skip products that user has already seen
                if (!product?.asin || userRecord.seenASINs[sellerId].includes(product.asin)) {
                    return false;
                }
                
                // Perform validation checks to avoid false positives
                
                // 1. Skip products without title (likely inactive)
                if (!product.title || product.title === "Unknown Title" || product.title === "Unknown Product") {
                    console.log(`⚠️ Skipping product ${product.asin} from ${sellerId} - missing title`);
                    return false;
                }
                
                // 2. If product has a specific "unavailable" flag (from enhanced scraper)
                if (product.unavailable === true) {
                    console.log(`⚠️ Skipping product ${product.asin} from ${sellerId} - marked unavailable`);
                    return false;
                }
                
                // 3. Check if URL looks valid
                if (!product.link?.includes('amazon.co.uk') && !product.link?.includes(product.asin)) {
                    console.log(`⚠️ Skipping product ${product.asin} from ${sellerId} - invalid link`);
                    return false;
                }
                
                // If all checks pass, product is valid
                return true;
            });
            
            // Update check results
            checkResults.newProductsFound += newProducts.length;
            checkResults.checkedSellers[sellerId].newProducts += newProducts.length;
            
            // Process each new product
            for (const product of newProducts) {
                // Add to seen ASINs to avoid future notifications
                if (product.asin) {
                    userRecord.seenASINs[sellerId].push(product.asin);
                }
                
                // Create and send notification
                try {
                    const notification = formatProductNotification(product, sellerId);
                    await user.send(notification);
                    console.log(`📨 Sent notification to ${user.username} about new product ${product.asin}`);
                } catch (notificationError) {
                    console.error(`⚠️ Error sending notification to user ${userId}:`, notificationError);
                }
            }
            
            // Save updated seenASINs if any new products were found
            if (newProducts.length > 0) {
                saveUserData();
                console.log(`✅ Added ${newProducts.length} new products to seenASINs for user ${userId} and seller ${sellerId}`);
            }
        }
        
        // Persist the checked timestamp for this seller
        try {
            fs.writeFileSync(
                lastSellerCheckPath, 
                JSON.stringify(lastSellerCheck, null, 2)
            );
        } catch (saveError) {
            console.error(`❌ Failed to save seller check timestamp: ${saveError.message}`);
        }
        
        return true;
    } catch (error) {
        console.error(`⚠️ Error processing seller ${sellerId}:`, error.message);
        return false;
    }
};

const checkAllUsers = async (client, forceRefresh = false, checkAllSellers = true) => {
    try {
        // Check if there's a force check initiator with details
        const initiator = global.forceCheckInitiator;
        let initiatorId = null;
        let initiatorInteraction = null;
        
        if (initiator) {
            initiatorId = initiator.userId;
            initiatorInteraction = initiator.interaction;
            // Override the force refresh flag if one is specified in the initiator
            if (typeof initiator.forceRefresh === 'boolean') {
                forceRefresh = initiator.forceRefresh;
            }
            console.log(`🔄 Force check initiated by user ${initiatorId} with forceRefresh=${forceRefresh}`);
        }
        
        console.log(`📋 Check parameters: forceRefresh=${forceRefresh}, checkAllSellers=${checkAllSellers}`);
        
        // First, let's gather all unique sellers in the system
        const allSellers = new Set();
        
        // Collect all unique sellers
        for (const userId in userData) {
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
        
        const checkResults = {
            userCount: 0,
            sellerCount: 0,
            newProductsFound: 0,
            checkedSellers: {}
        };
        
        // If checkAllSellers flag is true, check all sellers in the system
        // instead of iterating through user by user
        if (checkAllSellers && sellerArray.length > 0) {
            console.log(`🔄 Checking all sellers in the system (${sellerArray.length} total)`);
            
            checkResults.userCount = Object.keys(userData).length;
            checkResults.sellerCount = sellerArray.length;
            
            // Keep track of which users track each seller for notifications
            const sellerToUsers = {};
            
            // Build a mapping of seller IDs to users who track them
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
            
            // Process each seller directly
            console.log(`⏳ Starting to process ${sellerArray.length} sellers one by one`);
            
            // Important: Initialize the lastSellerCheck record with our start time
            // to mark all sellers as checked during this run
            const checkTime = Date.now();
            
            // Process sellers one by one with error handling
            for (let sellerIndex = 0; sellerIndex < sellerArray.length; sellerIndex++) {
                const sellerId = sellerArray[sellerIndex];
                console.log(`🔍 Checking seller ${sellerId} (${sellerIndex + 1}/${sellerArray.length}) (tracked by ${sellerToUsers[sellerId]?.length || 0} users)`);
                
                // Mark this seller as checked at this time to prevent skipping in future checks
                lastSellerCheck[sellerId] = checkTime;
                
                // Save the timestamp immediately to ensure we don't reprocess this seller
                // even if the script crashes later
                try {
                    fs.writeFileSync(
                        lastSellerCheckPath, 
                        JSON.stringify(lastSellerCheck, null, 2)
                    );
                } catch (saveError) {
                    console.error(`❌ Failed to save seller check timestamp: ${saveError.message}`);
                }
                
                try {
                    // Get all products from the seller using our enhanced approach
                    const products = await fetchSellerInventory(sellerId, forceRefresh);
                    
                    // Store check results for summary
                    if (!checkResults.checkedSellers[sellerId]) {
                        checkResults.checkedSellers[sellerId] = {
                            name: products[0]?.seller_name || 'Unknown',
                            totalProducts: products.length,
                            newProducts: 0
                        };
                    }
                    
                    // Update each user who tracks this seller
                    for (const userId of sellerToUsers[sellerId] || []) {
                        const userRecord = getUserData(userId);
                        
                        // Initialize seen ASINs array if it doesn't exist
                        if (!userRecord.seenASINs[sellerId]) {
                            userRecord.seenASINs[sellerId] = [];
                        }
                        
                        // Check if this is a first-time check for this seller (empty seenASINs array)
                        const isFirstCheck = userRecord.seenASINs[sellerId].length === 0;
                        
                        if (isFirstCheck) {
                            console.log(`🔄 First-time check for seller ${sellerId} (user ${userId}) - caching all products without sending notifications`);
                            
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
                        const user = await client.users.fetch(userId).catch(() => null);
                        if (!user) {
                            console.log(`⚠️ Could not fetch user ${userId} for notifications`);
                            continue;
                        }
                        
                        // Filter out products the user has already seen
                        const newProducts = products.filter(product => 
                            product?.asin && !userRecord.seenASINs[sellerId].includes(product.asin)
                        );
                        
                        // Update check results
                        checkResults.newProductsFound += newProducts.length;
                        checkResults.checkedSellers[sellerId].newProducts += newProducts.length;
                        
                        // Process each new product
                        for (const product of newProducts) {
                            // Add to seen ASINs to avoid future notifications
                            if (product.asin) {
                                userRecord.seenASINs[sellerId].push(product.asin);
                            }
                            
                            // Create and send notification with enhanced reliability
                            try {
                                // Import the enhanced notification function with retry logic
                                const { sendProductNotification } = require('./messageUtils');
                                
                                // Use enhanced notification for all users, especially 1064266465647276045
                                const success = await sendProductNotification(user, product, sellerId);
                                
                                if (!success) {
                                    console.error(`⚠️ FAILED to deliver notification to ${user.username} (${userId}) for product ${product.asin} after multiple attempts`);
                                }
                            } catch (notificationError) {
                                console.error(`⚠️ Critical error in notification process for user ${userId}:`, notificationError);
                            }
                        }
                        
                        // Save updated seenASINs if any new products were found
                        if (newProducts.length > 0) {
                            saveUserData();
                            console.log(`✅ Added ${newProducts.length} new products to seenASINs for user ${userId} and seller ${sellerId}`);
                        }
                    }
                } catch (error) {
                    console.error(`⚠️ Error checking seller ${sellerId}:`, error.message);
                }
                
                // Add a delay between seller checks to avoid overwhelming rate limits
                // Only add delay if this isn't the last seller
                if (sellerIndex < sellerArray.length - 1) {
                    console.log(`⏱️ Adding small delay before checking next seller...`);
                    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
                }
            }
            
            // Save timestamps at the end of the seller processing loop
            try {
                fs.writeFileSync(
                    lastSellerCheckPath, 
                    JSON.stringify(lastSellerCheck, null, 2)
                );
                console.log(`✅ Saved final seller check timestamps`);
            } catch (finalSaveError) {
                console.error(`❌ Failed to save timestamps at end of processing: ${finalSaveError.message}`);
            }
        } else {
            // Original user-by-user iteration
            for (const userId in userData) {
                // Skip users with no tracked sellers
                if (!userData[userId].trackedSellers || userData[userId].trackedSellers.length === 0) {
                    continue;
                }
                
                checkResults.userCount++;
                
                // Fetch user to send DMs
                const user = await client.users.fetch(userId).catch(() => null);
                if (!user) {
                    console.log(`⚠️ Could not fetch user ${userId}`);
                    continue;
                }
                
                const userRecord = getUserData(userId);
                
                // Check each seller the user is tracking
                for (const sellerId of userRecord.trackedSellers) {
                    checkResults.sellerCount++;
                    console.log(`🔍 Checking seller ${sellerId} for user ${userId}`);
                    
                    try {
                        // Get all products from the seller using our enhanced approach
                        const products = await fetchSellerInventory(sellerId, forceRefresh);
                    
                        // Initialize seen ASINs array if it doesn't exist
                        if (!userRecord.seenASINs[sellerId]) {
                            userRecord.seenASINs[sellerId] = [];
                        }
                        
                        // Check if this is a first-time check for this seller (empty seenASINs array)
                        const isFirstCheck = userRecord.seenASINs[sellerId].length === 0;
                        
                        if (isFirstCheck) {
                            console.log(`🔄 First-time check for seller ${sellerId} - caching all products without sending notifications`);
                            
                            // Add all products to seenASINs without sending notifications
                            products.forEach(product => {
                                if (product?.asin && !userRecord.seenASINs[sellerId].includes(product.asin)) {
                                    userRecord.seenASINs[sellerId].push(product.asin);
                                }
                            });
                            
                            // Save the updated data
                            if (products.length > 0) {
                                saveUserData();
                                console.log(`✅ Silently cached ${products.length} products for seller ${sellerId} (first-time check)`);
                            }
                            
                            // Skip notification processing
                            continue;
                        }
                        
                        // For subsequent checks, filter out products the user has already seen
                        const newProducts = products.filter(product => 
                            product?.asin && !userRecord.seenASINs[sellerId].includes(product.asin)
                        );
                        
                        // Store check results for summary
                        if (!checkResults.checkedSellers[sellerId]) {
                            checkResults.checkedSellers[sellerId] = {
                                name: products[0]?.seller_name || 'Unknown',
                                totalProducts: products.length,
                                newProducts: newProducts.length
                            };
                        }
                        
                        // Process each new product
                        for (const product of newProducts) {
                            // Add to seen ASINs to avoid future notifications
                            if (product.asin) {
                                userRecord.seenASINs[sellerId].push(product.asin);
                            }
                            
                            // Update check results
                            checkResults.newProductsFound++;
                            
                            // Create and send notification with enhanced reliability
                            try {
                                // Import the enhanced notification function with retry logic
                                const { sendProductNotification } = require('./messageUtils');
                                
                                // Use enhanced notification system that includes retry capability
                                const success = await sendProductNotification(user, product, sellerId);
                                
                                if (!success) {
                                    console.error(`⚠️ FAILED to deliver notification to ${user.username} (${userId}) for product ${product.asin} after multiple attempts`);
                                }
                            } catch (notificationError) {
                                console.error(`⚠️ Critical error in notification process for user ${userId}:`, notificationError);
                            }
                        }
                        
                        // Save updated seenASINs if any new products were found
                        if (newProducts.length > 0) {
                            saveUserData();
                            console.log(`✅ Added ${newProducts.length} new products to seenASINs for user ${userId} and seller ${sellerId}`);
                        }
                    } catch (error) {
                        console.error(`⚠️ Error checking seller ${sellerId}:`, error.message);
                    }
                }
            }
        }
        
        // Log check summary
        console.log(`📊 Check Summary:
        - Users checked: ${checkResults.userCount}
        - Sellers checked: ${checkResults.sellerCount}
        - New products found: ${checkResults.newProductsFound}
        `);
        
        // If this was a force check initiated by a user, send them a summary
        if (initiatorInteraction && initiatorId) {
            try {
                // Prepare report for the user who initiated the check
                let summaryMessage = `✅ Inventory check completed!\n\n`;
                summaryMessage += `📊 Check Summary:\n`;
                summaryMessage += `• ${checkResults.userCount} users checked\n`;
                summaryMessage += `• ${checkResults.sellerCount} sellers checked\n`;
                summaryMessage += `• ${checkResults.newProductsFound} new products found\n\n`;
                
                if (Object.keys(checkResults.checkedSellers).length > 0) {
                    summaryMessage += `📋 Sellers:\n`;
                    
                    for (const [sellerId, info] of Object.entries(checkResults.checkedSellers)) {
                        summaryMessage += `• ${info.name || sellerId}: ${info.totalProducts} products (${info.newProducts} new)\n`;
                    }
                }
                
                // If the initiator interaction is still valid, send the summary
                if (!initiatorInteraction.replied && !initiatorInteraction.deferred) {
                    await initiatorInteraction.reply({ content: summaryMessage, ephemeral: true });
                } else {
                    await initiatorInteraction.editReply({ content: summaryMessage });
                }
            } catch (summaryError) {
                console.error(`⚠️ Error sending force check summary:`, summaryError);
            }
        }
        
        // Save the lastSellerCheck to persist this information
        try {
            // Make sure we can resurrect the data 
            const cleanedLastSellerCheck = {};
            for (const [sellerId, timestamp] of Object.entries(lastSellerCheck)) {
                cleanedLastSellerCheck[sellerId] = timestamp;
            }
            
            // Save the check timestamps to a file for persistence
            fs.writeFileSync(
                lastSellerCheckPath, 
                JSON.stringify(cleanedLastSellerCheck, null, 2)
            );
            console.log(`💾 Saved last check times for ${Object.keys(cleanedLastSellerCheck).length} sellers`);
        } catch (saveError) {
            console.error(`❌ Failed to save seller check timestamps: ${saveError.message}`);
        }
    } catch (error) {
        console.error('❌ Fatal error in checkAllUsers:', error);
    }
};

module.exports = {
    getUserData,
    saveUserData,
    getSellerName,
    fetchSellerInventory,
    checkAllUsers
};