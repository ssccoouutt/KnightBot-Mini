/**
 * Group Forwarding Command - Simplified Version
 * Allows owner to set up automatic message forwarding between groups
 */

const database = require('../../database');

module.exports = {
  name: 'forward',
  description: 'Setup automatic message forwarding between groups',
  usage: '.forward <source|target|list|remove|toggle|stats> [args]',
  ownerOnly: true,
  aliases: ['fwd', 'groupforward', 'forwarding'],
  
  async execute(sock, msg, args, context) {
    const { from, reply, react, sender } = context;
    
    // Get current group JID
    const currentGroup = from.endsWith('@g.us') ? from : null;
    
    if (!args.length) {
      return reply(`📤 *Group Forwarding Commands*\n\n` +
        `*Setup Methods:*\n` +
        `1. In source group: \`.forward target <target_jid>\`\n` +
        `2. In target group: \`.forward source <source_jid>\`\n\n` +
        `*Management:*\n` +
        `📋 \`.forward list\` - List all active forwarding rules\n` +
        `🗑️ \`.forward remove <source_jid>\` - Remove forwarding rule\n` +
        `⏸️ \`.forward toggle <source_jid>\` - Enable/disable forwarding\n` +
        `📊 \`.forward stats\` - Show forwarding statistics\n\n` +
        `*Note:* Bot must be in both groups for forwarding to work`);
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
      case 'source': {
        // Set current group as target, receive from specified source
        if (!currentGroup) {
          return reply(`❌ This command must be used in a group to set it as the target!\n\n` +
            `Please go to the group you want to use as the TARGET and run this command there.`);
        }
        
        const sourceGroupId = args[1];
        if (!sourceGroupId || !sourceGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid source group JID (e.g., 120363123456789@g.us)');
        }
        
        // Check if source and target are the same
        if (sourceGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Try to get source group name (optional, won't fail if can't)
        let sourceName = sourceGroupId;
        try {
          const metadata = await sock.groupMetadata(sourceGroupId);
          sourceName = metadata.subject || sourceGroupId;
        } catch (err) {
          // Continue even if can't get metadata
        }
        
        const targetName = currentGroup;
        
        // Save forwarding config
        database.setGroupForwarding(sourceGroupId, currentGroup, true, sender);
        
        await react('✅');
        return reply(`✅ *Forwarding Configured Successfully*\n\n` +
          `📤 *Source Group:* ${sourceName}\n` +
          `📥 *Target Group:* ${targetName}\n` +
          `🆔 *Source JID:* ${sourceGroupId}\n` +
          `🆔 *Target JID:* ${currentGroup}\n` +
          `🔄 *Status:* ✅ Active\n` +
          `👤 *Configured by:* ${sender.split('@')[0]}\n` +
          `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
          `All messages from the source group will now be forwarded to this group.`);
      }
      
      case 'target': {
        // Set current group as source, forward to specified target
        if (!currentGroup) {
          return reply(`❌ This command must be used in a group to set it as the source!\n\n` +
            `Please go to the group you want to use as the SOURCE and run this command there.`);
        }
        
        const targetGroupId = args[1];
        if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid target group JID (e.g., 120363123456789@g.us)');
        }
        
        // Check if source and target are the same
        if (targetGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Try to get target group name (optional)
        let targetName = targetGroupId;
        try {
          const metadata = await sock.groupMetadata(targetGroupId);
          targetName = metadata.subject || targetGroupId;
        } catch (err) {
          // Continue even if can't get metadata
        }
        
        const sourceName = currentGroup;
        
        // Save forwarding config
        database.setGroupForwarding(currentGroup, targetGroupId, true, sender);
        
        await react('✅');
        return reply(`✅ *Forwarding Configured Successfully*\n\n` +
          `📤 *Source Group:* ${sourceName}\n` +
          `📥 *Target Group:* ${targetName}\n` +
          `🆔 *Source JID:* ${currentGroup}\n` +
          `🆔 *Target JID:* ${targetGroupId}\n` +
          `🔄 *Status:* ✅ Active\n` +
          `👤 *Configured by:* ${sender.split('@')[0]}\n` +
          `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
          `All messages from this group will be forwarded to the target group.`);
      }
      
      case 'list': {
        const forwardings = database.getAllGroupForwardings();
        
        if (forwardings.length === 0) {
          return reply('📭 *No Active Forwarding Rules*\n\n' +
            'Use `.forward source <jid>` or `.forward target <jid>` to set up forwarding.');
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
          listMsg += `   🔘 Status: ${f.enabled ? '✅ Active' : '⏸️ Disabled'}\n`;
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
      
      case 'remove': {
        const sourceToRemove = args[1];
        if (!sourceToRemove) {
          return reply('❌ Please provide source group JID to remove forwarding.\n\n' +
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
            `Target: ${existingConfig.targetGroupId}\n\n` +
            `Messages from this group will no longer be forwarded.`);
        } else {
          return reply(`❌ Failed to remove forwarding rule for ${sourceToRemove}`);
        }
      }
      
      case 'toggle': {
        const sourceToToggle = args[1];
        if (!sourceToToggle) {
          return reply('❌ Please provide source group JID to toggle.\n\n' +
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
          `Target: ${currentConfig.targetGroupId}\n` +
          `Status: ${newState ? 'Active' : 'Disabled'}`);
      }
      
      case 'stats': {
        const stats = database.getForwardingStats();
        
        return reply(`📊 *Forwarding Statistics*\n\n` +
          `📋 Total Rules: ${stats.total}\n` +
          `✅ Active Rules: ${stats.active}\n` +
          `⏸️ Disabled Rules: ${stats.disabled}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*Database:* database/group_forwarding.json`);
      }
      
      default:
        return reply('❌ Invalid subcommand.\n\n' +
          'Available: source, target, list, remove, toggle, stats\n\n' +
          'Use `.forward target <jid>` in source group\n' +
          'Or `.forward source <jid>` in target group');
    }
  }
};
