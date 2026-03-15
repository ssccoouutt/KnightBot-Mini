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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBD9l3rVGLkOSkRHrOAFWlEUwcvGPJRUISBUYVGgOOG/b2BPT89G7M72vhVVycmTeU7mdxAyjEqgfweEJiWe4aY9FyypIcftkTcFBjowqijCDHQBghwCHVwcXp7o2olnc9PZ+kWVrBo/M9yYBGytBBxX/CxVPW1s2S/g0QVFdcyS8DeA7k5B/m1pU2/WNy7V/dQJ4g1bFfZuRA9mjhK4yUgCibBWXsCjRYQJS8hpXMQ4xwxmM9y4MGGfow+HSFY8XIW7II0VbSsNuX+IzCZQltztB56hbqiALqYjDT9HX5haDKneFAtazlUtyiJ4J5uDRwWfxmy36qXGalKPQsUQ3uiXyYlgZCNMeMKbT/d9Om1SfkxN4ybOSKwsrj3t0mzIwiHbyrrYQejsRz1vyQVR+BzxxTyQSK2g5eUyHO5r2BdLi/pqfnXXrm+aWnxjwoCEmZGtfiXusnevnP9X3yeYzMbTVLmxdcypSPL10lOvl4zPJmtz6xlTdUb9o8q218/R95h1nH4twgr19rVzlK/XzmYxPCtuM6mijrVL46MwGc0d+7r/oA95xX7H8hqlo5tS2Oxu+pENiTwxLdVF43xP7fly7DfjOk0MuEC0IPuml0GBevIopEVUm6+l0Lc7WzbzVqgi9VKuzouUa4Y5fHlWdMaNjYAuPrqA4VNScgZ5QsnzTpS6AKLawyHD/NlekBE5LRprXcj0krprwnpLHMr9r2h4Mqd5dQhUdlGOea+ZOi+gCwpGQ1yWGFlJySlrHFyW8IRLoP/5rQsIvvE34dp0stgFUcJK7pOqyChE76q+P8IwpBXhXkNCsz1gBnTh4xpznpDTc3dUBLIwTmpsxpCXQI9gVuKfFWKGEdA5q/DPqTUpahsfzMWDudmJoAvypyAJAjoYSLI4EDRtIImqrgl/lF+uLSwsii8Ec9AF2TNMkgaS0lcVWRUFdSC2ke3D4yfDFhBhDpOsBDowF55xw+fpeJm6UilMp0N6GpqnIfio6N0ab61vhp0g9BznVQknRVj7bCLyo+jPq2hvBa/7+uy4Z8e2gptkv/wDSCveK7pHk6q/fM3kCxl44/k116SUBn31tiyqqxKl49pnR62Zbjt+uDBLzdw1CG4beHXPyyoULK8+LUblYoTSmHC6FdTR6qXNhnCdhPhvyaawEny1KRR+lK58c8+ze+r4XzeqZIybIrV6Runu753DMsxILfKBm8fjezEXpcP5NUNlXoc05BvzHKBM6mu8Ws0b44dpn0OT/VhWydNOrVbtZ5Tg5+wT2Cr439q9EW8tJjy6v2D82Cb/MpFGeHKz3Tgdmdgy4G4uzm7ouB0EpkYkQ/S2c3U0UkemIYYoAY/Hty4oMsgjyvJ26RDEaIJAFzBatZ61SUR/k8w0bNtYney28gyWfPgxB5skxyWHeQF0UdNkVetLkvgW5TJaWLCMgQ7k9eAgD9rfa8zKhBKgA/GLAB5/AXmo6ZRvBwAA',
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
