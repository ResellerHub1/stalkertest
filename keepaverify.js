const { SlashCommandBuilder } = require('discord.js');
const { getKeepaProductData } = require('../utils/keepa_product_tracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('keepaverify')
        .setDescription('Verify specific products with Keepa API')
        .addStringOption(option =>
            option.setName('asin')
                .setDescription('Amazon ASIN to verify with Keepa')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const asin = interaction.options.getString('asin');
        
        try {
            console.log(`🔍 Verifying ASIN ${asin} with Keepa API...`);
            
            const products = await getKeepaProductData([asin], 'co.uk');
            
            if (products.length === 0) {
                await interaction.editReply(`❌ No data found for ASIN: ${asin}`);
                return;
            }
            
            const product = products[0];
            
            const embed = {
                color: 0x00ff00,
                title: `📦 Keepa Verification: ${asin}`,
                description: product.title || 'Unknown Product',
                fields: [
                    {
                        name: '💰 Current Price',
                        value: product.current_price || 'Not available',
                        inline: true
                    },
                    {
                        name: '🏪 Amazon Price',
                        value: product.amazon_price || 'Not available',
                        inline: true
                    },
                    {
                        name: '📊 Sales Rank',
                        value: product.keepa_data?.salesRank?.toString() || 'Not available',
                        inline: true
                    },
                    {
                        name: '⭐ Rating',
                        value: product.keepa_data?.rating ? (product.keepa_data.rating / 10).toFixed(1) : 'Not available',
                        inline: true
                    },
                    {
                        name: '💬 Reviews',
                        value: product.keepa_data?.reviewCount?.toString() || 'Not available',
                        inline: true
                    },
                    {
                        name: '🔗 Link',
                        value: `[View on Amazon](${product.link})`,
                        inline: false
                    }
                ],
                footer: {
                    text: `Verified with Keepa API • ${new Date().toLocaleString()}`
                }
            };
            
            if (product.seller_offers && product.seller_offers.length > 0) {
                const sellersText = product.seller_offers.map(offer => 
                    `${offer.sellerName} (${offer.sellerId}): ${offer.price ? '£' + (offer.price / 100).toFixed(2) : 'N/A'}`
                ).join('\n');
                
                embed.fields.push({
                    name: '🏬 Current Sellers',
                    value: sellersText.substring(0, 1024) || 'None',
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('❌ Keepa verification error:', error.message);
            
            if (error.message.includes('tokensLeft') || error.message.includes('-')) {
                await interaction.editReply('❌ Keepa API token limit reached. Please wait for tokens to refill.');
            } else {
                await interaction.editReply('❌ Error verifying product with Keepa API: ' + error.message);
            }
        }
    },
};