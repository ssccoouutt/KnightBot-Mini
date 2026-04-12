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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBT8l3rVGFFBxIiOGG4CIggKCmzMA0KBpdysAhEn/PcNuqe752F3tvetqCLy5Mk8eX6CokQE6rADi5+gwugW1rA/1l0FwQIITZJADIYgDusQLIBisA2LuMZku5TGMhFyXmxKLV4doWK4G2liXDtBW6U1Rb+A5xBUzTFD0R8A14eM06Tr3RyX+NgsrUDSI9PQLppb8c2EP199jh906Y0s/Rfw7BFDhFGRytUJ5hCHmQ47K0T4a/QvGye/FpvscHf8yhehT0opCGbiLd2XIaOEVRok8nZkW2P/a/RFuNQ4d64z9vYgcmpJvC5Oc6dY1l51aAaW00qVtWYnD4d/o09QWsBYi2FRo7r7su6+jogxdkdTvC8OmVVvdNfQl56/YgPtGEsqP53Z3J3PNbX9GnE2t40plaou3jGH6WZgpMLVSiTxfjGwQ2LOkTLpEsvMwLV/J27h91m5/B/ddeG8WRmn1VVdXxt2YAe6u9F9iptTeL3j9PnyKJJT2ybSUv4a/RoyS3mPddHIR1cjM1y3YgSEK2W0C+5qLFAinI81bsIp0Sf9sG7wn1iGmgL9ceKZrr4V8v0lME07hQV9Pq4GKbMZKVjyYbBCj/WEp1cHf2e2nm0ub/O4qYW1ZfkMIZe2lLk1bE3BDJo0987ty2tHF9hpMViMn0OAYYpIjcMalUV/x82GIIxvOxhhWL+qC07rxt4HU2k6iszO0H1tsL/onu3K4sNxdoKYyBailO2R8PQLGIIKlxEkBMYqInWJOwMSEqaQgMVfP4aggPf6zbe+2nQ8BAnCpHaLpsrKMH439f0xjKKyKepdV0Rif4AYLKjPa1jXqEhJL2NThDg6oRsUT2FNwCIJMwI/GoQYxmBR4wZ+hFYs4153VjYUXmVXYAjyVz9QDBaAm0xpipqOGXZKL5jv5Fvbo4ZV9a2ANRiC7PWvyZyaT1iKpSc0xU7mC+Z7f//84NfDxbAOUUb6eGqHMxPQqry2brM5rSi8nPJiyoPPft7n4k14T48hz6a2pFjYhIIqEUQPNOYxfkgoZKdxdyFXbz4jvKS9/AMIWIDVPno4ZpCPBLqDthHK0YkRAvbsRLsLKfZihY5Vlev8pOOjASdFnu3JqieGGaSSUlTOVl1w63mLVG5cbsjqUjSHgWi/9NVieEMR/L3YMbANT7xPW88+RmrCOJVDlftqtvK9GSW6W8qrUmO0add3Nb5a+b66dWslmlu5Zc7YltOIuNUOS148YeZ2vUXnArnoxL9N7Gtisl+bCr0OU+9U/5kg+Br8Iuz9+0/n3nj380U9h79B/Nok/5JGYd8VXrqhZf5+nj28dNuyWmOhTcRFLZ033DSq1no22mCe78Dz+WMIqiyskxLnfZSLGJcoBkOAy6YfWK1Iyj/tcUHTJDvV+sazkNT8ZwgclENSh3kFFmOWZTiG5ejJ829Run9rOQcAAA==',
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
