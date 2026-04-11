/**
 * Auto-React Command - Configure automatic reactions
 */

const { load, save, DEFAULT_EMOJIS, DEFAULT_COMMAND_EMOJI } = require('../../utils/autoReact');

module.exports = {
  name: 'autoreact',
  aliases: ['ar'],
  category: 'owner',
  description: 'Configure automatic reactions to messages',
  usage: '.autoreact <on/off/set bot/set all/private/groups/addgroup/rmgroup/emojis/cmdemoj>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply } = extra;
      const db = load();
      
      if (!args[0]) {
        const groupStatus = db.specificGroups && db.specificGroups.length > 0 
          ? `\n• Specific Groups: ${db.specificGroups.length} group(s)` 
          : '\n• Specific Groups: All groups';
        
        return reply(`📋 *Auto-React Configuration*\n\n` +
                   `• Status: ${db.enabled ? '✅ ON' : '❌ OFF'}\n` +
                   `• Mode: ${db.mode === 'bot' ? '🤖 Bot commands only' : '🌟 All messages'}\n` +
                   `• Private Chats: ${db.inPrivate ? '✅' : '❌'}\n` +
                   `• Groups: ${db.inGroups ? '✅' : '❌'}${groupStatus}\n` +
                   `• Emojis (all mode): ${db.emojis?.join(' ') || DEFAULT_EMOJIS.join(' ')}\n` +
                   `• Command Emoji: ${db.commandEmoji || DEFAULT_COMMAND_EMOJI}\n\n` +
                   `*Commands:*\n` +
                   `• \`.autoreact on/off\` - Enable/disable\n` +
                   `• \`.autoreact set bot/all\` - Set mode\n` +
                   `• \`.autoreact private on/off\` - Private chat reactions\n` +
                   `• \`.autoreact groups on/off\` - Group reactions\n` +
                   `• \`.autoreact addgroup\` - Add current group\n` +
                   `• \`.autoreact rmgroup\` - Remove current group\n` +
                   `• \`.autoreact emojis 🎉 🎊 🎈\` - Set custom emojis\n` +
                   `• \`.autoreact cmdemoj ⏳\` - Set command emoji`);
      }

      const opt = args.join(' ').toLowerCase();

      // Basic on/off
      if (opt === 'on') {
        db.enabled = true;
        save(db);
        return reply('✅ Auto-react enabled.');
      }

      if (opt === 'off') {
        db.enabled = false;
        save(db);
        return reply('❌ Auto-react disabled.');
      }

      // Set mode
      if (opt === 'set bot') {
        db.mode = 'bot';
        save(db);
        return reply('🤖 Auto-react mode: Bot commands only');
      }

      if (opt === 'set all') {
        db.mode = 'all';
        save(db);
        return reply('🌟 Auto-react mode: All messages (random emojis)');
      }

      // Private chat settings
      if (opt === 'private on') {
        db.inPrivate = true;
        save(db);
        return reply('✅ Auto-react enabled for private chats.');
      }

      if (opt === 'private off') {
        db.inPrivate = false;
        save(db);
        return reply('❌ Auto-react disabled for private chats.');
      }

      // Group settings
      if (opt === 'groups on') {
        db.inGroups = true;
        save(db);
        return reply('✅ Auto-react enabled for groups.');
      }

      if (opt === 'groups off') {
        db.inGroups = false;
        save(db);
        return reply('❌ Auto-react disabled for groups.');
      }

      // Add current group to specific groups
      if (opt === 'addgroup') {
        const isGroup = from.endsWith('@g.us');
        if (!isGroup) {
          return reply('❌ This command must be used in a group!');
        }
        
        if (!db.specificGroups) db.specificGroups = [];
        if (!db.specificGroups.includes(from)) {
          db.specificGroups.push(from);
          save(db);
          return reply(`✅ Added this group to auto-react list.\nAuto-react will now work ONLY in: ${db.specificGroups.length} group(s)`);
        } else {
          return reply('❌ This group is already in the auto-react list.');
        }
      }

      // Remove current group from specific groups
      if (opt === 'rmgroup') {
        const isGroup = from.endsWith('@g.us');
        if (!isGroup) {
          return reply('❌ This command must be used in a group!');
        }
        
        if (db.specificGroups && db.specificGroups.includes(from)) {
          db.specificGroups = db.specificGroups.filter(g => g !== from);
          save(db);
          return reply(`✅ Removed this group from auto-react list.\nAuto-react will now work in: ${db.specificGroups.length === 0 ? 'ALL groups' : db.specificGroups.length + ' group(s)'}`);
        } else {
          return reply('❌ This group is not in the auto-react list.');
        }
      }

      // Set custom emojis for 'all' mode
      if (opt.startsWith('emojis')) {
        const emojis = args.slice(1);
        if (emojis.length === 0) {
          return reply('❌ Please provide at least one emoji.\nExample: `.autoreact emojis 🎉 🎊 🎈`');
        }
        db.emojis = emojis;
        save(db);
        return reply(`✅ Custom emojis set: ${emojis.join(' ')}`);
      }

      // Set command emoji for 'bot' mode
      if (opt.startsWith('cmdemoj')) {
        const emoji = args[1];
        if (!emoji) {
          return reply('❌ Please provide an emoji.\nExample: `.autoreact cmdemoj 🤖`');
        }
        db.commandEmoji = emoji;
        save(db);
        return reply(`✅ Command reaction emoji set to: ${emoji}`);
      }

      reply('❌ Invalid option. Use `.autoreact` to see all options.');
    } catch (err) {
      console.error('[autoreact cmd] error:', err);
      extra.reply('❌ Error configuring auto-react.');
    }
  }
};
