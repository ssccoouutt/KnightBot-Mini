/**
 * Menu Command - Display all available commands with permission filtering
 */

const config = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',
  
  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const categories = {};
      
      // Get user info
      const sender = extra.sender;
      const isGroup = extra.isGroup;
      const isUserOwner = await database.isOwner(sender);
      
      // Check if user is subscribed (when self mode is on)
      let isSubscribed = true;
      if (config.selfMode && !isUserOwner) {
        isSubscribed = await database.isUserAllowed(sender);
      }
      
      // Group commands by category with permission filtering
      commands.forEach((cmd, name) => {
        if (cmd.name === name) { // Only count main command names, not aliases
          
          // Determine if user can see this command
          let canSee = true;
          
          // Owner-only commands: only visible to owner
          if (cmd.ownerOnly) {
            canSee = isUserOwner;
          }
          // Admin-only commands: visible to owner and group admins (only in groups)
          else if (cmd.adminOnly) {
            if (isGroup) {
              // Check if user is admin in the group
              const groupMetadata = extra.groupMetadata;
              const isAdmin = groupMetadata && await extra.isAdmin(sock, sender, extra.from, groupMetadata);
              canSee = isUserOwner || isAdmin;
            } else {
              canSee = isUserOwner;
            }
          }
          // Mod-only commands: visible to owner and mods
          else if (cmd.modOnly) {
            const isMod = await database.isModerator(sender.split('@')[0]);
            canSee = isUserOwner || isMod;
          }
          // Group-only commands: visible to everyone in groups
          else if (cmd.groupOnly) {
            canSee = isGroup;
          }
          // Private-only commands: visible to everyone in private chat
          else if (cmd.privateOnly) {
            canSee = !isGroup;
          }
          
          // In self mode, non-owner users see limited commands
          if (config.selfMode && !isUserOwner && !isSubscribed) {
            // Only allow basic commands for non-subscribed users
            const allowedBasic = ['menu', 'ping', 'info', 'help'];
            canSee = allowedBasic.includes(name);
          }
          
          if (canSee) {
            const category = cmd.category || 'general';
            if (!categories[category]) {
              categories[category] = [];
            }
            categories[category].push(cmd);
          }
        }
      });
      
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      
      let menuText = `╭━━『 *${config.botName}* 』━━╮\n\n`;
      menuText += `👋 Hello @${sender.split('@')[0]}!\n\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      
      // Show status info
      if (config.selfMode) {
        if (isUserOwner) {
          menuText += `👑 Role: Owner\n`;
        } else if (isSubscribed) {
          menuText += `✅ Status: Subscribed User\n`;
        } else {
          menuText += `🔒 Status: Limited Access\n`;
        }
      }
      
      menuText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // Category display names and order
      const categoryOrder = {
        'general': '📌 GENERAL COMMANDS',
        'media': '🎵 MEDIA COMMANDS',
        'group': '👥 GROUP COMMANDS',
        'admin': '🛡️ ADMIN COMMANDS',
        'mod': '🛡️ MODERATOR COMMANDS',
        'fun': '🎮 FUN COMMANDS',
        'ai': '🤖 AI COMMANDS',
        'utility': '🔧 UTILITY COMMANDS',
        'anime': '👾 ANIME COMMANDS',
        'textmaker': '🖋️ TEXTMAKER COMMANDS',
        'owner': '👑 OWNER COMMANDS'
      };
      
      // Category icons
      const categoryIcons = {
        'general': '📌',
        'media': '🎵',
        'group': '👥',
        'admin': '🛡️',
        'mod': '🛡️',
        'fun': '🎮',
        'ai': '🤖',
        'utility': '🔧',
        'anime': '👾',
        'textmaker': '🖋️',
        'owner': '👑'
      };
      
      // Filter out categories for non-owner users in self mode
      let filteredCategories = Object.keys(categories);
      
      if (config.selfMode && !isUserOwner) {
        // Non-owner users should NOT see owner and admin categories
        filteredCategories = filteredCategories.filter(cat => 
          cat !== 'owner' && cat !== 'admin' && cat !== 'mod'
        );
      }
      
      // Display categories in order
      for (const [catKey, catName] of Object.entries(categoryOrder)) {
        if (filteredCategories.includes(catKey) && categories[catKey] && categories[catKey].length > 0) {
          menuText += `┏━━━━━━━━━━━━━━━━━\n`;
          menuText += `┃ ${catName}\n`;
          menuText += `┗━━━━━━━━━━━━━━━━━\n`;
          
          categories[catKey].forEach(cmd => {
            menuText += `│ ➜ ${config.prefix}${cmd.name}\n`;
          });
          menuText += `\n`;
        }
      }
      
      // Display any remaining categories not in order
      for (const cat of filteredCategories) {
        if (!categoryOrder[cat] && categories[cat] && categories[cat].length > 0) {
          const icon = categoryIcons[cat] || '📁';
          menuText += `┏━━━━━━━━━━━━━━━━━\n`;
          menuText += `┃ ${icon} ${cat.toUpperCase()} COMMANDS\n`;
          menuText += `┗━━━━━━━━━━━━━━━━━\n`;
          
          categories[cat].forEach(cmd => {
            menuText += `│ ➜ ${config.prefix}${cmd.name}\n`;
          });
          menuText += `\n`;
        }
      }
      
      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      menuText += `💡 Type ${config.prefix}help <command> for more info\n`;
      menuText += `🌟 Total Commands: ${commands.size}\n`;
      
      // Send menu with image
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [sender],
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: config.newsletterJid || '120363304414452603@newsletter',
              newsletterName: config.botName,
              serverMessageId: -1
            }
          }
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: [sender]
        }, { quoted: msg });
      }
      
    } catch (error) {
      console.error('Menu error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
