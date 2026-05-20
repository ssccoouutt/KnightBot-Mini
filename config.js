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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2ZKiSBT9l3zFaHZQIipi2FS0lFZxneiHFFJAIJMlAaXDf+/A6urqh5memrfc4txzzzk3vwNM4grN0R1o30Fexg2kqF/Se46ABoz6ckElGIAAUgg0UEyo4LiKknkd2WIXLs320J5oIthLs1HP4uycHJxNYeDMeQGPAcjrcxr7fwDkcbzjjW6Nw/16J5JqvN2jORuxwf1WR+65YXCnop2o0OvqBTx6RBiXMQ7tPEIZKmE6R/evMC4/R981SIDdEhFbrZRMyY0ZW9cKPsnHSXUxlUpyuqXYMF4jtJ+jj1fjRTIcqdaVPRaYTNCEr6Vm1IyUIvSWSqxfs5VgCcPVWnqjX8UhRoETIExjev+07rrFNCqe4mbuFyqdFdUKetyccDNb5XF4kjPvqx8oFy/KuM8RnxoJi9lhIZTdfphAOWyWlkezbpNBxsjbRXgch6woHEt+9Tvxr+V7VpL/o3tmCZFS5O29XjWvpn3ZYY5g8SjKSzZYb8RXiBaKKJPRnCOfo3+yuyaXk/XQuqpTEpmIgeJ6XbbhAUXnGa5dfsa57ZZmlv9BH9K6/BPL7dTCYRMHO0va5cYurT0fYpNKsJsmrMOPUKA05nRdtnKTrsfLIoWrWXvkV3lhzxSL8pOjmEodxL47mW5VxrbOxIxWL8+OEnR3AqDxjwEoURhXtIQ0Jvh5JkgDAINmg/wS0ae8YBxdd7tOZxJ4J6HbxaJEtpZwc8+30g3Pm/Z8q3dbSrlO2b6AAchL4qOqQsE0rigp7wtUVTBEFdD+/jYAGN3om3F9OZEfgEtcVnSL6zwlMHh39f0S+j6pMd3csW/2C1QCjfs4RpTGOKx6HWsMSz+KG2RGkFZAu8C0Qr86RCUKgEbLGv2aWpMEvfDD3UE82bwBBiB7GhIHQAMjQZQ4TuRlVZQ0Xvyr+tL2sDDPv2BEwQCkz2fCkBsKKqdKgsSpwrB/2V88fjHsAQNEYZxWQAOmI1zlkzS1F41ZBPpkotuhboY6+OjoPRpv0t/gmglgKBxOl2KiSFKkToak1XdyY1mxcO2k+DST01ex2HAv/wACNLAOz5Woyjd2WR26rduJzJY5ZK63UvXTRohu9G4Rfj3mk1e3SGYLhg11++4Y52pqM+1BQpmzFFp7Yi2q86m4KdZdMlS9femrBaiJffR7Me/ghkZir2SVvR8O0t7AiN3sdozNnG5mt0gJn86uKj/d3rp24XuqyY7Ebpt5+XKfvt6i63Dp1yei0hTtJ5FMzcXFG72H9jk06c/PKn7Gqfeq315i9Jx9DHsH/9u7N+J9xLjH4DeMn7/Jv0yk4e+TC96TZSoclKiuXQfdmvlCH6Nz20qUDBkn26DTZqQkFDwe3wYgTyG9kDIDGoA4KEkcgAEoSd1n1sEX8odipu44dhg6fecprKj+MQdenKGKwiwHGq+qI06ReWX4+AGH9lRiPQcAAA==',
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
