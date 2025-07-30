/**
 * One-time migration script to move user data from JSON file to Replit Database
 * Run this script once to migrate existing userData.json to database format
 */

const Database = require('@replit/database');
const fs = require('fs');
const path = require('path');

const db = new Database();

async function migrateUserData() {
    console.log('🚀 Starting user data migration to Replit Database...');
    
    const userDataPath = path.join(__dirname, 'data/userData.json');
    
    // Check if userData.json exists
    if (!fs.existsSync(userDataPath)) {
        console.log('❌ No userData.json file found to migrate');
        return;
    }
    
    try {
        // Load existing userData.json
        const jsonData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
        console.log(`📂 Found ${Object.keys(jsonData).length} users in userData.json`);
        
        let migratedCount = 0;
        let skippedCount = 0;
        
        // Migrate each user
        for (const [userId, userData] of Object.entries(jsonData)) {
            try {
                const key = `users.${userId}`;
                
                // Check if user already exists in database
                const existing = await db.get(key).catch(() => null);
                
                if (existing) {
                    console.log(`⚠️ User ${userId} already exists in database - skipping`);
                    skippedCount++;
                    continue;
                }
                
                // Clean the user data - only include user-specific data, not cache data
                const cleanUserData = {
                    membership: userData.membership || 'Basic',
                    trackedSellers: userData.trackedSellers || [],
                    seenASINs: userData.seenASINs || {},
                    quotaOverride: userData.quotaOverride || null
                };
                
                // Save to database
                await db.set(key, cleanUserData);
                migratedCount++;
                
                console.log(`✅ Migrated user ${userId} (${cleanUserData.membership}, ${cleanUserData.trackedSellers.length} sellers)`);
                
            } catch (error) {
                console.error(`❌ Error migrating user ${userId}:`, error.message);
            }
        }
        
        console.log(`\n🎉 Migration complete!`);
        console.log(`✅ Migrated: ${migratedCount} users`);
        console.log(`⚠️ Skipped: ${skippedCount} users (already existed)`);
        
        // Create backup of original file
        const backupPath = path.join(__dirname, 'data', `userData_backup_pre-database_${Date.now()}.json`);
        fs.copyFileSync(userDataPath, backupPath);
        console.log(`💾 Original file backed up to: ${backupPath}`);
        
        console.log('\n✨ User data is now stored in Replit Database with keys: users.<username>');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateUserData().then(() => {
        console.log('Migration script completed');
        process.exit(0);
    }).catch(error => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });
}

module.exports = { migrateUserData };