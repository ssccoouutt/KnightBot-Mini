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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUyY6jSBT8l7xitTFml0oavGAw4N1V4NEcMCQ42U1mgnHL/z7C1dXVh5memltuihcvIl5+B0WJMLRgB9TvoKpR4xPYL0lXQaCCCY0iWIMBCH3iAxUge/hGb+fXVjGPO5GsE2OlZ2WFr+gUsS1ko4r3/BW2M7d9AY8BqOg5Q8FvACWTSVNhy3Wnk8cs3bOScwdH5/ihszV0utBIvGjdxPG3rvMCHj2ij2pUxPPqAnNY+5kFu42P6q/Rd0zRVnbVUp7dNEYKvK6QVpNrxKQLT4vEYxwnw7NnHe/jt/Rr9JPtLHayypmsriFhxs4mZbLsfEpXljCZVHcuilyui23NP5rv9DGKCxiaISwIIt2Xdfc2nqlYaXyLbsornaamxs/jLXMYxw2nb2ak4/0xHlKFutrXiOdOu93rJ1FEgbtILJTpy1O3a4+rjvPu+H5F6GgYmQiFA/8r8U39kZX0/+heapK022TbN0YRF/ecxsb53kb3V8jtd2V5Sdb23ugoYUdPl79AX9bWUVhi19RTio83MooS/5XSy2IariojZr1b6SF833SH+Sd9n9D6dyznAqWhtYqGxdq4bNKJk4R2qlRWzJb8LpoL9006Lc+svp2Zw5xBxDZkUZ9p2j5BLtX8LS+8SZeh6+71iYDbShcsrCTty7OjFHZmCNTRYwBqGCNMap+gsujPOH40AH7Y7GFQQ/KUF5wu88NleriurWDWiDtWqZUiiNa5YzGKUszMXbEtVke/Tij7AgagqssAYgxDA2FS1p0DMfZjiIH6518DUMAbeTeuLzceDUCEakyOBa2y0g8/XP249IOgpAXZd0Uw7RewBir7eQwJQUWMex1p4dfBBTVwevEJBmrkZxj+7BDWMAQqqSn8ObXTMuyF3zrjyXwqTMAA5E9DUAhUoHBjnmXHI0Ea8+pI+AN/a3tYv6q+FZCAAciezziZlTmJlXiOZyVO7l/2F4+fDHvAEBIfZRioYLq6H4flVp8vRbsL54uFNo+1aayBz44+ovEufQgbVk9m9IqXdMrc23wd8yllnOuGrrN70cY3Rsy7TpZG/Ms/gAAVdIndNKed5FLZ6HKDbnZEh4IAZajoZ5k5XQIzoF521fh8YdxzvUM7vHerprZnJ54N0MVYvXqeIQiLyamljC4uTs10+9JXC2GDAvhrMU6elVmT2vViduUWGyO9TXazaByc+dpbWe2ly/ejnW3GhacHbYsOKZVtMc/GDDnC0mEOhsutrXVHWHt3VURlBd9y67J9D+1zaLIfnxV6xqn3qt9GCD5nv/B7B//bu3fifcTYx+AXjB+/yb9M5MR1a2XitdK1np7jBsvLpFwv7SaxEimpAkE2nYhWGDdrBYLH468BqDKfRGWdAxX4RViXKAQDUJe0z6xZROVvik0105zHsdl3nvmYaJ9zcEA5xMTPK6COJHkkSorA8Y+/Af4fz8U9BwAA',
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
