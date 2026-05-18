/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923190779215','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Tech Zone', 'Anonymous'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Tech Zone',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2ZKiSBT9l3zVaFlFjKiIAUSkEBUVFyb6IYEEU5ZkSUS6w3/vwOrq6oeZnpq33OLcc885N7+DnOAaWagD0++gqPANUtQvaVcgMAVqE0WoAkMQQgrBFGD7gq9r/er7ycA7l0tyy3xDuZ9KhhGbXZOez9JcnYvK2AhewGMIisZPcfAHQNba6Co6macZe0ELxz52kWrxxxk+Gacl5HXiqiV3s1y1NV/Ao0eEuMJ5rBcXlKEKphbqNhBXn6OvW8k2ErbpBJpm52y8JK4WwT3yZMkYYL3zB74mXORyeeE+Sd/a1fUs3cDl0qQCv7nLO0PkiWJESPa167FEXbCKXt3syiZv9Gsc5yg0Q5RTTLtP6z5erGYwOnajapLR20EYX9ZxOiZaXp9aXsPV2IvxSTgaBmt/jjgKzCbiCjtWR5drokZc7sTZ3CN2s9IY+Xxwfb6ZOxMtSe3fiW+q96wk/0d3R6l1brZ2HZIX4W3PeWU717qy4NCGWOhuxq2NdCLqImd+jv4hlrqjLjgHifn2be9mQi06uOEh6xyVFiXrFm+U60lirOv5gz6kTfUnltyKaofD3m3CqLlm7uzsTq6p22m34rDVx/aeeSWTxV6BWustdNPgYB5S1d7RVej5p9rLGLNtuLmE7pT395rnqNYuVpyXZ0cJ6swQTNnHEFQoxjWtIMUkf56J4hDA8LZDQYXoU16wPh5eLylZtHuf68RZVQxi0uCxgMS81DP15qzVBespZzIwX8AQFBUJUF2jcIFrSqrORnUNY1SD6d9fhyBHd/pmXF+OZ4cgwlVN3bwpUgLDd1ffL2EQkCanuy4PtH6BKjBlPo4RpTiP617HJodVcME3pF0grcE0gmmNfnWIKhSCKa0a9GtqNRL2wp8E27BFbQOGIHsagkMwBTLHszIjSTLHitMJ81f9pe1hYVF8yREFQ5A+n3GczAkTUeBFlhFltn/ZXzx+MewBQ0QhTmswBdoqU+8oMfS1tCypYhiKGStarICPjt6j8Sb90RkT78JJrEAH6famqIti4VRY5Ed8Os52lc+8mkE85xK3ffkHEDAFr1yo3NfaxNwoG0bSx+qWup7rmPI9d8JsEw7Clp/bs1oe7JPRCZ9yP7BEppO8Sj91+Va6bKUBm4TrBs0G290WJd6YaO1LXy1ENxyg34vBat+5bGSP3HYj6XPXCtdOUVtOuUp14k7EpS7os2gtWetSJtHrYUFuyUQcUKscaV28ZAos7lYuWnCsrOjimK8v3yYz5S20z6FJf35W+Bmn3qt+G2H0nP0c9g7+t3dvxPuIMY/hbxg/f5N/mUj1kKxL4xw2MlpGheu3yna8ZSyhCUeyiIqk5GRttzDVsJjb4PH4OgRFCmlEqqxXJg8rgkMwBBVp+syaeUT+UExTTFOP43nfeQprqnzMwR5nqKYwK8CUlSSZmXASLz9+AHeAJYE9BwAA',
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
