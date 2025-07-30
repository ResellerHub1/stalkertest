const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getUserData, saveUserData } = require('../utils/userData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stalkeradjust')
        .setDescription('Admin only: Adjust tracking quota for a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR)
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to adjust tracking quota for')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('quota')
                .setDescription('New maximum number of sellers to track')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Check if user has the Chiefs role
            const isChief = interaction.member.roles.cache.some(role => 
                role.name.toLowerCase() === 'chiefs');
            
            if (!isChief) {
                return interaction.editReply({ 
                    content: "❌ You need the Chiefs role to use this command."
                });
            }
            
            // Admin user has permission, continue with quota adjustment
            // We already deferred the reply above, no need to do it again
            
            const targetUser = interaction.options.getUser('member');
            const newQuota = interaction.options.getInteger('quota');
            
            if (!targetUser) {
                return interaction.editReply("❌ Member not found.");
            }
            
            // Get the current user data
            const userData = await getUserData(targetUser.id);
            const oldQuota = userData.quotaOverride || userData.maxSellers || 0;
            
            // Update the quota override
            userData.quotaOverride = newQuota;
            await saveUserData(targetUser.id);
            
            // Prepare DM message to the target user to notify them
            try {
                const fetchedUser = await interaction.client.users.fetch(targetUser.id);
                
                // Send DM to user about their quota adjustment
                await fetchedUser.send(
                    `📊 Your seller tracking quota has been updated by an admin.\n` +
                    `📈 Previous limit: ${oldQuota} sellers\n` +
                    `📉 New limit: ${newQuota} sellers\n\n` +
                    `You can check your current tracking list with /checkstalk command.`
                );
            } catch (dmError) {
                console.error(`Failed to send DM to ${targetUser.tag}: ${dmError.message}`);
                // Continue even if DM fails
            }
            
            // Success response to admin
            return interaction.editReply({
                content: `✅ Successfully adjusted tracking quota for ${targetUser.tag}:\n` +
                         `• Previous quota: ${oldQuota} sellers\n` +
                         `• New quota: ${newQuota} sellers\n` +
                         `• Current usage: ${userData.trackedSellers?.length || 0} sellers\n\n` +
                         `User has been notified of this change via DM.`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error(`Error in /stalkeradjust command:`, error);
            return interaction.reply({ 
                content: `❌ An error occurred while adjusting the quota: ${error.message}`, 
                ephemeral: true 
            });
        }
    },
};