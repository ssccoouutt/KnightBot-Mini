/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923190779215','923190779215'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Knight Bot Mini', 'Professor'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Knight Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2ZKiSBT9lYl81WhZRMGIihgWWQpUFC2XiX5IIVkEWTITEDvq3yewqrr6Yaanhqck88a9555z7v0B8iIhyEYdmP0AJU4aSFF/pF2JwAwodRgiDIYggBSCGZhY0XJQOP74tBhdFFFsbsZB6+q8HsiDgWdYwkhKMQlTUSdP4HUIyvqcJf5vEq4EREPzEuiNYdX6s3XkD3jL7G6t1Tq1J1d8lHXsvlhO5OIJvPYZYYKTPJqXMboiDDMbdS5M8Nfgc0tlsGqProeVeJJop4HgEsMg7dTjlsV8j+qQMpHawIBhvgY/FjwvGLWbAm/s/ckg/GS/CZ/DVbs4ztVTvLrGjadKdjNKojf4JIlyFFgBymlCuy/zvnc2pKyjsOi6NM54hna6fknLU31iqueTDb2dSFkimQXTfg24ObIT13Eg3IpeI3dMWiZoMr342wlvy1MmcVp4m4ecpjPkV+Au/vBK+n94b+fuohJuKjOqNHIYiIr3PFEu4yiX3ONykxyKMbtm2UlxvxZfg6+bdsGoPnxuRhc3vubV+dJuV+E4tqkljPRmPDo6Nu/NyV38hA9pjX+HUmFHTRj5dcTHddo08ro6RxqXnVaDoCxtoRAO6umu5BumahfY2S53By6+U+QeJvxcksyBvFC8RJOvuWlaxylcCMdDc2mfHh2lqLMCMGNfhwCjKCEUQ5oUeX83YYYABo2HfIzog12AC0NMsHqsGsncMaQ+G2W+dBgjHQmjmK0GsqNrB2OQ2XH0BIagxIWPCEGBmRBa4G6BCIERImD21/chyNGNvunWVxPHwhCECSZ0l9dlVsDgQ9Wfr9D3izqnXpf7an9AGMyYz2tEaZJHpCeyziH246RBagwpAbMQZgT9bBFhFIAZxTX6ObZqEfTMa7rsbQ1uC4bg+lAkCcAMSBzPSsx0KnGsMJvyf5JvbZ8WluW3HFEwBNkjjOMkbiwKY15gGUFi+8j+YQhy2CcD2xj9oRRdz/o75L5CgChMMgJmQF3ulRtKjflq1fKEMQzZimQ1ksFnix9meVOjkwcvvrdYPI99vfSbHdZZemZ3Th0ezZfnY5Mu3HRhmS83znr6hySPNbGjeMWjaFXxFvJW1nlbszt1f1zPNTQWBRXd0GIjrVcjMyfh3tlU+p4zmvhAS//upjZx4ctyix12rmUZDly7ZGpt/dRXC1CT+OjXYoNrs+VguCzq8bROT3d5js2XNSOLp7rT47k1yS153YrnMGy9kOD1ohLNxabaz0Oyq9griuuDWpN0RNc6qpToftt7QfJu48cYZe/rK3k4rBev/w0T9NgG7yr8p5hvwHvTMa/DX3K875d/m1E/crPD/KKpyFTgwWHtW3DeSy/qNOcU1ts7gqYJmqqwfpCA19fvQ1BmkIYFvoIZgHmAi4dVcFH3JrbysPhNMVWxLGUdWX3nGSRU/hyMbXJFhMJrCWbsdMpPeGkq8m9RLi5KE5IYzAC/kU681Lu8k8vSo5B+DBqQ+291jcHr38M5ojOEBwAA',
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
