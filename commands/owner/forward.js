/**
 * Group Forwarding Command
 * Allows owner to set up automatic message forwarding between groups
 */

const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'forward',
  description: 'Setup automatic message forwarding between groups',
  usage: '.forward <source|target|list|remove|toggle|stats> [args]',
  ownerOnly: true, // Owner only command for security
  aliases: ['fwd', 'groupforward', 'forwarding'],
  
  async execute(sock, msg, args, context) {
    const { from, reply, react, sender, isGroup } = context;
    
    // Check if command is being used in a group for source/target commands
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
        `*Examples:*\n` +
        `• \`.forward target 123456789@g.us\` - Forward this group to target\n` +
        `• \`.forward source 987654321@g.us\` - Forward source group to this group\n` +
        `• \`.forward list\` - Show all active rules\n\n` +
        `*Note:* Bot must be admin in both groups for full functionality`);
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
      case 'source':
        // Set current group as target, receive from specified source
        if (!currentGroup) {
          return reply('❌ This command must be used in a group to set it as the target!');
        }
        
        const sourceGroupId = args[1];
        if (!sourceGroupId || !sourceGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid source group JID (e.g., 123456789@g.us)\n\n' +
            'To get a group JID, enable debug mode or use .jid command in that group.');
        }
        
        // Check if source and target are the same
        if (sourceGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Verify source group exists and bot is in it
        try {
          const sourceMetadata = await sock.groupMetadata(sourceGroupId);
          if (!sourceMetadata) {
            return reply('❌ Cannot fetch source group metadata. Make sure bot is in that group.');
          }
          
          // Check if bot is in source group
          const botId = sock.user.id;
          const botInSource = sourceMetadata.participants.some(p => 
            p.id === botId || p.id === botId.split(':')[0] + '@s.whatsapp.net'
          );
          
          if (!botInSource) {
            return reply('❌ Bot is not in the source group! Please add bot to source group first.');
          }
          
          // Get source group name for confirmation
          const sourceName = sourceMetadata.subject || sourceGroupId;
          
          // Save forwarding config
          const config = database.setGroupForwarding(sourceGroupId, currentGroup, true, sender);
          
          await react('✅');
          return reply(`✅ *Forwarding Configured Successfully*\n\n` +
            `📤 *Source Group:* ${sourceName}\n` +
            `📥 *Target Group:* ${currentGroup}\n` +
            `🆔 *Source JID:* ${sourceGroupId}\n` +
            `🆔 *Target JID:* ${currentGroup}\n` +
            `🔄 *Status:* ✅ Active\n` +
            `👤 *Configured by:* ${sender.split('@')[0]}\n` +
            `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
            `All messages from the source group will now be forwarded to this group.`);
            
        } catch (err) {
          return reply(`❌ Cannot access source group. Error: ${err.message || 'Group not found'}\n\n` +
            `Make sure:\n` +
            `• The group JID is correct\n` +
            `• Bot is a member of the source group\n` +
            `• The group exists`);
        }
        
      case 'target':
        // Set current group as source, forward to specified target
        if (!currentGroup) {
          return reply('❌ This command must be used in a group to set it as the source!');
        }
        
        const targetGroupId = args[1];
        if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid target group JID (e.g., 123456789@g.us)\n\n' +
            'To get a group JID, enable debug mode or use .jid command in that group.');
        }
        
        // Check if source and target are the same
        if (targetGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Verify target group exists and bot is in it
        try {
          const targetMetadata = await sock.groupMetadata(targetGroupId);
          if (!targetMetadata) {
            return reply('❌ Cannot fetch target group metadata. Make sure bot is in that group.');
          }
          
          // Check if bot is admin in target group (optional but recommended)
          const botId = sock.user.id;
          const botInTarget = targetMetadata.participants.find(p => 
            p.id === botId || p.id === botId.split(':')[0] + '@s.whatsapp.net'
          );
          
          if (!botInTarget) {
            return reply('❌ Bot is not in the target group! Please add bot to target group first.');
          }
          
          const isAdmin = botInTarget.admin === 'admin' || botInTarget.admin === 'superadmin';
          const adminWarning = isAdmin ? '' : '\n\n⚠️ *Note:* Bot is not admin in target group. Some features may be limited.';
          
          // Get target group name for confirmation
          const targetName = targetMetadata.subject || targetGroupId;
          
          // Save forwarding config
          const config = database.setGroupForwarding(currentGroup, targetGroupId, true, sender);
          
          await react('✅');
          return reply(`✅ *Forwarding Configured Successfully*\n\n` +
            `📤 *Source Group:* ${currentGroup}\n` +
            `📥 *Target Group:* ${targetName}\n` +
            `🆔 *Source JID:* ${currentGroup}\n` +
            `🆔 *Target JID:* ${targetGroupId}\n` +
            `🔄 *Status:* ✅ Active\n` +
            `👤 *Configured by:* ${sender.split('@')[0]}\n` +
            `⏰ *Time:* ${new Date().toLocaleString()}${adminWarning}`);
            
        } catch (err) {
          return reply(`❌ Cannot access target group. Error: ${err.message || 'Group not found'}\n\n` +
            `Make sure:\n` +
            `• The group JID is correct\n` +
            `• Bot is a member of the target group\n` +
            `• The group exists`);
        }
        
      case 'list':
        const forwardings = database.getAllGroupForwardings();
        
        if (forwardings.length === 0) {
          return reply('📭 *No Active Forwarding Rules*\n\n' +
            'Use `.forward source <jid>` or `.forward target <jid>` to set up forwarding.');
        }
        
        let listMsg = '📤 *Active Group Forwarding Rules*\n\n';
        let count = 1;
        
        for (const f of forwardings) {
          // Try to get group names
          let sourceName = f.sourceGroupId;
          let targetName = f.targetGroupId;
          
          try {
            const sourceMeta = await sock.groupMetadata(f.sourceGroupId);
            if (sourceMeta) sourceName = sourceMeta.subject;
          } catch (err) {
            // Use JID if name can't be fetched
          }
          
          try {
            const targetMeta = await sock.groupMetadata(f.targetGroupId);
            if (targetMeta) targetName = targetMeta.subject;
          } catch (err) {
            // Use JID if name can't be fetched
          }
          
          listMsg += `${count}. *${sourceName}*\n`;
          listMsg += `   ➡️ → ${targetName}\n`;
          listMsg += `   🆔 Source: \`${f.sourceGroupId}\`\n`;
          listMsg += `   🆔 Target: \`${f.targetGroupId}\`\n`;
          listMsg += `   🔘 Status: ${f.enabled ? '✅ Active' : '⏸️ Disabled'}\n`;
          listMsg += `   👤 Setup by: ${f.forwarderJid?.split('@')[0] || 'Unknown'}\n`;
          listMsg += `   📅 Created: ${new Date(f.createdAt).toLocaleString()}\n`;
          listMsg += `   🕒 Updated: ${new Date(f.updatedAt).toLocaleString()}\n`;
          listMsg += `   ━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          count++;
        }
        
        // Truncate if too long (WhatsApp message limit ~4096 chars)
        if (listMsg.length > 4000) {
          listMsg = listMsg.substring(0, 3900) + '\n... (truncated, too many rules)';
        }
        
        return reply(listMsg);
        
      case 'remove':
        const sourceToRemove = args[1];
        if (!sourceToRemove) {
          return reply('❌ Please provide source group JID to remove forwarding.\n\n' +
            'Usage: `.forward remove 123456789@g.us`\n\n' +
            'Use `.forward list` to see all active source JIDs.');
        }
        
        // Validate JID format
        if (!sourceToRemove.endsWith('@g.us')) {
          return reply('❌ Invalid group JID format. Must end with @g.us');
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
        
      case 'toggle':
        const sourceToToggle = args[1];
        if (!sourceToToggle) {
          return reply('❌ Please provide source group JID to toggle.\n\n' +
            'Usage: `.forward toggle 123456789@g.us`\n\n' +
            'Use `.forward list` to see all active source JIDs.');
        }
        
        // Validate JID format
        if (!sourceToToggle.endsWith('@g.us')) {
          return reply('❌ Invalid group JID format. Must end with @g.us');
        }
        
        const currentConfig = database.getGroupForwarding(sourceToToggle);
        if (!currentConfig) {
          return reply(`❌ No forwarding rule found for source group ${sourceToToggle}`);
        }
        
        const newState = !currentConfig.enabled;
        database.toggleGroupForwarding(sourceToToggle, newState);
        
        await react(newState ? '✅' : '⏸️');
        
        // Try to get group name
        let sourceName = sourceToToggle;
        try {
          const sourceMeta = await sock.groupMetadata(sourceToToggle);
          if (sourceMeta) sourceName = sourceMeta.subject;
        } catch (err) {
          // Use JID if name can't be fetched
        }
        
        return reply(`✅ *Forwarding ${newState ? 'Enabled' : 'Disabled'}*\n\n` +
          `📤 Source: ${sourceName}\n` +
          `📥 Target: ${currentConfig.targetGroupId}\n` +
          `🔄 Status: ${newState ? '✅ Active' : '⏸️ Disabled'}\n\n` +
          `Messages from this group will ${newState ? 'now' : 'no longer'} be forwarded.`);
        
      case 'stats':
        const stats = database.getForwardingStats();
        
        const statsMsg = `📊 *Forwarding Statistics*\n\n` +
          `📋 Total Rules: ${stats.total}\n` +
          `✅ Active Rules: ${stats.active}\n` +
          `⏸️ Disabled Rules: ${stats.disabled}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*Rule Details:*\n` +
          stats.configs.map((cfg, idx) => {
            return `${idx + 1}. Source: ${cfg.source.substring(0, 20)}...\n` +
                   `   Status: ${cfg.enabled ? '✅ Active' : '⏸️ Disabled'}\n` +
                   `   Age: ${Math.floor(cfg.age / (1000 * 60 * 60 * 24))} days old`;
          }).join('\n\n') || '  No rules configured';
        
        return reply(statsMsg);
        
      case 'help':
        return reply(`📚 *Forward Command Help*\n\n` +
          `*Setup Commands:*\n` +
          `• \`.forward source <source_jid>\` - Set current group as target for source\n` +
          `• \`.forward target <target_jid>\` - Set current group as source to target\n\n` +
          `*Management Commands:*\n` +
          `• \`.forward list\` - List all forwarding rules\n` +
          `• \`.forward remove <source_jid>\` - Remove a forwarding rule\n` +
          `• \`.forward toggle <source_jid>\` - Enable/disable a rule\n` +
          `• \`.forward stats\` - Show forwarding statistics\n` +
          `• \`.forward help\` - Show this help message\n\n` +
          `*Important Notes:*\n` +
          `• Bot must be in both groups\n` +
          `• Admin privileges recommended for target group\n` +
          `• All message types (text, images, videos, etc.) are forwarded\n` +
          `• Forwarded messages include sender info and timestamp\n` +
          `• Rules are persistent across bot restarts\n\n` +
          `*Example Setup:*\n` +
          `1. Add bot to both groups\n` +
          `2. In source group, type: \`.forward target 123456789@g.us\`\n` +
          `3. All messages will now be forwarded!`);
        
      default:
        return reply('❌ Invalid subcommand.\n\n' +
          'Available commands: source, target, list, remove, toggle, stats, help\n\n' +
          'Use `.forward help` for detailed usage information.');
    }
  }
};
