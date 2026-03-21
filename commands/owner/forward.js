/**
 * Group Forwarding Command
 * Allows owner to set up automatic message forwarding between groups
 */

const database = require('../../database');
const config = require('../../config');

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

// Helper to check if bot is in group with detailed debugging
const isBotInGroup = async (sock, groupId, debug = true) => {
  try {
    if (debug) console.log(`🔍 Checking if bot is in group: ${groupId}`);
    
    const metadata = await sock.groupMetadata(groupId);
    if (!metadata || !metadata.participants) {
      if (debug) console.log(`❌ No metadata or participants for group`);
      return false;
    }
    
    const botJid = sock.user.id;
    const botNumber = normalizeJid(botJid);
    
    if (debug) {
      console.log(`🤖 Bot JID: ${botJid}`);
      console.log(`🤖 Bot Number: ${botNumber}`);
      console.log(`📊 Total participants: ${metadata.participants.length}`);
    }
    
    // Check all participants for bot's JID
    let found = false;
    let matchedBy = null;
    
    for (const p of metadata.participants) {
      const participantNumber = normalizeJid(p.id);
      const participantJid = p.id;
      
      if (debug) {
        console.log(`  Checking participant: ${participantJid} (number: ${participantNumber})`);
      }
      
      if (participantNumber === botNumber) {
        found = true;
        matchedBy = 'number';
        if (debug) console.log(`  ✅ Match found by number!`);
        break;
      }
      
      if (participantJid === botJid) {
        found = true;
        matchedBy = 'full_jid';
        if (debug) console.log(`  ✅ Match found by full JID!`);
        break;
      }
    }
    
    if (debug) {
      if (found) {
        console.log(`✅ Bot IS in group ${groupId} (matched by ${matchedBy})`);
      } else {
        console.log(`❌ Bot is NOT in group ${groupId}`);
        console.log(`   Bot JID: ${botJid}`);
        console.log(`   Bot Number: ${botNumber}`);
        console.log(`   First 5 participants:`, metadata.participants.slice(0, 5).map(p => p.id));
      }
    }
    
    return found;
  } catch (error) {
    console.error(`❌ Error checking bot in group ${groupId}:`, error.message);
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

// Helper to get bot info
const getBotInfo = (sock) => {
  return {
    jid: sock.user.id,
    number: normalizeJid(sock.user.id),
    lid: sock.user.lid || null
  };
};

module.exports = {
  name: 'forward',
  description: 'Setup automatic message forwarding between groups',
  usage: '.forward <source|target|list|remove|toggle|stats|debug> [args]',
  ownerOnly: true,
  aliases: ['fwd', 'groupforward', 'forwarding'],
  
  async execute(sock, msg, args, context) {
    const { from, reply, react, sender } = context;
    
    // Get current group JID
    const currentGroup = from.endsWith('@g.us') ? from : null;
    const isInGroup = currentGroup !== null;
    
    // Debug info
    const botInfo = getBotInfo(sock);
    
    if (!args.length) {
      return reply(`📤 *Group Forwarding Commands*\n\n` +
        `*Setup Methods:*\n` +
        `1. In source group: \`.forward target <target_jid>\`\n` +
        `2. In target group: \`.forward source <source_jid>\`\n\n` +
        `*Management:*\n` +
        `📋 \`.forward list\` - List all active forwarding rules\n` +
        `🗑️ \`.forward remove <source_jid>\` - Remove forwarding rule\n` +
        `⏸️ \`.forward toggle <source_jid>\` - Enable/disable forwarding\n` +
        `📊 \`.forward stats\` - Show forwarding statistics\n` +
        `🐛 \`.forward debug\` - Show debug information\n\n` +
        `*Examples:*\n` +
        `• \`.forward target 120363123456789@g.us\`\n` +
        `• \`.forward source 120363987654321@g.us\`\n` +
        `• \`.forward list\`\n\n` +
        `*Note:* Bot must be in both groups for forwarding to work`);
    }
    
    const subCommand = args[0].toLowerCase();
    
    // Debug command
    if (subCommand === 'debug') {
      const groups = args[1] ? [args[1]] : (currentGroup ? [currentGroup] : []);
      
      let debugMsg = `🐛 *Debug Information*\n\n` +
        `*Bot Info:*\n` +
        `• JID: ${botInfo.jid}\n` +
        `• Number: ${botInfo.number}\n` +
        `• LID: ${botInfo.lid || 'None'}\n` +
        `• In Group Command: ${isInGroup ? '✅ Yes' : '❌ No'}\n\n`;
      
      if (currentGroup) {
        debugMsg += `*Current Group:*\n• JID: ${currentGroup}\n`;
        const inCurrent = await isBotInGroup(sock, currentGroup, true);
        debugMsg += `• Bot Member: ${inCurrent ? '✅ Yes' : '❌ No'}\n\n`;
      }
      
      if (groups.length > 0) {
        for (const groupId of groups) {
          debugMsg += `*Checking Group:* ${groupId}\n`;
          const inGroup = await isBotInGroup(sock, groupId, true);
          debugMsg += `• Bot Member: ${inGroup ? '✅ Yes' : '❌ No'}\n\n`;
        }
      }
      
      return reply(debugMsg);
    }
    
    switch (subCommand) {
      case 'source':
        // Set current group as target, receive from specified source
        if (!currentGroup) {
          return reply(`❌ This command must be used in a group to set it as the target!\n\n` +
            `Current location: ${from}\n` +
            `This is ${from.endsWith('@g.us') ? 'a group' : 'a private chat'}.\n\n` +
            `Please go to the group you want to use as the TARGET and run this command there.`);
        }
        
        const sourceGroupId = args[1];
        if (!sourceGroupId || !sourceGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid source group JID (e.g., 120363123456789@g.us)\n\n' +
            'To get a group JID, send a message in the group and check the logs.\n\n' +
            `Example: .forward source ${currentGroup}`);
        }
        
        // Check if source and target are the same
        if (sourceGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Show debugging info
        await reply(`🔍 *Checking group membership...*\n\n` +
          `Source: ${sourceGroupId}\n` +
          `Target: ${currentGroup}\n\n` +
          `Please wait while I verify bot membership...`);
        
        // Verify bot is in source group with debugging
        console.log(`\n🔍 DEBUG: Checking source group: ${sourceGroupId}`);
        const sourceValid = await isBotInGroup(sock, sourceGroupId, true);
        
        if (!sourceValid) {
          const groupName = await getGroupName(sock, sourceGroupId);
          return reply(`❌ *Bot is not in the source group!*\n\n` +
            `Source Group: ${groupName}\n` +
            `Source JID: ${sourceGroupId}\n\n` +
            `Bot JID: ${botInfo.jid}\n` +
            `Bot Number: ${botInfo.number}\n\n` +
            `Please add the bot to the source group first.\n` +
            `Use .join command with the group invite link.\n\n` +
            `*Troubleshooting:*\n` +
            `1. Make sure the bot is actually in the group\n` +
            `2. Check if the JID is correct\n` +
            `3. Try using .debug command to verify\n\n` +
            `Run: .forward debug ${sourceGroupId}`);
        }
        
        // Check if bot is in current group (target)
        console.log(`\n🔍 DEBUG: Checking target group: ${currentGroup}`);
        const targetValid = await isBotInGroup(sock, currentGroup, true);
        
        if (!targetValid) {
          return reply(`❌ *Bot is not in the current group!*\n\n` +
            `Current Group: ${currentGroup}\n\n` +
            `Bot JID: ${botInfo.jid}\n` +
            `Bot Number: ${botInfo.number}\n\n` +
            `Please make sure the bot is a member of this group.\n` +
            `Run: .forward debug ${currentGroup}`);
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
          return reply(`❌ This command must be used in a group to set it as the source!\n\n` +
            `Current location: ${from}\n` +
            `This is ${from.endsWith('@g.us') ? 'a group' : 'a private chat'}.\n\n` +
            `Please go to the group you want to use as the SOURCE and run this command there.`);
        }
        
        const targetGroupId = args[1];
        if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
          return reply('❌ Please provide a valid target group JID (e.g., 120363123456789@g.us)\n\n' +
            'To get a group JID, send a message in the group and check the logs.\n\n' +
            `Example: .forward target ${currentGroup}`);
        }
        
        // Check if source and target are the same
        if (targetGroupId === currentGroup) {
          return reply('❌ Source and target groups cannot be the same!');
        }
        
        // Show debugging info
        await reply(`🔍 *Checking group membership...*\n\n` +
          `Source: ${currentGroup}\n` +
          `Target: ${targetGroupId}\n\n` +
          `Please wait while I verify bot membership...`);
        
        // Verify bot is in current group (source)
        console.log(`\n🔍 DEBUG: Checking source group: ${currentGroup}`);
        const sourceValid = await isBotInGroup(sock, currentGroup, true);
        
        if (!sourceValid) {
          return reply(`❌ *Bot is not in the current group!*\n\n` +
            `Current Group: ${currentGroup}\n\n` +
            `Bot JID: ${botInfo.jid}\n` +
            `Bot Number: ${botInfo.number}\n\n` +
            `Please make sure the bot is a member of this group.\n` +
            `Run: .forward debug ${currentGroup}`);
        }
        
        // Verify bot is in target group
        console.log(`\n🔍 DEBUG: Checking target group: ${targetGroupId}`);
        const targetValid = await isBotInGroup(sock, targetGroupId, true);
        
        if (!targetValid) {
          const groupName = await getGroupName(sock, targetGroupId);
          return reply(`❌ *Bot is not in the target group!*\n\n` +
            `Target Group: ${groupName}\n` +
            `Target JID: ${targetGroupId}\n\n` +
            `Bot JID: ${botInfo.jid}\n` +
            `Bot Number: ${botInfo.number}\n\n` +
            `Please add the bot to the target group first.\n` +
            `Use .join command with the group invite link.\n\n` +
            `*Troubleshooting:*\n` +
            `1. Make sure the bot is actually in the group\n` +
            `2. Check if the JID is correct\n` +
            `3. Try using .debug command to verify\n\n` +
            `Run: .forward debug ${targetGroupId}`);
        }
        
        // Get group names
        const sourceGroupName = await getGroupName(sock, currentGroup);
        const targetGroupName = await getGroupName(sock, targetGroupId);
        
        // Save forwarding config
        database.setGroupForwarding(currentGroup, targetGroupId, true, sender);
        
        await react('✅');
        return reply(`✅ *Forwarding Configured Successfully*\n\n` +
          `📤 *Source Group:* ${sourceGroupName}\n` +
          `📥 *Target Group:* ${targetGroupName}\n` +
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
          const srcName = await getGroupName(sock, f.sourceGroupId);
          const tgtName = await getGroupName(sock, f.targetGroupId);
          
          listMsg += `${count}. *${srcName}*\n`;
          listMsg += `   ➡️ → ${tgtName}\n`;
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
        
        const toggledGroupName = await getGroupName(sock, sourceToToggle);
        
        return reply(`✅ *Forwarding ${newState ? 'Enabled' : 'Disabled'}*\n\n` +
          `📤 Source: ${toggledGroupName}\n` +
          `📥 Target: ${currentConfig.targetGroupId}\n` +
          `🔄 Status: ${newState ? '✅ Active' : '⏸️ Disabled'}`);
        
      case 'stats':
        const stats = database.getForwardingStats();
        
        return reply(`📊 *Forwarding Statistics*\n\n` +
          `📋 Total Rules: ${stats.total}\n` +
          `✅ Active Rules: ${stats.active}\n` +
          `⏸️ Disabled Rules: ${stats.disabled}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*Bot Info:*\n` +
          `JID: ${botInfo.jid}\n` +
          `Number: ${botInfo.number}\n` +
          `LID: ${botInfo.lid || 'None'}\n\n` +
          `*Database:* database/group_forwarding.json`);
        
      default:
        return reply('❌ Invalid subcommand.\n\n' +
          'Available: source, target, list, remove, toggle, stats, debug, help\n\n' +
          'Use `.forward help` for detailed usage.');
    }
  }
};
