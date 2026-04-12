/**
 * Leave Command - Leave a WhatsApp group
 * Supports: group link or group JID
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

const FORCE_AI_MODE = true;

module.exports = {
    name: 'leave',
    aliases: ['leavegroup', 'exit', 'quitgroup'],
    category: 'owner',
    description: 'Leave a WhatsApp group using link or JID',
    usage: '.leave <group_link_or_jid>\n.leave https://chat.whatsapp.com/ABC123\n.leave 123456789@g.us\n.leave --help',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Show help
        if (args.length === 0 || args[0] === '--help') {
            return reply(`🚪 *LEAVE GROUP COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `• Using group link:\n   \`.leave https://chat.whatsapp.com/ABC123\`\n\n` +
                       `• Using group JID:\n   \`.leave 123456789@g.us\`\n\n` +
                       `• Leave current group:\n   \`.leave here\` (use in the group you want to leave)\n\n` +
                       `*Options:*\n` +
                       `• \`.leave --help\` - Show this help\n` +
                       `• \`.leave --list\` - List groups bot is in\n\n` +
                       `*Note:*\n` +
                       `• Bot must be a member of the group to leave\n` +
                       `• If the bot is the only admin, it cannot leave\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('🚪');
        
        let targetGroup = null;
        let isCurrentGroup = false;
        
        // Check if user wants to leave current group
        if (args[0].toLowerCase() === 'here') {
            if (!from.endsWith('@g.us')) {
                return reply(`❌ *Not a group chat!*\n\nThis command can only be used in a group when using \`here\`.\n\nUse: \`.leave https://chat.whatsapp.com/...\` or \`.leave 123456789@g.us\``);
            }
            targetGroup = from;
            isCurrentGroup = true;
        }
        // Check if it's a group link
        else if (args[0].includes('chat.whatsapp.com/')) {
            const inviteCode = args[0].split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            
            if (!inviteCode || inviteCode.length < 20) {
                return reply(`❌ *Invalid group link!*\n\nPlease provide a valid WhatsApp group invite link.`);
            }
            
            // Get group info from invite code
            try {
                const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                targetGroup = inviteInfo.id;
                
                // Show group info before leaving
                const confirmMsg = `🔍 *Group Information*\n\n` +
                                 `📌 *Name:* ${inviteInfo.subject || 'Unknown'}\n` +
                                 `👥 *Members:* ${inviteInfo.size || 0}\n` +
                                 `👑 *Creator:* ${inviteInfo.creator?.split('@')[0] || 'Unknown'}\n` +
                                 `🔗 *Invite Code:* ${inviteCode}\n\n` +
                                 `⚠️ Are you sure you want to leave this group?\n\n` +
                                 `Reply with *yes* to confirm, or *no* to cancel.`;
                
                const sentMsg = await reply(confirmMsg);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'leave_confirm');
                
                // Store confirmation data
                sessionManager.createSession(sender, from, 'leave_confirm', {
                    targetGroup: targetGroup,
                    groupName: inviteInfo.subject || 'Unknown',
                    inviteCode: inviteCode,
                    step: 'waiting_confirmation'
                });
                
                return;
                
            } catch (error) {
                console.error('[LEAVE] Error getting invite info:', error);
                return reply(`❌ *Failed to get group information!*\n\nError: ${error.message}\n\nMake sure the invite link is valid and the bot can access it.`);
            }
        }
        // Check if it's a JID
        else if (args[0].endsWith('@g.us')) {
            targetGroup = args[0];
            
            // Try to get group info
            try {
                const metadata = await sock.groupMetadata(targetGroup);
                const confirmMsg = `🔍 *Group Information*\n\n` +
                                 `📌 *Name:* ${metadata.subject || 'Unknown'}\n` +
                                 `👥 *Members:* ${metadata.participants?.length || 0}\n` +
                                 `👑 *Creator:* ${metadata.owner?.split('@')[0] || 'Unknown'}\n` +
                                 `🔒 *Restrict:* ${metadata.restrict ? 'Yes' : 'No'}\n` +
                                 `🔇 *Announce:* ${metadata.announce ? 'Yes' : 'No'}\n` +
                                 `🆔 *JID:* ${targetGroup}\n\n` +
                                 `⚠️ Are you sure you want to leave this group?\n\n` +
                                 `Reply with *yes* to confirm, or *no* to cancel.`;
                
                const sentMsg = await reply(confirmMsg);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'leave_confirm');
                
                // Store confirmation data
                sessionManager.createSession(sender, from, 'leave_confirm', {
                    targetGroup: targetGroup,
                    groupName: metadata.subject || 'Unknown',
                    step: 'waiting_confirmation'
                });
                
                return;
                
            } catch (error) {
                console.error('[LEAVE] Error getting group metadata:', error);
                return reply(`❌ *Failed to get group information!*\n\nError: ${error.message}\n\nMake sure the bot is a member of this group.`);
            }
        }
        else {
            return reply(`❌ *Invalid input!*\n\nPlease provide:\n• A WhatsApp group link: \`https://chat.whatsapp.com/...\`\n• A group JID: \`123456789@g.us\`\n• Or use \`here\` to leave the current group\n\nUse \`.leave --help\` for more info.`);
        }
        
        // If no confirmation needed (direct leave without confirmation)
        if (!isCurrentGroup && targetGroup) {
            await performLeave(sock, from, reply, react, targetGroup, null);
        }
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react } = context;
        
        if (session.command !== 'leave_confirm') return true;
        
        // Handle text input for confirmation
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation.trim().toLowerCase();
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.trim().toLowerCase();
        }
        
        if (!text) return true;
        
        if (text === 'yes' || text === 'y') {
            await performLeave(sock, from, reply, react, session.data.targetGroup, session.data.groupName);
            sessionManager.clearSession(session.id);
            return true;
        } else if (text === 'no' || text === 'n' || text === 'cancel') {
            await reply(`❌ *Leave operation cancelled.*`);
            sessionManager.clearSession(session.id);
            return true;
        } else {
            await reply(`❌ *Invalid response!*\n\nPlease reply with *yes* to confirm or *no* to cancel.`);
            return true;
        }
    }
};

async function performLeave(sock, chatId, reply, react, targetGroup, groupName) {
    try {
        // Check if bot is a member of the group
        let metadata;
        try {
            metadata = await sock.groupMetadata(targetGroup);
            
            // Check if bot is in the group
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isBotInGroup = metadata.participants?.some(p => p.id === botJid);
            
            if (!isBotInGroup) {
                await reply(`❌ *Cannot leave group!*\n\nBot is not a member of this group.\n\nGroup: ${groupName || targetGroup}`);
                await react('❌');
                return;
            }
            
            // Check if bot is the only admin (cannot leave if it's the only admin)
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const botParticipant = metadata.participants?.find(p => p.id === botJid);
            const admins = metadata.participants?.filter(p => p.admin === 'admin' || p.admin === 'superadmin') || [];
            
            if (botParticipant?.admin && admins.length === 1) {
                const confirmMsg = `⚠️ *WARNING: Bot is the only admin!*\n\n` +
                                 `If the bot leaves this group, there will be no admins left.\n\n` +
                                 `Group: ${groupName || targetGroup}\n` +
                                 `Admins: ${admins.length}\n\n` +
                                 `Are you ABSOLUTELY sure you want to leave?\n\n` +
                                 `Reply with *confirm* to proceed, or *cancel* to abort.`;
                
                const sentMsg = await reply(confirmMsg);
                sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'leave_force_confirm');
                
                // Create a temporary session for force confirmation
                sessionManager.createSession(sender, chatId, 'leave_force_confirm', {
                    targetGroup: targetGroup,
                    groupName: groupName || metadata.subject,
                    step: 'waiting_force_confirmation'
                });
                return;
            }
            
        } catch (error) {
            console.error('[LEAVE] Error checking group:', error);
            await reply(`❌ *Cannot leave group!*\n\nError: ${error.message}\n\nMake sure the bot is a member of this group.`);
            await react('❌');
            return;
        }
        
        // Leave the group
        await react('🚪');
        const processingMsg = await reply(`🚪 *Leaving group...*\n\n${groupName || targetGroup}\n\nPlease wait...`);
        
        await sock.groupLeave(targetGroup);
        
        await sock.sendMessage(chatId, {
            text: `✅ *Successfully left group!*\n\n📌 *Group:* ${groupName || targetGroup}\n🆔 *JID:* ${targetGroup}\n\n> *Powered by ${config.botName}*`,
            edit: processingMsg.key
        });
        
        await react('✅');
        
    } catch (error) {
        console.error('[LEAVE] Error leaving group:', error);
        
        let errorMsg = `❌ *Failed to leave group!*\n\n`;
        
        if (error.message?.includes('not-authorized')) {
            errorMsg += `Bot is not authorized to leave this group.\nMake sure the bot is a member.`;
        } else if (error.message?.includes('group')) {
            errorMsg += `Invalid group or bot is not a member.`;
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        
        await reply(errorMsg);
        await react('❌');
    }
}