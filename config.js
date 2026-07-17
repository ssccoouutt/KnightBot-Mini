/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923400315734','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Tech Zone', 'Anonymous'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Tech Zone',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2ZKiSBT9l3zFaEFRkIiKGDYtNjfKBSbmIYGURUiQTFDs8N8nsLq6+mGmp+Yttzj33HPOze8AlylBFuqA9B1UddpCivol7SoEJKA0pxOqwQBEkEIgAVdxNxOXWU9mc85IY3PjFROeo8PtKHkbYY3bncpxtcf5tghfwGMAqibI0/A3gH4y2zhe7PgFZcfRoboatuKclc680nsVb+1i7UynnC8cWO8FPHpEmNYpjvUqQQWqYW6hbg3T+ov07S1fKrMg849Tgd82uCuRQxbxWLyfT52v7ivmsLYDTznKX6NPTaGk/MXgDzpTxRqTbNpor61lmhf7ZZJNV+LiztneDrLOO32SxhhFRoQwTWn3Zd13tuF3rsavM3jXu8x2VKbUr+6w3jPzqqWOJgzbS+Og/PBF3clBOHNK4J0P7rGprss4TqxunrdHm5/ddeFiW+1hrivhWhd/Jb6uP7Jy/j+6L9RL9zYPUnTJuTg5GtkwKXzfyzYJM5RH1cQSdTRf58smL79Gf+2jw2K29t6SwNyrm1sY2krA4dXNZ83VbrWtIypG2Tmri90nfUib+ncsuy29Y0I1d6GwltUli9ZazgN9U6lC6WxdtcaaTayzYd8nlX+tRr7JddvotR0u9Amd51ZxnMSFgvHUEk1Zp7tjkC/l68uzozPqjAhI3GMAahSnhNaQpiXuz0R+AGDUuiisEX2qC+TqXga5kx7gAU4VgVFZ7wir255NsOFpbFv5rvFKw4uReC9gAKq6DBEhKHpNCS3rzkGEwBgRIP351wBgdKPvvvXVxtwAnNKa0B1uqryE0YepH5cwDMsGU7fDodovUA0k9vMYUZrimPQyNhjWYZK2SE0gJUA6wZygnw2iGkVAonWDfg6tWka97sJm/CrKogIGoHj6kUZAArPRmGfZMTcRxrzEiX+Qb9ceFlbVN4woGID8+WwksuJIYAV+xLPCSOxf9hePnwx7wAhRmOYESEBdve6G5WaumwdtujQWC1mPZTWWwWdHH8l4lz5CLTvPtOZCzEZl7tdiFfPnhnEu62aV3/E1vjHToutEgeNf/gEESKBaDS0Y8XT3GozHcEdSjAyGsWd3DV+ccbZR9TDnVX7tNTek3ozR7UbIyAq0rbzYj+acO9tOh4vlxDGXjcYXUEi0MFL6GA16cmmIfi22SBZDbS8Yqb9R50tRLjgcpFhu4zBwWVLuNXS2HXk+3d9WIetV95Yf7VLGMzdQ2LTijPUJ3wgNMWfcmxu+qUpBZ6Ucv2f2OTP5j78qfcap96rfnlL0HH0Mewf/27t34n3E2MfgF4wfn8m/DKRyPNYzxbsKl1oN4paIZlauTLvNrEzIqnAiGs6pqQhpVzMEHo+/BqDKIT2VdQEkAHFUl2kEBqAumz6zBj6Vvymmyoahx7HRd55DQuXPOXhLC0QoLCogcYLIj8TxhBcefwOAPlruPAcAAA==',
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
    autoStartTelegram: true, // Set to false to disable auto-start of Telegram bridge
    
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
