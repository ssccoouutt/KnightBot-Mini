/**
 * Auto-React Command - Configure automatic reactions with buttons
 */

const { load, save, DEFAULT_EMOJIS, DEFAULT_COMMAND_EMOJI } = require('../../utils/autoReact');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

const FORCE_AI_MODE = true;

module.exports = {
  name: 'autoreact',
  aliases: ['ar'],
  category: 'owner',
  description: 'Configure automatic reactions to messages',
  usage: '.autoreact',
  ownerOnly: true,

  async execute(sock, msg, args, context) {
    const { from, sender, reply, react } = context;
    
    // Clear any existing sessions first (like commit.js)
    const existingSessions = sessionManager.getUserSessions(sender, from);
    for (const sess of existingSessions) {
      if (sess.command === 'autoreact') {
        console.log(`[AUTOREACT] Cleaning up existing session: ${sess.id}`);
        sessionManager.clearSession(sess.id);
      }
    }
    
    // Create session
    const session = sessionManager.createSession(sender, from, 'autoreact', {
      step: 'main_menu'
    });
    
    await react('⚙️');
    
    const sessionId = session.id.split(':').pop();
    const db = load();
    
    // Build status display
    const statusEmoji = db.enabled ? '✅' : '❌';
    const modeText = db.mode === 'bot' ? '🤖 Bot Commands Only' : '🌟 All Messages';
    const privateStatus = db.inPrivate ? '✅ Enabled' : '❌ Disabled';
    const groupsStatus = db.inGroups ? '✅ Enabled' : '❌ Disabled';
    const specificGroupsCount = db.specificGroups?.length || 0;
    const groupsInfo = specificGroupsCount > 0 
      ? `🎯 Specific Groups (${specificGroupsCount})` 
      : '🌍 All Groups';
    
    const statusMessage = `⚙️ *Auto-React Configuration*\n\n` +
                         `${statusEmoji} *Status:* ${db.enabled ? 'ON' : 'OFF'}\n` +
                         `🎭 *Mode:* ${modeText}\n` +
                         `💬 *Private Chats:* ${privateStatus}\n` +
                         `👥 *Groups:* ${groupsStatus} (${groupsInfo})\n` +
                         `🎨 *Emojis (All mode):* ${db.emojis?.slice(0, 5).join(' ') || DEFAULT_EMOJIS.slice(0, 5).join(' ')}${db.emojis?.length > 5 ? '...' : ''}\n` +
                         `🔧 *Command Emoji:* ${db.commandEmoji || DEFAULT_COMMAND_EMOJI}\n\n` +
                         `*Click a button below to change settings:*`;
    
    // Create buttons based on current state (like commit.js pattern)
    const buttons = [
      { id: `autoreact_toggle_${sessionId}`, text: db.enabled ? '🔴 Disable' : '🟢 Enable' },
      { id: `autoreact_mode_${sessionId}`, text: db.mode === 'bot' ? '🌟 Switch to All' : '🤖 Switch to Bot' },
      { id: `autoreact_private_${sessionId}`, text: db.inPrivate ? '🔇 Disable Private' : '🔊 Enable Private' },
      { id: `autoreact_groups_${sessionId}`, text: db.inGroups ? '🔇 Disable Groups' : '🔊 Enable Groups' }
    ];
    
    // Add specific groups button only if in a group
    const isInGroup = from.endsWith('@g.us');
    if (isInGroup) {
      const isGroupInList = db.specificGroups?.includes(from);
      buttons.push({ id: `autoreact_group_${sessionId}`, text: isGroupInList ? '🚫 Remove This Group' : '➕ Add This Group' });
    }
    
    buttons.push({ id: `autoreact_advanced_${sessionId}`, text: '⚙️ Advanced' });
    buttons.push({ id: `autoreact_cancel_${sessionId}`, text: '❌ Cancel' });
    
    const sentMsg = await sendButtons(sock, from, {
      text: statusMessage,
      footer: 'Auto-React Manager',
      buttons: buttons,
      aimode: FORCE_AI_MODE
    }, { quoted: msg });
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'autoreact');
  },
  
  async handleSession(sock, msg, session, context) {
    const { from, sender, reply, react, isButtonClick } = context;
    
    console.log(`[AUTOREACT] handleSession called, isButtonClick: ${isButtonClick}`);
    
    // Handle button clicks (like commit.js pattern)
    if (isButtonClick) {
      let buttonId = null;
      let buttonText = null;
      
      // Extract button ID based on message type (like commit.js)
      if (msg.message?.buttonsResponseMessage) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
      } else if (msg.message?.listResponseMessage) {
        const listReply = msg.message.listResponseMessage.singleSelectReply;
        if (listReply) {
          buttonId = listReply.selectedRowId;
          buttonText = listReply.title;
        }
      } else if (msg.message?.interactiveResponseMessage) {
        const interactive = msg.message.interactiveResponseMessage;
        if (interactive.nativeFlowResponseMessage) {
          try {
            const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
            buttonId = params.id;
            buttonText = params.display_text;
          } catch (e) {}
        }
      } else if (msg.message?.templateButtonReplyMessage) {
        buttonId = msg.message.templateButtonReplyMessage.selectedId;
        buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
      }
      
      console.log(`[AUTOREACT] Button clicked: ID=${buttonId}, Text=${buttonText}`);
      
      if (!buttonId) return true;
      
      // Handle Cancel
      if (buttonId.includes('autoreact_cancel_')) {
        sessionManager.clearSession(session.id);
        await reply('❌ Auto-React configuration closed.');
        return true;
      }
      
      // Load current config
      const db = load();
      const sessionId = session.id.split(':').pop();
      
      // Handle Toggle Enable/Disable
      if (buttonId.includes('autoreact_toggle_')) {
        db.enabled = !db.enabled;
        save(db);
        await react(db.enabled ? '✅' : '❌');
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Mode Toggle
      if (buttonId.includes('autoreact_mode_')) {
        db.mode = db.mode === 'bot' ? 'all' : 'bot';
        save(db);
        await react('🎭');
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Private Toggle
      if (buttonId.includes('autoreact_private_')) {
        db.inPrivate = !db.inPrivate;
        save(db);
        await react('💬');
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Groups Toggle
      if (buttonId.includes('autoreact_groups_')) {
        db.inGroups = !db.inGroups;
        save(db);
        await react('👥');
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Add/Remove This Group
      if (buttonId.includes('autoreact_group_')) {
        const isInGroup = from.endsWith('@g.us');
        if (!isInGroup) {
          await reply('❌ This option is only available in groups!');
          return true;
        }
        
        if (!db.specificGroups) db.specificGroups = [];
        
        if (db.specificGroups.includes(from)) {
          // Remove group
          db.specificGroups = db.specificGroups.filter(g => g !== from);
          await reply(`✅ Removed this group from auto-react list.`);
        } else {
          // Add group
          db.specificGroups.push(from);
          await reply(`✅ Added this group to auto-react list.`);
        }
        
        save(db);
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Advanced Settings
      if (buttonId.includes('autoreact_advanced_')) {
        await showAdvancedSettings(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Back button from advanced
      if (buttonId.includes('autoreact_back_')) {
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      // Handle Set Emojis
      if (buttonId.includes('autoreact_set_emojis_')) {
        sessionManager.updateSession(sender, from, { step: 'waiting_emojis' });
        await reply(`🎨 *Set Custom Emojis*\n\nSend a list of emojis separated by spaces.\nExample: \`🎉 🎊 🎈 🎯 🎮\`\n\nCurrent emojis: ${db.emojis?.join(' ') || DEFAULT_EMOJIS.join(' ')}\n\nType \`cancel\` to go back.`);
        return true;
      }
      
      // Handle Set Command Emoji
      if (buttonId.includes('autoreact_set_cmdemoji_')) {
        sessionManager.updateSession(sender, from, { step: 'waiting_cmdemoji' });
        await reply(`🔧 *Set Command Emoji*\n\nSend an emoji to use for command reactions.\nExample: \`🤖\` or \`⚡\` or \`💫\`\n\nCurrent emoji: ${db.commandEmoji || DEFAULT_COMMAND_EMOJI}\n\nType \`cancel\` to go back.`);
        return true;
      }
      
      // Handle Reset to Defaults
      if (buttonId.includes('autoreact_reset_')) {
        db.enabled = false;
        db.mode = 'bot';
        db.inPrivate = true;
        db.inGroups = true;
        db.specificGroups = [];
        db.emojis = [...DEFAULT_EMOJIS];
        db.commandEmoji = DEFAULT_COMMAND_EMOJI;
        save(db);
        await react('🔄');
        await reply('✅ Auto-React settings reset to defaults!');
        await showUpdatedMenu(sock, from, sender, session, reply, db);
        return true;
      }
      
      return true;
    }
    
    // Handle text input for emojis or command emoji
    let text = '';
    if (msg.message?.conversation) {
      text = msg.message.conversation.trim();
    } else if (msg.message?.extendedTextMessage?.text) {
      text = msg.message.extendedTextMessage.text.trim();
    }
    
    if (!text) return true;
    
    const db = load();
    
    // Handle cancel
    if (text.toLowerCase() === 'cancel') {
      sessionManager.updateSession(sender, from, { step: 'main_menu' });
      await showUpdatedMenu(sock, from, sender, session, reply, db);
      return true;
    }
    
    // Handle emoji input
    if (session.data.step === 'waiting_emojis') {
      const emojis = text.split(/\s+/).filter(e => e.length > 0);
      if (emojis.length === 0) {
        await reply('❌ Please send at least one emoji.\nExample: `🎉 🎊 🎈`');
        return true;
      }
      
      db.emojis = emojis;
      save(db);
      await react('🎨');
      await reply(`✅ Custom emojis set: ${emojis.join(' ')}`);
      sessionManager.updateSession(sender, from, { step: 'main_menu' });
      await showUpdatedMenu(sock, from, sender, session, reply, db);
      return true;
    }
    
    // Handle command emoji input
    if (session.data.step === 'waiting_cmdemoji') {
      const emoji = text.trim();
      if (emoji.length === 0 || emoji.length > 2) {
        await reply('❌ Please send a single emoji.\nExample: `🤖`');
        return true;
      }
      
      db.commandEmoji = emoji;
      save(db);
      await react('🔧');
      await reply(`✅ Command reaction emoji set to: ${emoji}`);
      sessionManager.updateSession(sender, from, { step: 'main_menu' });
      await showUpdatedMenu(sock, from, sender, session, reply, db);
      return true;
    }
    
    return true;
  }
};

// Helper function to show updated menu
async function showUpdatedMenu(sock, from, sender, session, reply, db) {
  const sessionId = session.id.split(':').pop();
  
  const statusEmoji = db.enabled ? '✅' : '❌';
  const modeText = db.mode === 'bot' ? '🤖 Bot Commands Only' : '🌟 All Messages';
  const privateStatus = db.inPrivate ? '✅ Enabled' : '❌ Disabled';
  const groupsStatus = db.inGroups ? '✅ Enabled' : '❌ Disabled';
  const specificGroupsCount = db.specificGroups?.length || 0;
  const groupsInfo = specificGroupsCount > 0 
    ? `🎯 Specific Groups (${specificGroupsCount})` 
    : '🌍 All Groups';
  
  const statusMessage = `⚙️ *Auto-React Configuration*\n\n` +
                       `${statusEmoji} *Status:* ${db.enabled ? 'ON' : 'OFF'}\n` +
                       `🎭 *Mode:* ${modeText}\n` +
                       `💬 *Private Chats:* ${privateStatus}\n` +
                       `👥 *Groups:* ${groupsStatus} (${groupsInfo})\n` +
                       `🎨 *Emojis (All mode):* ${db.emojis?.slice(0, 5).join(' ') || DEFAULT_EMOJIS.slice(0, 5).join(' ')}${db.emojis?.length > 5 ? '...' : ''}\n` +
                       `🔧 *Command Emoji:* ${db.commandEmoji || DEFAULT_COMMAND_EMOJI}\n\n` +
                       `*Click a button below to change settings:*`;
  
  const buttons = [
    { id: `autoreact_toggle_${sessionId}`, text: db.enabled ? '🔴 Disable' : '🟢 Enable' },
    { id: `autoreact_mode_${sessionId}`, text: db.mode === 'bot' ? '🌟 Switch to All' : '🤖 Switch to Bot' },
    { id: `autoreact_private_${sessionId}`, text: db.inPrivate ? '🔇 Disable Private' : '🔊 Enable Private' },
    { id: `autoreact_groups_${sessionId}`, text: db.inGroups ? '🔇 Disable Groups' : '🔊 Enable Groups' }
  ];
  
  const isInGroup = from.endsWith('@g.us');
  if (isInGroup) {
    const isGroupInList = db.specificGroups?.includes(from);
    buttons.push({ id: `autoreact_group_${sessionId}`, text: isGroupInList ? '🚫 Remove This Group' : '➕ Add This Group' });
  }
  
  buttons.push({ id: `autoreact_advanced_${sessionId}`, text: '⚙️ Advanced' });
  buttons.push({ id: `autoreact_cancel_${sessionId}`, text: '❌ Cancel' });
  
  const sentMsg = await sendButtons(sock, from, {
    text: statusMessage,
    footer: 'Auto-React Manager',
    buttons: buttons,
    aimode: FORCE_AI_MODE
  }, {});
  
  sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'autoreact');
}

// Helper function to show advanced settings menu
async function showAdvancedSettings(sock, from, sender, session, reply, db) {
  const sessionId = session.id.split(':').pop();
  
  const advancedMessage = `⚙️ *Advanced Auto-React Settings*\n\n` +
                         `🎨 *Current Emojis (All mode):*\n${db.emojis?.join(' ') || DEFAULT_EMOJIS.join(' ')}\n\n` +
                         `🔧 *Command Emoji:* ${db.commandEmoji || DEFAULT_COMMAND_EMOJI}\n\n` +
                         `*Choose an option:*`;
  
  const buttons = [
    { id: `autoreact_set_emojis_${sessionId}`, text: '🎨 Set Custom Emojis' },
    { id: `autoreact_set_cmdemoji_${sessionId}`, text: '🔧 Set Command Emoji' },
    { id: `autoreact_reset_${sessionId}`, text: '🔄 Reset to Defaults' },
    { id: `autoreact_back_${sessionId}`, text: '◀️ Back to Main Menu' }
  ];
  
  const sentMsg = await sendButtons(sock, from, {
    text: advancedMessage,
    footer: 'Auto-React Advanced',
    buttons: buttons,
    aimode: FORCE_AI_MODE
  }, {});
  
  sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'autoreact');
}