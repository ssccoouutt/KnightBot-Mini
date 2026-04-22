/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['17789245369','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Tech Zone', 'Anonymous'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Tech Zone',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUyY6jSBT8l7zaavbFSCUNYBvwghe8j+aQhgTSZnOSgHHL/z7C1dXVh5memltuihcvIl5+B1mOSzRFLdC+g4LgGlLULWlbIKABowpDREAfBJBCoIF0hle3za7aXrLWFlAGJ37LrNScO5+zOtoKzilol49MCPn8DTz7oKjOCfZ/A8gz1uUYqme05SYyWRhSvObXyWV1xzP2OIslF+u+KB6lId6+gWeHCDHBWTQqYpQiApMpapcQk6/RjxYsW58fot6QYLGdXgM54Xk2DjLDrNU6P4zqI6w4B23G16/RV5A6M40tZY4b257vjmN/SooqWsNR6gX3XiMrUxZdp2jJ6e/0SxxlKHAClFFM2y/r7rlx1Vb1NRXT0WYltohhG+nYhmcGhbmrY7JQ7xx/CxjB/xrx0SS7MG7YSuMtV0+icOMGlKmxEI85Dm9cu+c5BVE9Z84dfyW+JB9Zuf4f3dNlsvHPgU4ucbZi1zg5TM19e5nrmLoVF17ReGPS3Ah09ou6i8k6rGdDyxu7RXVqVMMbNaHIHdSU9wbugLY+2vn6gR1a5Sd9SCvyO5aUhvdNfYIHdJsfxjh32b3ByBYsZVcuxLgXC8xxSmVztVvm8vFsU3e0y1bwNAv3hac4TG83D/fj3n1u3S5HUYy2W+8Rrd5eHV1R6wRA4559QFCES0ogxXn2OlP5PoBB7SGfIPqSF6xPe0t8rEkc8zhu2fVJCgJj1OiHMmmGZi+H3j1yNjf35utvoA8KkvuoLFFg45LmpJ2jsoQRKoH25199kKE7fTeuKydwfRBiUtJtVhVJDoMPVz8uoe/nVUa9NvPNboEI0NjPY0QpzqKy07HKIPFjXCMzhrQEWgiTEv3sEBEUAI2SCv2cWjMPOuHFvT2X19wc9EH6MgQHQAMDXhBZVuAkRRA1jv+j/NZ0sLAovmWIgj5IXs94lVV5hVVEXmQVXu1edhfPnww7wABRiJMSaMB02ot0Eu3R9Mxc56pl6aNINyMdfHb0EY136Q/TAOlKtBpaS+Iiwx6WWOw50oN7DDFUhKC9lreDKpf60Hn7BxCggUySpXbIuyeWX97spSXQcLQ3r7tbma2iDR8a1VW6DawZNbLB6FZOpCq9HNNpe7+5mKq8Qux12RNQyM49ONyhk3GJVLN566oFqMY++rVY6GMxIUSvmkCJJuL8zLrnXmtZ9sSLqnRstxuJu+GdHQqtXZ5554gS/S5OZ95ptS0uQ/OKGHdvZLux4TXb1vaHibW9NO+hfQ1N8uOzwq84dV512xCj1+xnsHPwv717J95FjH32f8H48Zv8y0QauzY7RAtxpN8v8uMQrRvFqZZ44Q/8RkyrgeAXs2nCLIiut+D5/KsPigTSMCcp0ADMApLjAPQByasus04W5r8pZhqOM1xFTtd5Akuqf87BBqeopDAtgMYpiizJMqdKz78BLjpEBT0HAAA=',
    newsletterJid: '120363304414452603@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: 'https://lora.comds/main.zip', // URL to latest code zip for .update command
    
    // Sticker Configuration
    packname: 'Telegram--> @techzonex',
    
    // Bot Behavior
    selfMode: true, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    
    // ===== LINK CAPTURE CONFIGURATION =====
    captureEnabled: false,      // Master switch for link capture (on/off)
    autoJoinEnabled: false,     // Automatically join captured group links
    autoMessageEnabled: false,  // Send welcome message to open chat groups after joining
    
    // ===== AUTO-REACT CONFIGURATION =====
    autoReact: false, // Master switch - set to true to enable auto-react
    autoReactMode: 'all', // 'bot' (only reacts to commands) or 'all' (reacts to all messages)
    
    // Granular auto-react controls
    autoReactInPrivate: false,   // Enable auto-react in private chats
    autoReactInGroups: true,    // Enable auto-react in groups
    autoReactSpecificGroups: ['120363420955143933@g.us'], // Array of specific group JIDs to enable auto-react (empty = all groups if autoReactInGroups is true)
    
    autoReactEmojis: ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😯','🤝','💫'], // Default emojis for 'all' mode
    autoReactCommandEmoji: '⏳', // Emoji for command messages in 'bot' mode
    
    autoDownload: false,
    
    // ===== NEW: Telegram Bridge Auto-Start =====
    autoStartTelegram: false, // Set to false to disable auto-start of Telegram bridge
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick'
      welcome: false,
      welcomeMessage: '╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @user 👋\n┃Member count: #memberCount\n┃𝚃𝙸𝙼𝙴: time⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\ngroupDesc\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ botName*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user 👋 We will never miss you!',
      antiSpam: false,
      antidelete: false,
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false // Auto-convert images/videos to stickers
    },
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },
    // Add to your config.js
    github: {
        token: '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', // Replace with your actual token
        username: 'ssccoouutt' // Replace with your GitHub username
    },
    
    // Timezone
    timezone: 'Asia/Kolkata',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
      github: 'https://github.com/mruniquehacker',
      instagram: 'https://instagram.com/yourusername',
      youtube: 'http://youtube.com/@mr_unique_hacker'
    }
};
