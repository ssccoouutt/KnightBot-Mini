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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VVXZOiOBT9L3nFGlGQD6u6agEBvxtUFN2ahwABohjoEBCc8r9vYU/3zMPuVO9bSFLnnnvuOeEHIDku0QK1YPwDFBTXkKFuydoCgTHQqzhGFPRABBkEY1Ct780kZVLcNA5jtutZuvN2PZiiHxULRi2bt6wNnq1O0/AFPHqgqIIMh38AXHFUq3feDTduXSnGysoz1err/kIdWCctOh1ms9LWjabG7gt4dIgQU0wSs0jRFVGYLVDrQEy/Rt9wGpVzppNkBym0YChyhuHbmdAGSjCV5sEa37O9XkuqrXyNvmyn3FFy7L4Y99/wguhOal6X80Q/BGfFHpo700PO6XocHW7v9EucEBTNIkQYZu2XdTed2VLUhvA8mpsTlXB3qyp1fx3mJIj8rSDUaZ0sOJkSU/wa8WLYl9a1hhZ8OnOL9aiZRDhs4YqKg9stcDb2nimEn2uy7v5O3KEfXrn8H935palyTpCv12lqtvPWr65FFQaHUyg1cXlPPF5ctprPH7zL1+jb4cgS+WOmNLNtaklvljo7i+IUXyJDlpqzzW3RRou5fTVQftGHrKJ/NHdiVK8a2iForJOz1O9Hbh44zL8uTru8Jp6rrfon19NU05H2frk6vu1bFseRZAXbpUbrAy83jSiSwPGLSeYKE9feJ8nLs6MLamcRGA8ePUBRgktGIcM5ee7JQg/AqN6ikCL2lBfYkhu4LJdVk8QUTsiWSUt+w78GK2WfGCuVy1vR3ZebVcq/gB4oaB6iskTRFJcsp+0KlSVMUAnGf3/vAYIa9j64rpww6IEY05J5pCqyHEYfU/04hGGYV4RtWxIa3QJRMOZ/bSPGMEnKTseKQBqmuEZGClkJxjHMSvTZIaIoAmNGK/SZWiOPOuFPu7k5tB0F9MD1ORAcgTFQh4LIDxReFVR5LKp/ld9uHSwsim8EMdAD2fPaUJSVkSgMR7woDHmlu9kdPD4ZdoARYhBnZRf5Vbs9C56bLJfw7h6P2lbTFprWqfbR0Yc13qUnSI8EuGnSV7PPXxwvmeru3vETNF0f+UlOcD2q7vkocg3v30C6RrarWLmZUBOYMkWtu16R/LbwR4FdzCnZj+bD10i2b+c3dKGbW0p3qXPzvLpghX7ztLNxuN7jnVrJu1i65miLePOc6u5LVy1CNQ7R78XeGDsoW3Jp6a1qrBUX2NaxH5hhXeTbVLwzc1DL/JtJ6CCaJk52OrJ7lnIWOw5OVaYbEr2k+YEb1POZfTExXby6e5a476Z9hib7+Vjhp526WXWfMUbP7BN4RV+Z3TvxzmL8o/cbxs/X5D8SqZ+ExI+Gl/C4Sx11PhnM9Jtn7QbiNL0f1po0FykXlNKr72kZeDy+90CRQRbn9ArGAJKI5jgCPUDzqvPsjMT5n34OmudqjaZ1nWewZNqvHOzwFZUMXosurbIwkkWRl95vOTQvprBMwRgIG/UkqODxD+YX3nxVBwAA',
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
