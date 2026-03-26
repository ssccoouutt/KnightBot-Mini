/**
 * Menu Command - Display available commands with permission filtering
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
      const { from, sender, isGroup, groupMetadata, reply } = extra;
      
      // Check if user is owner
      const isUserOwner = await database.isOwner(sender);
      
      // Check if user is moderator
      const isUserMod = await database.isModerator(sender.split('@')[0]);
      
      // Check if user is subscribed (when self mode is on)
      let isSubscribed = true;
      if (config.selfMode && !isUserOwner) {
        isSubscribed = await database.isUserAllowed(sender);
      }
      
      // Check if user is admin in group
      let isGroupAdmin = false;
      if (isGroup && groupMetadata) {
        isGroupAdmin = await extra.isAdmin(sock, sender, from, groupMetadata);
      }
      
      // Get all commands
      const commands = loadCommands();
      const categories = {};
      
      // Filter and categorize commands
      for (const [name, cmd] of commands) {
        // Only process main command names, not aliases
        if (cmd.name !== name) continue;
        
        // Determine if user can see this command
        let canSee = true;
        
        // Owner-only commands: only visible to owner
        if (cmd.ownerOnly) {
          canSee = isUserOwner;
        }
        // Mod-only commands: visible to owner and mods
        else if (cmd.modOnly) {
          canSee = isUserOwner || isUserMod;
        }
        // Admin-only commands: visible to owner and group admins (only in groups)
        else if (cmd.adminOnly) {
          if (isGroup) {
            canSee = isUserOwner || isGroupAdmin;
          } else {
            canSee = isUserOwner; // In private chat, only owner can see admin commands
          }
        }
        // Group-only commands: visible to everyone in groups
        else if (cmd.groupOnly) {
          canSee = isGroup;
        }
        // Private-only commands: visible to everyone in private chat
        else if (cmd.privateOnly) {
          canSee = !isGroup;
        }
        
        // In self mode, non-owner non-subscribed users see only basic commands
        if (config.selfMode && !isUserOwner && !isSubscribed) {
          const allowedBasic = ['menu', 'ping', 'info', 'help'];
          canSee = allowedBasic.includes(name);
        }
        
        // For subscribed users in self mode, they see non-owner commands
        if (config.selfMode && !isUserOwner && isSubscribed) {
          // Hide owner commands from subscribed users
          if (cmd.ownerOnly) {
            canSee = false;
          }
          // Hide mod/admin commands from subscribed users (optional)
          if (cmd.modOnly || cmd.adminOnly) {
            // Uncomment below if you want subscribed users to see admin commands
            // canSee = true;
          }
        }
        
        if (canSee) {
          const category = cmd.category || 'general';
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push(cmd);
        }
      }
      
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      
      // Build menu header
      let menuText = `╭━━『 *${config.botName}* 』━━╮\n\n`;
      menuText += `👋 Hello @${sender.split('@')[0]}!\n\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      menuText += `🔒 Mode: ${config.selfMode ? 'Private' : 'Public'}\n`;
      if (config.selfMode && !isUserOwner) {
        menuText += `📋 Status: ${isSubscribed ? 'Subscribed ✅' : 'Limited 🔒'}\n`;
      }
      menuText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // Category display order and names
      const categoryOrder = {
        'general': '📌 GENERAL',
        'media': '🎵 MEDIA',
        'group': '👥 GROUP',
        'admin': '🛡️ ADMIN',
        'mod': '🔰 MODERATOR',
        'fun': '🎮 FUN',
        'utility': '🔧 UTILITY',
        'anime': '👾 ANIME',
        'textmaker': '🖋️ TEXTMAKER',
        'owner': '👑 OWNER'
      };
      
      // Display categories in order
      for (const [catKey, catName] of Object.entries(categoryOrder)) {
        if (categories[catKey] && categories[catKey].length > 0) {
          menuText += `┏━━━━━━━━━━━━━━━━━\n`;
          menuText += `┃ ${catName}\n`;
          menuText += `┗━━━━━━━━━━━━━━━━━\n`;
          
          categories[catKey].forEach(cmd => {
            // Add description if available
            const desc = cmd.description ? ` - ${cmd.description.substring(0, 30)}` : '';
            menuText += `│ ➜ ${config.prefix}${cmd.name}${desc}\n`;
          });
          menuText += `\n`;
        }
      }
      
      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      menuText += `💡 Type ${config.prefix}help <command> for more info\n`;
      menuText += `🌟 Bot Version: 1.0.0\n`;
      
      // Send menu
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [extra.sender],
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
          mentions: [extra.sender]
        }, { quoted: msg });
      }
      
    } catch (error) {
      console.error('[MENU] Error:', error);
      await extra.reply(`❌ Error loading menu: ${error.message}`);
    }
  }
};
