/**
 * Groups Command - Show group statistics and manage announcement-only groups
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const FORCE_AI_MODE = true;

// Test group JID for testing broadcast
const TEST_GROUP_JID = '120363408035540146@g.us';

module.exports = {
    name: 'groups',
    aliases: ['grouplist', 'groupsinfo', 'mygroups'],
    category: 'owner',
    description: 'Show group statistics and manage announcement-only groups',
    usage: '.groups\n.groups --help',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--help') {
            return reply(`📊 *GROUPS COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `• \`.groups\` - Show all groups the bot is in\n` +
                       `• \`.groups --help\` - Show this help\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('📊');
        
        // Clear any existing sessions
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'groups') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            type: 'main_menu'
        });
        
        await showMainMenu(sock, from, sender, session, reply);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'groups') return true;
        
        // Handle text input for broadcast message
        if (session.data.type === 'waiting_broadcast_message') {
            let messageText = '';
            if (msg.message?.conversation) {
                messageText = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                messageText = msg.message.extendedTextMessage.text;
            }
            
            if (!messageText) return true;
            
            if (messageText.toLowerCase() === 'cancel') {
                sessionManager.updateSession(sender, from, { type: 'main_menu' });
                await showMainMenu(sock, from, sender, session, reply);
                return true;
            }
            
            // Send immediately
            if (session.data.isTest) {
                await performTestBroadcast(sock, from, sender, session, reply, react, messageText);
            } else {
                await performBroadcast(sock, from, sender, session, reply, react, messageText);
            }
            return true;
        }
        
        // Handle bulk join file input
        if (session.data.type === 'waiting_bulk_file') {
            // Check if replying to a document or direct link
            let fileContent = null;
            let fileName = null;
            
            // Check for direct link in text
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text;
            }
            
            if (text && text.toLowerCase() === 'cancel') {
                session.data.type = 'main_menu';
                await showMainMenu(sock, from, sender, session, reply);
                return true;
            }
            
            if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                // Direct download link
                await reply(`📥 *Downloading file from URL...*`);
                try {
                    const response = await axios.get(text, {
                        responseType: 'arraybuffer',
                        timeout: 30000
                    });
                    fileContent = response.data.toString('utf-8');
                    fileName = text.split('/').pop() || 'groups.txt';
                } catch (error) {
                    await reply(`❌ Failed to download: ${error.message}`);
                    session.data.type = 'main_menu';
                    await showMainMenu(sock, from, sender, session, reply);
                    return true;
                }
            } else {
                // Check if replying to a document
                const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quotedMessage?.documentMessage) {
                    await reply(`❌ *No file provided!*\n\nPlease reply to a .txt file containing group links.\n\nOr provide a direct download link:\n\`https://example.com/groups.txt\`\n\nType *cancel* to abort.`);
                    return true;
                }
                
                const document = quotedMessage.documentMessage;
                fileName = document.fileName || 'groups.txt';
                
                if (!fileName.endsWith('.txt') && document.mimetype !== 'text/plain') {
                    await reply(`❌ *Invalid file type!*\n\nPlease upload a .txt file.`);
                    return true;
                }
                
                await reply(`📥 *Downloading file...*`);
                
                try {
                    const stream = await downloadContentFromMessage(document, 'document');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    fileContent = Buffer.concat(buffer).toString('utf-8');
                } catch (error) {
                    await reply(`❌ Failed to download: ${error.message}`);
                    session.data.type = 'main_menu';
                    await showMainMenu(sock, from, sender, session, reply);
                    return true;
                }
            }
            
            if (fileContent) {
                await performBulkJoin(sock, from, sender, session, reply, react, fileContent, fileName);
            }
            return true;
        }
        
        // Handle button clicks
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            console.log(`[GROUPS] Button clicked: ${buttonId}`);
            
            // Handle Cancel
            if (buttonId?.includes('cancel')) {
                sessionManager.clearSession(session.id);
                await reply('❌ Closed.');
                return true;
            }
            
            // Handle Refresh
            if (buttonId?.includes('refresh')) {
                await refreshGroups(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Leave
            if (buttonId?.includes('leave')) {
                await performLeave(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Broadcast
            if (buttonId?.includes('broadcast') && !buttonId?.includes('test')) {
                session.data.isTest = false;
                session.data.type = 'waiting_broadcast_message';
                const totalOpen = session.data.openGroups.length;
                const sentMsg = await reply(`📢 *Send message to ${totalOpen} groups*\n\nType your message below (or "cancel" to abort):\n\n*Note:* WhatsApp group links will show a join button preview.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            // Handle Test Broadcast
            if (buttonId?.includes('test_broadcast')) {
                session.data.isTest = true;
                session.data.type = 'waiting_broadcast_message';
                const sentMsg = await reply(`🧪 *TEST MODE*\n\n⚠️ This will ONLY send to:\n${TEST_GROUP_JID}\n\nType your test message below (or "cancel" to abort):\n\n*Note:* WhatsApp group links will show a join button preview.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            // Handle Bulk Join
            if (buttonId?.includes('bulk_join')) {
                session.data.type = 'waiting_bulk_file';
                const sentMsg = await reply(`📥 *BULK JOIN FROM LINKS*\n\nPlease reply to a .txt file containing WhatsApp group links (one per line).\n\nOr provide a direct download link:\n\`https://example.com/groups.txt\`\n\nType *cancel* to abort.\n\n*Format:*\nhttps://chat.whatsapp.com/ABC123\nhttps://chat.whatsapp.com/XYZ789`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
        }
        
        return true;
    }
};

async function showMainMenu(sock, chatId, sender, session, reply) {
    // Get fresh group data
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    const announcementGroups = [];
    const openGroups = [];
    
    for (const group of groupList) {
        if (group.announce === true) {
            announcementGroups.push({ id: group.id, subject: group.subject });
        } else {
            openGroups.push({ id: group.id, subject: group.subject });
        }
    }
    
    const totalAnnouncement = announcementGroups.length;
    const totalOpen = openGroups.length;
    const totalGroups = groupList.length;
    
    // Store in session
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = totalAnnouncement;
    session.data.totalOpen = totalOpen;
    session.data.totalGroups = totalGroups;
    session.data.type = 'main_menu';
    
    // Build message
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `📁 Total Groups: ${totalGroups}\n` +
                       `🔇 Announcement-Only: ${totalAnnouncement}\n` +
                       `💬 Open Chat: ${totalOpen}\n\n`;
    
    if (announcementGroups.length > 0) {
        statusMessage += `🔇 *Announcement-Only Groups:*\n`;
        for (let i = 0; i < Math.min(announcementGroups.length, 10); i++) {
            statusMessage += `${i + 1}. ${announcementGroups[i].subject}\n`;
        }
        if (announcementGroups.length > 10) {
            statusMessage += `... and ${announcementGroups.length - 10} more\n`;
        }
        statusMessage += `\n`;
    }
    
    if (openGroups.length > 0) {
        statusMessage += `💬 *Open Chat Groups:*\n`;
        for (let i = 0; i < Math.min(openGroups.length, 10); i++) {
            statusMessage += `${i + 1}. ${openGroups[i].subject}\n`;
        }
        if (openGroups.length > 10) {
            statusMessage += `... and ${openGroups.length - 10} more\n`;
        }
    }
    
    const sessionId = session.id.split(':').pop();
    const leaveId = `leave_${sessionId}_${Date.now()}`;
    const broadcastId = `broadcast_${sessionId}_${Date.now()}`;
    const testBroadcastId = `test_broadcast_${sessionId}_${Date.now()}`;
    const bulkJoinId = `bulk_join_${sessionId}_${Date.now()}`;
    const refreshId = `refresh_${sessionId}_${Date.now()}`;
    const cancelId = `cancel_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
    }
    if (openGroups.length > 0) {
        buttons.push({ id: broadcastId, text: `📢 Broadcast to Open Chats (${totalOpen})` });
        buttons.push({ id: testBroadcastId, text: `🧪 Test Broadcast` });
    }
    buttons.push({ id: bulkJoinId, text: `📥 Bulk Join from Links` });
    buttons.push({ id: refreshId, text: '🔄 Refresh' });
    buttons.push({ id: cancelId, text: '❌ Close' });
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: statusMessage,
        footer: 'Group Manager',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function refreshGroups(sock, chatId, sender, session, reply) {
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    
    if (!messageText || openGroups.length === 0) {
        await reply(`❌ No message or no groups to broadcast to.`);
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    await react('📢');
    
    const statusMsg = await reply(`📢 *Broadcasting to ${totalOpen} groups...*\n\n0/${totalOpen} sent`);
    
    let successCount = 0;
    let failCount = 0;
    
    const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
    
    for (let i = 0; i < openGroups.length; i++) {
        const group = openGroups[i];
        
        try {
            if (groupLinkMatch) {
                const inviteCode = groupLinkMatch[1];
                try {
                    const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                    await sock.sendMessage(group.id, {
                        text: messageText,
                        contextInfo: {
                            externalAdReply: {
                                title: inviteInfo.subject || 'WhatsApp Group',
                                body: `👥 ${inviteInfo.size || 0} members • Click to join`,
                                thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/5968/5968841.png",
                                sourceUrl: messageText.match(/https?:\/\/[^\s]+/)[0],
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    });
                } catch (e) {
                    await sock.sendMessage(group.id, { text: messageText });
                }
            } else {
                await sock.sendMessage(group.id, { text: messageText });
            }
            successCount++;
            
            if ((i + 1) % 5 === 0 || i === openGroups.length - 1) {
                await sock.sendMessage(chatId, {
                    text: `📢 *Broadcasting...*\n\n✅ ${successCount}/${totalOpen} sent\n❌ Failed: ${failCount}`,
                    edit: statusMsg.key
                });
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            
        } catch (error) {
            failCount++;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: `✅ *Broadcast Complete!*\n\n✅ Sent: ${successCount}\n❌ Failed: ${failCount}`,
        edit: statusMsg.key
    });
    
    await react('✅');
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performTestBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    await react('🧪');
    
    const statusMsg = await reply(`🧪 *Sending test message...*`);
    
    try {
        const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
        
        if (groupLinkMatch) {
            const inviteCode = groupLinkMatch[1];
            try {
                const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                await sock.sendMessage(TEST_GROUP_JID, {
                    text: messageText,
                    contextInfo: {
                        externalAdReply: {
                            title: inviteInfo.subject || 'WhatsApp Group',
                            body: `👥 ${inviteInfo.size || 0} members • Click to join`,
                            thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/5968/5968841.png",
                            sourceUrl: messageText.match(/https?:\/\/[^\s]+/)[0],
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                });
            } catch (e) {
                await sock.sendMessage(TEST_GROUP_JID, { text: messageText });
            }
        } else {
            await sock.sendMessage(TEST_GROUP_JID, { text: messageText });
        }
        
        await sock.sendMessage(chatId, {
            text: `✅ *Test sent successfully!*\n\n📤 To: ${TEST_GROUP_JID}\n\n📝 Message: ${messageText}`,
            edit: statusMsg.key
        });
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(chatId, {
            text: `❌ *Test failed!*\n\nError: ${error.message}`,
            edit: statusMsg.key
        });
        await react('❌');
    }
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performBulkJoin(sock, chatId, sender, session, reply, react, fileContent, fileName) {
    await react('📥');
    
    const statusMsg = await reply(`📥 *Processing bulk join...*\n\nPlease wait...`);
    
    // Parse links from file
    const links = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => line.includes('chat.whatsapp.com/') || /^[A-Za-z0-9_-]{20,}$/.test(line));
    
    if (links.length === 0) {
        await sock.sendMessage(chatId, {
            text: `❌ *No valid WhatsApp group links found!*\n\nMake sure each line contains a valid WhatsApp invite link.`,
            edit: statusMsg.key
        });
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    // Categories for report
    const failedGroups = [];
    const announcementOnlyGroups = [];
    const openChatGroups = [];
    const unknownGroups = [];
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const linkNumber = i + 1;
        
        await sock.sendMessage(chatId, {
            text: `📥 *Processing ${linkNumber}/${links.length}...*\n${link.substring(0, 50)}...`,
            edit: statusMsg.key
        });
        
        try {
            // Extract invite code
            let inviteCode = link;
            if (link.includes('chat.whatsapp.com/')) {
                inviteCode = link.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            }
            
            if (!inviteCode || inviteCode.length < 20) {
                failedGroups.push({ link: link, reason: 'Invalid invite code format' });
                failCount++;
                continue;
            }
            
            // Get invite info first
            let inviteInfo = null;
            try {
                inviteInfo = await sock.groupGetInviteInfo(inviteCode);
            } catch (e) {
                failedGroups.push({ link: link, reason: 'Cannot fetch group info - ' + e.message });
                failCount++;
                continue;
            }
            
            // Try to join
            let groupJid;
            try {
                groupJid = await sock.groupAcceptInvite(inviteCode);
            } catch (joinError) {
                if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                    // Already in group - determine its type
                    try {
                        const metadata = await sock.groupMetadata(inviteInfo.id);
                        if (metadata.announce === true) {
                            announcementOnlyGroups.push({
                                name: inviteInfo.subject,
                                jid: inviteInfo.id,
                                link: link,
                                members: inviteInfo.size
                            });
                        } else {
                            openChatGroups.push({
                                name: inviteInfo.subject,
                                jid: inviteInfo.id,
                                link: link,
                                members: inviteInfo.size
                            });
                        }
                        successCount++;
                    } catch (e) {
                        unknownGroups.push({
                            name: inviteInfo.subject,
                            link: link,
                            members: inviteInfo.size,
                            reason: 'Already in group but could not determine type'
                        });
                        successCount++;
                    }
                    continue;
                }
                
                if (joinError.message?.includes('conflict') || joinError.data === 409) {
                    // Join request sent - needs approval
                    unknownGroups.push({
                        name: inviteInfo.subject,
                        link: link,
                        members: inviteInfo.size,
                        reason: 'Join request sent - needs admin approval'
                    });
                    successCount++;
                    continue;
                }
                
                failedGroups.push({ link: link, reason: joinError.message });
                failCount++;
                continue;
            }
            
            // Successfully joined - get metadata to determine group type
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const metadata = await sock.groupMetadata(groupJid);
                if (metadata.announce === true) {
                    announcementOnlyGroups.push({
                        name: metadata.subject,
                        jid: groupJid,
                        link: link,
                        members: metadata.participants?.length || 0
                    });
                } else {
                    openChatGroups.push({
                        name: metadata.subject,
                        jid: groupJid,
                        link: link,
                        members: metadata.participants?.length || 0
                    });
                }
                successCount++;
            } catch (e) {
                // Use invite info if metadata fails
                if (inviteInfo.announce === true) {
                    announcementOnlyGroups.push({
                        name: inviteInfo.subject,
                        jid: inviteInfo.id,
                        link: link,
                        members: inviteInfo.size
                    });
                } else if (inviteInfo.announce === false) {
                    openChatGroups.push({
                        name: inviteInfo.subject,
                        jid: inviteInfo.id,
                        link: link,
                        members: inviteInfo.size
                    });
                } else {
                    unknownGroups.push({
                        name: inviteInfo.subject,
                        link: link,
                        members: inviteInfo.size,
                        reason: 'Joined but could not determine group type'
                    });
                }
                successCount++;
            }
            
        } catch (error) {
            failedGroups.push({ link: link, reason: error.message });
            failCount++;
        }
        
        // Delay between joins
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Generate report using native fs
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFileName = `bulk_join_report_${timestamp}.txt`;
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const reportPath = path.join(tempDir, reportFileName);
    
    let reportContent = `📊 BULK JOIN REPORT\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportContent += `📅 Date: ${new Date().toLocaleString()}\n`;
    reportContent += `📄 Source: ${fileName}\n`;
    reportContent += `📊 Total Links: ${links.length}\n`;
    reportContent += `✅ Successful: ${successCount}\n`;
    reportContent += `❌ Failed: ${failCount}\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\n`;
    
    // Section 1: Failed groups due to bad-request
    reportContent += `❌ FAILED GROUP LINKS (${failedGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (failedGroups.length > 0) {
        for (const failed of failedGroups) {
            reportContent += `Link: ${failed.link}\n`;
            reportContent += `Reason: ${failed.reason}\n`;
            reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }
    } else {
        reportContent += `No failed groups.\n\n`;
    }
    reportContent += `\n\n\n`;
    
    // Section 2: Announcement-only groups
    reportContent += `🔇 ANNOUNCEMENT-ONLY GROUPS (${announcementOnlyGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (announcementOnlyGroups.length > 0) {
        for (const group of announcementOnlyGroups) {
            reportContent += `Name: ${group.name}\n`;
            reportContent += `JID: ${group.jid}\n`;
            reportContent += `Members: ${group.members}\n`;
            reportContent += `Link: ${group.link}\n`;
            reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }
    } else {
        reportContent += `No announcement-only groups found.\n\n`;
    }
    reportContent += `\n\n\n`;
    
    // Section 3: Open messaging groups
    reportContent += `💬 OPEN MESSAGING GROUPS (${openChatGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (openChatGroups.length > 0) {
        for (const group of openChatGroups) {
            reportContent += `Name: ${group.name}\n`;
            reportContent += `JID: ${group.jid}\n`;
            reportContent += `Members: ${group.members}\n`;
            reportContent += `Link: ${group.link}\n`;
            reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }
    } else {
        reportContent += `No open messaging groups found.\n\n`;
    }
    reportContent += `\n\n\n`;
    
    // Section 4: Could not determine type
    reportContent += `❓ COULD NOT DETERMINE GROUP TYPE (${unknownGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (unknownGroups.length > 0) {
        for (const group of unknownGroups) {
            reportContent += `Name: ${group.name}\n`;
            reportContent += `Members: ${group.members}\n`;
            reportContent += `Link: ${group.link}\n`;
            reportContent += `Reason: ${group.reason}\n`;
            reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }
    } else {
        reportContent += `All groups were properly categorized.\n\n`;
    }
    
    fs.writeFileSync(reportPath, reportContent);
    
    // Send summary message
    let summary = `✅ *BULK JOIN COMPLETED!*\n\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n`;
    summary += `📊 Total Links: ${links.length}\n`;
    summary += `✅ Successful: ${successCount}\n`;
    summary += `❌ Failed: ${failCount}\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📋 *Categories:*\n`;
    summary += `🔇 Announcement-Only: ${announcementOnlyGroups.length}\n`;
    summary += `💬 Open Chat: ${openChatGroups.length}\n`;
    summary += `❓ Unknown: ${unknownGroups.length}\n`;
    summary += `❌ Failed: ${failedGroups.length}\n\n`;
    summary += `📄 *Detailed report sent as a file.*`;
    
    await sock.sendMessage(chatId, {
        text: summary,
        edit: statusMsg.key
    });
    
    // Send the report file
    await sock.sendMessage(chatId, {
        document: fs.readFileSync(reportPath),
        fileName: reportFileName,
        mimetype: 'text/plain',
        caption: `📊 *Bulk Join Report*\n\n📅 ${new Date().toLocaleString()}\n📊 Total: ${links.length} | ✅ ${successCount} | ❌ ${failCount}`
    });
    
    // Clean up temp file
    fs.unlinkSync(reportPath);
    
    await react('✅');
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performLeave(sock, chatId, sender, session, reply, react) {
    const announcementGroups = session.data.announcementGroups;
    const totalAnnouncement = announcementGroups.length;
    
    if (totalAnnouncement === 0) {
        await reply(`❌ No announcement-only groups to leave.`);
        return;
    }
    
    await react('🚪');
    
    const statusMsg = await reply(`🚪 *Leaving ${totalAnnouncement} groups...*\n\n0/${totalAnnouncement} left`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        
        try {
            await sock.groupLeave(group.id);
            successCount++;
            
            await sock.sendMessage(chatId, {
                text: `🚪 *Leaving...*\n\n✅ ${successCount}/${totalAnnouncement} left\n❌ Failed: ${failCount}`,
                edit: statusMsg.key
            });
            
            await new Promise(resolve => setTimeout(resolve, 800));
            
        } catch (error) {
            failCount++;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: `✅ *Leave Complete!*\n\n✅ Left: ${successCount}\n❌ Failed: ${failCount}`,
        edit: statusMsg.key
    });
    
    await react('✅');
    
    await refreshGroups(sock, chatId, sender, session, reply);
}