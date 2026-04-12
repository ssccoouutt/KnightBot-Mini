// groups.js
const fs = require('fs-extra');
const path = require('path');

// Helper function for delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to extract invite code from WhatsApp link
function extractInviteCode(link) {
    const patterns = [
        /chat\.whatsapp\.com\/([A-Za-z0-9]{22})/,
        /whatsapp\.com\/invite\/([A-Za-z0-9]{22})/,
        /invite\/([A-Za-z0-9]{22})/
    ];
    
    for (const pattern of patterns) {
        const match = link.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Function to generate detailed report
function generateBulkJoinReport(results) {
    let report = '=====================================\n';
    report += '    BULK JOIN OPERATION REPORT    \n';
    report += `    Generated: ${new Date().toLocaleString()}    \n`;
    report += '=====================================\n\n\n';
    
    // Failed groups section
    report += '═══════════════════════════════════\n';
    report += '    FAILED GROUP LINKS\n';
    report += '    (Bad Request / Cannot Join)\n';
    report += '═══════════════════════════════════\n\n';
    
    if (results.failed.length > 0) {
        results.failed.forEach((item, idx) => {
            report += `[${idx + 1}] Link: ${item.link}\n`;
            report += `    Reason: ${item.reason}\n`;
            if (item.groupName) report += `    Group: ${item.groupName}\n`;
            report += `    Status: FAILED ❌\n\n`;
        });
    } else {
        report += 'No failed groups.\n\n';
    }
    
    report += '\n\n\n'; // 3 empty lines
    
    // Announcement only groups section
    report += '═══════════════════════════════════\n';
    report += '    ANNOUNCEMENT ONLY GROUPS\n';
    report += '    (Admin only messaging)\n';
    report += '═══════════════════════════════════\n\n';
    
    if (results.announcementOnly.length > 0) {
        results.announcementOnly.forEach((item, idx) => {
            report += `[${idx + 1}] Group: ${item.groupName}\n`;
            report += `    Link: ${item.link}\n`;
            report += `    Members: ${item.participantCount}\n`;
            report += `    Type: ANNOUNCEMENT ONLY 📢\n\n`;
        });
    } else {
        report += 'No announcement-only groups found.\n\n';
    }
    
    report += '\n\n\n'; // 3 empty lines
    
    // Open groups section
    report += '═══════════════════════════════════\n';
    report += '    SUCCESSFULLY JOINED GROUPS\n';
    report += '    (Open Messaging)\n';
    report += '═══════════════════════════════════\n\n';
    
    if (results.openGroups.length > 0) {
        results.openGroups.forEach((item, idx) => {
            report += `[${idx + 1}] Group: ${item.groupName}\n`;
            report += `    Link: ${item.link}\n`;
            report += `    Members: ${item.participantCount}\n`;
            report += `    Status: JOINED ✅\n\n`;
        });
    } else {
        report += 'No groups successfully joined.\n\n';
    }
    
    report += '\n\n\n'; // 3 empty lines
    
    // Unknown section
    report += '═══════════════════════════════════\n';
    report += '    COULD NOT DETERMINE TYPE\n';
    report += '    (Requires Manual Check)\n';
    report += '═══════════════════════════════════\n\n';
    
    if (results.unknown.length > 0) {
        results.unknown.forEach((item, idx) => {
            report += `[${idx + 1}] Group: ${item.groupName || 'Unknown'}\n`;
            report += `    Link: ${item.link}\n`;
            report += `    Reason: ${item.reason}\n`;
            report += `    Status: UNKNOWN ❓\n\n`;
        });
    } else {
        report += 'No undetermined groups.\n\n';
    }
    
    report += '\n\n\n';
    report += '=====================================\n';
    report += '         END OF REPORT\n';
    report += '=====================================\n';
    
    return report;
}

// Main enhanced bulk join function
async function enhancedBulkJoin(sock, chatId, groupLinks, msg, sendStatusUpdate = true) {
    const results = {
        failed: [],      // Bad request/failed to join
        announcementOnly: [], // Announcement only groups
        openGroups: [],  // Successfully joined open groups
        unknown: []      // Could not determine type
    };

    if (sendStatusUpdate) {
        await sock.sendMessage(chatId, { text: `🔄 Processing ${groupLinks.length} group link(s)...\nThis may take a moment.` });
    }

    for (let i = 0; i < groupLinks.length; i++) {
        const link = groupLinks[i].trim();
        
        try {
            // Extract invite code
            const inviteCode = extractInviteCode(link);
            if (!inviteCode) {
                results.failed.push({ 
                    link, 
                    reason: 'Invalid invite link format' 
                });
                continue;
            }

            // Try to get invite info first
            const inviteInfo = await sock.groupGetInviteInfo(inviteCode).catch(e => null);
            
            if (!inviteInfo) {
                results.failed.push({ 
                    link, 
                    reason: 'Could not fetch invite info - link may be expired or invalid' 
                });
                continue;
            }

            // Check group type based on invite settings
            if (inviteInfo.announce) {
                // Announcement only group
                results.announcementOnly.push({
                    link,
                    groupName: inviteInfo.subject || 'Unknown',
                    participantCount: inviteInfo.size || inviteInfo.participants?.length || 0
                });
            } else {
                // Try to join if it's an open group
                try {
                    await sock.groupAcceptInvite(inviteCode);
                    results.openGroups.push({
                        link,
                        groupName: inviteInfo.subject || 'Unknown',
                        participantCount: inviteInfo.size || inviteInfo.participants?.length || 0
                    });
                    await delay(2000); // Delay to avoid rate limits
                } catch (joinError) {
                    // Could not determine or join failed
                    results.unknown.push({
                        link,
                        groupName: inviteInfo.subject || 'Unknown',
                        reason: joinError.message || 'Join attempt failed - possibly requires admin approval'
                    });
                }
            }
        } catch (error) {
            results.failed.push({
                link,
                reason: error.message || 'Unknown error occurred'
            });
        }
        
        // Send progress update every 5 links
        if (sendStatusUpdate && (i + 1) % 5 === 0) {
            await sock.sendMessage(chatId, { 
                text: `📊 Progress: ${i + 1}/${groupLinks.length}\n✅ Joined: ${results.openGroups.length}\n📢 Announcement: ${results.announcementOnly.length}\n❌ Failed: ${results.failed.length}` 
            });
        }
    }

    // Generate report
    const report = generateBulkJoinReport(results);
    const reportPath = path.join(__dirname, `bulk_join_report_${Date.now()}.txt`);
    await fs.writeFile(reportPath, report);
    
    // Send summary
    await sock.sendMessage(chatId, {
        text: `✅ *Bulk Join Completed!*\n\n📊 *Summary:*\n• ✅ Joined: ${results.openGroups.length}\n• 📢 Announcement Only: ${results.announcementOnly.length}\n• ❌ Failed: ${results.failed.length}\n• ❓ Unknown: ${results.unknown.length}\n\n📄 Detailed report attached below.`
    });
    
    // Send the report file
    await sock.sendMessage(chatId, {
        text: `📄 *Report File:* ${path.basename(reportPath)}\n\n${report.substring(0, 40000)}` // Truncate if too long for WhatsApp
    });
    
    return results;
}

// Main groups command handler
async function handleGroupsCommand(sock, chatId, author, command, args, msg, userStates) {
    
    // ========== BULK JOIN BUTTON HANDLER ==========
    if (command === 'bulkjoin' || (msg.message?.buttonsResponseMessage?.selectedButtonId === 'bulkjoin')) {
        // Check if user is in waiting state for links
        if (userStates[author]?.waitingFor === 'bulkjoin_links') {
            // User is sending links
            const messageText = msg.message?.conversation || 
                               msg.message?.extendedTextMessage?.text || 
                               '';
            
            const links = messageText.split(/\s+/).filter(link => link.includes('chat.whatsapp.com') || link.includes('whatsapp.com'));
            
            if (links.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: '❌ No valid WhatsApp group links found.\n\nPlease send links in format:\nhttps://chat.whatsapp.com/xxxxx' 
                });
                delete userStates[author];
                return;
            }
            
            await enhancedBulkJoin(sock, chatId, links, msg, true);
            delete userStates[author];
            return;
        }
        
        // Ask user to provide links
        await sock.sendMessage(chatId, {
            text: '📎 *Bulk Join Groups*\n\nPlease send the WhatsApp group links you want to join.\n\n*Format:*\n• One link per line\n• Or space-separated\n\n*Example:*\nhttps://chat.whatsapp.com/xxxxx https://chat.whatsapp.com/yyyyy\n\n⚠️ *Note:* You can only join open groups. Announcement-only groups will be reported but not joined.\n\nType *cancel* to abort.',
            buttons: [
                { buttonId: 'cancel_bulk', buttonText: { displayText: '❌ Cancel' }, type: 1 }
            ]
        });
        
        // Set waiting state
        userStates[author] = { waitingFor: 'bulkjoin_links', timestamp: Date.now() };
        return;
    }
    
    // ========== CANCEL BULK JOIN ==========
    if (command === 'cancel_bulk' || (msg.message?.buttonsResponseMessage?.selectedButtonId === 'cancel_bulk')) {
        if (userStates[author]?.waitingFor === 'bulkjoin_links') {
            delete userStates[author];
            await sock.sendMessage(chatId, { text: '❌ Bulk join operation cancelled.' });
        } else {
            await sock.sendMessage(chatId, { text: 'ℹ️ No active bulk join operation.' });
        }
        return;
    }
    
    // ========== REGULAR GROUP COMMANDS ==========
    
    // Get group invite link
    if (command === 'getlink' || command === 'grouplink') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            const isAdmin = groupMetadata.participants.some(p => p.id === author && (p.admin === 'admin' || p.admin === 'superadmin'));
            
            if (!isAdmin) {
                await sock.sendMessage(chatId, { text: '❌ Only group admins can get the invite link!' });
                return;
            }
            
            const inviteCode = await sock.groupInviteCode(chatId);
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            
            await sock.sendMessage(chatId, {
                text: `🔗 *Group Invite Link*\n\n${inviteLink}\n\n⚠️ Share this link only with trusted people!`
            });
        } catch (error) {
            console.error('Error getting group link:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to get group invite link. Make sure I have admin rights!' });
        }
        return;
    }
    
    // Revoke group link
    if (command === 'revoke' || command === 'resetlink') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            const isAdmin = groupMetadata.participants.some(p => p.id === author && (p.admin === 'admin' || p.admin === 'superadmin'));
            
            if (!isAdmin) {
                await sock.sendMessage(chatId, { text: '❌ Only group admins can revoke the invite link!' });
                return;
            }
            
            await sock.groupRevokeInvite(chatId);
            const newInviteCode = await sock.groupInviteCode(chatId);
            const newInviteLink = `https://chat.whatsapp.com/${newInviteCode}`;
            
            await sock.sendMessage(chatId, {
                text: `🔄 *Group Invite Link Reset!*\n\nNew link: ${newInviteLink}\n\nOld link is now invalid.`
            });
        } catch (error) {
            console.error('Error revoking group link:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to revoke group link. Make sure I have admin rights!' });
        }
        return;
    }
    
    // Leave group
    if (command === 'leave' || command === 'leavegroup') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        await sock.sendMessage(chatId, {
            text: '⚠️ *Warning!*\n\nAre you sure you want me to leave this group?\n\nThis action cannot be undone!',
            buttons: [
                { buttonId: 'confirm_leave', buttonText: { displayText: '✅ Yes, Leave' }, type: 1 },
                { buttonId: 'cancel_leave', buttonText: { displayText: '❌ No, Cancel' }, type: 1 }
            ]
        });
        return;
    }
    
    if (command === 'confirm_leave') {
        if (!msg.key.remoteJid.endsWith('@g.us')) return;
        
        await sock.sendMessage(chatId, { text: '👋 Goodbye everyone! Leaving the group...' });
        await delay(1000);
        await sock.groupLeave(chatId);
        return;
    }
    
    if (command === 'cancel_leave') {
        if (!msg.key.remoteJid.endsWith('@g.us')) return;
        
        await sock.sendMessage(chatId, { text: '✅ Leave operation cancelled. I\'ll stay in the group!' });
        return;
    }
    
    // Group info
    if (command === 'groupinfo' || command === 'ginfo') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants;
            const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
            const totalMembers = participants.length;
            const botNumber = sock.user.id.split(':')[0];
            const isBotAdmin = participants.some(p => p.id === botNumber && (p.admin === 'admin' || p.admin === 'superadmin'));
            
            let info = `📊 *GROUP INFORMATION*\n\n`;
            info += `📛 *Name:* ${groupMetadata.subject}\n`;
            info += `🆔 *ID:* ${groupMetadata.id}\n`;
            info += `👥 *Members:* ${totalMembers}\n`;
            info += `👑 *Admins:* ${admins.length}\n`;
            info += `📅 *Created:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}\n`;
            info += `🔊 *Announcement Mode:* ${groupMetadata.announce ? 'Yes (Admin only)' : 'No (All members)'}\n`;
            info += `🤫 *Restrict Mode:* ${groupMetadata.restrict ? 'Yes' : 'No'}\n`;
            info += `🤖 *Bot Admin:* ${isBotAdmin ? '✅ Yes' : '❌ No'}\n`;
            info += `🔗 *Invite Link:* ${groupMetadata.inviteCode ? `chat.whatsapp.com/${groupMetadata.inviteCode}` : 'Not set'}\n`;
            
            await sock.sendMessage(chatId, { text: info });
        } catch (error) {
            console.error('Error getting group info:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to get group information!' });
        }
        return;
    }
    
    // Promote to admin
    if (command === 'promote') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        const mentionedUser = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUser) {
            await sock.sendMessage(chatId, { text: '❌ Please tag the user you want to promote!\n\nExample: .promote @user' });
            return;
        }
        
        try {
            await sock.groupParticipantsUpdate(chatId, [mentionedUser], 'promote');
            await sock.sendMessage(chatId, { text: `✅ Successfully promoted @${mentionedUser.split('@')[0]} to admin!`, mentions: [mentionedUser] });
        } catch (error) {
            console.error('Error promoting user:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to promote user. Make sure I am an admin!' });
        }
        return;
    }
    
    // Demote admin
    if (command === 'demote') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        const mentionedUser = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUser) {
            await sock.sendMessage(chatId, { text: '❌ Please tag the user you want to demote!\n\nExample: .demote @user' });
            return;
        }
        
        try {
            await sock.groupParticipantsUpdate(chatId, [mentionedUser], 'demote');
            await sock.sendMessage(chatId, { text: `✅ Successfully demoted @${mentionedUser.split('@')[0]} from admin!`, mentions: [mentionedUser] });
        } catch (error) {
            console.error('Error demoting user:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to demote user. Make sure I am an admin!' });
        }
        return;
    }
    
    // Remove user from group
    if (command === 'kick' || command === 'remove') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        const mentionedUser = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUser) {
            await sock.sendMessage(chatId, { text: '❌ Please tag the user you want to remove!\n\nExample: .kick @user' });
            return;
        }
        
        try {
            await sock.groupParticipantsUpdate(chatId, [mentionedUser], 'remove');
            await sock.sendMessage(chatId, { text: `✅ Successfully removed @${mentionedUser.split('@')[0]} from the group!`, mentions: [mentionedUser] });
        } catch (error) {
            console.error('Error removing user:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to remove user. Make sure I am an admin!' });
        }
        return;
    }
    
    // Add user to group
    if (command === 'add') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        const phoneNumber = args[0];
        if (!phoneNumber) {
            await sock.sendMessage(chatId, { text: '❌ Please provide the phone number to add!\n\nExample: .add 1234567890' });
            return;
        }
        
        let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (!cleanNumber.endsWith('@s.whatsapp.net')) {
            cleanNumber = `${cleanNumber}@s.whatsapp.net`;
        }
        
        try {
            await sock.groupParticipantsUpdate(chatId, [cleanNumber], 'add');
            await sock.sendMessage(chatId, { text: `✅ Successfully added @${cleanNumber.split('@')[0]} to the group!`, mentions: [cleanNumber] });
        } catch (error) {
            console.error('Error adding user:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to add user. Make sure I am an admin and the number is valid!' });
        }
        return;
    }
    
    // Close group (announcement mode)
    if (command === 'close' || command === 'announceon') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        try {
            await sock.groupSettingUpdate(chatId, 'announcement');
            await sock.sendMessage(chatId, { text: '🔒 Group closed! Only admins can send messages now.' });
        } catch (error) {
            console.error('Error closing group:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to close group. Make sure I am an admin!' });
        }
        return;
    }
    
    // Open group (all members can send)
    if (command === 'open' || command === 'announceoff') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        try {
            await sock.groupSettingUpdate(chatId, 'not_announcement');
            await sock.sendMessage(chatId, { text: '🔓 Group opened! All members can send messages now.' });
        } catch (error) {
            console.error('Error opening group:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to open group. Make sure I am an admin!' });
        }
        return;
    }
    
    // Set group name
    if (command === 'setname' || command === 'groupname') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        const newName = args.join(' ');
        if (!newName) {
            await sock.sendMessage(chatId, { text: '❌ Please provide the new group name!\n\nExample: .setname My Awesome Group' });
            return;
        }
        
        try {
            await sock.groupUpdateSubject(chatId, newName);
            await sock.sendMessage(chatId, { text: `✅ Group name changed to: *${newName}*` });
        } catch (error) {
            console.error('Error setting group name:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to change group name. Make sure I am an admin!' });
        }
        return;
    }
    
    // Set group description
    if (command === 'setdesc' || command === 'groupdesc') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        const newDesc = args.join(' ');
        if (!newDesc) {
            await sock.sendMessage(chatId, { text: '❌ Please provide the new group description!\n\nExample: .setdesc Welcome to our group!' });
            return;
        }
        
        try {
            await sock.groupUpdateDescription(chatId, newDesc);
            await sock.sendMessage(chatId, { text: `✅ Group description updated!\n\n*New description:*\n${newDesc}` });
        } catch (error) {
            console.error('Error setting group description:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to change group description. Make sure I am an admin!' });
        }
        return;
    }
    
    // Tag all members
    if (command === 'tagall') {
        if (!msg.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command can only be used in groups!' });
            return;
        }
        
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants;
            const mentions = participants.map(p => p.id);
            
            let message = '📢 *ANNOUNCEMENT*\n\n';
            message += `Total members: ${participants.length}\n\n`;
            message += mentions.map(m => `@${m.split('@')[0]}`).join(' ');
            
            await sock.sendMessage(chatId, { text: message, mentions: mentions });
        } catch (error) {
            console.error('Error tagging all:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to tag all members!' });
        }
        return;
    }
    
    // Help menu for group commands
    if (command === 'grouphelp' || command === 'ghelp') {
        const helpText = `*🤖 GROUP COMMANDS*\n\n` +
                        `*Admin Commands:*\n` +
                        `• .getlink - Get group invite link\n` +
                        `• .revoke - Reset group invite link\n` +
                        `• .promote @user - Make user admin\n` +
                        `• .demote @user - Remove admin rights\n` +
                        `• .kick/@user - Remove user from group\n` +
                        `• .add 1234567890 - Add user to group\n` +
                        `• .close - Enable announcement mode\n` +
                        `• .open - Disable announcement mode\n` +
                        `• .setname <name> - Change group name\n` +
                        `• .setdesc <desc> - Change group description\n` +
                        `• .tagall - Mention all members\n` +
                        `*Info Commands:*\n` +
                        `• .groupinfo - Show group details\n` +
                        `• .bulkjoin - Join multiple groups at once\n` +
                        `*Other:*\n` +
                        `• .leave - Bot leaves the group\n` +
                        `• .grouphelp - Show this menu\n\n` +
                        `*Bulk Join Feature:*\n` +
                        `Use .bulkjoin and send multiple WhatsApp group links to join them automatically with a detailed report!`;
        
        await sock.sendMessage(chatId, { text: helpText });
        return;
    }
    
    // If no command matched
    if (command && !command.startsWith('cancel')) {
        await sock.sendMessage(chatId, { text: '❌ Unknown group command. Use .grouphelp to see available commands!' });
    }
}

module.exports = { handleGroupsCommand, enhancedBulkJoin };