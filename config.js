/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923400315734','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Tech Zone', 'Anonymous'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Tech Zone',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBT8l3rVGFFBxIiOGG4iIggqCmzMA0KBpdysKkSc6H/fwO6enofd2V6eioLIk+dk5vkJihIRaMAWzH6CCqNbSGF3pG0FwQxIdZJADPogDmkIZkAz+ZpHQm3xbcpilUi5KNelHi+PUDPdtTIyr62kL1PKsC/gtQ+q+pih6A+Aq0Mm6Mr1bg1LfKzndqAYkWXqF92txHoknq++IPba9Ebm/gt47RBDhFGRqtUJ5hCHmQFbO0T4a/Qv611+LdbZ4b7zK1+GPimVIJjIt3RfhpwWVmmQqJuBYw/9r9GX4VwX3KnBOZuDLCxK4rVxmu+KOfWqQ92zd41S2St+9NiJb/QJSgsY6zEsKKLtl+fuG4iYQ3cwxvvikNl0bbimMff8JR/ox1hZiOOJI9zFXF80XyPO5445ZtKFi7fcYbzumal0tRNFvl9MvCOxsFMy5RKrXM91fidu4w+vXP7P3A3pvF6ap+V1sbrWfM8JDHdt+IwwZfBqKxjT+VEmp6ZJlLn6NfoUcnN1jw3ZzAdXMzNdt+IkhCttsA3ui1hiZDgd6sJI0KJP+iGt8Z9YhroG/WHiWa6xkfL9JbAsJ4UFez4ueym3HmhY8WGwRI/VSGSXB39rNZ5jzW/TuKbSyrZ9jpBLU6rCCjaWZAV1mnvn5uXZ0QW2egxmw9c+wDBFhOKQorLo7oRJH4TxbQsjDOlzuuC0qp19MFbGg8hqTcPXe/uL4TmuKj92u60kJ6qNGG1zJCL7AvqgwmUECYHxAhFa4taEhIQpJGD2148+KOCdvun2ZDAZDfsgQZhQt6irrAzjD1k/P4dRVNYF3bZFJHcHiMGM+byGlKIiJd0o6yLE0QndoHwKKQGzJMwI/NUkxDAGM4pr+Cu4chl3s+dVUxMX/BL0Qf7UBMVgBoTRmGWY8ZDjx+yM+06+NR1qWFXfCkhBH2TPv0ZTZjriGZ4dsQw/ms647919HxRhBwXEoizavKxJN/d3yl2FGNIQZaRLrX44cwG7UFf2bTJlNU1UU1FORfDZ4odd3vTwjBiKfOoomo0tKC0Ugtiezj2GDwWF/DhuL+TqTSdEVPSXfwABM7DcR4+dFeQDiW2hY4ZqdOKkgD/vou2FFHu5Qseqyg1x1IpRT1Aiz/HUhSeHGWSSUtbONi2E1bRBC2FYrsnyUtSHnuy8dNVieEMR/L3YMXBMT76PG885RouE21U7ptxXk6XvTRjZ3TBelZqDdbO6L+Krne+rW7vSoqmd29aEbwSdyBv9MBflE+Zu11t0LpCLTuKbkZ9Byt4XGHp6rBOve00QfO6Ddx3+S8w33p3pmNf+bxDvC+ZfQirt28JL16wq3s+Th5duGl6vbbSOhKhh81oYR9XKyAZrLIoteH390QdVFtKkxHmX8CLG5dMruKw7D+tFUv5pvUu6rjip3jWehYSKn7nYoRwSGuYVmA15nhM4XmBHfZC3YlVtaUg/AgXE7lFHDnj9G5hoydZtBwAA',
    newsletterJid: '120363304414452603@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: 'https://lora.comds/main.zip', // URL to latest code zip for .update command
    
    // Sticker Configuration
    packname: 'Telegram--> @techzonex',
    
    // Bot Behavior
    selfMode: true, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    
    // ===== LINK CAPTURE CONFIGURATION =====
    captureEnabled: false,      // Master switch for link capture (on/off)
    autoJoinEnabled: false,     // Automatically join captured group links
    autoMessageEnabled: false,  // Send welcome message to open chat groups after joining
    
    // ===== AUTO-REACT CONFIGURATION =====
    autoReact: false, // Master switch - set to true to enable auto-react
    autoReactMode: 'all', // 'bot' (only reacts to commands) or 'all' (reacts to all messages)
    
    // Granular auto-react controls
    autoReactInPrivate: false,   // Enable auto-react in private chats
    autoReactInGroups: true,    // Enable auto-react in groups
    autoReactSpecificGroups: ['120363408035540146@g.us'], // Array of specific group JIDs to enable auto-react (empty = all groups if autoReactInGroups is true)
    
    autoReactEmojis: ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'], // Default emojis for 'all' mode
    autoReactCommandEmoji: '⏳', // Emoji for command messages in 'bot' mode
    
    autoDownload: false,
    
    // ===== NEW: Telegram Bridge Auto-Start =====
    autoStartTelegram: false, // Set to false to disable auto-start of Telegram bridge
    
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
    // Add to your config.js
    github: {
        token: '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', // Replace with your actual token
        username: 'ssccoouutt' // Replace with your GitHub username
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
