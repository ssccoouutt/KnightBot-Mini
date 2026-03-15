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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBD9l3rVGLkrRnTEgrSiokKjLboxDyVV3G9dVSA44b9PYE/PzMPubO9bUpWcPHlOZn0DPsGIguk3UJQxxWvc9XFF4gYy3IesqzCYAr0OAkzAECDIIJiCbkv9eb64wG6zk0SjFI2V5mx2qbFEzfk2sQNqhmROFXO+fAL3IajqSxb7fwAcSfW+8Cs4KXBhWqtTfr3tRupIg2jyNuCDzT4sd8vb1nb36RO494gwJnERPlcRzjGB2Rp3NozJ5+i/bRYCmkssXRp7e2/xO6/u4vWLJ9i+ZxfZKo1IMl93b1x2/Rx9SaqPoh0k0XH3NsbCUaksZcM4W352TBRo8/34pgvUWOwS/50+jcMCoyXCBYtZ92ndy+fuLWR5ZqyZds4k2UV7zaMTlede4Q7mvqLTWgq2qiCWnyMeO7d1OC8MQk6+lUavawOmjRgGMNNfgrMVKV67E6mghUX5O3GbfMxK+n9052zPiLhTshsfV+ywdFuveZauycXyEzddVGcr3y+wzse1GX6OPmtcNpskHqkHrVK1A64xE9Ry/lER1qq9zmUyFsQD79Tzwy/6kNXkTyyl1LuQNKgrUrqOcyljsdY2PNMtZGdJEV6UgL4GuRYq0OOua0cQxsJRV3edqZ9zKONdiGKcWq/ztp6o2Uh8dfkjNrSnR0cp7pYITPn7EBAcxpQRyOKy6M8ESR4CiBoX+wSzh7wAtqW1cTl42aLR2LPc59cEzx3+DSXKeD229cjfscZx3bY7PYEhqEjpY0oxMmPKStJtMKUwxBRM//46BAVu2btxfTmRH4IgJpQdirrKSog+XP24hL5f1gVzu8Kf9QEmYMr9OsaMxUX4eDvqAhI/ihs8iyCjYBrAjOKfHWKCEZgyUuOfWzsrUS+8vNe3lrKxwBDkD0NiBKZAFUSJ4yecKqrjqSz+Rb9ce1hYVV8KzMAQZI80QRpPZEkUZE4SBW7SZ/YX958Me0CEGYwzCqZgthHcRDw4XHCBN+d00jpNW2tar9pHRx+j8S59gXUkwpc22j2PuNQ+hKbuvNpeiM3tiTPKIm7k+lbKyJkd/gkETIF/DQfHfHXs0rPTvbXy1j0hXFc6P0qipj5nWXpMPSXjkmgllWNL8HmdNCcqy+Ksa7WVmI0Gt6B1IZm7E+vFGFy2nDC7PvXVEG5iH/9e7DY2rqcVba2ZSXCXmZw9F668HcIFXs/p4qZIi2S/ai77XMjU8vxyDpHgeZxkxsaKoeiQlNzS9AV7tmhpNxp4ufrCGc770D6WJvvxWMWPceq96j+DGD92v4C9g//t3TvxfsS4+/A3jB+vyb9spH4WQw8JqX/aR7a6Mvilfj3M97xkRrfjVlNWEhlcqLLzDloG7vevQ1BlkAUlyfsdKhApYwSGgJR1P7PLIij/UGymHRyt1bS+8wxSpv3ag32cY8pgXoEpPx6L8kTkVe49yyZlZUIagSkQX9SzqPa/N5jQuCzAFPBfOHD/DhAIXtlvBwAA',
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
