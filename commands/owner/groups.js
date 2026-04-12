/**
 * Groups Command - Show group statistics and manage announcement-only groups
 * Shows: total groups, announcement-only groups, open chat groups
 * Buttons: Leave and delete all announcement-only groups
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
                       `• Shows announcement-only groups (only admins can send messages)\n` +
                       `• Shows open chat groups (everyone can send messages)\n` +
                       `• Option to leave all announcement-only groups\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('📊');
        
        const processingMsg = await reply(`📊 *Fetching group list...*\n\nPlease wait...`);
        
        try {
            // Get all groups the bot is in
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
            
            const totalGroups = groupList.length;
            const totalAnnouncement = announcementGroups.length;
            const totalOpen = openGroups.length;
            
            // Build status message
            let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                               `━━━━━━━━━━━━━━━━━━\n` +
                               `📁 *Total Groups:* ${totalGroups}\n` +
                               `🔇 *Announcement-Only:* ${totalAnnouncement}\n` +
                               `💬 *Open Chat:* ${totalOpen}\n` +
                               `━━━━━━━━━━━━━━━━━━\n\n`;
            
            if (announcementGroups.length > 0) {
                statusMessage += `🔇 *ANNOUNCEMENT-ONLY GROUPS (${announcementGroups.length}):*\n`;
                statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
                for (let i = 0; i < Math.min(announcementGroups.length, 15); i++) {
                    const group = announcementGroups[i];
                    const memberCount = group.participants?.length || 0;
                    statusMessage += `${i + 1}. ${group.subject}\n`;
                    statusMessage += `   👥 ${memberCount} members\n\n`;
                }
                if (announcementGroups.length > 15) {
                    statusMessage += `... and ${announcementGroups.length - 15} more\n`;
                }
                statusMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
            } else {
                statusMessage += `🔇 *No announcement-only groups*\n━━━━━━━━━━━━━━━━━━\n\n`;
            }
            
            if (openGroups.length > 0) {
                statusMessage += `💬 *OPEN CHAT GROUPS (${openGroups.length}):*\n`;
                statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
                for (let i = 0; i < Math.min(openGroups.length, 10); i++) {
                    const group = openGroups[i];
                    const memberCount = group.participants?.length || 0;
                    statusMessage += `${i + 1}. ${group.subject}\n`;
                    statusMessage += `   👥 ${memberCount} members\n\n`;
                }
                if (openGroups.length > 10) {
                    statusMessage += `... and ${openGroups.length - 10} more\n`;
                }
                statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
            } else {
                statusMessage += `💬 *No open chat groups*\n━━━━━━━━━━━━━━━━━━\n`;
            }
            
            // Clear any existing sessions
            const existingSessions = sessionManager.getUserSessions(sender, from);
            for (const sess of existingSessions) {
                if (sess.command === 'groups') {
                    sessionManager.clearSession(sess.id);
                }
            }
            
            // Create session
            const session = sessionManager.createSession(sender, from, 'groups', {
                announcementGroups: announcementGroups,
                openGroups: openGroups,
                totalAnnouncement: totalAnnouncement,
                totalOpen: totalOpen,
                totalGroups: totalGroups,
                step: 'main_menu'
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Create buttons
            const buttons = [];
            
            if (announcementGroups.length > 0) {
                buttons.push({ 
                    id: `groups_leave_${sessionId}`, 
                    text: `🔇 Leave Announcement Groups (${totalAnnouncement})` 
                });
            }
            
            buttons.push({ id: `groups_refresh_${sessionId}`, text: '🔄 Refresh' });
            buttons.push({ id: `groups_cancel_${sessionId}`, text: '❌ Close' });
            
            // Send message with buttons
            const sentMsg = await sendButtons(sock, from, {
                text: statusMessage,
                footer: 'Group Manager',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, { edit: processingMsg.key });
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
            
            await react('✅');
            
        } catch (error) {
            console.error('[GROUPS] Error:', error);
            await sock.sendMessage(from, {
                text: `❌ *Failed to fetch groups!*\n\nError: ${error.message}`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        console.log(`[GROUPS] handleSession called, isButtonClick: ${isButtonClick}`);
        
        if (session.command !== 'groups') return true;
        
        // Handle button clicks
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;
            
            // Extract button ID (like commit.js)
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
                console.log(`[GROUPS] Button clicked: ${buttonId} - ${buttonText}`);
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                        console.log(`[GROUPS] Interactive button: ${buttonId} - ${buttonText}`);
                    } catch (e) {}
                }
            }
            
            if (!buttonId) return true;
            
            // Handle Cancel
            if (buttonId.includes('groups_cancel_')) {
                sessionManager.clearSession(session.id);
                await reply(`❌ Closed.`);
                return true;
            }
            
            // Handle Refresh
            if (buttonId.includes('groups_refresh_')) {
                await refreshGroupList(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Leave Announcement Groups
            if (buttonId.includes('groups_leave_')) {
                await showConfirmLeave(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Confirm Leave
            if (buttonId.includes('groups_confirm_')) {
                await performLeaveAnnouncementGroups(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Cancel Leave
            if (buttonId.includes('groups_cancel_leave_')) {
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
    
    // Build status message
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `━━━━━━━━━━━━━━━━━━\n` +
                       `📁 *Total Groups:* ${totalGroups}\n` +
                       `🔇 *Announcement-Only:* ${totalAnnouncement}\n` +
                       `💬 *Open Chat:* ${totalOpen}\n` +
                       `━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (announcementGroups.length > 0) {
        statusMessage += `🔇 *ANNOUNCEMENT-ONLY GROUPS (${announcementGroups.length}):*\n`;
        statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
        for (let i = 0; i < Math.min(announcementGroups.length, 15); i++) {
            const group = announcementGroups[i];
            const memberCount = group.participants?.length || 0;
            statusMessage += `${i + 1}. ${group.subject}\n`;
            statusMessage += `   👥 ${memberCount} members\n\n`;
        }
        if (announcementGroups.length > 15) {
            statusMessage += `... and ${announcementGroups.length - 15} more\n`;
        }
        statusMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
    } else {
        statusMessage += `🔇 *No announcement-only groups*\n━━━━━━━━━━━━━━━━━━\n\n`;
    }
    
    if (openGroups.length > 0) {
        statusMessage += `💬 *OPEN CHAT GROUPS (${openGroups.length}):*\n`;
        statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
        for (let i = 0; i < Math.min(openGroups.length, 10); i++) {
            const group = openGroups[i];
            const memberCount = group.participants?.length || 0;
            statusMessage += `${i + 1}. ${group.subject}\n`;
            statusMessage += `   👥 ${memberCount} members\n\n`;
        }
        if (openGroups.length > 10) {
            statusMessage += `... and ${openGroups.length - 10} more\n`;
        }
        statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
    } else {
        statusMessage += `💬 *No open chat groups*\n━━━━━━━━━━━━━━━━━━\n`;
    }
    
    const sessionId = session.id.split(':').pop();
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ 
            id: `groups_leave_${sessionId}`, 
            text: `🔇 Leave Announcement Groups (${totalAnnouncement})` 
        });
    }
    buttons.push({ id: `groups_refresh_${sessionId}`, text: '🔄 Refresh' });
    buttons.push({ id: `groups_cancel_${sessionId}`, text: '❌ Close' });
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: statusMessage,
        footer: 'Group Manager',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function refreshGroupList(sock, chatId, sender, session, reply) {
    try {
        await reply(`🔄 *Refreshing group list...*`);
        
        // Get fresh group data
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
        
        // Update session
        session.data.announcementGroups = announcementGroups;
        session.data.openGroups = openGroups;
        session.data.totalAnnouncement = announcementGroups.length;
        session.data.totalOpen = openGroups.length;
        session.data.totalGroups = groupList.length;
        
        await showMainMenu(sock, chatId, sender, session, reply);
        
    } catch (error) {
        console.error('[GROUPS] Refresh error:', error);
        await reply(`❌ *Failed to refresh!*\n\nError: ${error.message}`);
    }
}

async function showConfirmLeave(sock, chatId, sender, session, reply) {
    const announcementGroups = session.data.announcementGroups;
    const totalAnnouncement = announcementGroups.length;
    
    if (totalAnnouncement === 0) {
        await reply(`❌ *No announcement-only groups to leave!*`);
        return;
    }
    
    // Build warning message
    let warningMsg = `⚠️ *WARNING: You are about to leave ${totalAnnouncement} announcement-only group(s)!*\n\n`;
    warningMsg += `━━━━━━━━━━━━━━━━━━\n`;
    warningMsg += `📋 *Groups that will be left:*\n\n`;
    
    for (let i = 0; i < Math.min(announcementGroups.length, 15); i++) {
        warningMsg += `${i + 1}. ${announcementGroups[i].subject}\n`;
    }
    if (announcementGroups.length > 15) {
        warningMsg += `\n... and ${announcementGroups.length - 15} more\n`;
    }
    
    warningMsg += `━━━━━━━━━━━━━━━━━━\n\n`;
    warningMsg += `⚠️ *This action cannot be undone!*\n\n`;
    warningMsg += `Are you sure you want to leave all announcement-only groups?`;
    
    const sessionId = session.id.split(':').pop();
    
    const buttons = [
        { id: `groups_confirm_${sessionId}`, text: `✅ Yes, Leave All (${totalAnnouncement})` },
        { id: `groups_cancel_leave_${sessionId}`, text: '❌ No, Cancel' }
    ];
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: warningMsg,
        footer: 'Confirm Leave',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function performLeaveAnnouncementGroups(sock, chatId, sender, session, reply, react) {
    const announcementGroups = session.data.announcementGroups;
    const totalAnnouncement = announcementGroups.length;
    
    if (totalAnnouncement === 0) {
        await reply(`❌ *No announcement-only groups to leave!*`);
        return;
    }
    
    await react('🚪');
    
    const processingMsg = await reply(`🚪 *Leaving ${totalAnnouncement} announcement-only group(s)...*\n\nPlease wait...`);
    
    let successCount = 0;
    let failCount = 0;
    const failedGroups = [];
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        
        try {
            // Send success message before leaving
            await sock.sendMessage(chatId, {
                text: `✅ Left: ${group.subject}`,
                edit: processingMsg.key
            });
            
            await sock.groupLeave(group.id);
            successCount++;
            
            // Small delay between leaves
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`[GROUPS] Failed to leave ${group.subject}:`, error.message);
            failedGroups.push({ name: group.subject, reason: error.message });
            failCount++;
        }
    }
    
    // Build result message
    let resultMsg = `✅ *Bulk Leave Completed!*\n\n` +
                   `━━━━━━━━━━━━━━━━━━\n` +
                   `📊 *Summary:*\n` +
                   `• ✅ Successfully left: ${successCount}\n` +
                   `• ❌ Failed: ${failCount}\n` +
                   `━━━━━━━━━━━━━━━━━━\n`;
    
    if (failedGroups.length > 0) {
        resultMsg += `\n❌ *Failed groups:*\n`;
        for (const failed of failedGroups.slice(0, 10)) {
            resultMsg += `• ${failed.name}\n  └ Reason: ${failed.reason}\n`;
        }
        if (failedGroups.length > 10) {
            resultMsg += `\n... and ${failedGroups.length - 10} more\n`;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: resultMsg,
        edit: processingMsg.key
    });
    
    await react('✅');
    
    // Refresh the group list after operation
    await refreshGroupList(sock, chatId, sender, session, reply);
}