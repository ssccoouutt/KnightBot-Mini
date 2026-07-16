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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUTZOiSBT8L3XVGFEQ0IiOWEREGhVEQXRjDwgFlkCBVQVCT/jfN7Cnp+ewO9t7q6/Il+9lZn0HuEAUmrAF0++gJKgOGOyWrC0hmIJZFceQgD6IAhaAKdCUiXnAaDFxzLM31qnGHWdm7FKo1JxMK/Y68qI8UzaLPH0Bjz4oq3OGwt8A6rmw43Z7w9bVmRH4Y+N03Nm7y4rEp3IV8/WAvqEScgOSai/g0SEGiCCcaOUF5pAEmQlbO0Dka/SVOdtJwZ1Nzrrmiviwjc2SW7mFgX208WxKblCTEFwc9S/SR5rnNq+HRhNTLSYx6/HLg7GExY0o4mvppHG0gOO5a84T4Z0+RQmGkRFBzBBrvzx3V9nOVJYNNqEoxM0Gb3V5aPh+e3WM1Em31rrEyZ7fj/3l8WvEr/XbamuhpTg7Lqi+tu+7QWJuWye7t+P9yfPwSNhd+djjOforcZt8eCX9P3PXZ1aemGe+Vsq9p1/ErZ2OA1MOK8NKo/HkzVVE0UbyRfPXX6OfuN66acfLUKyPW7c5lNIyd8x6fONqPi9OXnO5c1d+7l2H4Sf9gFXkdyyNGxOk1dvkFI4rbn+LBfFw7SkLVDTeJl426VJ1enekiEd7bskVCaVSiOz5xuMptgYy1arleZdh0XRQPJHLHoIJPSr3l2dHKWyNCEyHjz4gMEGUkYChAj/PJKkPgqjewZBA9hwv2B6trZ9c/eY0b06cUaSpScUhJ800chYSPViGt16prLUzLV5AH5SkCCGlMFoiygrSriGlQQIpmP75Vx9g2LB34bpy/LAPYkQoc3FVZkUQfaj6cRmEYVFhtmtxqHYLSMCU+zyGjCGc0G6OFQ5IeEE1VC8Bo2AaBxmFPzuEBEZgykgFf6ZWLaJu8HvbP4mmb4M+yJ+CoAhMwWTECxzHD8cSL0yH0h/0272DDcryG4YM9EH2fDaSOXkkcZIwEjhpJHcvu4vHT4YdYARZgDIKpkC15u6g2C40o70IzNB1RUsUNVHAZ0cf1ngffQRrbnGdVzf6Wqm9t3tuJUJa9dY3u7KyN3xPmp6Yt60sDYWXfwABU7C7+Bt/iDLcQ/ed7h4Xs5yuHCdYbIpeGxpGbZvriONtNX6z5FWa3UfDnZjexhFdnxtpuL7CG8/NWrQiM8majOS1MvdmnY/6HTkUwl+LrTTqj+KbyKh4a/zKw/fhxeFtc3BxbBouz4WuetJJLZ02Gt5WvQHN9QHGwcnhuNHCbBvHwZXd3M9rv2cd3K3lur1W/WHaZ2iyH58Vetqp06rbxgg+s4+DTsH/1u6deGcx7tH/BePHb/IviZz5PpnMjnfpRtRzUlP59VpYr6v6al6laxmOZWMdVyWltTWB4PH4qw/KLGBxQXIwBQGOSIEi0AekqDrPGjguflNMVQxDSxKj6zwLKFM+c7BHOaQsyMsurbIwlCecNH78DWXKfqU9BwAA',
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
