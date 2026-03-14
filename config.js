/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['923247220362','923247220362'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Knight Bot Mini', 'Professor'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Knight Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU25KiSBD9l3rVGBAUxIiOWARbELobRPCysQ+lFFDcrSpQnPDfN7C7Z+Zhd7b3ra6ZJ885md9BWWGKLNSB2XdQE9xChvol62oEZmDeRBEiYAhCyCCYAWkZFqsmlVPbukUoTl7EgklT17NNPdQvpxTauqVM43Wdm0/gPgR1c8zx6XcBm8S/TMLD4lJky8zdhnWgFvF8xG2kXXV0C2uw3uiZZzli/ATufUSICS7jRZ2gAhGYW6hzICZfg985bb2fTHWlq3Vjx81Tx6lyA/pXY5E2zkbnYJMax47KPP0a/EAe7wZdMgjwTan2mJYj6E6rre27Y1+KmLpPV+wq6127fHmHT3FcotAMUckw677Mu7YgB62ot2LTlhfLGahoGjMdDYzKduk6b0TV2S/NNPVy/2vAD/OGWwuRxNTLbpKvyPP1TeMgOWDVd4QGV60pWpvX68TMx78Cd8inV7L/wzs1yT5ReINezlUgSnkd1S+r2Fu4g13gwfNKCYo5x9viIDh9Df6FbS94IZxvuRrkdr0ODsXN4VRe1287etA8WZHOvnx6a9LsJ3zIGvI7lNAOt7YjHOtVpl1lFsi2HyMXRW7lHZ/l1dIuMn+6oaWS+JbRnu2z41oTTxVFnxZ6505f4UC7YiWSGM2ub2mBtXaA46dHRRnqzBDMRvchICjGlBHIcFU+zoTpEMCw9dCJIPagF+SNVAS7jt9yVw/Fp8xK02O29k0kpfXeUw/TfJmiSIsmzssTGIKaVCdEKQoNTFlFuhdEKYwRBbM//xqCEl3Zu3B9OnE0BBEmlPllU+cVDD9V/byEp1PVlMzrypPWLxABM/7nMWIMlzHteWxKSE4JbpGWQEbBLII5RT8qRASFYMZIg350rVaFPfHSVJnPXdUAQ1A8BMEhmAFFEIWxLAi8KAkzkf+Dfrv0YWFdfysRA0NQwv41UMuq7IqqoWAI8sdPYTwZ88JIFKWxPBkr/ef+4v4DdJ8jRAzinPbNZIpogl135HDOzd3vVayqlqr2RH4W+emWdzVKpDcWvzGrKBVDGlbmXAz4YlluMamjk/lcZudqXQiam/j/FATMwFvxXHLl0lLDYziuZc+7zqXSYMpAT9fYn9bIzTn+yHsjhfNQJZyFqaxKVoKJLcdb2L6+CcvrQt+slkFCu7MpxgZ01ctTny1ELT6hX5Ot0gGnQiZbmnd+bm7lSGtwtAwmLTrf2i4irVK8lm/rZewIi4M9X9VdYO+38oVbVXyBX12YO9ViDAuSbCnVaxLoqRp/+PjRR/nH/MIPh/Xy9dsIo8c4+JDpP+V8B967jr8Pf4nxMWD+pUnnBzGWMVt0ljFWxKMBNTUchaukHlVnaSdq88PEOi8OLM7MANzvfw1BnUMWVaTo51BxhGAISNX0HjbLqPrdzFV5U43j577sHFKm/uyLDS4QZbCowWwky+KYH48E4f2VQ6ragDQBM+Bss8kc3P8GxDdJ/WQHAAA=',
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
