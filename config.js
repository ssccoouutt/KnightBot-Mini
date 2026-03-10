/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['91xxxxxxxxxxx','917023951514'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['Knight Bot Mini', 'Professor'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'Knight Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: 'KnightBot!H4sIAAAAAAAAA5VU2ZKiSBT9l3zVaNlVIipiWEtcwa3UiX5IIYFUIIFMUOjw3zuwurr7Yaan5i3Xe88959z7DWQEUzRDDVC/gbzENWSoW7ImR0AFehWGqAR9EEAGgQoUu3efSYPzrJiHq0s+9+/G9DhYhr5XrO++skbU2u0H8lJP/Rfw6IO8OifY/0NAx8Ae2WXDQPe98RXiyWWocW22qCdxa53JxeY3PXrerFcC9wIeXUSIS5xFVh6jFJUwmaHGhbj8HPyr0co57C2TIJGKkrRHww38+xiWt/aac8XxYi4mlYZGl731OfiDojWXq6M9E/2EwcHcxCvzzrV8sUNuXA1aPeZf652SIu/6Dp/iKEOBE6CMYdZ8mndtUWM6g+Ji6+myHa5epZNjrukbT5eOVEuyMa/2s3H7uktHnwMuKTtaNj3fc1F4ng6adWDh0e3wdrFkrZFFfHbMwPdnvenr7nfgbvnhlev/4X2jlVZ4Ck+ukoaTbL+VSdNMzaGxH52WTcYmzdTPj+c5dd6kz8Ff2EHIt3uXZGJQU/6kB9U4n5MhpfF2jnYKuY1ML5tiRYt+wYesKv+EcpgSujgd2qK53Afn5H7ytLR1jBHaW3HM7ntiCdedXSr5ujfdTW8HjS5j1z7Olcq86GJvbk41Y2Ivx1w9pkpisMo0W917eVZ0RY0TAJV/9EGJIkxZCRkm2fOM4/oABvUG+SViT3rByRtDqSgOl4tGZnI0JMe7H/H4Eg7YAYb4MNZ5WhyjTMbXF9AHeUl8RCkKJpgyUjYLRCmMEAXq31/7IEN39i5cl07k+yDEJWW7rMoTAoMPVT8uoe+TKmObJvONboFKoHK/jhFjOItox2OVwdKPcY2MGDIK1BAmFP2sEJUoACorK/Szaw0SdMRLQ8M1Tm826IP0KQgOgArGgihIQ0HgREVQBfkv+uXWhYV5/iVDDPRBBrvXQMtI1qSkoqAPkudPQZIlTuBFUZGGsjTuPncXj5+guxwBYhAnFKjAcEokY8/LpxXfesejhjVtpmkdkR9FfrjlXY0MmdWM2zokvIgBDYiji3sufc3ecJmHvmNn14KsU8Hw4t0/BQEqiMP2bbDYbmhOLX2rCKVimItaljjupjjMCdPVpK60wb3da349R9O8GDoLJ4ZutBGVXdSzgk0CLW2ycV19J9jy8e67ZmetPghQjX30ezJhQzVrbUtwFKTXSXWV2mWLvet5iWMulVeCg+x5nYbumtVC4TUBRAoUb3JvTLTt4GYds6V9MrWGUme6WhYmP309EFN79/Gzj5If8ws/HdbJ121DjJ7j4IdM/ynnO/DOddyj/1uMHwPmX5pUP4nREDOrmU2ksXieQEML+GAa5zwplINo6Cd5VlgnFl2dPXg8vvZBnkAWkjIFKqDpGYI+KEnVedjJQvKHTIbGOVoU2V3ZCaRM+9UXW5wiymCaA5UfDoWxIguj4fsrtyT5BNIYqMB9u8o6eHwHzFCZNGQHAAA=',
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
  
