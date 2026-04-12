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
                       `*Features:*\n` +
                       `• Shows total number of groups\n` +
                       `• Shows announcement-only groups\n` +
                       `• Shows open chat groups\n` +
                       `• Option to leave all announcement-only groups\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('📊');
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            type: 'main_menu'
        });
        
        const sessionId = session.id.split(':').pop();
        
        // Get all groups
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups);
        
        // Categorize groups
        const announcementGroups = [];
        const openGroups = [];
        
        for (const group of groupList) {
            if (group.announce === true) {
                announcementGroups.push({ id: group.id, subject: group.subject, participants: group.participants });
            } else {
                openGroups.push({ id: group.id, subject: group.subject, participants: group.participants });
            }
        }
        
        const totalAnnouncement = announcementGroups.length;
        const totalOpen = openGroups.length;
        const totalGroups = groupList.length;
        
        // Store data in session
        sessionManager.updateSession(sender, from, {
            announcementGroups: announcementGroups,
            openGroups: openGroups,
            totalAnnouncement: totalAnnouncement,
            totalOpen: totalOpen,
            totalGroups: totalGroups
        });
        
        // Build status message
        let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                           `━━━━━━━━━━━━━━━━━━\n` +
                           `📁 *Total Groups:* ${totalGroups}\n` +
                           `🔇 *Announcement-Only:* ${totalAnnouncement}\n` +
                           `💬 *Open Chat:* ${totalOpen}\n` +
                           `━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (announcementGroups.length > 0) {
            statusMessage += `🔇 *ANNOUNCEMENT-ONLY GROUPS:*\n`;
            for (let i = 0; i < Math.min(announcementGroups.length, 10); i++) {
                statusMessage += `${i + 1}. ${announcementGroups[i].subject}\n`;
            }
            if (announcementGroups.length > 10) {
                statusMessage += `... and ${announcementGroups.length - 10} more\n`;
            }
            statusMessage += `\n`;
        }
        
        // Create buttons (simple IDs like drive.js)
        const leaveId = `leave_${sessionId}_${Date.now()}`;
        const refreshId = `refresh_${sessionId}_${Date.now()}`;
        const cancelId = `cancel_${sessionId}_${Date.now()}`;
        
        const buttons = [];
        
        if (announcementGroups.length > 0) {
            buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
        }
        buttons.push({ id: refreshId, text: '🔄 Refresh' });
        buttons.push({ id: cancelId, text: '❌ Close' });
        
        const sentMsg = await sendButtons(sock, from, {
            text: statusMessage,
            footer: 'Group Manager',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Groups session created: ${session.id}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        // Handle button clicks (like drive.js)
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
                await confirmLeave(sock, from, sender, session, reply);
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
    const announcementGroups = session.data.announcementGroups;
    const openGroups = session.data.openGroups;
    const totalAnnouncement = session.data.totalAnnouncement;
    const totalOpen = session.data.totalOpen;
    const totalGroups = session.data.totalGroups;
    const sessionId = session.id.split(':').pop();
    
    // Build status message
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `━━━━━━━━━━━━━━━━━━\n` +
                       `📁 *Total Groups:* ${totalGroups}\n` +
                       `🔇 *Announcement-Only:* ${totalAnnouncement}\n` +
                       `💬 *Open Chat:* ${totalOpen}\n` +
                       `━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (announcementGroups.length > 0) {
        statusMessage += `🔇 *ANNOUNCEMENT-ONLY GROUPS:*\n`;
        for (let i = 0; i < Math.min(announcementGroups.length, 10); i++) {
            statusMessage += `${i + 1}. ${announcementGroups[i].subject}\n`;
        }
        if (announcementGroups.length > 10) {
            statusMessage += `... and ${announcementGroups.length - 10} more\n`;
        }
        statusMessage += `\n`;
    }
    
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
    await reply(`🔄 Refreshing...`);
    
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    const announcementGroups = [];
    const openGroups = [];
    
    for (const group of groupList) {
        if (group.announce === true) {
            announcementGroups.push({ id: group.id, subject: group.subject, participants: group.participants });
        } else {
            openGroups.push({ id: group.id, subject: group.subject, participants: group.participants });
        }
    }
    
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = announcementGroups.length;
    session.data.totalOpen = openGroups.length;
    session.data.totalGroups = groupList.length;
    
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function confirmLeave(sock, chatId, sender, session, reply) {
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
    const cancelId = `cancel_leave_${sessionId}_${Date.now()}`;
    
    const buttons = [
        { id: confirmId, text: `✅ Yes, Leave All (${totalAnnouncement})` },
        { id: cancelId, text: '❌ No, Cancel' }
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
    const processingMsg = await reply(`🚪 *Leaving ${totalAnnouncement} group(s)...*`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const group of announcementGroups) {
        try {
            await sock.groupLeave(group.id);
            successCount++;
            await sock.sendMessage(chatId, {
                text: `✅ Left: ${group.subject}`,
                edit: processingMsg.key
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            failCount++;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: `✅ *Completed!*\n\n✅ Left: ${successCount}\n❌ Failed: ${failCount}`,
        edit: processingMsg.key
    });
    
    await react('✅');
    
    // Refresh the list
    await refreshGroups(sock, chatId, sender, session, reply);
}