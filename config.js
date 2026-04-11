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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU27KiOBT9l7xqNVcVrDpVA3gB8Y4oOtUPAQJEkWgSFOzy37vw9Onuh5meM2+51dprr7V2voGCYIZcVIP+N3Ch+AY5apa8viDQB2aZJIiCNoghh6AP/LGgx+VC7CrL5fhoTbzM3TqZwLZlmbEg1QLzulzekyNStDfwbINLGeY4+gNgOPXWiLiqmSbBSRzY4UO8ndHwViut9BDGtcLK3UALzVNK3sCzQYSY4iIdXjJ0RhTmLqqXENPP0VddbZ45nIi+QY3V0VmUwXE4aXUyQ6jEHmVeJx5wyZOD4elz9AUirOUWQoRuk/Lhqr0u9RE2ZW0SKdXC0kZZTC7snGf4/k6f4bRAsROjgmNef1r3dLHy99mJuXt37N7X1UUcV7ZU8ZYs5+p+HqLdRiKLWWoV0eeIb/y0ZF7XLcOp48vXxCTjhBzuii3lx3uXZ2NflYjz8I7S8HfiS/qRldP/0X02O8leMV56Ebwi73IIp8sQ27EeXzNh5ax9EnZQqI0TtnM+Rz+V0FHo6SsjD7deoHaEm3LkXdFc7iBRJGs2qEnlXRW4C4xf9CEv6Z9Y5mmPC62DnsXiLr12hvvgqizUgHVFcX0bjNOi0qdVZD/83ObT3U1ab8M093bXCVQ25EBkHJFyO7rV+e7+WKzdyhSCYJC+vTo6odqJQV96tgFFKWacQo5J0ZzJotwGML55KKKIv+QFG7MuhEpEjuIeqIhHZxjverW4D66P2nxANRvd63mMzzffeQNtcKEkQoyh2MaME1rPEGMwRQz0//7aBgWq+LtxTTlFaoMEU8b9orzkBMYfrn5cwigiZcG9uoisZoEo6Iu/jhHnuEhZo2NZQBpl+IasDHIG+gnMGfrZIaIoBn1OS/Rzai0SN8IPbWnkrqcqaIPzyxAcgz7QZUUVJU3UFb3X17S/2Jd7Awsvly8F4qAN8tczWe1pHVWRO6KqyKLWvGwunj8ZNoAx4hDnDPSBNT97R8VfdXu94pHu94ZnGK5hNKp9dPQRjXfpC2TGClxX2WIoiKeln9rmarsMUmTP9+KAFPjWKR+kE68s/59AQB/Y2KtRxxjGlequNTMUB/nBKg141b1yexsIwvgxC9xkUdrd3o2iTpRv6ULRoYPnwUxCde/8yFpFmO+P+UDP4nTatbevHLVBjG44Qr8Xs7Kxsqru3dEQ7Z0FE+cHKx0JSwmOdTbV+WPdco58i20k2IZvH9xWUGqr6W4XZZnVxXtaZ8KgrsT5aTaeWPs0KXccmz9C+xqa/MdnhV9xarxqtglGr9kvYOPgf3v3TryJmPhs/4bx4zf5l4k0D0oaxPIp2m+ypT4ZSI5590cbSbWzx25udCcqbYWsuwh8IwfP59c2uOSQJ4SeQR/AIqYEx6ANKCmbzDpFQv5QzDL8lVEZRtN5Dhk3fs3BBp8R4/B8AX2p1+toWlfSxed3D5uZwj0HAAA=',
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
    autoReact: false,
    autoReactMode: 'bot', // set bot or all via cmd
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
