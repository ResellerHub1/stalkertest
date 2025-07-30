const { SlashCommandBuilder } = require('discord.js');
const { fetchSellerInventory } = require('../utils/keepaClient');
const { getUserData, saveUserData } = require('../utils/userData');

const membershipLimits = {
  Basic: 0,
  Silver: 2,
  Gold: 5,
  Chiefs: Infinity,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stalk')
    .setDescription('Start tracking a seller by their Amazon seller ID')
    .addStringOption(option =>
      option.setName('sellerid')
        .setDescription('Amazon seller ID to track')
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const sellerId = interaction.options.getString('sellerid').trim();
    const { sendDMResponse } = require('../utils/messageUtils');

    // First, acknowledge the interaction to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    try {
      // Fetch user data with proper structure
      const userData = await getUserData(userId, interaction.member);
      const tier = userData.membership;
      
      // Check for admin-adjusted quota override first, then fall back to tier-based limit
      const limit = userData.quotaOverride !== null && userData.quotaOverride !== undefined ? userData.quotaOverride : membershipLimits[tier];

      // Check against trackedSellers (corrected from 'sellers')
      if (userData.trackedSellers.includes(sellerId)) {
        return sendDMResponse(interaction, '❌ You are already tracking this seller.');
      }

      if (userData.trackedSellers.length >= limit) {
        // If using quota override, show a different message
        if (userData.quotaOverride !== null) {
          return sendDMResponse(interaction, `🚫 You have reached your custom tracking limit of **${limit}** sellers.`);
        } else {
          return sendDMResponse(interaction, `🚫 You have reached your tracking limit for the **${tier}** tier.`);
        }
      }

      // Add to trackedSellers (not 'sellers')
      userData.trackedSellers.push(sellerId);
      
      // Initialize the seenASINs entry for this seller
      if (!userData.seenASINs[sellerId]) {
        userData.seenASINs[sellerId] = [];
      }
      
      // Update global tracking data with new seller
      if (typeof global.latestSellerData === 'undefined') {
        global.latestSellerData = {};
      }
      
      if (!global.latestSellerData[userId]) {
        global.latestSellerData[userId] = { trackedSellers: [] };
      }
      
      global.latestSellerData[userId].trackedSellers = [...userData.trackedSellers];
      console.log(`✅ Updated global tracking data for user ${userId}, now tracking ${global.latestSellerData[userId].trackedSellers.length} sellers`);

      // Save the updated user data (before caching products)
      await saveUserData(userId);
      
      // Tell the user we're tracking their seller
      await sendDMResponse(interaction, `✅ Now tracking seller: \`${sellerId}\`. Initial inventory scan is starting...`);
      
      try {
        // Silently cache all current products from this seller without sending notifications
        console.log(`🔍 Silently caching inventory for seller ${sellerId} (Initial tracking setup)`);
        const initialProducts = await fetchSellerInventory(sellerId, true); // Force refresh
        
        if (initialProducts && initialProducts.length > 0) {
          console.log(`✅ Found ${initialProducts.length} products in initial scan for seller ${sellerId}`);
          
          // Add all current products to seenASINs to avoid initial notification spam
          initialProducts.forEach(product => {
            if (product.asin && !userData.seenASINs[sellerId].includes(product.asin)) {
              userData.seenASINs[sellerId].push(product.asin);
            }
          });
          
          // Save after caching initial inventory
          await saveUserData(userId);
          
          // Send a follow-up DM to inform the user about the initial caching
          const user = await interaction.client.users.fetch(userId);
          await user.send(`✅ Initial inventory scan complete for seller \`${sellerId}\`. Found ${initialProducts.length} products.
The bot will now track this seller and notify you about new products going forward.`);
        }
      } catch (cacheError) {
        console.error(`Error caching initial inventory: ${cacheError.message}`);
        // Don't alert the user about this error, tracking is already set up
      }
      
      return; // No need to respond again
    } catch (err) {
      console.error('Error in /stalk command:', err);
      return sendDMResponse(interaction, '⚠️ Failed to update your tracking data. Please try again later.');
    }
  }
};
