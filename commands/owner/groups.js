/**
 * Groups Command - Show group statistics and manage announcement-only groups
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

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
            
            // Store the message and show confirmation
            session.data.broadcastMessage = messageText;
            session.data.type = 'confirm_broadcast';
            
            await showBroadcastConfirm(sock, from, sender, session, reply, messageText);
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
            if (buttonId?.includes('cancel') && !buttonId?.includes('cancel_broadcast')) {
                sessionManager.clearSession(session.id);
                await reply('❌ Closed.');
                return true;
            }
            
            // Handle Refresh
            if (buttonId?.includes('refresh')) {
                await refreshGroups(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Leave (from main menu)
            if (buttonId?.includes('leave') && !buttonId?.includes('confirm') && !buttonId?.includes('cancel')) {
                await showConfirmLeave(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Broadcast (from main menu)
            if (buttonId?.includes('broadcast')) {
                await showBroadcastInput(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Test Broadcast (from main menu)
            if (buttonId?.includes('test_broadcast')) {
                await showTestBroadcastInput(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Confirm Broadcast
            if (buttonId?.includes('confirm_broadcast')) {
                await performBroadcast(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Confirm Test Broadcast
            if (buttonId?.includes('confirm_test_broadcast')) {
                await performTestBroadcast(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Cancel Broadcast
            if (buttonId?.includes('cancel_broadcast')) {
                sessionManager.updateSession(sender, from, { type: 'main_menu' });
                await showMainMenu(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Confirm Leave
            if (buttonId?.includes('confirm_leave')) {
                await performLeave(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Cancel Leave
            if (buttonId?.includes('cancel_leave')) {
                await showMainMenu(sock, from, sender, session, reply);
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
    const refreshId = `refresh_${sessionId}_${Date.now()}`;
    const cancelId = `cancel_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
    }
    if (openGroups.length > 0) {
        buttons.push({ id: broadcastId, text: `📢 Broadcast to Open Chats (${totalOpen})` });
        buttons.push({ id: testBroadcastId, text: `🧪 Test Broadcast (Single Group)` });
    }
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

async function showBroadcastInput(sock, chatId, sender, session, reply) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    
    session.data.type = 'waiting_broadcast_message';
    
    const message = `📢 *Broadcast to ${totalOpen} Open Chat Groups*\n\n` +
                   `Send me the message you want to broadcast.\n\n` +
                   `*Important:*\n` +
                   `• The message will be sent EXACTLY as you type it\n` +
                   `• Links will show full preview\n` +
                   `• No extra text or footers will be added\n\n` +
                   `Type *cancel* to go back.`;
    
    const sentMsg = await reply(message);
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function showTestBroadcastInput(sock, chatId, sender, session, reply) {
    session.data.type = 'waiting_broadcast_message';
    session.data.isTest = true;
    
    const message = `🧪 *Test Broadcast*\n\n` +
                   `This will send a test message ONLY to:\n` +
                   `\`${TEST_GROUP_JID}\`\n\n` +
                   `Send me the message you want to test.\n\n` +
                   `*Important:*\n` +
                   `• The message will be sent EXACTLY as you type it\n` +
                   `• Links will show full preview\n` +
                   `• No extra text or footers will be added\n\n` +
                   `Type *cancel* to go back.`;
    
    const sentMsg = await reply(message);
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function showBroadcastConfirm(sock, chatId, sender, session, reply, messageText) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    const isTest = session.data.isTest || false;
    const sessionId = session.id.split(':').pop();
    
    let previewMessage = `📢 *Broadcast Confirmation*\n\n`;
    
    if (isTest) {
        previewMessage = `🧪 *Test Broadcast Confirmation*\n\n` +
                        `Target: \`${TEST_GROUP_JID}\`\n\n`;
    } else {
        previewMessage = `📢 *Broadcast to ${totalOpen} Open Chat Groups*\n\n`;
    }
    
    previewMessage += `*Message Preview:*\n━━━━━━━━━━━━━━━━━━\n${messageText}\n━━━━━━━━━━━━━━━━━━\n\n`;
    previewMessage += `⚠️ Send this EXACT message to ${isTest ? '1 group' : totalOpen + ' groups'}?\n\n`;
    previewMessage += `The message will be sent WITHOUT any additional text.`;
    
    const confirmId = `confirm_broadcast_${sessionId}_${Date.now()}`;
    const confirmTestId = `confirm_test_broadcast_${sessionId}_${Date.now()}`;
    const cancelId = `cancel_broadcast_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (isTest) {
        buttons.push({ id: confirmTestId, text: '✅ Yes, Send Test Message' });
    } else {
        buttons.push({ id: confirmId, text: `✅ Yes, Broadcast to ${totalOpen} Groups` });
    }
    buttons.push({ id: cancelId, text: '❌ No, Cancel' });
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: previewMessage,
        footer: 'Confirm Broadcast',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function performBroadcast(sock, chatId, sender, session, reply, react) {
    const openGroups = session.data.openGroups;
    const messageText = session.data.broadcastMessage;
    const totalOpen = openGroups.length;
    
    if (!messageText || openGroups.length === 0) {
        await reply(`❌ No message or no groups to broadcast to.`);
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    await react('📢');
    
    const statusMsg = await reply(`📢 *Broadcasting...*\n\n0/${totalOpen} groups\n\nPlease wait...`);
    
    let successCount = 0;
    let failCount = 0;
    const failedGroups = [];
    
    for (let i = 0; i < openGroups.length; i++) {
        const group = openGroups[i];
        
        try {
            // Send message EXACTLY as is - NO extra text, NO footers
            await sock.sendMessage(group.id, { 
                text: messageText,
                linkPreview: true  // This ensures links show full preview
            });
            successCount++;
            
            // Update progress every 5 groups
            if ((i + 1) % 5 === 0 || i === openGroups.length - 1) {
                await sock.sendMessage(chatId, {
                    text: `📢 *Broadcasting...*\n\n✅ ${successCount}/${totalOpen} sent\n❌ Failed: ${failCount}`,
                    edit: statusMsg.key
                });
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            failCount++;
            failedGroups.push({ name: group.subject, error: error.message });
            console.error(`[GROUPS] Failed to send to ${group.subject}:`, error.message);
        }
    }
    
    // Build result message
    let resultMsg = `✅ *Broadcast Completed!*\n\n` +
                   `📢 Message sent to:\n` +
                   `✅ Success: ${successCount}\n` +
                   `❌ Failed: ${failCount}\n\n` +
                   `*Message:*\n${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`;
    
    if (failedGroups.length > 0 && failedGroups.length <= 5) {
        resultMsg += `\n\n❌ *Failed groups:*\n`;
        for (const failed of failedGroups) {
            resultMsg += `• ${failed.name}\n`;
        }
    } else if (failedGroups.length > 5) {
        resultMsg += `\n\n❌ *Failed: ${failedGroups.length} groups*`;
    }
    
    await sock.sendMessage(chatId, {
        text: resultMsg,
        edit: statusMsg.key
    });
    
    await react('✅');
    
    // Clear broadcast data and show main menu
    session.data.broadcastMessage = null;
    session.data.isTest = false;
    session.data.type = 'main_menu';
    
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performTestBroadcast(sock, chatId, sender, session, reply, react) {
    const messageText = session.data.broadcastMessage;
    
    if (!messageText) {
        await reply(`❌ No message to send.`);
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    await react('🧪');
    
    const statusMsg = await reply(`🧪 *Sending test message...*\n\nTarget: ${TEST_GROUP_JID}`);
    
    try {
        // Send message EXACTLY as is - NO extra text, NO footers
        await sock.sendMessage(TEST_GROUP_JID, { 
            text: messageText,
            linkPreview: true  // This ensures links show full preview
        });
        
        await sock.sendMessage(chatId, {
            text: `✅ *Test Broadcast Successful!*\n\n` +
                  `📤 Message sent to:\n\`${TEST_GROUP_JID}\`\n\n` +
                  `*Message:*\n${messageText}`,
            edit: statusMsg.key
        });
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(chatId, {
            text: `❌ *Test Broadcast Failed!*\n\n` +
                  `Error: ${error.message}\n\n` +
                  `Target: ${TEST_GROUP_JID}`,
            edit: statusMsg.key
        });
        await react('❌');
    }
    
    // Clear broadcast data and show main menu
    session.data.broadcastMessage = null;
    session.data.isTest = false;
    session.data.type = 'main_menu';
    
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function showConfirmLeave(sock, chatId, sender, session, reply) {
    const announcementGroups = session.data.announcementGroups;
    const totalAnnouncement = announcementGroups.length;
    const sessionId = session.id.split(':').pop();
    
    let warningMsg = `⚠️ *WARNING: You are about to leave ${totalAnnouncement} announcement-only group(s)!*\n\n`;
    warningMsg += `━━━━━━━━━━━━━━━━━━\n`;
    warningMsg += `📋 *Groups that will be left:*\n\n`;
    
    for (let i = 0; i < Math.min(announcementGroups.length, 10); i++) {
        warningMsg += `${i + 1}. ${announcementGroups[i].subject}\n`;
    }
    if (announcementGroups.length > 10) {
        warningMsg += `\n... and ${announcementGroups.length - 10} more\n`;
    }
    
    warningMsg += `\n⚠️ *This action cannot be undone!*\n\n`;
    warningMsg += `Are you sure?`;
    
    const confirmId = `confirm_leave_${sessionId}_${Date.now()}`;
    const cancelLeaveId = `cancel_leave_${sessionId}_${Date.now()}`;
    
    const buttons = [
        { id: confirmId, text: `✅ Yes, Leave All (${totalAnnouncement})` },
        { id: cancelLeaveId, text: '❌ No, Cancel' }
    ];
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: warningMsg,
        footer: 'Confirm Leave',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function performLeave(sock, chatId, sender, session, reply, react) {
    const announcementGroups = session.data.announcementGroups;
    const totalAnnouncement = announcementGroups.length;
    
    await react('🚪');
    
    const statusMsg = await reply(`🚪 *Leaving ${totalAnnouncement} group(s)...*\n\n0/${totalAnnouncement} completed`);
    
    let successCount = 0;
    let failCount = 0;
    const failedGroups = [];
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        
        try {
            await sock.groupLeave(group.id);
            successCount++;
            
            await sock.sendMessage(chatId, {
                text: `🚪 *Leaving ${totalAnnouncement} group(s)...*\n\n✅ ${successCount}/${totalAnnouncement} completed\n${failCount > 0 ? `❌ Failed: ${failCount}` : ''}`,
                edit: statusMsg.key
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            failCount++;
            failedGroups.push({ name: group.subject, error: error.message });
            await sock.sendMessage(chatId, {
                text: `🚪 *Leaving ${totalAnnouncement} group(s)...*\n\n✅ ${successCount}/${totalAnnouncement} completed\n❌ Failed: ${failCount}`,
                edit: statusMsg.key
            });
        }
    }
    
    let resultMsg = `✅ *Bulk Leave Completed!*\n\n` +
                   `✅ Successfully left: ${successCount}\n` +
                   `❌ Failed: ${failCount}`;
    
    if (failedGroups.length > 0) {
        resultMsg += `\n\n❌ *Failed groups:*\n`;
        for (const failed of failedGroups.slice(0, 5)) {
            resultMsg += `• ${failed.name}\n`;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: resultMsg,
        edit: statusMsg.key
    });
    
    await react('✅');
    
    sessionManager.clearSession(session.id);
    
    const newSession = sessionManager.createSession(sender, chatId, 'groups', {
        type: 'main_menu'
    });
    
    await showMainMenu(sock, chatId, sender, newSession, reply);
}