const { SlashCommandBuilder } = require('discord.js');
const { getUserData, saveUserData } = require('../utils/userData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletestalk')
        .setDescription('Remove a seller from your tracking list')
        .addStringOption(option =>
            option.setName('sellerid')
                .setDescription('The seller ID to remove')
                .setRequired(true)),

    async execute(interaction) {
        const { sendDMResponse } = require('../utils/messageUtils');
        await interaction.deferReply({ ephemeral: true });

        try {
            const userId = interaction.user.id;
            const sellerId = interaction.options.getString('sellerid').trim();
            const data = await getUserData(userId, interaction.member);
            
            console.log(`🗑️ User ${userId} attempting to delete seller: ${sellerId}`);
            console.log(`🔍 Current tracked sellers: ${JSON.stringify(data.trackedSellers)}`);

            // Check if user's trackedSellers array exists and is valid
            if (!Array.isArray(data.trackedSellers)) {
                console.error(`❌ User ${userId} has invalid trackedSellers structure: ${typeof data.trackedSellers}`);
                data.trackedSellers = [];
                await saveUserData(userId);
                return sendDMResponse(interaction, '⚠️ Your tracking data was corrupted and has been reset. Please try again.');
            }

            // Check if the seller ID is in the list
            if (!data.trackedSellers.includes(sellerId)) {
                return sendDMResponse(interaction, `❌ You are not tracking seller: ${sellerId}`);
            }

            // Remove the seller from trackedSellers
            const oldLength = data.trackedSellers.length;
            data.trackedSellers = data.trackedSellers.filter(id => id !== sellerId);
            const newLength = data.trackedSellers.length;
            
            console.log(`✅ Filtered trackedSellers from ${oldLength} to ${newLength}`);
            
            // Also clean up the seenASINs for this seller
            if (data.seenASINs && data.seenASINs[sellerId]) {
                delete data.seenASINs[sellerId];
                console.log(`✅ Deleted seenASINs for seller ${sellerId}`);
            }
            
            // Update global tracking data to stay in sync
            if (typeof global.latestSellerData !== 'undefined' && global.latestSellerData[userId]) {
                global.latestSellerData[userId].trackedSellers = [...data.trackedSellers];
                console.log(`🔄 Updated global tracking data for user ${userId}, now tracking ${global.latestSellerData[userId].trackedSellers.length} sellers`);
            }
            
            // Save the changes
            await saveUserData(userId);
            console.log(`💾 User data saved successfully`);

            return sendDMResponse(interaction, `🗑️ Removed seller \`${sellerId}\` from your tracking list.`);
        } catch (error) {
            console.error('❌ Error in /deletestalk:', error);
            return sendDMResponse(interaction, '⚠️ An error occurred while removing the seller.');
        }
    }
};
