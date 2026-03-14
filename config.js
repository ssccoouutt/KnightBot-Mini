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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2bKiSBD9l3rFmMsmIhE3YhBRcMcFxIl5YCmgEKqwKFSc8N8n8Pbt7oeZnjtvtWaePOdk/gUwQTWcwxZof4GKomvAYLdkbQWBBkZNkkAKeiAOWAA0cBtLqp28DUVng6kq4Pxu0nqbX11ePQ1PJ5puD7ZaDsuJlb6DZw9UTVig6BcBi1BYJ2bmGn6+XFF5i7i77hNVdJaHgWf5i6ULdUty5fRG3sGzixgginBqVhksIQ2KOWw3AaJfg3/YtJtpaW6LIBpPuMvbPVSJSfbt4SFlx4P8sEpVGUiKeD+bX4OvQr+iu3sMuSZurylZ9efHuCxWadsuZltD3m/082KAjzZyPuDXKMUwtmOIGWLtl3kno4eiLp3wnFBDhf190jbN8VDeYaXrjeSY5s5QOVqtLc//GnC3Gr3Vu3A/21ftwb3v4SOpL8ty6wwSkSt8T1TWVm7me7mwfwa+oZ9eOf8f3uFkOsYcEemmaE4czHaeUB8a/mieWpJ4DsplpXDXqqrgL/Keplamt9S9jMPNeLNNx8LQvGMdcttLk1hRmSxYwiXzRSOoP+AHrKG/QnnlotM0m/hW08/PNNw3V9xW6jZ3caon0lVNFQnzq8GD2W1rT9fSPeDW0OdQxuvLKMIL1CwevI791hscx29htdXLKr+9vyo6w9aOgSY8e4DCFNWMBgwR/DrrD3sgiK87GFHIXvSCSCB375rrByMPdTE+hVYohV4pjaQxbQLED9XqogRvQ79N30EPVJREsK5hbKGaEdouYV0HKayB9sefPYDhnX0I16WThB5IEK3ZATdVQYL4U9XPyyCKSIPZrsWR0S0gBRr/4xgyhnBadzw2OKBRhq7QyAJWAy0Jihp+rxBSGAON0QZ+71qDxB3xfcuZ6IJjgB4oX4KgGGhgKEqiPBBFXlJETVR/r3+7dWGDqvoNQwZ6AAfda6BjgtuSNDXogeL1U5T7Mi8KkqTIg7487D53F8/voLscMWQBKmqgAcN+wD5ynAvczB+O7+tI1+e63hH5WeSnWz7UwHDczPm9TZJciuuY2CPJ5csp9hCtksie4POFbEvRcLLDPwXpGsC7mQJbeu3jvpmtDFOpyaZaC+w4TLZcS7d4vV6QMl7jy0hXvKF8EsPd2VnGNyuZT3juuPKns7t7O+aR7vLncjlbY2HsvHfZYnhFEfw5WaXfBhkkS68/JrfpDe58wqnTkzJz80I4z9zp6VAu5gd7gHlO5ip77nl0ZBjhcTQ38nm4amMWjxVRPl2y1Ux89E2Y+Jn+4eNXHxXf5hd6OayTr9smCL7GwTeZ/lPOD+Cd6/hn76cY3wbMvzTp6CSlA8TMdm7JQym0AkOPhXiWVQK5KEfJGJ3684t5YunZdsHz+WcPVEXAEkJLoIG6DAPQA5Q0nYdtnJBfZDJ03tbTdNKVXQQ103/0xR6VsGZBWQFNGAwkSVD7A/Hj1YaSygrqDGhg4537I/D8G1f52y5kBwAA',
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
  
