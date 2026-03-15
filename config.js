/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923247220362','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Knight Bot Mini', 'Professor'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Knight Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!eyJjcmVkcyI6eyJub2lzZUtleSI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoia0g0RnI3WTNWNVlSVkZrRkRLdGszTTVJY1F2SkhHaGk3UUxWcStLaU0yWT0ifSwicHVibGljIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiNFM5cVJFMDlpdEhwUk9yMjBobG12d0tOT1RldWdpa1VtM2ZIbTA4ZmsxQT0ifX0sInBhaXJpbmdFcGhlbWVyYWxLZXlQYWlyIjp7InByaXZhdGUiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiI0Tm9zTFY0ckFSK09LZlFSNmphRjgrSzB0Z0h0QW5INjZkcGtoLzlCUEVRPSJ9LCJwdWJsaWMiOnsidHlwZSI6IkJ1ZmZlciIsImRhdGEiOiJlZzQ2NHhkRjNuK2QzSCtRR2RJLzZ2bUptVS9ibW8rSHExTU5PaUFRS2prPSJ9fSwic2lnbmVkSWRlbnRpdHlLZXkiOnsicHJpdmF0ZSI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IndETnVpLy9rcEoybElQbDBLMVBCcWo0a0ZXQ0JyTDc2Y0FocnF2U09pWFE9In0sInB1YmxpYyI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IlJabUgyWDFzVzBwSzBSQVlkUDlGczZRL2ZmWVVrU3h0YzRKWGxMVkZHZ1E9In19LCJzaWduZWRQcmVLZXkiOnsia2V5UGFpciI6eyJwcml2YXRlIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiNENsaStaNUZvSjE1U2xjcGxNSWVaMGtIUGlGa0FITkducndiMnZhUFUyQT0ifSwicHVibGljIjp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiejh6a0M4UlZoMTQ2LzJPMWVhcFoyVzBhclF5SlZjRkxVUVEzUGxMUTZnST0ifX0sInNpZ25hdHVyZSI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IjRrRThTZ0owL3ZpeXV2YVdrOVdBM2hzY1BINjVKMDN1VXc3WjBjeXRQMFlmZVNvOUF5MlJ1UlRVY0kySjdJbTRpc2ZDNWhSMjhha1RKQU10dFlOcWlRPT0ifSwia2V5SWQiOjF9LCJyZWdpc3RyYXRpb25JZCI6MjgsImFkdlNlY3JldEtleSI6IlpYUUVGZEg5MVFpTHU3ZFlCeUxJTC8wV2lMeDNPbUV0SGxKc2wzZHlrS0E9IiwicHJvY2Vzc2VkSGlzdG9yeU1lc3NhZ2VzIjpbXSwibmV4dFByZUtleUlkIjozMSwiZmlyc3RVbnVwbG9hZGVkUHJlS2V5SWQiOjMxLCJhY2NvdW50U3luY0NvdW50ZXIiOjAsImFjY291bnRTZXR0aW5ncyI6eyJ1bmFyY2hpdmVDaGF0cyI6ZmFsc2V9LCJyZWdpc3RlcmVkIjp0cnVlLCJwYWlyaW5nQ29kZSI6Ik5GV0U4OE1TIiwibWUiOnsiaWQiOiI5MjM0MDE4MDkzOTc6NDNAcy53aGF0c2FwcC5uZXQiLCJsaWQiOiIyNDc4NTQzMjUwNDMyMDg6NDNAbGlkIiwibmFtZSI6IjkyMzQwMTgwOTM5NyJ9LCJhY2NvdW50Ijp7ImRldGFpbHMiOiJDTXFTajNVUXNvemF6UVlZQVNBQUtBQT0iLCJhY2NvdW50U2lnbmF0dXJlS2V5IjoibmVCZDNhUnhoT0UvMGtQVWdIQlFWUFhnZUhOWTBEb25pdjV1em81ZFFDVT0iLCJhY2NvdW50U2lnbmF0dXJlIjoiUUNSU3E5SHJpRUg1QlRPOXlDNHZ4YXIwQS9xU0hzbFdQeiswZ0ZIcFNCRkNzYVFmaTZHbUJ4ZklGa3BJRGJ6OE96SDhad1F2dGVzZzNjWVhnTVMrQnc9PSIsImRldmljZVNpZ25hdHVyZSI6Ik5nK0RtaWNCZGlVZEZMWG56NVNnVE1PVlY3UDY3UFBoZnFOZEVRaS8xalNzWG55bWFSYys5QWJ1SWZ0NjNHbG5jREM0MGRYMGg1dnNFai9xOEU0bmhBPT0ifSwic2lnbmFsSWRlbnRpdGllcyI6W3siaWRlbnRpZmllciI6eyJuYW1lIjoiOTIzNDAxODA5Mzk3OjQzQHMud2hhdHNhcHAubmV0IiwiZGV2aWNlSWQiOjB9LCJpZGVudGlmaWVyS2V5Ijp7InR5cGUiOiJCdWZmZXIiLCJkYXRhIjoiQlozZ1hkMmtjWVRoUDlKRDFJQndVRlQxNEhoeldOQTZKNHIrYnM2T1hVQWwifX1dLCJwbGF0Zm9ybSI6ImFuZHJvaWQiLCJyb3V0aW5nSW5mbyI6eyJ0eXBlIjoiQnVmZmVyIiwiZGF0YSI6IkNBVVFBeEFBIn0sImxhc3RBY2NvdW50U3luY1RpbWVzdGFtcCI6MTc3MzU2OTU5MCwibGFzdFByb3BIYXNoIjoiM1I5WjM5In0sInZlcnNpb24iOiIxLjAifQ==',
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
