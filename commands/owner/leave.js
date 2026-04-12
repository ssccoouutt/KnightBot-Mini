/**
 * Leave Command - Leave a WhatsApp group
 * Supports: group link or group JID
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

module.exports = {
    name: 'leave',
    aliases: ['leavegroup', 'exit', 'quitgroup'],
    category: 'owner',
    description: 'Leave a WhatsApp group using link or JID',
    usage: '.leave <group_link_or_jid>\n.leave https://chat.whatsapp.com/ABC123\n.leave 123456789@g.us\n.leave here',
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
                       `*Note:*\n` +
                       `• Bot must be a member of the group to leave\n` +
                       `• If the bot is the only admin, you will be warned\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('🚪');
        
        let targetGroup = null;
        let groupName = null;
        
        // Check if user wants to leave current group
        if (args[0].toLowerCase() === 'here') {
            if (!from.endsWith('@g.us')) {
                return reply(`❌ *Not a group chat!*\n\nThis command can only be used in a group when using \`here\`.\n\nUse: \`.leave https://chat.whatsapp.com/...\` or \`.leave 123456789@g.us\``);
            }
            targetGroup = from;
            
            // Get group name
            try {
                const metadata = await sock.groupMetadata(targetGroup);
                groupName = metadata.subject;
            } catch (e) {}
            
            // Direct confirmation for current group
            const confirmMsg = `🔍 *Group Information*\n\n` +
                             `📌 *Name:* ${groupName || 'Unknown'}\n` +
                             `🆔 *JID:* ${targetGroup}\n\n` +
                             `⚠️ Are you sure you want to leave this group?\n\n` +
                             `Reply with *yes* to confirm, or *no* to cancel.`;
            
            const sentMsg = await reply(confirmMsg);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'leave_confirm');
            
            sessionManager.createSession(sender, from, 'leave_confirm', {
                targetGroup: targetGroup,
                groupName: groupName || 'Unknown',
                step: 'waiting_confirmation'
            });
            return;
        }
        
        // Check if it's a group link
        if (args[0].includes('chat.whatsapp.com/')) {
            const inviteCode = args[0].split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            
            if (!inviteCode || inviteCode.length < 20) {
                return reply(`❌ *Invalid group link!*\n\nPlease provide a valid WhatsApp group invite link.`);
            }
            
            try {
                const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                targetGroup = inviteInfo.id;
                groupName = inviteInfo.subject || 'Unknown';
                
                const confirmMsg = `🔍 *Group Information*\n\n` +
                                 `📌 *Name:* ${groupName}\n` +
                                 `👥 *Members:* ${inviteInfo.size || 0}\n` +
                                 `👑 *Creator:* ${inviteInfo.creator?.split('@')[0] || 'Unknown'}\n` +
                                 `🔗 *Invite Code:* ${inviteCode}\n\n` +
                                 `⚠️ Are you sure you want to leave this group?\n\n` +
                                 `Reply with *yes* to confirm, or *no* to cancel.`;
                
                const sentMsg = await reply(confirmMsg);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'leave_confirm');
                
                sessionManager.createSession(sender, from, 'leave_confirm', {
                    targetGroup: targetGroup,
                    groupName: groupName,
                    step: 'waiting_confirmation'
                });
                return;
                
            } catch (error) {
                return reply(`❌ *Failed to get group information!*\n\nError: ${error.message}`);
            }
        }
        
        // Check if it's a JID
        if (args[0].endsWith('@g.us')) {
            targetGroup = args[0];
            
            try {
                const metadata = await sock.groupMetadata(targetGroup);
                groupName = metadata.subject || 'Unknown';
                
                const confirmMsg = `🔍 *Group Information*\n\n` +
                                 `📌 *Name:* ${groupName}\n` +
                                 `👥 *Members:* ${metadata.participants?.length || 0}\n` +
                                 `👑 *Creator:* ${metadata.owner?.split('@')[0] || 'Unknown'}\n` +
                                 `🆔 *JID:* ${targetGroup}\n\n` +
                                 `⚠️ Are you sure you want to leave this group?\n\n` +
                                 `Reply with *yes* to confirm, or *no* to cancel.`;
                
                const sentMsg = await reply(confirmMsg);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'leave_confirm');
                
                sessionManager.createSession(sender, from, 'leave_confirm', {
                    targetGroup: targetGroup,
                    groupName: groupName,
                    step: 'waiting_confirmation'
                });
                return;
                
            } catch (error) {
                return reply(`❌ *Failed to get group information!*\n\nError: ${error.message}\n\nMake sure the bot is a member of this group.`);
            }
        }
        
        return reply(`❌ *Invalid input!*\n\nPlease provide:\n• A WhatsApp group link\n• A group JID\n• Or use \`here\` to leave the current group\n\nUse \`.leave --help\` for more info.`);
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
        // Get bot's JID
        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // Check if bot is a member
        let metadata;
        try {
            metadata = await sock.groupMetadata(targetGroup);
            const isBotInGroup = metadata.participants?.some(p => p.id === botJid);
            
            if (!isBotInGroup) {
                await reply(`❌ *Cannot leave group!*\n\nBot is not a member of this group.\n\nGroup: ${groupName || targetGroup}`);
                await react('❌');
                return;
            }
            
            // Check if bot is the only admin
            const botParticipant = metadata.participants?.find(p => p.id === botJid);
            const admins = metadata.participants?.filter(p => p.admin === 'admin' || p.admin === 'superadmin') || [];
            
            if (botParticipant?.admin && admins.length === 1) {
                await reply(`⚠️ *WARNING: Bot is the only admin!*\n\n` +
                          `If the bot leaves this group, there will be no admins left.\n\n` +
                          `Group: ${groupName || targetGroup}\n` +
                          `Admins: ${admins.length}\n\n` +
                          `Use \`.forceleave ${targetGroup}\` if you still want to leave.`);
                await react('⚠️');
                return;
            }
            
        } catch (error) {
            await reply(`❌ *Cannot leave group!*\n\nError: ${error.message}`);
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
        console.error('[LEAVE] Error:', error);
        
        let errorMsg = `❌ *Failed to leave group!*\n\n`;
        
        if (error.message?.includes('not-authorized')) {
            errorMsg += `Bot is not authorized to leave this group.`;
        } else if (error.message?.includes('group')) {
            errorMsg += `Invalid group or bot is not a member.`;
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        
        await reply(errorMsg);
        await react('❌');
    }
}