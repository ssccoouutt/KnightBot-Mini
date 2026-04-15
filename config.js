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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUyZKjOBT8F11xtMUOjqiIwRvG+wbGnpiDDALLZpXAgDv87xO4urr6MNNTc9MW+fJl5tN3kKSE4RluQO87yCi5owK3y6LJMOiBfhkEmIIO8FGBQA8g64ps275qYm1t87vjzFfZiUODQwTp9mKo3LhfJ95pvzhIb+DZAVl5joj3G8BqxejomovbYGB50lT3yEGYD2qxxAbnyk5lE3l2PV8EnFRv4NkiIkJJEo6yC44xRdEMN2tE6Nfow/Gdi5Mix0NIE/i4KZflEQkTYRfd5dBHD8WcH+TUm/LQ+hp9FAr7MO4L53CnQZndlU056Qr6caip6uwOQ1NfbqvId6vKfqfPSJhg3/JxUpCi+bLu3MxVGT4NVMU+Qy8bz3ab1IBbTvMaZWGa3S1djuc61Lt2+DXiq+14GMpqfNwNbf9q5cLY5TimKErfcMxDZkf1gTiLUBtG4a/E1/QjK7f/o/tiFm/qwE9L3gvEOBnXEmbkpuRd53w45Ceq4kqU9rehyn8xNiPtFoyvW7S60eu0yZfTQ7Kh4X7Rh2ed34TkdhTkGuOkvsBP+qgo6e9YjuMSSjDyZxOoGyt7MrUiPKnvMov7gYnjvYirYDu6BDfnJIglJzbz06MvN6470fEmEx6PleozVNTQMtauIxs5v4Jh+Pbq6IYbywc9/tkBFIeEFRQVJE3aM0GUOwD59x32KC5e8gKDu9jrzNiPqmOcHRP5amtOnsTQvYiOO12f85x3x1wpKBfjDXRARlMPM4b9CWFFSpsFZgyFmIHen391QILr4t24tpzId0BAKCvspMyiFPkfrn5cIs9Ly6TYNYk3aBeYgh78PMZFQZKQtTqWCaLehdzx4IIKBnoBihj+2SGm2Ae9gpb459QOUv8l/NER9iNlCTogfhlCfNADuiBKEIq8rIpSj+f/YN+qFhZl2bcEF6ADotczQYOaoEJVEiSoClr7sr14/mTYAvq4QCRioAcGVnmVT9JktFJNTpNM0xiFxiA0wGdHH9F4l96d+dhQw83QXNMl7k+GjEicJT/4x5AgVfSbG8tdTWHG0Hr7BxDQAyU9qo0qepODKZtjSz5ZMZNCdSpQg5ka3dvm8JYdIblOff2wutezQWBe5yN0XIWjQ7RfaNSwhi4Xd1FfJiUvaqas9dscdYCP78TDvxabR5V22ZX3s7fP3SqgBMNDwfLR5B54xs4RNkv+vHzU/GKie4u8SayFto3XN9HdjvrzrkL5QbirHtf+5rhwqKcHeNflLtV7aF9DE/34rMgrTq1X7TYg+DX7CWod/G/v3om3EYPPzi8YP36Tf5nIvtMkbriSRkZ9VR5uuK1Uq1yTlad7lRSXuuhl81nUXVHDaMDz+VcHZBEqgpTG7d+c+DQlPugAmpZtZq0kSH9TbGAsrEEVWm3nEWKF8TkHexJjVqA4Az1eVRWBlzRde/4N9FdgKD0HAAA=',
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
