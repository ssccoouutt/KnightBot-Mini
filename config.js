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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VUW5OiOBj9L3nVGkFAkKquWkAUpJuJF1Tc2ocIAaLcTIKKU/73LezpmXnYne19y+Wrk/Odc758A2VFGPZwC/RvoKbkgjjulrytMdCB2SQJpqAPYsQR0IHr2sbg9QDX59y+ET9VT/kqKE93OdrYV2t2XUdWurU29+NUeAGPPqibQ06i3wCq8da0k8Jv79r9oPaKemBBhXrzOpxsRmp9wmd6c5OldCyqF/DoEBGhpEztOsMFpij3cAsRoZ+jT7xQbJDAqvsGc6HeYifykBB8NQ+HdnKsrJ39tpKmvuudos/RD5oza6hlmMp1voHq/FwfxnuCmtYxhUNY+1V9SS/aNoH59Z0+I2mJYzfGJSe8/bTuHhwGFkGj4yFYHWFVRrdhAWulXuauGccjb+CI/vm23p3ExeeIX116UyN5IITC23XVsl2Wwax63ZvY807rU7PQjkOYoCXcaL8Sh/QjK6f/pft87+LqlkxEBn3zAm8Gmx63OB1Vo3I8i8tswPbb7LbtCcHn6E/g6XaYlv6bt4zX6LwYnKSU8MluK+2SqRsM2pb0lpOst5qmP+kj3tDfsSwgckfCSNwZFknto21fkut0U47b/R5ve1vN3pa5j1K2PF+vBK/X/rFU9iJVlIHIbbiq5nMHycTpDX1NDYqITpRgZS5enh2dcOvGQBcffUBxShiniJOq7M6GstoHKL6scEQxf8oLpqvrgcwDY0Pn1I1kobIjODUmgbZWxsJ5kkaQaK/+KPeP1Qvog5pWEWYMxw5hvKLtG2YMpZgB/c+/+qDEN/5uXPecJPZBQijjQdnUeYXiD1c/LlEUVU3JV20ZWd0CU6ALP48x56RMWadjUyIaZeSCrQxxBvQE5Qz/6BBTHAOd0wb/mFqrijvhndC2nOVwD/qgeBpCYqCD8VCSBVETxtJY1UfyH+zLtYNFdf2lxBz0Qf4sG8qqpsjSUBFkaShoXWV38fjBsAOMMUckZ0AH1ltvdZSCxXlE8X0RhkZrGJ5hdKp9dPQRjXfpS2zGElresq/2QDjBIHXMxQbuUuz4oTCpSnJRmnulxAsr+CcQoIPe1ZETXDqHTbIvOV5oq9WrHA6DacXgcSB7N8mG4pQYYVioy2p5MNtKSXI7m1l8VpShNCtiqrSXlp5E07O1WW7uYqPLUR/E+EIi/Otjb8ixV+t5b4aXuy0Ms56zzzgXKJyG83jBFpNXze85sFGlt8ykYVYcF+JFsiE0pMvdi2+uIBqeam3YfOpak3bp2qZlpe+hfQ5N/v2zIs84dV5124Tg5+yXqHPwv717J95FTHj0f8H4/pv8y0SaeyndxcNTFK4zOJ5PRNe8BtO1KDvZfesbo7lMewc2+roLjBw8Hn/1QZ0jnlS0ADpAZUwrEoM+oFXTZdYtk+o3j1lGsDBuhtF1niPGjZ9zsCYFZhwVNdBFVZVGkjZWxu9VkFa1g1gGdCAtx3tpDB5/A6aGf6RVBwAA',
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
