/**
 * Subscription Manager - Manage users who can use bot in self mode
 */

const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'sub',
  aliases: ['subscribe', 'subscription', 'allow', 'deny'],
  description: 'Manage user subscriptions for self mode',
  usage: '.sub <start|end|list|stats> [user_jid]',
  category: 'owner',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    const { from, reply, react, sender } = extra;
    
    if (args.length < 1) {
      return reply('👥 *Subscription Manager*\n\n' +
        'Manage users who can use the bot when Self Mode is ON\n\n' +
        '*Commands:*\n' +
        '• `.sub start <user_jid>` - Add user subscription\n' +
        '• `.sub end <user_jid>` - Remove user subscription\n' +
        '• `.sub list` - Show all subscribed users\n' +
        '• `.sub stats` - Show subscription statistics\n\n' +
        '*Examples:*\n' +
        '• `.sub start 923001234567@s.whatsapp.net`\n' +
        '• `.sub end 923001234567@s.whatsapp.net`\n' +
        '• `.sub list`\n' +
        '• `.sub stats`\n\n' +
        `*Current Self Mode:* ${config.selfMode ? '🔒 ON' : '🔓 OFF'}`);
    }
    
    const action = args[0].toLowerCase();
    
    // LIST COMMAND
    if (action === 'list') {
      const users = await database.getAllSubscribedUsers();
      const userCount = Object.keys(users).length;
      
      if (userCount === 0) {
        return reply('📭 *No Subscribed Users*\n\n' +
          'Use `.sub start <user_jid>` to add users.\n\n' +
          `*Self Mode:* ${config.selfMode ? '🔒 ON' : '🔓 OFF'}`);
      }
      
      let listMsg = '👥 *Subscribed Users*\n\n';
      let count = 1;
      
      // Get first 20 users to avoid message too long
      const entries = Object.entries(users).slice(0, 20);
      
      for (const [jid, data] of entries) {
        const displayName = jid.split('@')[0];
        listMsg += `${count}. *${displayName}*\n`;
        listMsg += `   📅 Subscribed: ${data.subscribedAt}\n`;
        listMsg += `   👤 By: ${data.subscribedBy?.split('@')[0] || 'Owner'}\n\n`;
        count++;
      }
      
      if (Object.keys(users).length > 20) {
        listMsg += `... and ${Object.keys(users).length - 20} more users\n\n`;
      }
      
      listMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      listMsg += `📊 Total: ${userCount} users\n`;
      listMsg += `🔒 Self Mode: ${config.selfMode ? 'ON' : 'OFF'}`;
      
      return reply(listMsg);
    }
    
    // STATS COMMAND
    if (action === 'stats') {
      const userCount = await database.getSubscribedUserCount();
      const selfModeStatus = config.selfMode ? '🔒 ON' : '🔓 OFF';
      const selfModeDesc = config.selfMode ? 
        'Only subscribed users can use commands' : 
        'All users can use commands';
      
      return reply(`📊 *Subscription Statistics*\n\n` +
        `👥 Total Subscribed Users: *${userCount}*\n` +
        `🔒 Self Mode: *${selfModeStatus}*\n` +
        `📝 Status: ${selfModeDesc}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*How it works:*\n` +
        `• When Self Mode is ON, only subscribed users can use commands\n` +
        `• Bot owners can always use commands regardless of subscription\n` +
        `• Use .sub start to add users\n` +
        `• Use .sub end to remove users\n` +
        `• All data is synced to Google Drive\n\n` +
        `*Commands:*\n` +
        `• .sub start <jid> - Add user\n` +
        `• .sub end <jid> - Remove user\n` +
        `• .sub list - Show all users\n` +
        `• .sub stats - Show statistics`);
    }
    
    // START/ADD COMMAND
    if (action === 'start' || action === 'add') {
      let userJid = args[1];
      
      if (!userJid) {
        return reply('❌ Please provide a user JID.\n\n' +
          'Example: .sub start 923001234567@s.whatsapp.net\n\n' +
          'You can also use just the phone number: .sub start 923001234567');
      }
      
      // Normalize JID
      let normalizedJid = userJid;
      if (!normalizedJid.includes('@')) {
        normalizedJid = `${normalizedJid}@s.whatsapp.net`;
      } else if (!normalizedJid.endsWith('@s.whatsapp.net') && !normalizedJid.endsWith('@g.us')) {
        normalizedJid = normalizedJid.split('@')[0] + '@s.whatsapp.net';
      }
      
      // Check if already subscribed
      const isAlreadyAllowed = await database.isUserAllowed(normalizedJid);
      if (isAlreadyAllowed) {
        return reply(`⚠️ *User Already Subscribed*\n\n` +
          `👤 User: ${normalizedJid}\n\n` +
          `This user is already in the subscription list.\n` +
          `Use .sub list to see all subscribed users.`);
      }
      
      // Add user
      const success = await database.addUserSubscription(normalizedJid, sender);
      
      if (success) {
        await react('✅');
        
        // Try to get user's name (optional)
        let userName = normalizedJid.split('@')[0];
        try {
          const contact = await sock.onWhatsApp(normalizedJid);
          if (contact && contact[0] && contact[0].name) {
            userName = contact[0].name;
          }
        } catch (e) {
          // Ignore, use number as fallback
        }
        
        return reply(`✅ *User Subscribed Successfully*\n\n` +
          `👤 *User:* ${userName}\n` +
          `🆔 *JID:* ${normalizedJid}\n` +
          `📅 *Date:* ${new Date().toLocaleString()}\n` +
          `👑 *Added by:* ${sender.split('@')[0]}\n\n` +
          `This user can now use the bot even when Self Mode is ON.\n\n` +
          `*Current Self Mode:* ${config.selfMode ? '🔒 ON' : '🔓 OFF'}`);
      } else {
        return reply(`❌ Failed to add user. Please try again later.`);
      }
    }
    
    // END/REMOVE COMMAND
    if (action === 'end' || action === 'remove' || action === 'delete') {
      let userJid = args[1];
      
      if (!userJid) {
        return reply('❌ Please provide a user JID.\n\n' +
          'Example: .sub end 923001234567@s.whatsapp.net\n\n' +
          'Use .sub list to see all subscribed users.');
      }
      
      // Normalize JID
      let normalizedJid = userJid;
      if (!normalizedJid.includes('@')) {
        normalizedJid = `${normalizedJid}@s.whatsapp.net`;
      } else if (!normalizedJid.endsWith('@s.whatsapp.net') && !normalizedJid.endsWith('@g.us')) {
        normalizedJid = normalizedJid.split('@')[0] + '@s.whatsapp.net';
      }
      
      // Check if user is subscribed
      const isAllowed = await database.isUserAllowed(normalizedJid);
      if (!isAllowed) {
        return reply(`⚠️ *User Not Found*\n\n` +
          `👤 User: ${normalizedJid}\n\n` +
          `This user is not in the subscription list.\n` +
          `Use .sub list to see all subscribed users.`);
      }
      
      // Remove user
      const success = await database.removeUserSubscription(normalizedJid);
      
      if (success) {
        await react('🗑️');
        
        return reply(`✅ *User Unsubscribed Successfully*\n\n` +
          `👤 *User:* ${normalizedJid}\n` +
          `📅 *Removed:* ${new Date().toLocaleString()}\n` +
          `👑 *Removed by:* ${sender.split('@')[0]}\n\n` +
          `This user can no longer use the bot when Self Mode is ON.\n\n` +
          `*Current Self Mode:* ${config.selfMode ? '🔒 ON' : '🔓 OFF'}`);
      } else {
        return reply(`❌ Failed to remove user. Please try again later.`);
      }
    }
    
    // Invalid action
    return reply('❌ Invalid action.\n\n' +
      'Available actions: start, end, list, stats\n\n' +
      'Example: .sub start 923001234567@s.whatsapp.net');
  }
};
