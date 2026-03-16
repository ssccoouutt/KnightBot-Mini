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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBD9l3rVGLkrRnTEgnhXQAFt3ZiHaqqAUiywqlBxwn+fwJ6emYfd2d63umRknjznZH4DtCAcz3EN+t9AycgFCtwcRV1i0Ad2lSSYgTZAUEDQBwNPP3MlHMUtXuqy42XB3XcPU6hvbniZFikTyeDold29cnwBjzYoq7ecxH9IOFy3xlE4N1NvySNfJRy24lZ0o3gf2UznZHeoW51L3lkp0Qt4NBkhYYSmwzLDJ8xgPse1Dwn7HPzjfLB1TH7bs9AfjMJiEgS7MQnPb3p10bzS2d8PIpdTOqDTz8FXcn/kS8rYzvz97B5D7tHzZDsWpHc9SfYhLj0Z6Xo5dKTVO3xOUorRFGEqiKg/zXswHSfbCKdDwgS3vfzS25ZGupstOuFtndd4s1kuPc3bu6/p54BnndbVpqdrb3c8LjjWnbM18FkMc2zU5j4xIZ1yw1vaONv9DtxnH145/h/eBwu9exuxmi1OlrveKov0TahDrNzOh9A7uJnk02uOzHvv9EneE4iD+yEdU8TwJg2ge43rSZeH5sxaJTLddo1tPS8nki0Xv+BDUbE/oTyX+96osB05Us5bfPZaF6pfLdTVJvktnxSevLc7oWbkncVhEwzO2i2K7QkZs8Q9RqilJHi4cGZdrp3T2rveWebzK3PSl2dHR1xPEejLjzZgOCVcMChIQZs3RVfbAKJLgGOGxZNeEFV+7t5tZTyeZXmmGi1SLdUsMG3oEcMbqqHq5sdwlQV49wLaoGRFjDnHaEK4KFi9xJzDFHPQ//trG1B8E+/CNeVUuQ0SwriIaFXmBUQfqn58wjguKiqCmsaD5oAZ6Eu/nrEQhKa84bGikMUZueBBBgUH/QTmHP/sEDOMQF+wCv+c2kGBGuJ1a9nVR68b0AanpyAEgT4wFVWT5J5kqma3byh/8S/XJi0syy8UC9AG+TNM0bo9XVMVXdJUReo1kc3H4yfCJiHCApKcN9ZbtoKDGq3OHYbuq93OCixrblkNax8dfVjjnXqKbaTC9S3zhh3p6EfpxF5t/NcUT9yd5BSUXPTqXuhoNYj+KQnoA3eiVIM3lyT5DEVkMKV6WLhErQpDSXeBlrmnhbP1Jyf1tXNHI+hsDT9YxEd6mdIcvV0Oa7szrDpS2JvHVpkUmiP1Ts7qpamG8IXE+Pdi1qZbRr49tSAhgZWNK1JXSzq3bN+Toh52PFG17tdtlfi92Jv6uKzRXWOd/Zya67J733JxQ4ZSGfOdCpXlqxjPnb1jvZv2OTT5j2VFnnZqtGquCcHP2aewUfC/tXsH3lhMerR/y/Fjm/zLRNp7NX1FyjHehZlvzhx5al+jUShrk+y+dS1jprHWGze818jKwePxtQ3KHIqkYCfQB5AiVhAE2oAVVePZKU2KPy0pK1pZN8tqOs8hF9avOQjJCXMBTyXoy92uaqhKT9bfo3xWlBPIM9AH6trcqyZ4fAcHxbHvVQcAAA==',
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
