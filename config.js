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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBT8l3rVGEFULhEdMYAXwAveEHFjHkoooBQKrCqwccJ/36B7emYedmd7eSoORJ48eTLrOyAFZmiOGqB9ByXFNeSoPfKmREADRhXHiIIuiCCHQAO6EZbm5V7c0jm8Q1sa+/zu7Fa7/sDd32V7QfyekVuhkE/tF/DsgrI6Zzj8A6CTk3xvjxX1qvbGpBw0Q3cYDgNo4iyYNyjKj2o/Ddz+2kxewLNFhJhikkzKFOWIwmyOmjXE9HP0Z4ZMesU2Xvs3ZUUc2bzaON1HrheojpfIwjzuOQbr9yZW+Dn6c9ZXHzejMFkx3j/u1p1u+nXgC/417B3UTAk7Fyv2R4uVaL/TZzghKLIjRDjmzad1t80E9+4ZrYRjBxKTuI6DHnQ5m3XKg16vA8erdNQsiqG4/Bxx5dU9LYxaKC6jrZDNk+kg7ukdw7zNeGjZQ9mUHds6ybb3ofs78TX98Mr1/+h+XYubsWMoWHo0EyiFm+LajPXS252FaB2w/mNr+MpQOnJP+Bz9YpHqjrvyHqMZ47Zid8765mSLl2rN1iWNU6yqyemO4mT2G33IK/onlqdT51x2Zv6lo84Oj6BZzjIjGHtIt3S33tNbEa96UXVYJFRanlfrcTzfyE5TWltqi/ZgEvnI3dbiDgfb6+hxwKeRc7jp95e3ia6osSOgic8uoCjBjFPIcUHamqp0AYzqHQop4m/qAm+6WeYCPG87TriaskeIO4sEG8ZudTxnw70YxeP+7HgxByx4AV1Q0iJEjKHIwowXtFkixmCCGND++tYFBL3y97213SSxC2JMGfdIVWYFjD6W+vERhmFREb5rSGi2B0SBJvwqI84xSVgrY0UgDVNcIzOFnAEthhlDPwdEFEVA47RCP0NrFlGre384UQ8HZQe6IH/bB46ABkRZVtT+YCiNVE38yr7cW1BYll8I4qALsrefVEUVVVUeKupIEjTxa1t9/iTXYkWIQ5wxoAHT9SU2mpgTV9rL4WA20yeJbiY6+DXMhyneVV/HMkE33OFOvIz1UpWuJvVLw7VCcTsiHrKiAWpSJxca++UfQIAGpDWstxG7LHFvNJ9mE/e01gPVJfJDTm8bqqdCLgSRTcQFFs3Hia2WbjZ0ZtZ4LPT1Mc+Oj7jxF3VQ+/uTNzW2mR41ZuugLohQjUP0e7Pj8kKnVkQbt0yrDb1But0/RopDvHSl1wIXDmf/2Fc7yXjqmsLEC5fNjuhBrLixEfuM1Gu6WpXzOZLSfTUz2Suvc1N/t+tbXLIf1xR+c1K7pvY1xugt9QS2y/uvtb3Tbr0lPLu/Ify4Rf4licZe6gylW1HT3fFh3edxNNRv4m2zT6WVh0rRSiVksWJ34ksMns9vXVBmkMcFzYEGIIlogSPQBbSoWrPaJC7+0MzUbdvUk2k7dwYZ138FYI9zxDjMS6CJsjxUFbkvDLogb/Sy3HHIP3ID9PZZkBg8/wYO8WP6UgcAAA==',
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
    
    // ===== AUTO-REACT CONFIGURATION =====
    autoReact: false, // Master switch - set to true to enable auto-react
    autoReactMode: 'all', // 'bot' (only reacts to commands) or 'all' (reacts to all messages)
    
    // Granular auto-react controls
    autoReactInPrivate: false,   // Enable auto-react in private chats
    autoReactInGroups: true,    // Enable auto-react in groups
    autoReactSpecificGroups: ['120363408035540146@g.us'], // Array of specific group JIDs to enable auto-react (empty = all groups if autoReactInGroups is true)
    // Example: autoReactSpecificGroups: ['123456789@g.us', '987654321@g.us']
    
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
