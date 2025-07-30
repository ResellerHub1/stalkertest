/**
 * Utility functions for consistent message handling
 * Ensures all bot responses are sent via DM instead of ephemeral messages
 * Also provides logging to a central channel when configured
 */

/**
 * Send a message to the log channel if configured
 * @param {Object} client - Discord client
 * @param {string} message - Message to log
 * @returns {Promise} - Resolves when the message is sent or silently continues
 */
async function sendToLogChannel(client, message) {
  if (!process.env.LOG_CHANNEL_ID) {
    return; // No log channel configured
  }
  
  try {
    console.log(`🔍 Attempting to send to log channel: ${process.env.LOG_CHANNEL_ID}`);
    const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
    
    if (logChannel) {
      await logChannel.send(message);
      console.log(`📢 Successfully logged to channel #${logChannel.name}`);
      return true;
    } else {
      console.error(`⚠️ Log channel not found with ID: ${process.env.LOG_CHANNEL_ID}`);
    }
  } catch (error) {
    console.error(`⚠️ Error sending to log channel: ${error.message}`);
  }
  
  return false;
}

/**
 * Send a message to a user via DM and acknowledge in channel
 * @param {Object} interaction - Discord interaction object
 * @param {string} message - Message to send via DM
 * @param {boolean} logToChannel - Whether to also log this message to the log channel
 * @returns {Promise} - Resolves when messages are sent
 */
async function sendDMResponse(interaction, message, logToChannel = false) {
  try {
    console.log(`📨 Attempting to send DM to ${interaction.user.tag} (${interaction.user.id})`);
    console.log(`📨 Message content: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    // First send the message via DM
    await interaction.user.send(message);
    console.log(`✅ DM sent successfully to ${interaction.user.tag}`);
    
    // Log to channel if requested
    if (logToChannel && process.env.LOG_CHANNEL_ID) {
      try {
        await sendToLogChannel(
          interaction.client, 
          `📊 Notification for ${interaction.user.tag}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`
        );
      } catch (logError) {
        console.error(`⚠️ Failed to log to channel:`, logError);
      }
    }
    
    // Then acknowledge the interaction in channel
    const response = interaction.deferred || interaction.replied 
      ? 'editReply'
      : 'reply';
    
    console.log(`📨 Acknowledging interaction with ${response}`);
    
    // Standard acknowledgment text
    return interaction[response]({
      content: '✅ Check your DMs for a response.',
      ephemeral: true
    }).then(() => {
      console.log(`✅ Interaction acknowledged successfully`);
    }).catch(err => {
      console.error(`❌ Failed to acknowledge interaction:`, err);
      // If acknowledge fails, just log it and continue
    });
  } catch (error) {
    console.error(`❌ Error sending DM to ${interaction.user.tag}:`, error);
    
    // If DM fails, send error message in channel
    const response = interaction.deferred || interaction.replied 
      ? 'editReply'
      : 'reply';
    
    return interaction[response]({
      content: '⚠️ Failed to send you a DM. Please check your privacy settings and try again.',
      ephemeral: true
    }).catch(err => {
      console.error(`❌ Failed to send error message:`, err);
    });
  }
}

/**
 * Format a product for DM notification
 * @param {Object} product - Product data
 * @param {string} sellerId - ID of the seller
 * @param {string} sellerName - Store name of the seller (optional)
 * @returns {string} - Formatted message
 */
function formatProductNotification(product, sellerId, sellerName = null) {
  // Get the price text if available
  let price = 'N/A';
  if (product.price_text) {
    price = product.price_text;
  } else if (product.sellerInfo && product.sellerInfo.price) {
    price = `£${product.sellerInfo.price.toFixed(2)}`;
  } else if (product.buyBoxPrice) {
    price = `£${(product.buyBoxPrice / 100).toFixed(2)}`;
  }
  
  // Get the condition if available
  let condition = '';
  if (product.sellerInfo && product.sellerInfo.condition) {
    const conditionMap = {
      0: 'New',
      1: 'Used - Like New',
      2: 'Used - Very Good',
      3: 'Used - Good',
      4: 'Used - Acceptable',
      5: 'Collectible - Like New',
      6: 'Collectible - Very Good',
      7: 'Collectible - Good',
      8: 'Collectible - Acceptable',
      9: 'Refurbished',
      10: 'Club'
    };
    condition = conditionMap[product.sellerInfo.condition] || 'Unknown';
    condition = `\nCondition: ${condition}`;
  }
  
  // Add source information
  const source = product.source === 'keepa' ? ' (via Keepa)' : ' (via Direct Scraping)';
  
  // Use seller name if available, otherwise fall back to ID
  const sellerDisplay = sellerName && sellerName.trim() ? sellerName : sellerId;
  
  return `📦 New Product Found from ${sellerDisplay}!${source}\nMarketplace: Amazon UK\nASIN: ${product.asin}\nPrice: ${price}${condition}\nName: ${product.title}\nLink: https://www.amazon.co.uk/dp/${product.asin}`;
}

/**
 * Send a direct product notification to a user
 * @param {Object} user - Discord user object
 * @param {Object} product - Product data
 * @param {string} sellerId - ID of the seller
 * @returns {Promise} - Resolves when the message is sent
 */
async function sendProductNotification(user, product, sellerId) {
  try {
    // Try to get the seller's store name for better user experience
    let sellerName = null;
    try {
      const { getSellerName } = require('./amazon_bridge');
      sellerName = await getSellerName(sellerId, 'co.uk');
    } catch (nameError) {
      console.log(`⚠️ Could not fetch seller name for ${sellerId}: ${nameError.message}`);
    }
    
    // Create the notification message with seller name if available
    const notification = formatProductNotification(product, sellerId, sellerName);
    
    // Log the attempt
    console.log(`🔔 Sending notification to ${user.tag} (${user.id}) about product ${product.asin}`);
    
    // Special handling for member who had DM issues
    const isPriorityUser = user.id === '1064266465647276045';
    if (isPriorityUser) {
      console.log(`⚠️ PRIORITY USER DETECTED: ${user.tag} (${user.id}) - Using enhanced delivery protocol`);
    }
    
    // Increased retries for problematic users
    let dmSent = false;
    let retryCount = 0;
    const maxRetries = isPriorityUser ? 5 : 3; // More retries for priority user
    const initialDelay = isPriorityUser ? 1000 : 2000; // Shorter initial delay for priority user
    
    while (!dmSent && retryCount < maxRetries) {
      try {
        await user.send(notification);
        console.log(`📨 Successfully sent DM to ${user.tag} (${user.id}) about product ${product.asin}`);
        dmSent = true;
      } catch (dmError) {
        retryCount++;
        console.error(`⚠️ Error sending DM to ${user.tag} (${user.id}), attempt ${retryCount}/${maxRetries}: ${dmError.message}`);
        
        if (retryCount < maxRetries) {
          // Wait before retry with exponential backoff
          const backoffTime = initialDelay * Math.pow(1.5, retryCount - 1);
          console.log(`⏱️ Waiting ${backoffTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }
    
    // Always duplicate to log channel if configured, regardless of DM success
    // This ensures we have a record of all notifications
    if (process.env.LOG_CHANNEL_ID) {
      try {
        const logChannel = await user.client.channels.fetch(process.env.LOG_CHANNEL_ID);
        if (logChannel) {
          // Format the log channel message
          const logPrefix = isPriorityUser ? '🚨 PRIORITY USER - ' : '';
          const statusText = dmSent ? 'DM sent to' : 'FAILED to send DM to';
          const sellerDisplay = sellerName && sellerName.trim() ? sellerName : sellerId;
          
          const logMessage = `${logPrefix}${statusText} @${user.username} (${user.id}):\n📦 New Product Found from ${sellerDisplay}! (via Direct Scraping)\nMarketplace: Amazon UK\nASIN: ${product.asin}\nPrice: ${product.price_text || 'N/A'}\nName: ${product.title}\nLink: https://www.amazon.co.uk/dp/${product.asin}`;
          await logChannel.send(logMessage);
          console.log(`📢 Duplicated notification to channel #${logChannel.name}`);
          
          // Add more detailed status message for priority users
          const channelMessage = `🔔 ${dmSent ? 'Sent' : 'FAILED to send'} notification: ${product.asin} from ${sellerDisplay} to ${user.tag} (${user.id})`;
          await logChannel.send(channelMessage);
          
          // For priority users who fail, add an admin alert
          if (isPriorityUser && !dmSent) {
            await logChannel.send(`🔴 **ADMIN ALERT**: Unable to deliver DM to priority user ${user.tag} (${user.id}) after ${maxRetries} attempts. Please contact user manually about new product from seller ${sellerId}.`);
          }
        }
      } catch (channelError) {
        console.error(`⚠️ Error posting to log channel:`, channelError.message);
      }
    }
    
    return dmSent;
  } catch (error) {
    console.error(`⚠️ Error in notification process for ${user.tag} (${user.id}):`, error.message);
    return false;
  }
}

module.exports = {
  sendDMResponse,
  formatProductNotification,
  sendToLogChannel,
  sendProductNotification
};