const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const { sendDMResponse } = require('../utils/messageUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apitest')
        .setDescription('Test the Keepa API integration')
        .addStringOption(option =>
            option.setName('sellerid')
                .setDescription('The seller ID to test with')
                .setRequired(true)),
    
    async execute(interaction) {
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
            const sellerId = interaction.options.getString('sellerid').trim();
            let responseMessage = `🧪 Running debug tests for seller: ${sellerId}\n\n`;
            
            // Test 1: Seller Info API Call
            responseMessage += '**Test 1**: Seller Info API Call...\n';
            try {
                const sellerResponse = await axios.get(
                    `https://api.keepa.com/seller`, {
                    params: {
                        key: process.env.KEEPA_API_KEY,
                        domain: 3, // UK
                        seller: sellerId
                    }
                });
                
                responseMessage += '✅ Seller test completed:\n```json\n';
                responseMessage += JSON.stringify(sellerResponse.data, null, 2).substring(0, 500);
                if (JSON.stringify(sellerResponse.data, null, 2).length > 500) {
                    responseMessage += '\n... (response truncated)';
                }
                responseMessage += '\n```\n';
            } catch (error) {
                responseMessage += `❌ Seller test failed: ${error.message}\n`;
                if (error.response) {
                    responseMessage += `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}\n`;
                }
            }
            
            // Test 2: Product Search API Call
            responseMessage += '**Test 2**: Product Search API Call...\n';
            try {
                const productsResponse = await axios.get(
                    `https://api.keepa.com/query`, {
                    params: {
                        key: process.env.KEEPA_API_KEY,
                        domain: 3, // UK
                        seller: sellerId,
                        type: 'seller'
                    }
                });
                
                if (productsResponse.data && productsResponse.data.products) {
                    responseMessage += `✅ Search test completed: Found ${productsResponse.data.products.length} products\n`;
                } else {
                    responseMessage += `❌ Search test: No products found in response\n`;
                }
            } catch (error) {
                responseMessage += `❌ Search test failed: ${error.message}\n`;
                if (error.response) {
                    responseMessage += `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}\n`;
                }
            }
            
            // Now show the Amazon fallback approach
            responseMessage += '\n**Test 3**: Fallback to Amazon Scraper...\n';
            try {
                const { getSellerProducts } = require('../utils/amazon_bridge');
                const products = await getSellerProducts(sellerId, 'co.uk', true);
                responseMessage += `✅ Amazon scraper test completed: Found ${products.length} products\n`;
                if (products.length > 0) {
                    responseMessage += `First product: ${products[0].title}\n`;
                }
            } catch (error) {
                responseMessage += `❌ Amazon scraper test failed: ${error.message}\n`;
            }
            
            // Send a detailed reply
            return sendDMResponse(interaction, responseMessage);
        } catch (error) {
            console.error('Error in /apitest command:', error);
            return sendDMResponse(interaction, `❌ An error occurred during API testing: ${error.message}`);
        }
    },
};