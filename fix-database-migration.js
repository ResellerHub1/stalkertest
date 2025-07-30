/**
 * Fix database migration - overwrite incorrect empty data with actual JSON data
 */

const Database = require('@replit/database');
const fs = require('fs');
const path = require('path');

const db = new Database();

async function fixDatabaseMigration() {
    console.log('🔧 Fixing database migration - overwriting empty records...');
    
    const userDataPath = path.join(__dirname, 'data/userData.json');
    
    if (!fs.existsSync(userDataPath)) {
        console.log('❌ No userData.json file found');
        return;
    }
    
    try {
        // Load JSON data
        const jsonData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
        console.log(`📂 Found ${Object.keys(jsonData).length} users in userData.json`);
        
        let updatedCount = 0;
        
        // Force update each user with correct data
        for (const [userId, userData] of Object.entries(jsonData)) {
            try {
                const key = `users.${userId}`;
                
                // Clean user data - only include actual user data
                const cleanUserData = {
                    membership: userData.membership || 'Basic',
                    trackedSellers: userData.trackedSellers || [],
                    seenASINs: userData.seenASINs || {},
                    quotaOverride: userData.quotaOverride || null
                };
                
                // Force overwrite in database
                await db.set(key, cleanUserData);
                updatedCount++;
                
                if (cleanUserData.trackedSellers.length > 0) {
                    console.log(`✅ Updated user ${userId} (${cleanUserData.membership}, ${cleanUserData.trackedSellers.length} sellers)`);
                }
                
            } catch (error) {
                console.error(`❌ Error updating user ${userId}:`, error.message);
            }
        }
        
        console.log(`\n🎉 Database fix complete!`);
        console.log(`✅ Updated: ${updatedCount} users`);
        
    } catch (error) {
        console.error('❌ Fix failed:', error);
    }
}

// Run fix
fixDatabaseMigration().then(() => {
    console.log('Database fix completed');
    process.exit(0);
}).catch(error => {
    console.error('Database fix failed:', error);
    process.exit(1);
});