/**
 * Group Forwarding Command
 * Allows owner to set up automatic message forwarding between groups
 */

const database = require('../../database');
const config = require('../../config');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

// Helper function to normalize JID (extract phone number)
const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  
  // Remove device ID if present
  if (jid.includes(':')) {
    return jid.split(':')[0];
  }
  // Remove domain if present
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
};

// Helper to check if bot is in group (more reliable)
const isBotInGroup = async (sock, groupId) => {
  try {
    const metadata = await sock.groupMetadata(groupId);
    if (!metadata || !metadata.participants) return false;
    
    const botJid = sock.user.id;
    const botNumber = normalizeJid(botJid);
    
    // Check all participants for bot's JID
    const found = metadata.participants.some(p => {
      const participantNumber = normalizeJid(p.id);
      return participantNumber === botNumber || p.id === botJid;
    });
    
    return found;
  } catch (error) {
    console.error('Error checking bot in group:', error);
    return false;
  }
};

// Helper to get group name safely
const getGroupName = async (sock, groupId) => {
  try {
    const metadata = await sock.groupMetadata(groupId);
    return metadata.subject || groupId;
  } catch (err) {
    return groupId;
  }
};

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
        `*Examples:*\n` +
        `• \`.forward target 120363123456789@g.us\`\n` +
        `• \`.forward source 120363987654321@g.us\`\n` +
        `• \`.forward list\`\n\n` +
        `*Note:* Bot must be in both groups for forwarding to work`);
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
          return reply('❌ Please provide a valid source group JID (e.g., 120363123456789@g.us)\n\n' +
            'To get a group JID, send a message in the group and check the logs.');
        }
        
        // Check if source and target are the same
        if (sourceGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Verify bot is in source group
        const botInSource = await isBotInGroup(sock, sourceGroupId);
        if (!botInSource) {
          return reply(`❌ Bot is not in the source group!\n\n` +
            `Source JID: ${sourceGroupId}\n\n` +
            `Please add the bot to the source group first.\n` +
            `Use .join command to add bot to the group.`);
        }
        
        // Check if bot is in current group (target)
        const botInTarget = await isBotInGroup(sock, currentGroup);
        if (!botInTarget) {
          return reply(`❌ Bot is not in the current group!\n\n` +
            `Make sure the bot is a member of this group.`);
        }
        
        // Get group names
        const sourceName = await getGroupName(sock, sourceGroupId);
        const targetName = await getGroupName(sock, currentGroup);
        
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
        
      case 'target':
        // Set current group as source, forward to specified target
        if (!currentGroup) {
          return reply('❌ This command must be used in a group to set it as the source!');
        }
        
        const targetGroupId = args[1];
        if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid target group JID (e.g., 120363123456789@g.us)\n\n' +
            'To get a group JID, send a message in the group and check the logs.');
        }
        
        // Check if source and target are the same
        if (targetGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Verify bot is in current group (source)
        const botInSource = await isBotInGroup(sock, currentGroup);
        if (!botInSource) {
          return reply(`❌ Bot is not in the current group!\n\n` +
            `Make sure the bot is a member of this group.`);
        }
        
        // Verify bot is in target group
        const botInTarget = await isBotInGroup(sock, targetGroupId);
        if (!botInTarget) {
          return reply(`❌ Bot is not in the target group!\n\n` +
            `Target JID: ${targetGroupId}\n\n` +
            `Please add the bot to the target group first.\n` +
            `Use .join command to add bot to the group.\n\n` +
            `Once added, run this command again.`);
        }
        
        // Get group names
        const sourceName = await getGroupName(sock, currentGroup);
        const targetName = await getGroupName(sock, targetGroupId);
        
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
        
      case 'list':
        const forwardings = database.getAllGroupForwardings();
        
        if (forwardings.length === 0) {
          return reply('📭 *No Active Forwarding Rules*\n\n' +
            'Use `.forward source <jid>` or `.forward target <jid>` to set up forwarding.');
        }
        
        let listMsg = '📤 *Active Group Forwarding Rules*\n\n';
        let count = 1;
        
        for (const f of forwardings) {
          // Get group names
          const sourceName = await getGroupName(sock, f.sourceGroupId);
          const targetName = await getGroupName(sock, f.targetGroupId);
          
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
        
      case 'remove':
        const sourceToRemove = args[1];
        if (!sourceToRemove) {
          return reply('❌ Please provide source group JID to remove forwarding.\n\n' +
            'Usage: `.forward remove 120363123456789@g.us`\n\n' +
            'Use `.forward list` to see all active source JIDs.');
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
            'Usage: `.forward toggle 120363123456789@g.us`');
        }
        
        const currentConfig = database.getGroupForwarding(sourceToToggle);
        if (!currentConfig) {
          return reply(`❌ No forwarding rule found for source group ${sourceToToggle}`);
        }
        
        const newState = !currentConfig.enabled;
        database.toggleGroupForwarding(sourceToToggle, newState);
        
        await react(newState ? '✅' : '⏸️');
        
        const sourceName = await getGroupName(sock, sourceToToggle);
        
        return reply(`✅ *Forwarding ${newState ? 'Enabled' : 'Disabled'}*\n\n` +
          `📤 Source: ${sourceName}\n` +
          `📥 Target: ${currentConfig.targetGroupId}\n` +
          `🔄 Status: ${newState ? '✅ Active' : '⏸️ Disabled'}`);
        
      case 'stats':
        const stats = database.getForwardingStats();
        
        return reply(`📊 *Forwarding Statistics*\n\n` +
          `📋 Total Rules: ${stats.total}\n` +
          `✅ Active Rules: ${stats.active}\n` +
          `⏸️ Disabled Rules: ${stats.disabled}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*Database Location:* database/group_forwarding.json\n` +
          `*Bot JID:* ${sock.user.id || 'Unknown'}`);
        
      case 'help':
        return reply(`📚 *Forward Command Help*\n\n` +
          `*Setup Commands:*\n` +
          `• \`.forward source <source_jid>\` - Forward from source to this group\n` +
          `• \`.forward target <target_jid>\` - Forward from this group to target\n\n` +
          `*Management:*\n` +
          `• \`.forward list\` - List all forwarding rules\n` +
          `• \`.forward remove <source_jid>\` - Remove a rule\n` +
          `• \`.forward toggle <source_jid>\` - Enable/disable a rule\n` +
          `• \`.forward stats\` - Show statistics\n` +
          `• \`.forward help\` - This help\n\n` +
          `*Requirements:*\n` +
          `• Bot must be in BOTH groups\n` +
          `• Use the exact group JID (starts with 120363...)\n` +
          `• Admin privileges are optional but recommended\n\n` +
          `*Getting Group JID:*\n` +
          `Send any message in the group, then use .jid command in DM`);
        
      default:
        return reply('❌ Invalid subcommand.\n\n' +
          'Available: source, target, list, remove, toggle, stats, help\n\n' +
          'Use `.forward help` for detailed usage.');
    }
  }
};
