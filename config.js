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
    sessionID: 'KnightBot!H4sIAAAAAAAA/61V227jNhD9FUOfY69S5S7y0SBo96YFmga9L7uNIdCSY0mVKpE8rN1g/70zpS8uE6S72K9gzvDMmTPn0O6lG7vP2C7m05GbtW09qOfNfMquZit/yv5ezS6uMv+5pA/m77N38/qM9o7mZpP7vMv5XDPYfKIn9mK+Yq/4G97XzL/IuK3yK0oB68yPZqLdYjZ6K0N+V4x0v+1+j1K421CjO25vXlF53iZ1rP6fK7Y809f4Yp6Zp6uXG7X0rY57p3fS9a6mU4SjB0r3jPrr5X0FmP3E6uX58M/fF9uN3C4o24q3Nf876+0Z9C3386L6mG/uX3L3Mbt/u6C5ZkXf7W3h0yN/Ym6m8C6Yv082/T6fPvx972R+9M47Bf+W3V2x7Y3o3sP/hAunv09fP6f/3t3O726I0mD/G2O+Cq/078VvV/O8vWd6fP6Oa0Gf0d5Y87+ZzL9r/H8qK8Y+e7U6/Wv3vj9Ym/3/H3B294Z9N5jGofn2TfT8Lp8W9f81u91vKxY9lQ9N0OqU9GqO4fG1YJ/rR/fL6U86v8s+5p0Y9/0F95fC6p0v3Z++x3S0p/P5/5zK9XmXnZ/fIu+m+O/q6+9FvL/lP2O2X9v/2DbeD8aK7+Xp3OizT+f8iY5/L/76+1XU9n/HveT6tJ3H9Yv96P+U++lX8m9P2X/zW/YI8vL86V02u/L+/m53+fO3B/o/zV9Yv+r/88v++6+Xn0v7y1P+v13w1/9z3D2b3/1G/P0qXzT/+w62T0X7G9k/+fMv+X/X/+f9r5v/P00R7I/H9N8R+v9S3v90Tf8/Y7X/lP/o7+m/vTz/r8f8G9nS92v9X/+YfO7zZ9X/09X+T/Y01f4m9/kO1v95K582+l8P0qf7/Uvx+6f8VfP/P/U0/9uT9f/f7X9N+X/6G1vYf66G33V6W/f7Oub/833+6X/+R+V///zH7X/6G9r+B7R/86X9M/t6+X76f/rL6v8T+7X/9uP6P9f/Z+P/9L9T6X85u6r937T/e/H3D+3/nOf/8S8tGf/9X/I3/S0p9N8z2f+6+7/3O60O+u8u9L/3uD9pZ9fS/2+h/6Y6Svp987/p91/00/f/A8E5p0ZpCwAA',
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
