/**
 * Data Recovery System for Discord Bot
 * 
 * This module provides automated data recovery capabilities
 * to restore lost tracking data from logs and interactions.
 */

const fs = require('fs');
const path = require('path');
const { getUserData, saveUserData } = require('./userData');

/**
 * Create a backup of current user data
 */
function createDataBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, '../data', `userData_backup_${timestamp}.json`);
        const currentData = getUserData();
        
        fs.writeFileSync(backupPath, JSON.stringify(currentData, null, 2));
        console.log(`📦 Created data backup: ${backupPath}`);
        return backupPath;
    } catch (error) {
        console.error('❌ Failed to create data backup:', error);
        return null;
    }
}

/**
 * Scan system for evidence of seller tracking relationships
 * This helps automatically recover lost tracking data
 */
function scanForTrackingEvidence() {
    const evidence = {};
    
    try {
        // Check global tracking data for evidence
        if (typeof global.latestSellerData !== 'undefined') {
            for (const userId in global.latestSellerData) {
                if (global.latestSellerData[userId].trackedSellers) {
                    evidence[userId] = {
                        source: 'global_memory',
                        sellers: [...global.latestSellerData[userId].trackedSellers]
                    };
                }
            }
        }
        
        // Check for recent log entries that show tracking relationships
        // This could be expanded to parse log files for stalk command usage
        
        console.log(`🔍 Found tracking evidence for ${Object.keys(evidence).length} users`);
        return evidence;
    } catch (error) {
        console.error('❌ Error scanning for tracking evidence:', error);
        return {};
    }
}

/**
 * Automatically restore tracking data from available evidence
 */
function autoRestoreTrackingData() {
    try {
        console.log('🔄 Starting automated data recovery...');
        
        // Create backup before making changes
        createDataBackup();
        
        // Scan for evidence
        const evidence = scanForTrackingEvidence();
        
        let restoredCount = 0;
        const currentData = getUserData();
        
        for (const userId in evidence) {
            const userEvidence = evidence[userId];
            
            // Only restore if user exists but has no tracking data
            if (currentData[userId] && 
                (!currentData[userId].trackedSellers || currentData[userId].trackedSellers.length === 0) &&
                userEvidence.sellers && userEvidence.sellers.length > 0) {
                
                console.log(`🔧 Restoring tracking data for user ${userId} from ${userEvidence.source}`);
                currentData[userId].trackedSellers = [...userEvidence.sellers];
                
                // Initialize seenASINs for restored sellers
                if (!currentData[userId].seenASINs) {
                    currentData[userId].seenASINs = {};
                }
                
                userEvidence.sellers.forEach(sellerId => {
                    if (!currentData[userId].seenASINs[sellerId]) {
                        currentData[userId].seenASINs[sellerId] = [];
                    }
                });
                
                restoredCount++;
            }
        }
        
        if (restoredCount > 0) {
            saveUserData();
            console.log(`✅ Automatically restored tracking data for ${restoredCount} users`);
        } else {
            console.log('ℹ️ No tracking data needed restoration');
        }
        
        return restoredCount;
    } catch (error) {
        console.error('❌ Error during automated data recovery:', error);
        return 0;
    }
}

/**
 * Validate data integrity and consistency
 */
function validateDataIntegrity() {
    try {
        const currentData = getUserData();
        const issues = [];
        
        // Check for users with global tracking data but missing userData
        if (typeof global.latestSellerData !== 'undefined') {
            for (const userId in global.latestSellerData) {
                if (!currentData[userId]) {
                    issues.push(`User ${userId} in global data but missing from userData`);
                } else if (!currentData[userId].trackedSellers) {
                    issues.push(`User ${userId} missing trackedSellers array`);
                } else if (global.latestSellerData[userId].trackedSellers) {
                    const globalSellers = global.latestSellerData[userId].trackedSellers;
                    const userSellers = currentData[userId].trackedSellers;
                    
                    if (globalSellers.length !== userSellers.length) {
                        issues.push(`User ${userId} has ${globalSellers.length} sellers in global data but ${userSellers.length} in userData`);
                    }
                }
            }
        }
        
        if (issues.length > 0) {
            console.log('⚠️ Data integrity issues found:');
            issues.forEach(issue => console.log(`  - ${issue}`));
        } else {
            console.log('✅ Data integrity check passed');
        }
        
        return issues;
    } catch (error) {
        console.error('❌ Error during data integrity validation:', error);
        return ['Validation failed due to error'];
    }
}

module.exports = {
    createDataBackup,
    scanForTrackingEvidence,
    autoRestoreTrackingData,
    validateDataIntegrity
};