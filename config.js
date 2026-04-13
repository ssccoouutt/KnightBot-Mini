/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923401809397','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Tech Zone', 'Anonymous'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Tech Zone',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUy5KjNhT9lZS2dg1PY3BVVwXwAxq/aWzs1CwECJCNEUbCBk/1dlb5j2yzyMdMKj+Twt09M4tk0mElJNW5555zrj6BnGCKHNSAwSdQlPgCGWqXrCkQGACjimNUgi6IIINgALwJp0XVglek5XJyMB/d1NnYKUc3VZVSP1F947xcXuMDktQH8NwFRRVkOPwBYDB114g4spHE/pEfWsGNv5zQ6NJInWQfRI1Eq+1QDYxjQh7Ac4sIcYnzZFSk6IRKmDmoWUJcvo++7Kjz1GaE9/RSXx3sReUfRo+dXqpzNd8vqduLhkxwRX90fB99jnBrsYMQKTdxdXPkvlJ6CBui+hhK9cJUx2lECnrKUnx9oU9xkqPIjlDOMGverXuyWHm79EidnTNxruu64Ce1JdSsI4qZvJsHaPskkMUsMfPwfcSfvKSiruJUwdT2xHNskElM9lfJErLDVWHpxJMFYt/cgzD6nviyfMvK8f/oPpsdRTefLN0QnpFb7IPpMsBWpEXnlFvZa48EPRSok5hu7ffRTwR04PraSs+CjevLPe4iHZjCG8stJJJgzoYNqd2zBLe+/o0+ZFX5I5ZZ0mdcZ6+lEb9Nzr3Rzj9LC9mnCs+vL8NJktfatA6tm5dZbLq9COtNkGTu9vwIpSeyJyIOSbUZX5pse70t1k5tcL4/TB7uHR1RY0dgIDx3QYkSTFkJGSZ5uyfyYhfA6OKisETsLi94Mpqcq3lkS86+5PH4BKNtv+F3/vnWGDcop+NrM4/w6eLZD6ALipKEiFIUWZgyUjYzRClMEAWDXz52QY5q9mJcW05R5C6IcUmZl1dFRmD0ZuvXUxiGpMqZ2+Sh2S5QCQb8t23EGM4T2ipZ5bAMU3xBZgoZBYMYZhR97RGVKAIDVlbo69yaJGqlH1nC2FlPZdAFp7slOAIDoImSzAsqr0laf6CqP9MP1xYWFsWHHDHQBdn9mij31Z4siT1elkRebW+2B12QwxYMfPn9r19/+vLHl9/+/NxK/0q7rRIhBnFGwQCY85N7kLyV0u/nt2S3011dd3S9FfOtzbfEvDiSIyOS4LpOFyOOPy69xDJWm6WfIGu+44ckx5dedSO9aGV6/wQCBsDCboN6+iiqZWetGgE/zPZmpcOz5laby5DjJreZ78SLylL6lxL1wmxTLiQN2njuzwTU9E+3tJMH2e6QDbU0SqaKtbnHqwsidMEh+r6YmU6kVX1VxiO0sxeUn+/NZMwtBTjR6FRjt3XHPrANthBn6Z61dzp+pa6m222YpqaCd2WTcsOm5ufH2eTR3CVxtWXYeM3yfZay1zcM31PWGtj+xhjdn4RXJ/7T0BfibfD45+53GK+PzL8MqrGXEj8Sj+HuKV1qj0PBNq7e+EmQrfS2nevKo1x2AqosfE/PwPPzxy4oMshiUp7AAMA8Ksk9LiWp2iDbeUx+UMzUvZVe63rbeQYp078NxxM+IcrgqQADod/vqaoiaHwXnBq9KFwG2dtQAb39lqQAz38Dlg122HEHAAA=',
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
    autoReactSpecificGroups: ['120363408035540146@g.us'], // Array of specific group JIDs to enable auto-react (empty = all groups if autoReactInGroups is true)
    
    autoReactEmojis: ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'], // Default emojis for 'all' mode
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
