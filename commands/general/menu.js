/**
 * Menu Command - Display commands available to users
 * Owners see all commands with categories
 * Subscribed users see only specific commands from Google Drive list (one per line)
 */

const axios = require('axios');
const config = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');

// Hardcoded direct download link for subscribed users' commands
const COMMANDS_LIST_URL = "https://drive.usercontent.google.com/download?id=1bh1iJ12OMb6_-gXI-rpsTZuCXDqTtFGu&export=download&confirm=t";

// Cache for commands list
let cachedCommands = [];
let lastFetch = 0;
const CACHE_TTL = 300000; // 5 minutes

async function fetchCommandsList() {
    try {
        // Check cache
        if (cachedCommands.length > 0 && (Date.now() - lastFetch) < CACHE_TTL) {
            return cachedCommands;
        }
        
        console.log('[MENU] Fetching commands list from Google Drive...');
        
        const response = await axios.get(COMMANDS_LIST_URL, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Parse the content (one command per line)
        const content = response.data;
        const commands = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
        
        cachedCommands = commands;
        lastFetch = Date.now();
        
        console.log(`[MENU] Loaded ${commands.length} commands from list`);
        return commands;
        
    } catch (error) {
        console.error('[MENU] Failed to fetch commands list:', error.message);
        
        // Return cached commands if available
        if (cachedCommands.length > 0) {
            return cachedCommands;
        }
        
        // Fallback commands
        return [
            'ping', 'menu', 'status', 'antidelete', 'antivv', 'capture',
            'groups', 'dlp', 'translate', 'ghibli', 'logo', 'magics', 'sora'
        ];
    }
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'Show available commands',
  usage: '.menu',
  
  async execute(sock, msg, args, extra) {
    try {
      const { from, sender, reply } = extra;
      
      // Check if user is owner
      const isUserOwner = database.isOwner(sender);
      
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      
      let menuText = `╭━━『 *${config.botName}* 』━━╮\n\n`;
      menuText += `👋 Hello @${sender.split('@')[0]}!\n\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      if (config.selfMode) {
        menuText += `🔒 Mode: Private\n`;
      }
      menuText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      if (isUserOwner) {
        // ==================== OWNER MENU (All commands with categories) ====================
        const commands = loadCommands();
        const categories = {};
        
        // Group commands by category
        commands.forEach((cmd, name) => {
          if (cmd.name === name) {
            const category = cmd.category || 'general';
            if (!categories[category]) {
              categories[category] = [];
            }
            categories[category].push(cmd);
          }
        });
        
        // Define category order and display names
        const categoryOrder = [
          { key: 'general', name: '🧭 GENERAL COMMANDS' },
          { key: 'media', name: '🎞️ MEDIA COMMANDS' },
          { key: 'fun', name: '🎭 FUN COMMANDS' },
          { key: 'utility', name: '🔧 UTILITY COMMANDS' },
          { key: 'ai', name: '🤖 AI COMMANDS' },
          { key: 'anime', name: '👾 ANIME COMMANDS' },
          { key: 'textmaker', name: '🖋️ TEXTMAKER COMMANDS' },
          { key: 'group', name: '🔵 GROUP COMMANDS' },
          { key: 'admin', name: '🛡️ ADMIN COMMANDS' },
          { key: 'mod', name: '🛡️ MODERATOR COMMANDS' },
          { key: 'owner', name: '👑 OWNER COMMANDS' }
        ];
        
        for (const cat of categoryOrder) {
          if (categories[cat.key] && categories[cat.key].length > 0) {
            menuText += `┏━━━━━━━━━━━━━━━━━\n`;
            menuText += `┃ ${cat.name}\n`;
            menuText += `┗━━━━━━━━━━━━━━━━━\n`;
            categories[cat.key].forEach(cmd => {
              menuText += `│ ➜ ${config.prefix}${cmd.name}\n`;
            });
            menuText += `\n`;
          }
        }
        
        menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
        menuText += `💡 Use .list for usage details\n`;
        menuText += `🌟 Bot Version: 1.0.0\n`;
        
      } else {
        // ==================== SUBSCRIBED USER MENU (One command per line) ====================
        const commandsList = await fetchCommandsList();
        
        if (commandsList.length === 0) {
          menuText += `⚠️ No commands available. Please contact owner.\n\n`;
        } else {
          // Show ONE command per line (not multiple)
          for (let i = 0; i < commandsList.length; i++) {
            const cmd = commandsList[i];
            menuText += `│ ➜ ${config.prefix}${cmd}\n`;
          }
          menuText += `\n`;
        }
        
        menuText += `━━━━━━━━━━━━━━━━━━━━━\n`;
        menuText += `📊 *Total:* ${commandsList.length} commands\n`;
        menuText += `💡 Use .list for usage details\n`;
        menuText += `🌟 Bot Version: 1.0.0\n`;
        menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      }
      
      menuText += `> *Powered by ${config.botName}*`;
      
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
