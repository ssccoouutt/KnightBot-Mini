const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'listchats',
    aliases: [],
    description: 'List all groups and channels the bot is in',
    usage: 'listchats',
    category: 'owner',
    ownerOnly: true,  // Only owner can use this
    
    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        const senderNumber = sender.split('@')[0];
        
        await react('⏳');
        
        try {
            // Send initial processing message
            const statusMsg = await reply('📊 *Fetching all chats...*\n⏳ This may take a moment.');
            
            // 1. FETCH ALL GROUPS
            const groups = await sock.groupFetchAllParticipating();
            
            // 2. FETCH ALL NEWSLETTERS/CHANNELS
            let newsletters = [];
            try {
                // Try to get newsletters if supported
                if (sock.newsletter) {
                    newsletters = await sock.newsletter.list('all') || [];
                } else {
                    // Alternative method - check if there's a newsletter store
                    const newsletterList = [];
                    // Try to get from store if available
                    if (sock.store && sock.store.newsletters) {
                        for (const [id, newsletter] of sock.store.newsletters.entries()) {
                            newsletterList.push(newsletter);
                        }
                    }
                    newsletters = newsletterList;
                }
            } catch (e) {
                console.log('Newsletter fetch not supported:', e.message);
                // Not all Baileys versions support newsletters
            }
            
            // 3. TRY TO GET PRIVATE CHATS (if available)
            let privateChats = [];
            try {
                // This is best-effort - Baileys doesn't store private chat history by default
                if (sock.store && sock.store.chats) {
                    for (const [jid, chat] of sock.store.chats.entries()) {
                        if (!jid.endsWith('@g.us') && !jid.includes('@newsletter') && jid !== sock.user.id) {
                            privateChats.push({
                                jid,
                                name: chat.name || chat.formattedTitle || jid.split('@')[0],
                                lastMessage: chat.lastMessage?.messageTimestamp 
                                    ? new Date(chat.lastMessage.messageTimestamp * 1000).toLocaleString() 
                                    : 'Unknown'
                            });
                        }
                    }
                }
            } catch (e) {
                console.log('Could not fetch private chats:', e);
            }
            
            // Process groups
            const groupList = [];
            for (const [jid, metadata] of Object.entries(groups)) {
                groupList.push({
                    jid,
                    name: metadata.subject || 'Unnamed Group',
                    members: metadata.participants?.length || 0,
                    description: metadata.desc || 'No description',
                    creator: metadata.owner || 'Unknown',
                    creation: metadata.creation ? new Date(metadata.creation * 1000).toLocaleString() : 'Unknown',
                    announce: metadata.announce ? '🔇 Announcement Only' : '💬 Open Messaging',
                    restrict: metadata.restrict ? '🔒 Restricted' : '🔓 Open Editing',
                    inviteCode: metadata.inviteCode || null,
                    link: metadata.inviteCode ? `https://chat.whatsapp.com/${metadata.inviteCode}` : null,
                    participants: metadata.participants || []
                });
            }
            
            // Process newsletters/channels
            const newsletterList = [];
            for (const newsletter of newsletters) {
                const njid = newsletter.id || newsletter.jid;
                newsletterList.push({
                    jid: njid,
                    name: newsletter.name || newsletter.title || 'Unnamed Channel',
                    description: newsletter.description || newsletter.desc || 'No description',
                    subscribers: newsletter.subscriberCount || newsletter.followers || 0,
                    verified: newsletter.verified ? '✅ Verified' : '❌ Not Verified',
                    creation: newsletter.creationTime ? new Date(newsletter.creationTime * 1000).toLocaleString() : 'Unknown',
                    link: newsletter.link || (njid ? `https://whatsapp.com/channel/${njid.split('@')[0]}` : null)
                });
            }
            
            // Sort all lists by name
            groupList.sort((a, b) => a.name.localeCompare(b.name));
            newsletterList.sort((a, b) => a.name.localeCompare(b.name));
            privateChats.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            // Generate timestamp for file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const reportFile = path.join(tempDir, `chats_${timestamp}.txt`);
            
            // Build report
            let report = `╔════════════════════════════════════════╗\n`;
            report += `║     WHATSAPP CHATS EXPORT             ║\n`;
            report += `╚════════════════════════════════════════╝\n\n`;
            report += `Generated: ${new Date().toLocaleString()}\n`;
            report += `Bot Number: ${sock.user.id.split(':')[0]}\n`;
            report += `Requested by: @${senderNumber}\n\n`;
            
            // SUMMARY SECTION
            report += `📊 *SUMMARY*\n`;
            report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            report += `Total Groups: ${groupList.length}\n`;
            report += `Total Channels: ${newsletterList.length}\n`;
            report += `Total Private Chats: ${privateChats.length}\n`;
            report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // GROUPS SECTION
            if (groupList.length > 0) {
                report += `👥 *GROUPS (${groupList.length})*\n`;
                report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                groupList.forEach((g, index) => {
                    report += `[${index + 1}] ${g.name}\n`;
                    report += `    ${'─'.repeat(50)}\n`;
                    report += `    📝 Desc: ${g.description.substring(0, 100)}${g.description.length > 100 ? '...' : ''}\n`;
                    report += `    👥 Members: ${g.members}\n`;
                    report += `    🏷️ Type: ${g.announce} | ${g.restrict}\n`;
                    report += `    👑 Creator: ${g.creator.split('@')[0]}\n`;
                    report += `    📅 Created: ${g.creation}\n`;
                    report += `    🆔 JID: ${g.jid}\n`;
                    if (g.link) report += `    🔗 Link: ${g.link}\n`;
                    
                    // Add participant preview
                    if (g.participants.length > 0) {
                        const admins = g.participants.filter(p => p.admin).length;
                        report += `    👤 Admins: ${admins}\n`;
                    }
                    report += `\n`;
                });
            }
            
            // CHANNELS/NEWSLETTERS SECTION
            if (newsletterList.length > 0) {
                report += `📢 *CHANNELS/NEWSLETTERS (${newsletterList.length})*\n`;
                report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                newsletterList.forEach((n, index) => {
                    report += `[${index + 1}] ${n.name}\n`;
                    report += `    ${'─'.repeat(50)}\n`;
                    report += `    📝 Desc: ${n.description}\n`;
                    report += `    👥 Subscribers: ${n.subscribers}\n`;
                    report += `    ✅ Verified: ${n.verified}\n`;
                    report += `    📅 Created: ${n.creation}\n`;
                    report += `    🆔 JID: ${n.jid}\n`;
                    if (n.link) report += `    🔗 Link: ${n.link}\n`;
                    report += `\n`;
                });
            }
            
            // PRIVATE CHATS SECTION
            if (privateChats.length > 0) {
                report += `💬 *PRIVATE CHATS (${privateChats.length})*\n`;
                report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                privateChats.forEach((p, index) => {
                    report += `[${index + 1}] ${p.name}\n`;
                    report += `    📱 Number: ${p.jid.split('@')[0]}\n`;
                    report += `    🆔 JID: ${p.jid}\n`;
                    if (p.lastMessage) report += `    ⏱️ Last: ${p.lastMessage}\n`;
                    report += `\n`;
                });
            }
            
            // STATISTICS SECTION
            report += `📈 *DETAILED STATISTICS*\n`;
            report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // Group size distribution
            if (groupList.length > 0) {
                const memberRanges = {
                    '1-10': groupList.filter(g => g.members <= 10).length,
                    '11-50': groupList.filter(g => g.members > 10 && g.members <= 50).length,
                    '51-100': groupList.filter(g => g.members > 50 && g.members <= 100).length,
                    '101-500': groupList.filter(g => g.members > 100 && g.members <= 500).length,
                    '500+': groupList.filter(g => g.members > 500).length
                };
                
                report += `📊 *Group Size Distribution:*\n`;
                report += `  ├─ 1-10 members: ${memberRanges['1-10']}\n`;
                report += `  ├─ 11-50 members: ${memberRanges['11-50']}\n`;
                report += `  ├─ 51-100 members: ${memberRanges['51-100']}\n`;
                report += `  ├─ 101-500 members: ${memberRanges['101-500']}\n`;
                report += `  └─ 500+ members: ${memberRanges['500+']}\n\n`;
                
                // Announcement mode stats
                const announceGroups = groupList.filter(g => g.announce.includes('Announcement')).length;
                const openGroups = groupList.filter(g => g.announce.includes('Open')).length;
                report += `🔇 Announcement Only Groups: ${announceGroups}\n`;
                report += `💬 Open Messaging Groups: ${openGroups}\n\n`;
            }
            
            // Footer
            report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            report += `Export completed: ${new Date().toLocaleString()}\n`;
            report += `Total items: ${groupList.length + newsletterList.length + privateChats.length}\n`;
            report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            
            // Write to file
            fs.writeFileSync(reportFile, report);
            
            // Send the file
            if (fs.existsSync(reportFile)) {
                await sock.sendMessage(from, {
                    document: fs.readFileSync(reportFile),
                    fileName: `whatsapp_chats_${timestamp}.txt`,
                    mimetype: 'text/plain',
                    caption: `📊 *Chats Export Complete*\n\n` +
                            `👥 Groups: ${groupList.length}\n` +
                            `📢 Channels: ${newsletterList.length}\n` +
                            `💬 Private: ${privateChats.length}\n` +
                            `📁 Total: ${groupList.length + newsletterList.length + privateChats.length}\n\n` +
                            `✅ Full report attached!`
                });
            }
            
            // Send quick preview
            let preview = `📋 *QUICK PREVIEW*\n\n`;
            
            if (groupList.length > 0) {
                preview += `👥 *Top Groups:*\n`;
                groupList.slice(0, 5).forEach(g => {
                    preview += `• ${g.name} (${g.members} members)\n`;
                });
                if (groupList.length > 5) preview += `  ... and ${groupList.length - 5} more\n`;
                preview += `\n`;
            }
            
            if (newsletterList.length > 0) {
                preview += `📢 *Top Channels:*\n`;
                newsletterList.slice(0, 5).forEach(n => {
                    preview += `• ${n.name} (${n.subscribers} subs)\n`;
                });
                if (newsletterList.length > 5) preview += `  ... and ${newsletterList.length - 5} more\n`;
                preview += `\n`;
            }
            
            preview += `📁 *Full details saved in the attached file!*`;
            
            await reply(preview);
            await react('✅');
            
            // Clean up old report files (keep only last 5)
            try {
                const files = fs.readdirSync(tempDir)
                    .filter(f => f.startsWith('chats_') && f.endsWith('.txt'))
                    .map(f => ({ name: f, time: fs.statSync(path.join(tempDir, f)).mtimeMs }))
                    .sort((a, b) => b.time - a.time);
                
                for (let i = 5; i < files.length; i++) {
                    fs.unlinkSync(path.join(tempDir, files[i].name));
                }
            } catch (e) {
                // Ignore cleanup errors
            }
            
        } catch (error) {
            console.error('Listchats error:', error);
            await react('❌');
            reply(`❌ Failed to fetch chats: ${error.message}`);
        }
    }
};
