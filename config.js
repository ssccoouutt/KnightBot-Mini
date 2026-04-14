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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUW4+iSBj9L/WqGbmDJJ0sAo2oCIoouJmHEgqolptQIDrxv2+wp2dmk93Z3re65XznO+d89Q0UJW7QEt2A/A1UNe4gQcOS3CoEZDBr4xjVYAwiSCCQgafQjESyVEn224U5yw3WV0nWhNcY9eYsiLws1kdzi0708wt4jEHVnjIc/gbQFbfKTVysMg8LgcfHQnVP7JH7dqVf3danCVfi/T3XO0aRXsBjQIS4xkWiVynKUQ2zJbo5ENefo6+sjid+V67s7ZI2o0uVjMIln7aZ0UrlwrKQpadbCpNCZZrP0TeOYulCSjQ8eIK3w9w3/LzuAi3Plo2jHgWbymy6TQnR9Xf6DU4KFJkRKggmt0/rLjj6QT+3kyDcbutkGU8Pl2Y2jd5ax9+0SmzdhBm96ReX1lA+R1wSDuvjSbQlLl/e3XmMXo/s6jJZat5m23hUu9tCY6ptTOv8N+JO/ZGV8//R3bAY6U5hZrFnM0NEEmI6J2capdLKKwN9mrfn0oHdm9L5k7HxJ2k3RZoYWipReoZX6sva9egzZGKyVha9Zc+zhjKnVhH+pA9JW/+OJRGulc4cR811cu5cckMn57TbLw3XDM7tyN9aRb/S26gL5goxccW5Cr2xZ3inKX5nOLA10hO9M3dpzPbhGhZHseB6VXl5dnRGNzMCMv0YgxoluCE1JLgshjOG4ccARp2LwhqRp7wAl8t+7VNv0d5CuemG4j6Ykiqq6r7rk8uo9drsmi5rJSTmCxiDqi5D1DQomuOGlPXNQk0DE9QA+c+vY1CgnrwbN5Rj6TGIcd0Qr2irrITRh6sflzAMy7Yg7q0I1WGBaiBTP48RIbhImkHHtoB1mOIOqSkkDZBjmDXoR4eoRhGQSd2iH1OrltEgvKOxPr9y5mAM8qchOAIymDIsR9ESNWWnojzl/2i+XAdYWFVfCkTAGGTPZwwnSjzHMjzFsQwlDS+Hi8cPhgNghAjEWQNkoNqq+8Z6myJw+HsSBIqrKEtFGVT76OgjGu/SF2gWsXDbp7Y+oc6Ol8xnm73jJ2i+DiitLHDHt/eSjzaq908gQAb7EZNs7NvC6PN7+jqds8I+qapXPZDuqn022zBJFqW059y3u+FZkGjVIZ0kvWfuFft2v+Sct+us9Ho4h0mruFYtbNeiNuRoDCLU4RD9WkxbeVNVfy22u9V1rXMRykPuZBx7E03mC9s3s4mSarP5iuz4gp2ZG+4grGgquUBxtDruj2hNhYFkbdtNkXczjjhvQtpqm/fQPocm+/5Z4WecBq+GbYzRc/YLODj43969Ex8iRj3Gv2B8/03+ZSJnRzbxI+YcBrvUmS402pxdvdcdzc3T+2GtCAuuHp0awfY9JQOPx9cxqDJI4rLOgQxgEdUljsAY1GU7ZNYs4vI3xVSlMdVN4g6dZ7Ahys852OEcNQTmFZBpURRokeVE/vEXyTUhnz0HAAA=',
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
