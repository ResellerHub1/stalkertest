const { SlashCommandBuilder } = require('discord.js');
const { getUserData } = require('../utils/userData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkstalk')
    .setDescription('Check your current tracked sellers.'),

  async execute(interaction) {
    const { sendDMResponse } = require('../utils/messageUtils');
    
    try {
      // First generate the message, then defer the reply
      const userId = interaction.user.id;
      const userData = await getUserData(userId, interaction.member);
      
      // Using trackedSellers instead of sellers
      const sellers = userData.trackedSellers || [];
      
      // Debug output to help diagnose tracker issues
      console.log(`🔍 User ${userId} (${interaction.user.tag}) has trackedSellers:`, sellers);
      
      // Initialize global tracking data if needed
      if (typeof global.latestSellerData === 'undefined') {
        global.latestSellerData = {};
      }
      
      // Initialize data for this user if needed
      if (!global.latestSellerData[userId]) {
        global.latestSellerData[userId] = { 
          trackedSellers: userData.trackedSellers ? [...userData.trackedSellers] : [] 
        };
      }
      
      // Ensure the userData is correctly reflecting the latest state
      if (global.latestSellerData[userId]) {
        const latestSellers = global.latestSellerData[userId].trackedSellers || [];
        console.log(`🔄 Latest tracking data has ${latestSellers.length} sellers for ${userId}`);
        
        // If either source has more sellers, merge them to ensure we have the complete list
        if (latestSellers.length !== sellers.length) {
          console.log(`⚠️ Merging tracking data: userData has ${sellers.length} sellers, global has ${latestSellers.length} sellers`);
          
          // Create a combined, deduplicated list
          const allSellers = new Set([...sellers, ...latestSellers]);
          userData.trackedSellers = Array.from(allSellers);
          
          // Update both sources
          global.latestSellerData[userId].trackedSellers = [...userData.trackedSellers];
          
          // Persist changes
          const { saveUserData } = require('../utils/userData');
          await saveUserData(userId);
          
          console.log(`✅ Synchronized tracking data with ${userData.trackedSellers.length} total sellers`);
        }
      }

      if (!Array.isArray(sellers) || sellers.length === 0) {
        // Don't defer first, send direct response
        return interaction.reply({ 
          content: '✅ Check your DMs for a response.',
          ephemeral: true 
        }).then(() => {
          interaction.user.send('📭 You are not tracking any sellers.');
        }).catch(err => {
          console.error('Failed to send response:', err);
          interaction.followUp({ 
            content: '⚠️ Failed to send DM. Please check your privacy settings.',
            ephemeral: true 
          }).catch(console.error);
        });
      }

      // Check if there are any invalid seller IDs and report them
      const validSellers = [];
      const invalidSellers = [];
      
      for (const id of sellers) {
        if (typeof id === 'string' && id.trim() && id.trim().length > 0) {
          const cleanId = id.trim();
          // Basic validation for Amazon seller ID format (usually alphanumeric, 13-14 chars)
          if (/^[A-Z0-9]{10,15}$/.test(cleanId)) {
            validSellers.push(cleanId);
          } else {
            console.warn(`⚠️ Invalid seller ID format: ${cleanId}`);
            invalidSellers.push(id);
          }
        } else {
          invalidSellers.push(id);
        }
      }
      
      // Remove any duplicates
      const uniqueValidSellers = [...new Set(validSellers)];
      
      if (invalidSellers.length > 0) {
        console.warn(`⚠️ Found ${invalidSellers.length} invalid seller IDs for user ${userId}`);
      }

      // Build the list with valid sellers and fetch their store names
      const { getSellerName } = require('../utils/amazon_bridge');
      const listItems = [];
      
      for (let idx = 0; idx < uniqueValidSellers.length; idx++) {
        const sellerId = uniqueValidSellers[idx];
        try {
          // Try to get the seller's store name
          const sellerName = await getSellerName(sellerId, 'co.uk');
          if (sellerName && sellerName.trim()) {
            listItems.push(`${idx + 1}. ${sellerName} (${sellerId})`);
          } else {
            listItems.push(`${idx + 1}. ${sellerId}`);
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch name for seller ${sellerId}:`, error.message);
          listItems.push(`${idx + 1}. ${sellerId}`);
        }
      }
      
      const list = listItems.join('\n');
      
      // Determine the user's quota
      const membershipLimits = {
        Basic: 0,
        Silver: 2,
        Gold: 5,
        Chiefs: Infinity,
      };
      
      const tier = userData.membership || 'Basic';
      const normalLimit = membershipLimits[tier] || 0;
      const actualLimit = userData.quotaOverride !== null ? userData.quotaOverride : normalLimit;
      let quotaMessage = '';
      
      if (userData.quotaOverride !== null) {
        quotaMessage = `\n🔹 You have a custom quota allowing you to track up to **${actualLimit}** sellers (Admin adjusted)`;
      } else {
        quotaMessage = `\n🔹 Your **${tier}** membership allows you to track up to **${actualLimit}** sellers`;
      }
      
      // Send the list via DM with additional info about products being tracked
      let message = `📋 You are tracking the following sellers (${uniqueValidSellers.length}/${actualLimit}):\n${list}\n`;
      message += quotaMessage;
      
      // Check if any products have been found for each seller
      for (const sellerId of uniqueValidSellers) {
        const productCount = userData.seenASINs?.[sellerId]?.length || 0;
        message += `\n${sellerId}: ${productCount} products being tracked`;
      }
      
      // Add warning message at the end if there was an issue
      if (invalidSellers.length > 0) {
        message += `\n\n⚠️ Removed ${invalidSellers.length} invalid seller ID(s) from your tracking list.`;
        
        // Clean up the userData by removing invalid sellers
        userData.trackedSellers = uniqueValidSellers;
        const { saveUserData } = require('../utils/userData');
        await saveUserData(userId);
      }

      // Reply first, then send DM
      await interaction.reply({ 
        content: '✅ Check your DMs for a response.',
        ephemeral: true 
      });
      
      // Send the DM separately
      await interaction.user.send(message);
      
      // Also duplicate to admin channel if needed
      if (process.env.LOG_CHANNEL_ID) {
        try {
          const logChannel = await interaction.client.channels.fetch(process.env.LOG_CHANNEL_ID);
          if (logChannel) {
            await logChannel.send(`📋 Tracked sellers list for ${interaction.user.tag}:\n${list}`);
          }
        } catch (logError) {
          console.error(`⚠️ Error posting to log channel:`, logError);
        }
      }
      
      return;
    } catch (error) {
      console.error('❌ Error in /checkstalk:', error);
      
      // If there was an error, try to notify without using the same interaction
      try {
        // If we haven't replied yet, do a simple reply
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '⚠️ There was an error processing your request. Check your DMs.',
            ephemeral: true 
          });
        }
        
        // Send DM directly
        await interaction.user.send('⚠️ Something went wrong while fetching your tracked sellers.');
        
      } catch (followUpError) {
        console.error('Failed to send error notification:', followUpError);
      }
      
      return;
    }
  }
};
