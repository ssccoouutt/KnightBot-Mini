/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923400315734','923400315734'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Knight Bot Mini', 'Professor'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Knight Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VVXZOiOBT9L3nVGhBEPqq6alAUkRawUfzYmocAAaJIaBJUmPK/b2F3T8/D7mzvW0hS5557zrnhJygIpshGDdB+grLCF8hQt2RNiYAGxnWSoAr0QQwZBBo46T6HyD7kDXfmb1dsQDh5omTcdeWwLSRBxnOkl7YzwaRP4N4HZR3mOPoD4FgsArldTXkzZPNrMT1fnEsaz5n74hHZR4EcK+OwGZu3xnoC9w4R4goX6bTM0BlVMLdR40FcfY1+T49pbvLOtKfvT8pupVbzZh/scmVdH9xTwjdZ1OZBOTkG6dfoh/vKHXnyTF7QFUkStPKbqZDP+YUz5qJr74S4gsuxbMFAf6NPcVqg2IpRwTBrvqy7ZW/wUSS2V9Uv3HC9n/iTSG9rh5tium2vzvUWuBFvBtajzheI41lAmqisjXXGMfIsZ5KbbnHGK7eeQJa1JHuy4w6b7eWm/E7cqz6ycvo/utd2aNpL2lxeJ6NRK7zimEtou8XqQX9u5YM3423mLrZMOn0xNuswoxtL8SQqupFh6CIU7JvYWKUZDKJgberu9vDaWBEZ0E/6kNXVn1heQs8t090ypnEi4PFIT9qznZxte7mCVTiYjl7XMH8+Z+uBUQby0befmwnJWLK56Qs/xeZGGMd076aiAueGI7KdNLOP6dOjoxNqrBhog3sfVCjFlFWQYVI89ni5D2B88VFUIfaQFxyfe5xxzKHSc1sfe9LsMDihmp+cTKNsDz39dTEWxDI73urNE+iDsiIRohTFc0wZqZolohSmiALtrx99UKAbezOuKycO+iDBFWWboi5zAuMPVz8OYRSRumB+U0STboEqoPGf24gxXKS007EuYBVl+IImGWQUaAnMKfrVIapQDDRW1ejX1E5I3AkfqMHLyFnuQB+cH4bgGGhAFcQhz4sDSRaH2uA7/XbtUGFZfisQA32QP24JCq8IMi8PhSEvC4o2+N7t33/x6+BixCDOKdDAxDKP0mE4ny7wTlR409SnqT5JdfDZz0cw3oR3nJmiEP6YHCSmtD3fLIz1qtDHcrkJF1dD1F3D54aBP22mT/8AAjSwj9eSQxP5nIYJl2+DeO8t1LYy5CG/n81fgrk0j5Pr9kZOqk3k1r8FWa5czGOTr53W24VqTqQzWr14odoU87DUTZWOuxT1QYwuOEK/F9vF4lZs/MNu66aRWzpWKYb0ug2No3BQF0hp5D083C7ycGsdX/GFK1NJNkc7drxSgkVkLjJ1kjlSOwj18uQvoTmsZ+l7ZB8jk78/VfgRps6p7jPB6DH5Bez8+0/n3nh3+eLv/d8g3p+Sf/s1rNcviWc7liigMFlyp6y88vziqqNRYDaRrl6NlL/0ZptsmYH7/UcflDlkCanOQAOwiCuCY9AHFam7wFpFQv5QbDK2LGOVWl3jOaRM/xyCNT4jyuC5BNpAlsWRJCiq+HbLq0g5hzQDGhBf1IOogvvfkYQ31lIHAAA=',
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
