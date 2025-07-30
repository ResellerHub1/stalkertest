const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getUserData } = require('../utils/userData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellersstalked')
    .setDescription('Admin command: View all member tracking assignments')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    console.log(`📋 sellersstalked command executed by ${interaction.user.username}`);
    
    try {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await interaction.reply({ 
          content: 'This command is restricted to administrators only.', 
          ephemeral: true 
        });
      }

      console.log(`📋 Admin permission check passed for ${interaction.user.username}`);

      // Respond immediately to avoid timeout
      try {
        await interaction.reply({ 
          content: 'Generating tracking report... Please check your DMs.', 
          ephemeral: true 
        });
      } catch (replyError) {
        console.error('Reply error:', replyError);
        // Continue with DM generation even if reply fails
      }
      
      console.log(`📋 Initial reply sent to ${interaction.user.username}`);

      const allUserData = await getUserData();
      
      let reportLines = ['**Complete Member Tracking Report**\n'];
      let totalMembers = 0;
      let totalSellers = 0;
      let activeMemberCount = 0;

      // Build report for each user with tracking data
      for (const userId in allUserData) {
        const userData = allUserData[userId];
        
        if (userData.trackedSellers && userData.trackedSellers.length > 0) {
          totalMembers++;
          activeMemberCount++;
          
          const membershipTier = userData.membership || 'Basic';
          reportLines.push(`**Member - ${userId}** (${membershipTier})`);
          
          // List each tracked seller
          for (let i = 0; i < userData.trackedSellers.length; i++) {
            const sellerId = userData.trackedSellers[i];
            totalSellers++;
            reportLines.push(`${i + 1}) ${sellerId}`);
          }
          
          reportLines.push(''); // Empty line between members
        } else {
          totalMembers++;
        }
      }

      // Add summary at the end
      reportLines.push(`**Summary:**`);
      reportLines.push(`• Total members in system: ${totalMembers}`);
      reportLines.push(`• Active tracking members: ${activeMemberCount}`);
      reportLines.push(`• Total seller assignments: ${totalSellers}`);
      reportLines.push(`• Inactive members: ${totalMembers - activeMemberCount}`);

      // Send as DM to avoid timeout issues
      const user = await interaction.client.users.fetch(interaction.user.id);
      const fullReport = reportLines.join('\n');
      
      if (fullReport.length > 1900) {
        // Split into multiple DM messages
        const chunks = [];
        let currentChunk = '';
        
        for (const line of reportLines) {
          if ((currentChunk + line + '\n').length > 1900) {
            chunks.push(currentChunk);
            currentChunk = line + '\n';
          } else {
            currentChunk += line + '\n';
          }
        }
        
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        // Send all chunks as DMs
        for (const chunk of chunks) {
          await user.send(chunk);
        }
        
      } else {
        await user.send(fullReport);
      }

      console.log(`📋 Admin ${interaction.user.username} requested tracking report: ${activeMemberCount} active members, ${totalSellers} total assignments`);

    } catch (error) {
      console.error('Error generating tracking report:', error);
      try {
        const user = await interaction.client.users.fetch(interaction.user.id);
        await user.send('Error generating tracking report. Please check the logs.');
      } catch (dmError) {
        console.error('Could not send error DM:', dmError);
      }
    }
  }
};