/**
 * Group Forwarding Command - Universal Version
 * Can be used from any chat to set up forwarding between groups
 */

const database = require('../../database');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'forward',
  description: 'Setup automatic message forwarding between groups',
  usage: '.forward <source_jid> <target_jid>',
  ownerOnly: true,
  aliases: ['fwd', 'groupforward'],
  
  async execute(sock, msg, args, context) {
    const { from, reply, react, sender } = context;
    
    if (args.length < 2) {
      return reply(`📤 *Group Forwarding Commands*\n\n` +
        `*Setup:*\n` +
        `.forward <source_jid> <target_jid>\n\n` +
        `*Management:*\n` +
        `📋 \`.forward list\` - List all active rules\n` +
        `🗑️ \`.forward remove <source_jid>\` - Remove a rule\n` +
        `⏸️ \`.forward toggle <source_jid>\` - Enable/disable a rule\n` +
        `📊 \`.forward stats\` - Show statistics\n` +
        `🐛 \`.forward debug <source_jid>\` - Debug group\n\n` +
        `*Examples:*\n` +
        `.forward 120363408035540146@g.us 120363421227499361@g.us\n` +
        `.forward list\n` +
        `.forward debug 120363408035540146@g.us\n\n` +
        `*Note:* Bot must be in BOTH groups for forwarding to work`);
    }
    
    const subCommand = args[0].toLowerCase();
    
    // Handle management commands
    if (subCommand === 'list') {
      const forwardings = database.getAllGroupForwardings();
      
      if (forwardings.length === 0) {
        return reply('📭 *No Active Forwarding Rules*\n\n' +
          'Use `.forward source_jid target_jid` to set up forwarding.');
      }
      
      let listMsg = '📤 *Active Group Forwarding Rules*\n\n';
      let count = 1;
      
      for (const f of forwardings) {
        // Try to get group names (optional)
        let sourceName = f.sourceGroupId;
        let targetName = f.targetGroupId;
        
        try {
          const srcMeta = await sock.groupMetadata(f.sourceGroupId);
          if (srcMeta) sourceName = srcMeta.subject || f.sourceGroupId;
        } catch (err) {}
        
        try {
          const tgtMeta = await sock.groupMetadata(f.targetGroupId);
          if (tgtMeta) targetName = tgtMeta.subject || f.targetGroupId;
        } catch (err) {}
        
        listMsg += `${count}. *${sourceName}*\n`;
        listMsg += `   ➡️ → ${targetName}\n`;
        listMsg += `   🆔 Source: \`${f.sourceGroupId}\`\n`;
        listMsg += `   🆔 Target: \`${f.targetGroupId}\`\n`;
        listMsg += `   🔘 Status: ${f.enabled ? '✅ Active' : '⏸️ Disabled'}\n`;
        listMsg += `   👤 Setup by: ${f.forwarderJid?.split('@')[0] || 'Unknown'}\n`;
        listMsg += `   📅 Created: ${new Date(f.createdAt).toLocaleString()}\n`;
        listMsg += `   ━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        count++;
        
        if (listMsg.length > 3800) {
          listMsg += `\n... and ${forwardings.length - count + 1} more rules`;
          break;
        }
      }
      
      return reply(listMsg);
    }
    
    if (subCommand === 'remove') {
      const sourceToRemove = args[1];
      if (!sourceToRemove || !sourceToRemove.endsWith('@g.us')) {
        return reply('❌ Please provide valid source group JID\n\n' +
          'Usage: `.forward remove 120363123456789@g.us`');
      }
      
      const existingConfig = database.getGroupForwarding(sourceToRemove);
      if (!existingConfig) {
        return reply(`❌ No forwarding rule found for source group ${sourceToRemove}`);
      }
      
      const removed = database.removeGroupForwarding(sourceToRemove);
      if (removed) {
        await react('🗑️');
        return reply(`✅ *Forwarding Rule Removed*\n\n` +
          `Source: ${sourceToRemove}\n` +
          `Target: ${existingConfig.targetGroupId}`);
      }
      return reply(`❌ Failed to remove forwarding rule`);
    }
    
    if (subCommand === 'toggle') {
      const sourceToToggle = args[1];
      if (!sourceToToggle || !sourceToToggle.endsWith('@g.us')) {
        return reply('❌ Please provide valid source group JID\n\n' +
          'Usage: `.forward toggle 120363123456789@g.us`');
      }
      
      const currentConfig = database.getGroupForwarding(sourceToToggle);
      if (!currentConfig) {
        return reply(`❌ No forwarding rule found for source group ${sourceToToggle}`);
      }
      
      const newState = !currentConfig.enabled;
      database.toggleGroupForwarding(sourceToToggle, newState);
      
      await react(newState ? '✅' : '⏸️');
      return reply(`✅ *Forwarding ${newState ? 'Enabled' : 'Disabled'}*\n\n` +
        `Source: ${sourceToToggle}\n` +
        `Target: ${currentConfig.targetGroupId}`);
    }
    
    if (subCommand === 'stats') {
      const stats = database.getForwardingStats();
      const botNumber = sock.user.id.split(':')[0];
      
      return reply(`📊 *Forwarding Statistics*\n\n` +
        `📋 Total Rules: ${stats.total}\n` +
        `✅ Active Rules: ${stats.active}\n` +
        `⏸️ Disabled Rules: ${stats.disabled}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Bot:* ${botNumber}\n` +
        `*Database:* database/group_forwarding.json`);
    }
    
    if (subCommand === 'debug') {
      const groupToDebug = args[1];
      if (!groupToDebug || !groupToDebug.endsWith('@g.us')) {
        return reply('❌ Please provide valid group JID\n\n' +
          'Usage: `.forward debug 120363123456789@g.us`');
      }
      
      try {
        const metadata = await sock.groupMetadata(groupToDebug);
        const botJid = sock.user.id;
        const botNumber = normalizeJid(botJid);
        
        // Check if bot is in group
        let isBotMember = false;
        let botRole = null;
        
        for (const p of metadata.participants) {
          const participantId = p.id;
          const participantNumber = participantId.split('@')[0];
          
          if (participantNumber === botNumber || participantId === botJid) {
            isBotMember = true;
            botRole = p.admin === 'admin' ? 'Admin' : p.admin === 'superadmin' ? 'Super Admin' : 'Member';
            break;
          }
        }
        
        const forwardingConfig = database.getGroupForwarding(groupToDebug);
        
        let debugMsg = `🐛 *Group Debug Information*\n\n` +
          `*Group:* ${metadata.subject || groupToDebug}\n` +
          `🆔 JID: ${groupToDebug}\n` +
          `👥 Members: ${metadata.participants.length}\n` +
          `👑 Admins: ${metadata.participants.filter(p => p.admin).length}\n\n` +
          `*Bot Status:*\n` +
          `🤖 JID: ${botJid}\n` +
          `📱 Number: ${botNumber}\n` +
          `✅ Member: ${isBotMember ? 'YES' : 'NO'}\n` +
          `👑 Role: ${botRole || 'Not a member'}\n\n`;
        
        if (forwardingConfig) {
          debugMsg += `*Forwarding Config:*\n` +
            `📤 As Source: YES\n` +
            `📥 Forwards to: ${forwardingConfig.targetGroupId}\n` +
            `🔘 Status: ${forwardingConfig.enabled ? 'Active' : 'Disabled'}\n`;
        } else {
          // Check if this group is a target
          const allForwardings = database.getAllGroupForwardingsIncludingDisabled();
          const asTarget = allForwardings.find(f => f.targetGroupId === groupToDebug);
          
          if (asTarget) {
            debugMsg += `*Forwarding Config:*\n` +
              `📥 As Target: YES\n` +
              `📤 Receives from: ${asTarget.sourceGroupId}\n` +
              `🔘 Status: ${asTarget.enabled ? 'Active' : 'Disabled'}\n`;
          } else {
            debugMsg += `*Forwarding Config:* None\n`;
          }
        }
        
        debugMsg += `\n*Recent Messages (last 5 from logs will show in console):*\n` +
          `Check terminal for real-time message logs`;
        
        return reply(debugMsg);
      } catch (err) {
        return reply(`❌ Error debugging group: ${err.message}`);
      }
    }
    
    // Main setup: forward source_jid target_jid
    const sourceJid = args[0];
    const targetJid = args[1];
    
    // Validate JIDs
    if (!sourceJid.endsWith('@g.us') || !targetJid.endsWith('@g.us')) {
      return reply('❌ Both source and target must be valid group JIDs (ending with @g.us)');
    }
    
    if (sourceJid === targetJid) {
      return reply('❌ Source and target groups cannot be the same!');
    }
    
    await reply(`🔍 *Setting up forwarding...*\n\n` +
      `Source: ${sourceJid}\n` +
      `Target: ${targetJid}\n\n` +
      `Checking bot membership...`);
    
    // Check bot in source group
    let sourceValid = false;
    let sourceName = sourceJid;
    let sourceError = null;
    
    try {
      const sourceMeta = await sock.groupMetadata(sourceJid);
      sourceName = sourceMeta.subject || sourceJid;
      sourceValid = true;
      console.log(`✅ Source group found: ${sourceName} (${sourceJid})`);
    } catch (err) {
      sourceError = err.message;
      console.log(`❌ Source group error: ${err.message}`);
    }
    
    // Check bot in target group
    let targetValid = false;
    let targetName = targetJid;
    let targetError = null;
    
    try {
      const targetMeta = await sock.groupMetadata(targetJid);
      targetName = targetMeta.subject || targetJid;
      targetValid = true;
      console.log(`✅ Target group found: ${targetName} (${targetJid})`);
    } catch (err) {
      targetError = err.message;
      console.log(`❌ Target group error: ${err.message}`);
    }
    
    // Show debug info
    let statusMsg = `📊 *Verification Results*\n\n` +
      `*Source Group:* ${sourceName}\n` +
      `🆔 ${sourceJid}\n` +
      `✅ Access: ${sourceValid ? 'Yes' : 'No - ' + sourceError}\n\n` +
      `*Target Group:* ${targetName}\n` +
      `🆔 ${targetJid}\n` +
      `✅ Access: ${targetValid ? 'Yes' : 'No - ' + targetError}\n\n`;
    
    if (!sourceValid || !targetValid) {
      statusMsg += `⚠️ *Warning:* Bot cannot access one or both groups.\n` +
        `Forwarding may not work until bot is added to both groups.`;
      await reply(statusMsg);
    } else {
      await reply(statusMsg + `✅ Both groups accessible. Setting up forwarding...`);
    }
    
    // Save forwarding config
    database.setGroupForwarding(sourceJid, targetJid, true, sender);
    
    await react('✅');
    
    const finalMsg = `✅ *Forwarding Configured Successfully*\n\n` +
      `📤 *Source:* ${sourceName}\n` +
      `📥 *Target:* ${targetName}\n` +
      `🆔 ${sourceJid} → ${targetJid}\n` +
      `🔄 Status: ✅ Active\n` +
      `👤 By: ${sender.split('@')[0]}\n` +
      `⏰ Time: ${new Date().toLocaleString()}\n\n` +
      `*Debug Logs:* Check terminal for real-time message forwarding logs\n` +
      `Messages from source will be forwarded to target with full details.`;
    
    return reply(finalMsg);
  }
};

// Helper function
const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  if (jid.includes(':')) return jid.split(':')[0];
  if (jid.includes('@')) return jid.split('@')[0];
  return jid;
};
