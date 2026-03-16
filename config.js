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
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBD9l3rVGLmIihEdsVzk0qCiaHvZ2IcSCihBwKoCxAn/fQN7enoedmd73+qScfLkyZP5HeQFpshBLZh+ByXBNWSoO7K2RGAK1CqKEAF9EEIGwRSM7HjRK9xgeJwPzupkUt/Mvd5WedVTej3ftKWBnBIapRODvoBHH5TVKcPBbwCXEmKRdQ6N2rQr49U+iHuy4ba3xm7cyleuYpy1/K5YjJTiBTw6RIgJzuNZmaALIjBzUOtBTL5GX1iovWVz8HyiJiOsH3uSR02TNmNfWBSzHaoixsVaDUOO+xr9RPL9cNCsC7J2dkeTiqPdOnqNls38MNOOyfKS1L4mO/UAx+/0KY5zFNohyhlm7Zd137lrWlZxVLRtmmQix1rDOKflsTpy19ejA/3thPFUtgqu+Rpxa+Bgz3Uh3Ez8Wmm5tMRoND4Hm5HoKGMOuw28zSJBNzj6K3GPfHgl/T+6NzNvfpVuGje46nTfm6j+60g9D+Nc9g6LNd4XQ37F86Pifim+Rt+wnILTAvhaD85ecsmvp3OzWUbDxGG2NDDq4eDgOqI/o/fJJ33IKvI7lio/qKM4qGIxqdK6VlbXU6wL2XHZC8vSkQpprx3var7mrs2cuJvFdi8kd4a8/UicybLVU+aqj3XlkluWfRjDuXTY1+fm5VlRilo7BFP+0QcExZgyAhku8u5txPUBDGsfBQSxp7qAFOYEE+1wrWVry9HqZJb5wuXMdCANEv7aU1xD35u9zEniF9AHJSkCRCkKLUxZQdo5ohTGiILpn3/1QY5u7L1vXTaR74MIE8q2eVVmBQw/mvrxCYOgqHLmt3mgdQdEwJT7fEaM4TymnYxVDkmQ4BppCWQUTCOYUfSzQERQCKaMVOjn0GpF2OmuG4q/MYUN6IPLsx84BFMgCyIvc+OxLPDSdCz+Qb81HSwsy285YqAPsmeYIMjCcCINRYnnJJnvIruPx0+GHWCIGMQZBVOgLXbqDaXmbLlsRMqZpmLHihYr4LOiD2e8S98qvbfAn89fh4FRBvWWGDw78Vu3ig7W2+uhTudeOrett5tgv/wDyHMnbBlZiiheXkUb+Uv7tKn4rbY7rGY6Gk4kDd3QfC2vlgMrp9HOXV+NnWDWyZ6Vwd1LHerBt8WGuPxMzzISek7JVfrqpcsWohoH6NdkvUu9EWC0KKrhuEqPd2VGrLcVp0yOVWskM3uU28qqmZyiqPEjSlbz68Sar6+7WUS3V/6CkmqvVTQdsJWBrmp8v+38EP/w7HNmsh+7Cj/t1PWqu0YYPUc/h10H/7t378Q7i3GP/i8YP5bJvw1kEHvZfnbWNWSpcO/yzi087eQ3bZwLKu/vXEnXJV1T+SDE4PH4qw/KDLKoIBcwBTAPSYFD0AekqDrP2nlU/CaZptq2uortrvIMUqZ8zsEGXxBl8FKCKT8eiyNRHk/E9yiPFKUFaQKmQFzLR1EGj78BCEvB6lQHAAA=',
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
