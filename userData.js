/**
 * User data management utilities
 * Handles loading and saving user data using Replit Database
 * User data is stored with keys: "users.<username>"
 */

// In-memory cache of user data for performance
let userData = {};
let isDataLoaded = false;

// Load all user data from database at startup
async function loadUserData(db) {
    if (isDataLoaded) return userData;
    
    try {
        console.log(`📂 Loading user data from Replit Database...`);
        
        // Get all keys that start with "users." - Replit DB returns {ok: true, value: [keys]}
        const dbKeysResult = await db.list("users.");
        userData = {};
        
        // Replit DB list() returns {ok: true, value: actualKeys}
        const keysList = (dbKeysResult && dbKeysResult.ok && dbKeysResult.value) ? dbKeysResult.value : [];
        
        for (const key of keysList) {
            const userId = key.replace('users.', '');
            try {
                const dbResult = await db.get(key);
                // Replit DB get() returns {ok: true, value: actualData}
                const userRecord = dbResult && dbResult.ok && dbResult.value ? dbResult.value : null;
                if (userRecord && userRecord.membership) {
                    userData[userId] = userRecord;
                }
            } catch (err) {
                console.error(`⚠️ Error loading user ${userId}: ${err.message}`);
            }
        }
        
        console.log(`📂 Loaded user data with ${Object.keys(userData).length} users from database`);
        isDataLoaded = true;
        
        return userData;
    } catch (err) {
        console.error(`❌ Error loading user data from database: ${err.message}`);
        userData = {};
        isDataLoaded = true;
        return userData;
    }
}

// Initialize data loading
loadUserData();

/**
 * Get user data record for a specific user, or all user data
 * @param {string} userId - Optional user ID to get specific user data
 * @param {Object} member - Optional Discord GuildMember object to check roles
 * @returns {Object} - User data record or all user data
 */
async function getUserData(userId = null, member = null) {
    // Ensure data is loaded (only loads once due to caching)
    if (!isDataLoaded) {
        await loadUserData();
    }
    if (userId) {
        // Return specific user
        if (!userData[userId]) {
            // Initialize user record if it doesn't exist - ONLY for truly new users
            userData[userId] = {
                membership: 'Basic', // Default membership tier
                trackedSellers: [],
                seenASINs: {},
                quotaOverride: null // Admin-adjusted quota takes precedence when set
            };
            console.log(`🆕 Initialized new user ${userId} with empty tracking data`);
        }
        
        // CRITICAL: Only update membership role, never overwrite tracking data
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
            
            // Only update membership if it changed, preserve all other data
            if (userData[userId].membership !== newMembership) {
                userData[userId].membership = newMembership;
                console.log(`🔄 Updated membership for user ${userId} to ${newMembership}`);
                await saveUserData(userId);
            }
            
            // Ensure tracking data structure exists but never overwrite existing data
            if (!userData[userId].trackedSellers) {
                userData[userId].trackedSellers = [];
            }
            if (!userData[userId].seenASINs) {
                userData[userId].seenASINs = {};
            }
            if (userData[userId].quotaOverride === undefined) {
                userData[userId].quotaOverride = null;
            }
        }
        
        return userData[userId];
    } else {
        // Return all user data
        return userData;
    }
}

/**
 * Save user data to Replit Database
 * @param {string} userId - Specific user ID to save, or null to save all users
 * @returns {boolean} - Success status
 */
async function saveUserData(userId = null) {
    try {
        if (userId) {
            // Save specific user
            const key = `users.${userId}`;
            const result = await db.set(key, userData[userId]);
            // Don't log every single save to reduce spam
            return true;
        } else {
            // Save all users
            const savePromises = [];
            for (const uid in userData) {
                const key = `users.${uid}`;
                savePromises.push(db.set(key, userData[uid]));
            }
            await Promise.all(savePromises);
            console.log(`💾 Saved data for ${Object.keys(userData).length} users to database`);
        }
        return true;
    } catch (err) {
        console.error(`❌ Error saving user data to database: ${err.message}`);
        return false;
    }
}

/**
 * Add a seller to user's tracking list
 * @param {string} userId - Discord user ID 
 * @param {string} sellerId - Amazon seller ID
 * @returns {Object} - Result of the operation
 */
async function addSeller(userId, sellerId) {
    const userRecord = await getUserData(userId);
    
    // Ensure trackedSellers array exists
    if (!userRecord.trackedSellers) {
        userRecord.trackedSellers = [];
    }
    
    // Check if seller is already tracked
    if (userRecord.trackedSellers.includes(sellerId)) {
        return { success: false, message: 'Already tracking this seller' };
    }
    
    // Add the seller
    userRecord.trackedSellers.push(sellerId);
    
    // Initialize seenASINs for this seller
    if (!userRecord.seenASINs) {
        userRecord.seenASINs = {};
    }
    
    if (!userRecord.seenASINs[sellerId]) {
        userRecord.seenASINs[sellerId] = [];
    }
    
    // Save changes
    await saveUserData(userId);
    
    // Also update global tracking data for command reference
    if (typeof global.latestSellerData === 'undefined') {
        global.latestSellerData = {};
    }
    
    if (!global.latestSellerData[userId]) {
        global.latestSellerData[userId] = { trackedSellers: [] };
    }
    
    if (!global.latestSellerData[userId].trackedSellers.includes(sellerId)) {
        global.latestSellerData[userId].trackedSellers.push(sellerId);
    }
    
    console.log(`✅ Added seller ${sellerId} to tracking for user ${userId}. Total sellers: ${userRecord.trackedSellers.length}`);
    
    return { 
        success: true, 
        message: 'Added seller to tracking list',
        sellerCount: userRecord.trackedSellers.length
    };
}

/**
 * Remove a seller from user's tracking list
 * @param {string} userId - Discord user ID
 * @param {string} sellerId - Amazon seller ID
 * @returns {Object} - Result of the operation
 */
async function removeSeller(userId, sellerId) {
    const userRecord = await getUserData(userId);
    
    // Ensure trackedSellers array exists
    if (!userRecord.trackedSellers) {
        userRecord.trackedSellers = [];
        return { success: false, message: 'Not tracking this seller' };
    }
    
    // Check if seller is tracked
    const sellerIndex = userRecord.trackedSellers.indexOf(sellerId);
    if (sellerIndex === -1) {
        return { success: false, message: 'Not tracking this seller' };
    }
    
    // Remove the seller
    userRecord.trackedSellers.splice(sellerIndex, 1);
    
    // Remove seenASINs for this seller
    if (userRecord.seenASINs && userRecord.seenASINs[sellerId]) {
        delete userRecord.seenASINs[sellerId];
    }
    
    // Save changes
    await saveUserData(userId);
    
    // Also update global tracking data for command reference
    if (typeof global.latestSellerData !== 'undefined' && 
        global.latestSellerData[userId] && 
        global.latestSellerData[userId].trackedSellers) {
        
        const globalIndex = global.latestSellerData[userId].trackedSellers.indexOf(sellerId);
        if (globalIndex !== -1) {
            global.latestSellerData[userId].trackedSellers.splice(globalIndex, 1);
        }
    }
    
    console.log(`❌ Removed seller ${sellerId} from tracking for user ${userId}. Total sellers: ${userRecord.trackedSellers.length}`);
    
    return { 
        success: true, 
        message: 'Removed seller from tracking list',
        sellerCount: userRecord.trackedSellers.length
    };
}

/**
 * Update a user's membership tier
 * @param {string} userId - Discord user ID
 * @param {string} membership - Membership tier (Basic, Silver, Gold, Chiefs)
 * @returns {Object} - Result of the operation
 */
async function updateMembership(userId, membership) {
    const validTiers = ['Basic', 'Silver', 'Gold', 'Chiefs'];
    if (!validTiers.includes(membership)) {
        return { success: false, message: 'Invalid membership tier' };
    }
    
    const userRecord = await getUserData(userId);
    userRecord.membership = membership;
    await saveUserData(userId);
    
    return { 
        success: true, 
        message: `Updated membership to ${membership}` 
    };
}

module.exports = {
    getUserData,
    saveUserData,
    addSeller,
    removeSeller,
    updateMembership
};