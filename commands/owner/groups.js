/**
 * Groups Command - Show group statistics and manage announcement-only groups
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

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
            if (buttonId?.includes('cancel') && !buttonId?.includes('cancel_leave')) {
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
    }
    
    const sessionId = session.id.split(':').pop();
    const leaveId = `leave_${sessionId}_${Date.now()}`;
    const refreshId = `refresh_${sessionId}_${Date.now()}`;
    const cancelId = `cancel_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
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
    
    // Send initial message
    const statusMsg = await reply(`🚪 *Leaving ${totalAnnouncement} group(s)...*\n\n0/${totalAnnouncement} completed`);
    
    let successCount = 0;
    let failCount = 0;
    const failedGroups = [];
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        
        try {
            await sock.groupLeave(group.id);
            successCount++;
            
            // Update progress
            await sock.sendMessage(chatId, {
                text: `🚪 *Leaving ${totalAnnouncement} group(s)...*\n\n✅ ${successCount}/${totalAnnouncement} completed\n${failCount > 0 ? `❌ Failed: ${failCount}` : ''}`,
                edit: statusMsg.key
            });
            
            // Small delay
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
    
    // Build result message
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
    
    // Clear the session and show fresh main menu
    sessionManager.clearSession(session.id);
    
    // Create new session and show menu
    const newSession = sessionManager.createSession(sender, chatId, 'groups', {
        type: 'main_menu'
    });
    
    await showMainMenu(sock, chatId, sender, newSession, reply);
}