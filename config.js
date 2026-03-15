/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923401809397','923401809397'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Knight Bot Mini', 'Professor'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Knight Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBD9l3rVGLmIFyI6YgFtsRHBVlpgYx5KKKAEAauKmxP++wT29Mw87M72viVVycmT52TWNxAQFFIgfwN5gSkyUNfHJcE1ZKgPWVciIAO1iiJEwBCEkEEgg5m58JRmkQvaAYpF6altIxlp1CSZODOyGQelQ2uaUOVF+gTuQ1BWpwwHfwCUKJ+vvHSlXqrDsy4ojJw6joxeT2yvH03pIiFxyu1cIcLmE7j3iBATnMfLMkEXRGBmoM6GmHyOPqcuGkff0CTjTc8yzmVTDbRITPX0SGqdnCGhGK/Ewc2JP0dfD1KFXkuR09TbdnQ+T2K3WW+m7diPszTLT+uOUxbrZmo/797pUxznKFyHKGeYdZ/W/bIRxLekWlxsSdOEwVlVI6u46K5umN5yxy3CzXXrHlpdW32SOEOvHjnT7XV9IJvKn+tmvb+Qnfa2iGtTn0rNKsnzfdfsee934jb5mJX0/+jemUfBEQ3RXmw7x1PTauY+65qxVW0czfhxVrahte9w6PPp5+jvxWthSKs0OVldvFNWvne8ptxaDdtckozIn4TCyUm34ipe/6IPWUX+xDLmAiYM7HrZzCfZQCuPJ3i2HQU52Qa5Z3dVN4RtpHyVh0Y9ugUhk/iBZV9tdW4E7dGPopEoWf4AORhJbiqa44sFFeXp0VGKunUIZP4+BATFmDICGS7yxxnPDwEM6z0KCGIPeUHoZedaIs3seeTwxbadx63fmdlpopGuqae7gGsv65q4nDJ+AkNQkiJAlKJQx5QVpDMRpTBGFMh/fx2CHLXs3bi+nMgPQYQJZU5elVkBww9XPy5hEBRVzvZdHmh9gAiQuV/HiDGcx4+3o8ohCRJcIy2BjAI5ghlFPztEBIVAZqRCP7dWK8Je+MOrJLnSeAmG4PIwBIdABnNBHHP8jJuL86kszf+iX5oeFpbllxwxMATZI00YT2fSWBQkbiwK3KzP7C/uPxn2gCFiEGcUyEAzJ/uz6Owm/uF023meihXFUJRetY+OPkbjXfocqaEIX9vEWo641HZiXd292W6M9K3HLYoc11J1K6Rwpzn/BAJkMHDMl2o2p8uqOlp6gG9wJLSz1c0/snV2nTipTyYc9V1vMU88aDvBIVg1y9TaXrTgHLRhBeELsry2cW7zAUy5pIZ7bffUVwtRjQP0e7Ht6M1KlnV0Es6ZWpKrKgirNd1WEmaelr9NrGDRGSpea447MQ+84NajXLDt10QcbxT3Dbs7o7ZOfhNk3NaVNmK8L8LFj6F9LE3247HCj3Hqveo/I4weu5/D3sH/9u6deD9i3H34G8aP1+RfNlL1xdgNhTTwDok9f1nwa7Vxng/8WE9ux60yeRmTwYlOLNdRMnC/fx2CMoMsKsgFyADmISlwCIaAFFU/s+s8Kv5QTFOcndIqSt95BilTfu3BAV8QZfBSApmfTkVpNuWkyXuWTYpShzQBMhBf574473+vEaG4yIEM+C8cuH8HvhdBJW8HAAA=',
    newsletterJid: '120363161513685998@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: 'https://github.com/mruniquehacker/KnightBot-Mini/archive/refs/heads/main.zip', // URL to latest code zip for .update command
    
    // Sticker Configuration
    packname: 'Knight Bot Mini',
    
    // Bot Behavior
    selfMode: false, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot', // set bot or all via cmd
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
