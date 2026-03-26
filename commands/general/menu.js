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
      const { from, sender, isGroup, reply } = extra;
      
      // Check if user is owner
      const isUserOwner = await database.isOwner(sender);
      
      // Check if user is subscribed (when self mode is on)
      let isSubscribed = true;
      if (config.selfMode && !isUserOwner) {
        isSubscribed = await database.isUserAllowed(sender);
      }
      
      const commands = loadCommands();
      const categories = {};
      
      // Group commands by category with permission filtering
      commands.forEach((cmd, name) => {
        if (cmd.name === name) { // Only count main command names, not aliases
          
          // Determine if this command should be shown to current user
          let shouldShow = true;
          
          // Owner-only commands: only visible to owner
          if (cmd.ownerOnly) {
            shouldShow = isUserOwner;
          }
          // Admin-only commands: visible to owner only in self mode
          else if (cmd.adminOnly) {
            if (config.selfMode && !isUserOwner) {
              shouldShow = false;
            } else {
              shouldShow = true;
            }
          }
          // Group-only commands
          else if (cmd.groupOnly) {
            shouldShow = isGroup;
          }
          // Private-only commands
          else if (cmd.privateOnly) {
            shouldShow = !isGroup;
          }
          
          // In self mode, non-subscribed users only see limited commands
          if (config.selfMode && !isUserOwner && !isSubscribed) {
            const allowedBasic = ['menu', 'ping', 'info', 'help'];
            shouldShow = allowedBasic.includes(cmd.name);
          }
          
          if (shouldShow) {
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
      menuText += `🔒 Mode: ${config.selfMode ? 'Private' : 'Public'}\n`;
      if (config.selfMode && !isUserOwner) {
        menuText += `📋 Status: ${isSubscribed ? 'Subscribed ✅' : 'Limited Access 🔒'}\n`;
      }
      menuText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // General Commands (visible to everyone)
      if (categories.general && categories.general.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 🧭 GENERAL COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.general.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // Media Commands (visible to everyone)
      if (categories.media && categories.media.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 🎞️ MEDIA COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.media.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // Fun Commands (visible to everyone)
      if (categories.fun && categories.fun.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 🎭 FUN COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.fun.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // Utility Commands (visible to everyone)
      if (categories.utility && categories.utility.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 🔧 UTILITY COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.utility.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // AI Commands (visible to everyone)
      if (categories.ai && categories.ai.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 🤖 AI COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.ai.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // Anime Commands (visible to everyone)
      if (categories.anime && categories.anime.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 👾 ANIME COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.anime.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // Textmaker Commands (visible to everyone)
      if (categories.textmaker && categories.textmaker.length > 0) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 🖋️ TEXTMAKER COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.textmaker.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      // Group Commands (visible to owners only in self mode, visible to admins in public mode)
      if (categories.group && categories.group.length > 0) {
        let shouldShowGroup = true;
        if (config.selfMode && !isUserOwner) {
          shouldShowGroup = false;
        }
        
        if (shouldShowGroup) {
          menuText += `┏━━━━━━━━━━━━━━━━━\n`;
          menuText += `┃ 🔵 GROUP COMMANDS\n`;
          menuText += `┗━━━━━━━━━━━━━━━━━\n`;
          categories.group.forEach(cmd => {
            menuText += `│ ➜ ${config.prefix}${cmd.name}`;
            if (cmd.description) menuText += ` - ${cmd.description}`;
            menuText += `\n`;
          });
          menuText += `\n`;
        }
      }
      
      // Admin Commands (only visible to owners in self mode)
      if (categories.admin && categories.admin.length > 0) {
        let shouldShowAdmin = false;
        if (!config.selfMode) {
          shouldShowAdmin = true;
        } else if (isUserOwner) {
          shouldShowAdmin = true;
        }
        
        if (shouldShowAdmin) {
          menuText += `┏━━━━━━━━━━━━━━━━━\n`;
          menuText += `┃ 🛡️ ADMIN COMMANDS\n`;
          menuText += `┗━━━━━━━━━━━━━━━━━\n`;
          categories.admin.forEach(cmd => {
            menuText += `│ ➜ ${config.prefix}${cmd.name}`;
            if (cmd.description) menuText += ` - ${cmd.description}`;
            menuText += `\n`;
          });
          menuText += `\n`;
        }
      }
      
      // Moderator Commands (only visible to owners in self mode)
      if (categories.mod && categories.mod.length > 0) {
        let shouldShowMod = false;
        if (!config.selfMode) {
          shouldShowMod = true;
        } else if (isUserOwner) {
          shouldShowMod = true;
        }
        
        if (shouldShowMod) {
          menuText += `┏━━━━━━━━━━━━━━━━━\n`;
          menuText += `┃ 🛡️ MODERATOR COMMANDS\n`;
          menuText += `┗━━━━━━━━━━━━━━━━━\n`;
          categories.mod.forEach(cmd => {
            menuText += `│ ➜ ${config.prefix}${cmd.name}`;
            if (cmd.description) menuText += ` - ${cmd.description}`;
            menuText += `\n`;
          });
          menuText += `\n`;
        }
      }
      
      // Owner Commands (only visible to owners)
      if (categories.owner && categories.owner.length > 0 && isUserOwner) {
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ 👑 OWNER COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories.owner.forEach(cmd => {
          menuText += `│ ➜ ${config.prefix}${cmd.name}`;
          if (cmd.description) menuText += ` - ${cmd.description}`;
          menuText += `\n`;
        });
        menuText += `\n`;
      }
      
      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      menuText += `💡 Type ${config.prefix}help <command> for more info\n`;
      menuText += `🌟 Bot Version: 1.0.0\n`;
      
      // Send menu with image
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
      console.error('Menu error:', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
