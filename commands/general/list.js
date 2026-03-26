/**
 * List Command
 * Show all commands with descriptions (filtered by user permissions)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');
const { sendButtons } = require('gifted-btns');

module.exports = {
  name: 'list',
  aliases: ['commands', 'cmdlist'],
  description: 'List all commands with descriptions',
  usage: '.list',
  category: 'general',
  
  async execute(sock, msg, args, extra) {
    try {
      const { from, sender, isGroup, groupMetadata } = extra;
      const prefix = config.prefix;
      
      // Check user permissions
      const isUserOwner = await database.isOwner(sender);
      const isUserMod = await database.isModerator(sender.split('@')[0]);
      
      // Check if user is subscribed (when self mode is on)
      let isSubscribed = true;
      if (config.selfMode && !isUserOwner) {
        isSubscribed = await database.isUserAllowed(sender);
      }
      
      // Check if user is admin in group
      let isGroupAdmin = false;
      if (isGroup && groupMetadata) {
        // We need to check admin status - this requires access to the group metadata
        // Since extra might not have isAdmin, we'll use a try-catch
        try {
          if (extra.isAdmin) {
            isGroupAdmin = await extra.isAdmin(sock, sender, from, groupMetadata);
          }
        } catch (e) {
          // If we can't check, assume not admin
          isGroupAdmin = false;
        }
      }
      
      const commands = loadCommands();
      const categories = {};
      
      // Group and filter commands by category
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
            canSee = isUserOwner;
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
          const allowedBasic = ['list', 'menu', 'ping', 'info', 'help'];
          canSee = allowedBasic.includes(name);
        }
        
        // For subscribed users in self mode, hide owner commands
        if (config.selfMode && !isUserOwner && isSubscribed) {
          if (cmd.ownerOnly) {
            canSee = false;
          }
        }
        
        if (canSee) {
          const category = (cmd.category || 'other').toLowerCase();
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            name: cmd.name,
            aliases: cmd.aliases || [],
            description: cmd.description || '',
            usage: cmd.usage || `${prefix}${cmd.name}`
          });
        }
      }
      
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
        'owner': '👑 OWNER',
        'other': '📁 OTHER'
      };
      
      // Build menu
      let menu = `*${config.botName} - Commands List*\n`;
      menu += `Prefix: *${prefix}*\n`;
      menu += `Mode: ${config.selfMode ? '🔒 Private' : '🔓 Public'}\n`;
      if (config.selfMode && !isUserOwner) {
        menu += `Status: ${isSubscribed ? '✅ Subscribed' : '⚠️ Limited Access'}\n`;
      }
      menu += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // Display categories in order
      for (const [catKey, catName] of Object.entries(categoryOrder)) {
        if (categories[catKey] && categories[catKey].length > 0) {
          menu += `*📂 ${catName}*\n`;
          
          for (const cmd of categories[catKey]) {
            // Format command list
            const cmdList = [cmd.name, ...cmd.aliases].map(n => `${prefix}${n}`).join(', ');
            const usage = cmd.usage ? `\n   📝 Usage: ${cmd.usage}` : '';
            menu += `• \`${cmdList}\`${usage}\n`;
            if (cmd.description) {
              menu += `   ${cmd.description}\n`;
            }
          }
          menu += '\n';
        }
      }
      
      menu = menu.trimEnd();
      
      // Add footer
      menu += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      menu += `💡 Total commands shown: ${Object.values(categories).reduce((a, b) => a + b.length, 0)}\n`;
      menu += `> *Powered by ${config.botName}*`;
      
      // Send message with buttons
      await sendButtons(sock, extra.from, {
        title: '',
        text: menu,
        footer: `> *Powered by ${config.botName}*`,
        buttons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'Youtube',
              url: config.social?.youtube || 'http://youtube.com/@mr_unique_hacker'
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'Visit Bot Repo',
              url: config.social?.github || 'https://github.com/mruniquehacker'
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'Join Channel',
              url: 'https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A'
            })
          }
        ]
      }, { quoted: msg });
      
    } catch (err) {
      console.error('list.js error:', err);
      await extra.reply('❌ Failed to load commands list.');
    }
  }
};
