/**
 * Group Forwarding Command - With Google Drive Storage
 */

const database = require('../../database');

module.exports = {
  name: 'forward',
  description: 'Setup automatic message forwarding between groups',
  usage: '.forward <source_jid> <target_jid> [filters]',
  ownerOnly: true,
  category: 'owner',
  aliases: [],
  
  async execute(sock, msg, args, context) {
    const { from, reply, react, sender } = context;
    
    if (args.length < 2) {
      return reply(`📤 *Group Forwarding Commands*\n\n` +
        `*Setup:*\n` +
        `.forward <source_jid> <target_jid> [filters]\n\n` +
        `*Filters (optional):*\n` +
        `• types:text,image,video,audio,document,sticker,location,contact,poll\n` +
        `• caption:only|without\n` +
        `• exclude:media|text\n\n` +
        `*Examples:*\n` +
        `.forward 120363408035540146@g.us 120363421227499361@g.us\n` +
        `.forward 120363408035540146@g.us 120363421227499361@g.us types:image,video\n` +
        `.forward 120363408035540146@g.us 120363421227499361@g.us caption:only\n` +
        `.forward 120363408035540146@g.us 120363421227499361@g.us exclude:text\n\n` +
        `*Management:*\n` +
        `📋 \`.forward list\` - List all active rules\n` +
        `🗑️ \`.forward remove <source_jid>\` - Remove a rule\n` +
        `⏸️ \`.forward toggle <source_jid>\` - Enable/disable a rule\n` +
        `🔧 \`.forward filters <source_jid> [filters]\` - Update filters\n` +
        `📊 \`.forward stats\` - Show statistics\n\n` +
        `*Note:* Bot must be in BOTH groups for forwarding to work`);
    }
    
    const subCommand = args[0].toLowerCase();
    
    // Handle management commands
    if (subCommand === 'list') {
      const forwardings = await database.getAllGroupForwardings();
      
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
        
        if (f.filters) {
          listMsg += `   🎯 Filters:\n`;
          if (f.filters.types) listMsg += `      • Types: ${f.filters.types.join(', ')}\n`;
          if (f.filters.onlyWithCaption) listMsg += `      • Only with caption\n`;
          if (f.filters.onlyWithoutCaption) listMsg += `      • Only without caption\n`;
          if (f.filters.excludeMedia) listMsg += `      • Exclude media\n`;
          if (f.filters.excludeText) listMsg += `      • Exclude text\n`;
        }
        
        listMsg += `   👤 By: ${f.forwarderJid?.split('@')[0] || 'Unknown'}\n`;
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
        return reply('❌ Please provide valid source group JID\n\nUsage: `.forward remove 120363123456789@g.us`');
      }
      
      const existingConfig = await database.getGroupForwarding(sourceToRemove);
      if (!existingConfig) {
        return reply(`❌ No forwarding rule found for source group ${sourceToRemove}`);
      }
      
      const removed = await database.removeGroupForwarding(sourceToRemove);
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
      
      const currentConfig = await database.getGroupForwarding(sourceToToggle);
      if (!currentConfig) {
        return reply(`❌ No forwarding rule found for source group ${sourceToToggle}`);
      }
      
      const newState = !currentConfig.enabled;
      await database.toggleGroupForwarding(sourceToToggle, newState);
      
      await react(newState ? '✅' : '⏸️');
      return reply(`✅ *Forwarding ${newState ? 'Enabled' : 'Disabled'}*\n\n` +
        `Source: ${sourceToToggle}\n` +
        `Target: ${currentConfig.targetGroupId}`);
    }
    
    if (subCommand === 'filters') {
      const sourceToFilter = args[1];
      if (!sourceToFilter || !sourceToFilter.endsWith('@g.us')) {
        return reply('❌ Please provide valid source group JID\n\nUsage: `.forward filters 120363123456789@g.us types:image,video`');
      }
      
      const currentConfig = await database.getGroupForwarding(sourceToFilter);
      if (!currentConfig) {
        return reply(`❌ No forwarding rule found for source group ${sourceToFilter}`);
      }
      
      if (args.length < 3) {
        return reply(`🔧 *Current Filters for ${sourceToFilter}*\n\n` +
          `Types: ${currentConfig.filters?.types?.join(', ') || 'all'}\n` +
          `Only with caption: ${currentConfig.filters?.onlyWithCaption ? 'Yes' : 'No'}\n` +
          `Only without caption: ${currentConfig.filters?.onlyWithoutCaption ? 'Yes' : 'No'}\n` +
          `Exclude media: ${currentConfig.filters?.excludeMedia ? 'Yes' : 'No'}\n` +
          `Exclude text: ${currentConfig.filters?.excludeText ? 'Yes' : 'No'}\n\n` +
          `*To update:*\n` +
          `• types:image,video\n` +
          `• caption:only\n` +
          `• caption:without\n` +
          `• exclude:media\n` +
          `• exclude:text`);
      }
      
      // Parse filters
      const filters = {};
      const filterStr = args.slice(2).join(' ');
      const filterParts = filterStr.split(' ');
      
      for (const part of filterParts) {
        const [key, value] = part.split(':');
        
        if (key === 'types') {
          filters.types = value.split(',');
        } else if (key === 'caption') {
          if (value === 'only') filters.onlyWithCaption = true;
          if (value === 'without') filters.onlyWithoutCaption = true;
        } else if (key === 'exclude') {
          if (value === 'media') filters.excludeMedia = true;
          if (value === 'text') filters.excludeText = true;
        }
      }
      
      await database.updateForwardingFilters(sourceToFilter, filters);
      await react('🔧');
      
      return reply(`✅ *Filters Updated*\n\n` +
        `Source: ${sourceToFilter}\n` +
        `Types: ${filters.types?.join(', ') || 'all'}\n` +
        `Only with caption: ${filters.onlyWithCaption ? 'Yes' : 'No'}\n` +
        `Only without caption: ${filters.onlyWithoutCaption ? 'Yes' : 'No'}\n` +
        `Exclude media: ${filters.excludeMedia ? 'Yes' : 'No'}\n` +
        `Exclude text: ${filters.excludeText ? 'Yes' : 'No'}`);
    }
    
    if (subCommand === 'stats') {
      const stats = await database.getForwardingStats();
      const botNumber = sock.user.id.split(':')[0];
      
      return reply(`📊 *Forwarding Statistics*\n\n` +
        `📋 Total Rules: ${stats.total}\n` +
        `✅ Active Rules: ${stats.active}\n` +
        `⏸️ Disabled Rules: ${stats.disabled}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Bot:* ${botNumber}\n` +
        `*Storage:* Google Drive\n` +
        `*File:* forwarding_config.json`);
    }
    
    // Main setup: forward source_jid target_jid with optional filters
    const sourceJid = args[0];
    const targetJid = args[1];
    
    // Parse filters from remaining args
    let filters = null;
    if (args.length > 2) {
      filters = {
        types: [],
        onlyWithCaption: false,
        onlyWithoutCaption: false,
        excludeMedia: false,
        excludeText: false
      };
      
      const filterStr = args.slice(2).join(' ');
      const filterParts = filterStr.split(' ');
      
      for (const part of filterParts) {
        const [key, value] = part.split(':');
        
        if (key === 'types') {
          filters.types = value.split(',');
        } else if (key === 'caption') {
          if (value === 'only') filters.onlyWithCaption = true;
          if (value === 'without') filters.onlyWithoutCaption = true;
        } else if (key === 'exclude') {
          if (value === 'media') filters.excludeMedia = true;
          if (value === 'text') filters.excludeText = true;
        }
      }
      
      // If no types specified, include all
      if (filters.types.length === 0) {
        filters.types = ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'poll'];
      }
    }
    
    // Validate JIDs
    if (!sourceJid.endsWith('@g.us') || !targetJid.endsWith('@g.us')) {
      return reply('❌ Both source and target must be valid group JIDs (ending with @g.us)');
    }
    
    if (sourceJid === targetJid) {
      return reply('❌ Source and target groups cannot be the same!');
    }
    
    await reply(`🔍 *Setting up forwarding...*\n\n` +
      `Source: ${sourceJid}\n` +
      `Target: ${targetJid}\n` +
      `Filters: ${filters ? JSON.stringify(filters) : 'None (forward all)'}\n\n` +
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
    
    // Save forwarding config to Google Drive
    const saved = await database.setGroupForwarding(sourceJid, targetJid, true, sender, filters);
    
    if (!saved) {
      return reply(`❌ Failed to save forwarding configuration to Google Drive.`);
    }
    
    await react('✅');
    
    let filterText = '';
    if (filters) {
      filterText = `\n\n*Filters:*\n`;
      if (filters.types && filters.types.length > 0) {
        filterText += `• Types: ${filters.types.join(', ')}\n`;
      }
      if (filters.onlyWithCaption) filterText += `• Only messages with caption\n`;
      if (filters.onlyWithoutCaption) filterText += `• Only messages without caption\n`;
      if (filters.excludeMedia) filterText += `• Exclude all media\n`;
      if (filters.excludeText) filterText += `• Exclude text messages\n`;
    }
    
    const finalMsg = `✅ *Forwarding Configured Successfully*\n\n` +
      `📤 *Source:* ${sourceName}\n` +
      `📥 *Target:* ${targetName}\n` +
      `🆔 ${sourceJid} → ${targetJid}\n` +
      `🔄 Status: ✅ Active\n` +
      `👤 By: ${sender.split('@')[0]}\n` +
      `⏰ Time: ${new Date().toLocaleString()}\n` +
      `💾 Storage: Google Drive (persistent across redeploys)${filterText}\n\n` +
      `*How it works:*\n` +
      `• All messages from source group will be forwarded to target group\n` +
      `• Media files (images, videos, audio, documents) are also forwarded\n` +
      `• Messages are forwarded exactly as-is (no extra headers or tags)\n` +
      `• Filters can be updated anytime with .forward filters\n` +
      `• Check terminal for real-time forwarding logs\n\n` +
      `*Management:*\n` +
      `• \`.forward list\` - View all rules\n` +
      `• \`.forward remove ${sourceJid}\` - Remove this rule\n` +
      `• \`.forward toggle ${sourceJid}\` - Enable/disable\n` +
      `• \`.forward filters ${sourceJid}\` - Update filters\n` +
      `• \`.forward stats\` - View statistics`;
    
    return reply(finalMsg);
  }
};
