const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserData } = require('../utils/keepaClient');

const tierLimits = {
    Basic: 0,
    Silver: 2,
    Gold: 5,
    Chiefs: Infinity
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('membership')
        .setDescription('View your membership tier and tracking stats'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const data = await getUserData(interaction.user.id, member);
            
            // membership is set in getUserData
            const membership = data.membership;

            // Count trackedSellers, not sellers
            const used = data.trackedSellers.length;
            const remaining = membership === 'Chiefs' ? 'Unlimited' : (tierLimits[membership] - used);

            // Prepare tracked sellers information
            let sellersList = '';
            if (data.trackedSellers.length === 0) {
                sellersList = 'No sellers being tracked.';
            } else {
                for (const sellerId of data.trackedSellers) {
                    // Count how many products we've seen from this seller
                    const seenProductsCount = data.seenASINs[sellerId]?.length || 0;
                    sellersList += `• \`${sellerId}\` (${seenProductsCount} products tracked)\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 Membership Tier: ${membership}`)
                .addFields(
                    { name: '📦 Stalks Used:', value: used.toString(), inline: true },
                    { name: '📉 Remaining:', value: remaining.toString(), inline: true },
                    { name: '\u200B', value: '\u200B' }, // Empty field for spacing
                    { name: '🏬 Tracked Sellers:', value: sellersList || 'None' }
                )
                .setFooter({ text: 'Bot scans for new products hourly' })
                .setTimestamp()
                .setColor(
                    membership === 'Chiefs' ? '#ff5555' : 
                    membership === 'Gold' ? '#ffaa00' : 
                    membership === 'Silver' ? '#aaaaaa' : 
                    '#555555'
                );

            // Send the embed via DM
            await interaction.user.send({ embeds: [embed] });
            return interaction.editReply('✅ Check your DMs for a response.');
        } catch (error) {
            console.error('❌ /membership error:', error);
            try {
                await interaction.user.send('❌ Failed to retrieve membership data: ' + error.message);
                return interaction.editReply('✅ Check your DMs for a response.');
            } catch (dmErr) {
                console.error('⚠️ Could not send DM to user:', dmErr);
                return interaction.editReply('⚠️ Failed to send you a DM. Please check your privacy settings and try again.');
            }
        }
    }
};
