/**
 * Groups Command - Show group statistics and manage announcement-only groups
 * Shows: total groups, announcement-only groups, open chat groups
 * Buttons: Leave and delete all announcement-only groups
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

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
                       `• Option to leave and delete all announcement-only groups\n\n` +
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
                    // Announcement-only group (only admins can send)
                    announcementGroups.push(group);
                } else {
                    // Open chat group (everyone can send)
                    openGroups.push(group);
                }
            }
            
            const totalGroups = groupList.length;
            const totalAnnouncement = announcementGroups.length;
            const totalOpen = openGroups.length;
            
            // Build status message
            const statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                                 `━━━━━━━━━━━━━━━━━━\n` +
                                 `📁 *Total Groups:* ${totalGroups}\n` +
                                 `🔇 *Announcement-Only:* ${totalAnnouncement}\n` +
                                 `💬 *Open Chat:* ${totalOpen}\n` +
                                 `━━━━━━━━━━━━━━━━━━\n\n`;
            
            // Show announcement-only groups (first 20)
            if (announcementGroups.length > 0) {
                statusMessage += `🔇 *ANNOUNCEMENT-ONLY GROUPS (${announcementGroups.length}):*\n`;
                statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
                for (let i = 0; i < Math.min(announcementGroups.length, 20); i++) {
                    const group = announcementGroups[i];
                    const memberCount = group.participants?.length || 0;
                    statusMessage += `${i + 1}. ${group.subject}\n`;
                    statusMessage += `   👥 ${memberCount} members | 🆔 ${group.id}\n\n`;
                }
                if (announcementGroups.length > 20) {
                    statusMessage += `... and ${announcementGroups.length - 20} more\n`;
                }
                statusMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
            } else {
                statusMessage += `🔇 *No announcement-only groups*\n━━━━━━━━━━━━━━━━━━\n\n`;
            }
            
            // Show open chat groups (first 20)
            if (openGroups.length > 0) {
                statusMessage += `💬 *OPEN CHAT GROUPS (${openGroups.length}):*\n`;
                statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
                for (let i = 0; i < Math.min(openGroups.length, 20); i++) {
                    const group = openGroups[i];
                    const memberCount = group.participants?.length || 0;
                    statusMessage += `${i + 1}. ${group.subject}\n`;
                    statusMessage += `   👥 ${memberCount} members | 🆔 ${group.id}\n\n`;
                }
                if (openGroups.length > 20) {
                    statusMessage += `... and ${openGroups.length - 20} more\n`;
                }
                statusMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
            } else {
                statusMessage += `💬 *No open chat groups*\n━━━━━━━━━━━━━━━━━━\n\n`;
            }
            
            // Create session for button handling
            const session = sessionManager.createSession(sender, from, 'groups', {
                announcementGroups: announcementGroups.map(g => ({ id: g.id, subject: g.subject })),
                openGroups: openGroups.map(g => ({ id: g.id, subject: g.subject })),
                totalAnnouncement: totalAnnouncement,
                totalOpen: totalOpen,
                totalGroups: totalGroups
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Create buttons
            const buttons = [];
            
            if (announcementGroups.length > 0) {
                buttons.push({ 
                    id: `groups_leave_announcement_${sessionId}`, 
                    text: `🔇 Leave All Announcement Groups (${totalAnnouncement})` 
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
        
        if (session.command !== 'groups') return true;
        
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
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
            if (buttonId.includes('groups_leave_announcement_')) {
                await confirmLeaveAnnouncementGroups(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Confirm Leave
            if (buttonId.includes('groups_confirm_leave_')) {
                await performLeaveAnnouncementGroups(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Cancel Leave
            if (buttonId.includes('groups_cancel_leave_')) {
                await refreshGroupList(sock, from, sender, session, reply);
                return true;
            }
        }
        
        return true;
    }
};

async function refreshGroupList(sock, chatId, sender, session, reply) {
    try {
        const processingMsg = await reply(`🔄 *Refreshing group list...*`);
        
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
            for (let i = 0; i < Math.min(announcementGroups.length, 20); i++) {
                const group = announcementGroups[i];
                const memberCount = group.participants?.length || 0;
                statusMessage += `${i + 1}. ${group.subject}\n`;
                statusMessage += `   👥 ${memberCount} members | 🆔 ${group.id}\n\n`;
            }
            if (announcementGroups.length > 20) {
                statusMessage += `... and ${announcementGroups.length - 20} more\n`;
            }
            statusMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
        } else {
            statusMessage += `🔇 *No announcement-only groups*\n━━━━━━━━━━━━━━━━━━\n\n`;
        }
        
        if (openGroups.length > 0) {
            statusMessage += `💬 *OPEN CHAT GROUPS (${openGroups.length}):*\n`;
            statusMessage += `━━━━━━━━━━━━━━━━━━\n`;
            for (let i = 0; i < Math.min(openGroups.length, 20); i++) {
                const group = openGroups[i];
                const memberCount = group.participants?.length || 0;
                statusMessage += `${i + 1}. ${group.subject}\n`;
                statusMessage += `   👥 ${memberCount} members | 🆔 ${group.id}\n\n`;
            }
            if (openGroups.length > 20) {
                statusMessage += `... and ${openGroups.length - 20} more\n`;
            }
            statusMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
        } else {
            statusMessage += `💬 *No open chat groups*\n━━━━━━━━━━━━━━━━━━\n\n`;
        }
        
        // Update session with fresh data
        session.data.announcementGroups = announcementGroups.map(g => ({ id: g.id, subject: g.subject }));
        session.data.openGroups = openGroups.map(g => ({ id: g.id, subject: g.subject }));
        session.data.totalAnnouncement = totalAnnouncement;
        session.data.totalOpen = totalOpen;
        session.data.totalGroups = totalGroups;
        
        const sessionId = session.id.split(':').pop();
        
        const buttons = [];
        if (announcementGroups.length > 0) {
            buttons.push({ 
                id: `groups_leave_announcement_${sessionId}`, 
                text: `🔇 Leave All Announcement Groups (${totalAnnouncement})` 
            });
        }
        buttons.push({ id: `groups_refresh_${sessionId}`, text: '🔄 Refresh' });
        buttons.push({ id: `groups_cancel_${sessionId}`, text: '❌ Close' });
        
        await sock.sendMessage(chatId, {
            text: statusMessage,
            edit: processingMsg.key
        });
        
        const sentMsg = await sendButtons(sock, chatId, {
            text: statusMessage,
            footer: 'Group Manager',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
        
    } catch (error) {
        console.error('[GROUPS] Refresh error:', error);
        await reply(`❌ *Failed to refresh!*\n\nError: ${error.message}`);
    }
}

async function confirmLeaveAnnouncementGroups(sock, chatId, sender, session, reply, react) {
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
        { id: `groups_confirm_leave_${sessionId}`, text: `✅ Yes, Leave All (${totalAnnouncement})` },
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
            // Check if bot is the only admin before leaving
            const metadata = await sock.groupMetadata(group.id);
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const botParticipant = metadata.participants?.find(p => p.id === botJid);
            const admins = metadata.participants?.filter(p => p.admin === 'admin' || p.admin === 'superadmin') || [];
            
            if (botParticipant?.admin && admins.length === 1) {
                failedGroups.push({ name: group.subject, reason: 'Bot is the only admin' });
                failCount++;
                continue;
            }
            
            await sock.groupLeave(group.id);
            successCount++;
            
            // Update progress every 5 groups
            if ((i + 1) % 5 === 0 || i === announcementGroups.length - 1) {
                await sock.sendMessage(chatId, {
                    text: `🚪 Progress: ${successCount + failCount}/${totalAnnouncement} (✅ ${successCount} left, ❌ ${failCount} failed)`,
                    edit: processingMsg.key
                });
            }
            
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