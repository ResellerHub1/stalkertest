const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkAllSellers } = require('../utils/seller_tracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forcecheck')
        .setDescription('Force the bot to check all sellers now')
        .setDefaultMemberPermissions(null), // Allow for specific roles, checked in execute

    async execute(interaction) {
        const { sendDMResponse } = require('../utils/messageUtils');
        const fs = require('fs');
        const path = require('path');
        
        // Check if user has Chiefs role
        const { hasChiefsRole } = require('../utils/roleUtils');
        if (!hasChiefsRole(interaction)) {
            return sendDMResponse(interaction, "❌ This command is only available to members with the Chiefs role.");
        }
        
        console.log(`🔄 Force check initiated by user ${interaction.user.tag} (${interaction.user.id})`);

        try {
            // Reply immediately to avoid timeout
            await interaction.reply({ 
                content: '🔄 Starting inventory check for all your tracked sellers. This may take a while...', 
                ephemeral: true 
            });
            
            // Log current user data state before check
            const userDataPath = path.join(__dirname, '..', 'data', 'userData.json');
            const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            console.log(`📊 Current userData state: ${Object.keys(userData).length} users`);
            
            for (const userId in userData) {
                const user = userData[userId];
                const sellerCount = user.trackedSellers?.length || 0;
                console.log(`User ${userId}: Tracking ${sellerCount} sellers`);
                
                // Check each seller's seen products
                for (const sellerId of user.trackedSellers || []) {
                    const seenCount = user.seenASINs?.[sellerId]?.length || 0;
                    console.log(`  Seller ${sellerId}: ${seenCount} seen products`);
                }
            }
            
            // Set a flag to indicate this is an explicit forced check from this user
            global.forceCheckInitiator = {
                userId: interaction.user.id,
                interaction,
                forceRefresh: true // Always use force refresh for manual checks
            };
            
            // Run the check using our new seller tracking system
            console.log('🔄 Running checkAllSellers with force refresh and checking all sellers...');
            await checkAllSellers(interaction.client, true, true); // Pass client, force refresh, and checkAllSellers flags
            
            // Clear the force check initiator flag
            global.forceCheckInitiator = null;
            
            // Log user data state after check
            const updatedUserData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            console.log(`📊 Updated userData state: ${Object.keys(updatedUserData).length} users`);
            
            for (const userId in updatedUserData) {
                const user = updatedUserData[userId];
                const sellerCount = user.trackedSellers?.length || 0;
                console.log(`User ${userId}: Tracking ${sellerCount} sellers`);
                
                // Check each seller's seen products
                for (const sellerId of user.trackedSellers || []) {
                    const seenCount = user.seenASINs?.[sellerId]?.length || 0;
                    console.log(`  Seller ${sellerId}: ${seenCount} seen products`);
                }
            }
            
            // Prepare a summary message of what was checked
            let summary = '✅ Inventory check completed manually.\n\n';
            summary += '📊 Summary of sellers checked:\n';
            
            // Get the user's data to prepare a report
            const userId = interaction.user.id;
            const userDataObj = updatedUserData[userId];
            
            if (userDataObj && userDataObj.trackedSellers) {
                for (const sellerId of userDataObj.trackedSellers) {
                    const productCount = userDataObj.seenASINs?.[sellerId]?.length || 0;
                    summary += `• \`${sellerId}\`: ${productCount} products tracked\n`;
                }
                
                // Check if any new products were found in the worker
                const foundNewProducts = global.forceCheckResults && global.forceCheckResults.newProductsFound;
                
                if (foundNewProducts && foundNewProducts > 0) {
                    summary += `\n✅ ${foundNewProducts} new products were found during this check. You should have received DM notifications with details.`;
                } else {
                    summary += '\nNo new products were found during this check.';
                }
                
                summary += '\nThe bot runs checks hourly and will notify you of any new products.';
            } else {
                summary += 'No tracked sellers found for your account.';
            }
            
            // Send detailed completion via DM to avoid timeout
            const user = await interaction.client.users.fetch(interaction.user.id);
            await user.send(summary);
            
            // Send simple completion message to interaction
            return await interaction.editReply('✅ Check completed. Details sent via DM.');
        } catch (error) {
            console.error('❌ Error in /forcecheck:', error);
            global.forceCheckInitiator = null; // Make sure to clear this in case of errors
            
            try {
                return await interaction.editReply('❌ Failed to complete inventory check: ' + error.message);
            } catch (editError) {
                // If edit fails, try DM as fallback
                const user = await interaction.client.users.fetch(interaction.user.id);
                await user.send('❌ Failed to complete inventory check: ' + error.message);
            }
        }
    }
};
