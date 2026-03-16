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
    sessionID: 'H4sIANF4t2kC/5VUXZOiOBT9L7zSNUKDiF3VVRtAFGhtQFHprX2IEDDKlyGAODX/fUN/TM/D7mzvA0VyIeeee+65+c4VJa6Rg3ru4TtXEdxCioYl7Sv25rQmSRDh7rgYUsj2kXGa99qz3SXHSah0y5dlsiJBaG4Vd9wZcnAK9dt9uNJ7YfbI/bjjquaQ4eg3gO5B3S3sJt6EHqaCZ1zUEd476kFY60Lu7Nppdxp5NiIqODPAARFigot0Vh1RjgjMGHWXhb5G/wwC0+h9PnUUvOvKY8qn3ZafQ2NKrtYqUaRxIper0ZMjgq/RHz33EiXqZXogqesqt3rX1eXWm0eNDWTz8ESXofGiF5a/lt/o1zgtUGzFqKCY9l/WfW4qV/dFsi8mbVqSyE88BWa3XTez6KZu6ux2jBdHF4yx4H2NeBPaXipfnkxbUvCpkg+mrFxu6XTs21h7mgdGZjjFqtwsNfArcZd8eOX8f3RvnsXtdCdBkb/2/vpcZA7wepLooYXBuZfdy36Mb5q4vsyDr9FX7ObEVx7epkZ7lLY0TrwNikmRlYJQpTPYPZ901Zrycqd+0oe0Ib9jSWCDq2V6W5cznTT7iyftqC4601pbplhPzllUm/XJ8X39HKxAVo/DfE+uiZNeCi1rkaxMXG8OJv2y7HgopXUtW0ucPr5WxOSyYu5BZEuCUlxTAikuiyE2Fu44GLdrFBFEX9Xl+Dk6ba10ktAROIi+vErPkuE7rbnnM3VnOfbFOQcKfy9d6kfGvyJlhOoaxQsGXJJ+yTYwRTX38Odfd1yBrvStb0M2SbzjEkxqGhRNlZUw/mjqx0cYRWVT0HVfRPqwYAo9CJ9hRCkbv3qQsSkgiY64RfoRUhZJYFajnwUighgiJQ36ObR6GQ+6i6ambzRpypjnr/3A7Eduei/JgqgKU2k6eVCEP+pv3QALq+pbgeig4TuF4USMKMQZy8npS2V9kgIvb4r45oWh1gPgADDI8kH5o/Vv2hZIiyXoX4/Ps5FwdoN0oXlbd5+ixSoUjLLA7bi5lePY04N/AmEIs5UFd4E5TjYv/iLbR5NCPcsie3Z2q1+OK3k0apqRJ5Ici9A/zPf+mNSVNjk1Ii5TKz2P98FMTEq1sQDaO2bUkNzoHodsMWpxhH5Ntofdmte03Gm6E/aDKj8afJ0JoR2BXfeS7xy1uQjtiN6Xcpu1mWpZrZuIIEmLuRr0hzk5ARptbOUWmJt+HoldlG9P4M2Ur0ORvV9G+NUvQzOGbYLR62wXcGjRfzXng/jgIYEBf2K83xb/MnHai5Tu4/tzFG6O7tQ2REvrGE9RXhxvuxVQbJnwh1p53gcgY2PMzFxlkCYlydlhWMSkZNZhhiubwZRWkZS/SaaDwANXAIbKM1hT8Gn0Dc5RTWFesQmdTCRFEpR76cff8r0YxB0HAAA=',
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
