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
    sessionID: 'KnightBot!H4sIACyRt2kC/5VUXZOiOBT9L7zaNSJfSldN1fKh4heggLZu7UMaAkQxYBJUmJr/vsGenp6H3dneF0gul5OTc8+93wRcIgoXsBGevwkVQVfAYLdkTcXfglmnKSTCk5AABvje8tQLlcJJ3KOVOrC9PGh99zgD6vYOV1mZEZZaJ68aHqTTV+H7k1DVrwWKfwM43vSmUbjQM29FI19GFPTiXnTH8BCZRKVof2x6/WvRX0sRB+wQASIIZ+Mqh2dIQMGp+zz0OfqnhbWzdXo/kNC3JmHpBMF+isLLq1pfFa+yD+2RFYMMW3j2OfpS4U98UZqauX+YtzGgHr44uylDo9tZNI9x5Q0SVa3Gtrh+o09RhmEySyBmiDWf1j2YTdNdBLMxIoyaXnEd7Sot28+X/fC+KRq43a5WnuId3Jfsc8Tzfu9m4vNttD+dlhSq9sWwfBKDAmqNfkh1gGdU81YmzPe/EvfJu1dO/0d3a6kO7xPSkOXZcDc7aZm9MnkMpfvlGHpHNxd9fCsSvR2dP6l7CmDQHrMpTgjcZgFwb3HjDGmoz411OsC7obZrFpUjmoPygz5gNfkdy0t1GE1K0x5E0mUHL17vitWbkQwVp7gXTukNDmY/VLSivzxuA+ui3KPYdNCUpO4pSnpSCsdLez6kyiVrvFtLcp/eiJ19fdyIyzVLhOcBXxKYIcoIYKjEXUxS5ScBJNcAxgSyh7xCVPuF25rSdDrPi1zWeqheyXmgm8BDmjeWQ9ktTuE6DyAvD9eLlDGkFCYORy5Js+IbkEEqPP/515OA4Z29Fa47Th48CSkilEW4rooSJO9Vff8I4risMQsaHFvdgkv0LH6EIWO8/2inY40BiXN0hVYOGI+koKDw5w0hgRyRkRr+7FqrTDrhVWM1VCcvW878/CgI4omCLsmKOBiJuqwPnzXpD/rl1sGCqvqCIeO5xSNNUoYjVZElVeQPcdRldh++/2TYASaQAVTQznqrXnCUo/WlT5J2vd8bgWEsDKNT7f1G79Z4kx5DM5HB5p5747548qPMMddb/yWDjrsX7RKjq1q3pZqsreifQDiC60i19eqitJgnEbJmWA1LF8l1qUnZPlBy97y0d75zll/6bTIB9k7zg2V8wtcZLpLX63Fj9sd1XwxHi9io0lKxxdHZXn/tTkvgFcXw18OM7bCKfHNmAIQCI5/WqKlXeGGYvidGI2h7rO61t12d+qPYm/mwapJWIf3DAuubatjuKLsnmlRri70MpNULmy7sg228mfbRNMWPYYUedupq1W1TBB+9j0FXwf+u3RvxzmIiB/7A+DFN/qUjzYOcvSTSKd6Hua/P7cHMvEWTcKA4ebtzDW2ukN4rn1MvkVHwNuderwrA0pKc+c+AD4eSO4P7saw7z85wWv5uSBnR2rgbRnfzAlBmfPRBiM6QMnCueAcPh7ImS6OB+pblk7JyAM05gLzRD7IufP8bB8Wx71UHAAA=',
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
