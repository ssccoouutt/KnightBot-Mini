/**
 * List Command
 * Show all commands with descriptions
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');
const { sendButtons } = require('gifted-btns');

module.exports = {
  name: 'list',
  aliases: [],
  description: 'List all commands with descriptions',
  usage: '.list',
  category: 'general',
  
  async execute(sock, msg, args, extra) {
    try {
      const { from, sender, isGroup, reply } = extra;
      const prefix = config.prefix;
      
      // Check if user is owner
      const isUserOwner = database.isOwner(sender);
      
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
          // Admin-only commands: only visible to owner when self mode is on
          else if (cmd.adminOnly) {
            if (config.selfMode && !isUserOwner) {
              shouldShow = false;
            } else {
              shouldShow = true;
            }
          }
          
          if (shouldShow) {
            const category = (cmd.category || 'other').toLowerCase();
            if (!categories[category]) {
              categories[category] = [];
            }
            categories[category].push({
              label: cmd.description || '',
              names: [cmd.name].concat(cmd.aliases || []),
            });
          }
        }
      });
      
      let menu = `*${config.botName} - Commands List*\n`;
      menu += `Prefix: *${prefix}*\n`;
      if (config.selfMode) {
        menu += `Mode: Private\n`;
      }
      menu += `\n`;
      
      const orderedCats = Object.keys(categories).sort();
      
      for (const cat of orderedCats) {
        // Skip group/admin categories for non-owners in self mode
        if (config.selfMode && !isUserOwner && (cat === 'group' || cat === 'admin' || cat === 'mod' || cat === 'owner')) {
          continue;
        }
        
        menu += `*📂 ${cat.toUpperCase()}*\n`;
        for (const entry of categories[cat]) {
          const cmdList = entry.names.map((n) => `${prefix}${n}`).join(', ');
          const label = entry.label || '';
          menu += label ? `• \`${cmdList}\` - ${label}\n` : `• ${cmdList}\n`;
        }
        menu += '\n';
      }
      
      menu = menu.trimEnd();
      
      // Send message with buttons using gifted-btns
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
