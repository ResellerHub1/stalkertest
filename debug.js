const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getUserData, saveUserData } = require('../utils/keepaClient');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug commands for admins only')
        .setDefaultMemberPermissions(null) // Using our custom role check instead
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset_products')
                .setDescription('Reset the product cache for a seller to trigger fresh notifications')
                .addStringOption(option =>
                    option.setName('sellerid')
                        .setDescription('The seller ID to reset')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset_all')
                .setDescription('Reset all product cache for all your sellers')),

    async execute(interaction) {
        const { sendDMResponse } = require('../utils/messageUtils');
        const { hasChiefsRole } = require('../utils/roleUtils');
        
        // Check if user has Chiefs role
        if (!hasChiefsRole(interaction)) {
            return interaction.reply({ 
                content: "❌ This command is only available to members with the Chiefs role.", 
                ephemeral: true 
            });
        }
        
        await interaction.deferReply({ ephemeral: true });

        try {
            const userId = interaction.user.id;
            const userData = await getUserData(userId, interaction.member);
            
            // Make sure a subcommand was provided
            let subcommand;
            try {
                subcommand = interaction.options.getSubcommand();
            } catch (error) {
                return sendDMResponse(interaction, '❌ Please specify a subcommand: `/debug reset_products` or `/debug reset_all`');
            }

            if (subcommand === 'reset_products') {
                const sellerId = interaction.options.getString('sellerid').trim();
                
                // Check if the seller is being tracked by this user
                if (!userData.trackedSellers.includes(sellerId)) {
                    return sendDMResponse(interaction, `❌ You are not tracking seller \`${sellerId}\`.`);
                }
                
                // Reset the seenASINs for this seller
                if (userData.seenASINs && userData.seenASINs[sellerId]) {
                    // Get current count for reporting
                    const previousCount = userData.seenASINs[sellerId].length;
                    
                    // Reset the array
                    userData.seenASINs[sellerId] = [];
                    await saveUserData(userId);
                    
                    // Clear Python cache for this seller
                    try {
                        const cachePath = path.join(__dirname, '..', 'utils', 'cache', `${sellerId}_co.uk.json`);
                        if (fs.existsSync(cachePath)) {
                            fs.unlinkSync(cachePath);
                            console.log(`✅ Successfully deleted Python cache file: ${cachePath}`);
                        }
                    } catch (err) {
                        console.log(`⚠️ Warning: Could not clear Python cache: ${err.message}`);
                    }
                    
                    return sendDMResponse(interaction, `✅ Successfully reset product cache for seller \`${sellerId}\`.\n${previousCount} products were cleared from tracking history.\n\nNext time you run a check, all products from this seller will be treated as new and fetched fresh from Amazon.`);
                } else {
                    return sendDMResponse(interaction, `ℹ️ No product history found for seller \`${sellerId}\`.`);
                }
            } else if (subcommand === 'reset_all') {
                // Reset all seenASINs for all sellers this user tracks
                let resetCount = 0;
                let cacheFilesCleared = 0;
                
                if (userData.seenASINs) {
                    for (const sellerId of userData.trackedSellers) {
                        if (userData.seenASINs[sellerId]) {
                            resetCount += userData.seenASINs[sellerId].length;
                            userData.seenASINs[sellerId] = [];
                            
                            // Clear Python cache for this seller
                            try {
                                const cachePath = path.join(__dirname, '..', 'utils', 'cache', `${sellerId}_co.uk.json`);
                                if (fs.existsSync(cachePath)) {
                                    fs.unlinkSync(cachePath);
                                    cacheFilesCleared++;
                                    console.log(`✅ Successfully deleted Python cache file: ${cachePath}`);
                                }
                            } catch (err) {
                                console.log(`⚠️ Warning: Could not clear Python cache for ${sellerId}: ${err.message}`);
                            }
                        }
                    }
                    
                    await saveUserData(userId);
                    return sendDMResponse(interaction, `✅ Successfully reset product cache for all your tracked sellers.\n${resetCount} products were cleared from tracking history.\n${cacheFilesCleared} seller cache files were deleted.\n\nNext time you run a check, all products will be treated as new and fetched fresh from Amazon.`);
                } else {
                    return sendDMResponse(interaction, `ℹ️ No product history found for any of your tracked sellers.`);
                }
            }
        } catch (error) {
            console.error('❌ Error in /debug command:', error);
            return sendDMResponse(interaction, '❌ An error occurred while executing the debug command.');
        }
    }
};