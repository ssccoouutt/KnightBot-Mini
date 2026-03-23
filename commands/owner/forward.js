/**
 * Group Forwarding Command - Universal Version
 * Can be used from any chat to set up forwarding between groups
 */

const database = require('../../database');

module.exports = {
  name: 'forward',
  description: 'Setup automatic message forwarding between groups',
  usage: '.forward <source_jid> <target_jid>',
  ownerOnly: true,
  aliases: ['fwd', 'groupforward', 'forwarding'],
  
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
        `📊 \`.forward stats\` - Show statistics\n\n` +
        `*Examples:*\n` +
        `.forward 120363408035540146@g.us 120363421227499361@g.us\n` +
        `.forward list\n\n` +
        `*Note:* Bot must be in BOTH groups for forwarding to work`);
    }
    
    const subCommand = args[0].toLowerCase();
    
    // Handle management commands
    if (subCommand === 'list') {
      const forwardings = database.getAllGroupForwardings();
      
      if (forwardings.length === 0) {
        return reply('📭 *No Active Forwarding Rules*\n\nUse `.forward source_jid target_jid` to set up forwarding.');
      }
      
      let listMsg = '📤 *Active Group Forwarding Rules*\n\n';
      let count = 1;
      
      for (const f of forwardings) {
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
        
        // Prevent message too long
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
        return reply('❌ Please provide valid source group JID\n\nUsage: `.forward remove 120363123456789@g.us`');
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
          `Target: ${existingConfig.targetGroupId}\n\n` +
          `Messages from this group will no longer be forwarded.`);
      }
      return reply(`❌ Failed to remove forwarding rule`);
    }
    
    if (subCommand === 'toggle') {
      const sourceToToggle = args[1];
      if (!sourceToToggle || !sourceToToggle.endsWith('@g.us')) {
        return reply('❌ Please provide valid source group JID\n\nUsage: `.forward toggle 120363123456789@g.us`');
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
        `Target: ${currentConfig.targetGroupId}\n` +
        `Status: ${newState ? 'Active' : 'Disabled'}`);
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
      `✅ Access: ${sourceValid ? 'Yes' : 'No - ' + sourceError}\n\n` +
      `*Target Group:* ${targetName}\n` +
      `✅ Access: ${targetValid ? 'Yes' : 'No - ' + targetError}\n\n`;
    
    if (!sourceValid || !targetValid) {
      statusMsg += `⚠️ *Warning:* Bot cannot access one or both groups.\n` +
        `Forwarding may not work until bot is added to both groups.\n\n` +
        `*Tips:*\n` +
        `• Make sure bot is a member of both groups\n` +
        `• Use .join command to add bot to groups\n` +
        `• Check group JIDs are correct`;
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
      `*How it works:*\n` +
      `• All messages from source group will be forwarded to target group\n` +
      `• Media files (images, videos, audio, documents) are also forwarded\n` +
      `• Messages are forwarded exactly as-is (no extra headers or tags)\n` +
      `• Check terminal for real-time forwarding logs\n\n` +
      `*Management:*\n` +
      `• \`.forward list\` - View all rules\n` +
      `• \`.forward remove ${sourceJid}\` - Remove this rule\n` +
      `• \`.forward toggle ${sourceJid}\` - Enable/disable\n` +
      `• \`.forward stats\` - View statistics`;
    
    return reply(finalMsg);
  }
};
