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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2bKiSBT8l3rVaNlki7gRAyjiyqIoOtEPJZRYigVSBYod/nsH3r7d/TDTc+ettsiTJzNPfQMkxxRNUQP0b6AocQ0ZapesKRDQgVkdDqgEXZBABoEO/MGsnMk3d71Tretpc3dEqa+u+MGNbUQ1PrgLp0NylToh4d7AswuKap/h+A+AyyW58k366DQGaTxnEszZggimoFnnvh0+5gMY9ORYzk58/gaeLSLEJSbpsDiiCyphNkWNB3H5OfrSZMlgEW0Ulccprn0HkcBbGdWezI+7LPPKcg3TPEAnwf8c/SGp9zbitHyfrxpqFPO+VBfjzeJKiYt2Srwh1NtHqT28GO/0KU4JSsYJIgyz5tO604Vm3a9Ln2uCc25r6zEf56P7zuakNQzoaGXE8uriXFRhGH6OOCJ3b1Hko3m+pnBAowadVIjdXFjuFodeZNWBUJCZN2rI7XfiXvmRlfP/0X1ojzKxY9vFklC0nnCFlcnQXyZjhxOhgSbRDO0KsRMPo/hz9N1RYRmmRQaVmdxNMbFMgyqeO3IQqY6ua+2vYzTeCLuNMf5FH7Kq/HM6osUtkB7hpk64WLTK8UUNze1srvBslrt2NoqmqGBaVXuQS5LZVUH3oaA+fJ835peTvBF7LnfROo/egTf2zeW+9n3Tf3t1dEbNOAE6/+yCEqWYshIynJPXmcp1AUzqJYpLxF7yArIPHufRUK59Jkfpwx8n2dpbQX5zdJDiuOGyE4Sn7SxTHOkNdEFR5jGiFCUOpiwvmzmiFKaIAv3vr11A0J29G9eWE/kuOOCSspBURZbD5MPVj0sYx3lF2LIhsdUuUAl07tcxYgyTlLY6VgSW8RHXyDpCRoF+gBlFPztEJUqAzsoK/ZxaK09a4S1V9if+IAJdcHkZghOgA00QJY5XOU3UFL0v/UW/3FpYWBRfCGKgC7LXM0FS1L4kCn1OEgVObV+2F8+fDFvABDGIM9rWmsvLkxj6Vf2AD3+7NZaGMTWMVrWPjj6i8UN6ZCYiDO5Hd9jjzl6YOqa/9qIUOYstN8gJrvvVI+8nvhX+EwjQASfUu3E5W6j2qfe4y7CKqom4mt9N2R4qwqqSFgG0A3fIBje+t1aM2mV2p3+pbj2fuYzNB+ygmHJmhiPL2WsHD+Hr0Whz1AUJqnGMfi9W9FYqG/F9FihK5+wsi/iqTjnJmvpTLcfbfW+aptxcGO3VRHU3l/QM8bT0rdxjPtf34hPpJycPp/hhz+vt4njwEnlope+hfQ1N9uOzwq84tV612wNGr9knsHXwv717J95GjHt2f8P48Zv8y0SaOzGNEuEcb1dHT5sM+LF5C+0VLznHx2ZhyBOp7Oyp7EahkYHn82sXFBlkh7y8AB1AkpQ5TkAXlHnVZnZMDvkfillG6Bt3w2g7zyBlxq85WOELogxeCqDziiL2VVET+++vvDIvHEiPQAdioO1EDTy/A/vpmndVBwAA',
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
