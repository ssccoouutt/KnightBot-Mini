const config = require('../../config');

module.exports = {
    name: 'join',
    aliases: ['joinlink', 'joinchat', 'joingroup', 'joinchannel'],
    description: 'Join groups, channels, or communities via link',
    usage: 'join <link>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await reply(`❌ Please provide a link!\n\nUsage: \`${config.prefix}join [link]\`\n\n*Supported links:*\n• Group invite: \`https://chat.whatsapp.com/...\`\n• Channel link: \`https://whatsapp.com/channel/...\`\n• Community link: \`https://chat.whatsapp.com/...\` (Community invite)`);
            return;
        }

        const input = args[0].trim();
        await react('⏳');

        // Detect link type
        let linkType = 'unknown';
        let code = '';
        let fullLink = input;

        // Extract code from different link formats
        if (input.includes('chat.whatsapp.com/')) {
            // Group or Community link
            code = input.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            
            // Check if it might be a community (communities use same domain but have different behavior)
            linkType = 'group_or_community';
        } else if (input.includes('whatsapp.com/channel/')) {
            // Channel link
            code = input.split('whatsapp.com/channel/')[1].split('?')[0].split('/')[0].trim();
            linkType = 'channel';
        } else if (input.includes('invite/')) {
            // Alternative format
            code = input.split('invite/')[1].split('?')[0].split('/')[0].trim();
            linkType = 'group_or_community';
        } else {
            // Try as direct code
            code = input;
            linkType = 'group_or_community';
        }

        if (!code) {
            await react('❌');
            await reply('❌ Invalid link or code!');
            return;
        }

        // Send processing message
        const statusMsg = await reply(`🔍 *Analyzing link...*\n\nLink: \`${fullLink.substring(0, 50)}${fullLink.length > 50 ? '...' : ''}\``);

        try {
            // First, try to get invite info (works for both groups and communities)
            let inviteInfo = null;
            try {
                inviteInfo = await sock.groupGetInviteInfo(code);
            } catch (infoError) {
                console.log('Could not get invite info:', infoError.message);
                // Continue anyway
            }

            // Check if it's a channel
            if (linkType === 'channel') {
                await handleChannelJoin(sock, from, statusMsg, code, context);
                return;
            }

            // Handle group/community join
            await handleGroupOrCommunityJoin(sock, from, statusMsg, code, inviteInfo, context);

        } catch (error) {
            console.error('Join command error:', error);
            await react('❌');
            
            // Try to edit the status message
            try {
                await sock.sendMessage(from, {
                    text: `❌ *Failed to process link*\n\nError: ${error.message}`,
                    edit: statusMsg.key
                });
            } catch {
                await reply(`❌ Failed to process link: ${error.message}`);
            }
        }
    }
};

async function handleGroupOrCommunityJoin(sock, chatId, statusMsg, inviteCode, inviteInfo, context) {
    const { react } = context;

    try {
        // Check if bot is already in this group/community
        let isAlreadyIn = false;
        let existingGroupJid = null;
        
        try {
            const groups = await sock.groupFetchAllParticipating();
            
            // Check by invite code
            for (const [jid, group] of Object.entries(groups)) {
                if (group.inviteCode === inviteCode) {
                    isAlreadyIn = true;
                    existingGroupJid = jid;
                    break;
                }
            }
            
            // If not found by invite code but we have invite info, check by subject and size
            if (!isAlreadyIn && inviteInfo) {
                for (const [jid, group] of Object.entries(groups)) {
                    if (group.subject === inviteInfo.subject && 
                        group.participants?.length === inviteInfo.size) {
                        isAlreadyIn = true;
                        existingGroupJid = jid;
                        break;
                    }
                }
            }
        } catch (e) {
            console.log('Error checking existing groups:', e);
        }

        if (isAlreadyIn && existingGroupJid) {
            // Bot is already in this group/community
            const groupMetadata = await sock.groupMetadata(existingGroupJid);
            const groupName = groupMetadata.subject || 'Unnamed';
            const memberCount = groupMetadata.participants?.length || 0;
            const isCommunity = groupMetadata.isCommunity || false;
            const isCommunityAnnounce = groupMetadata.isCommunityAnnounce || false;

            let typeIcon = isCommunity ? '🏘️' : '👥';
            let typeText = isCommunity ? 'COMMUNITY' : 'GROUP';

            await sock.sendMessage(chatId, {
                text: `✅ *Bot was already in this ${typeText}!*\n\n` +
                      `${typeIcon} *Name:* ${groupName}\n` +
                      `👥 *Members:* ${memberCount}\n` +
                      `🔗 *JID:* \`${existingGroupJid}\`\n` +
                      `📊 *Status:* Already joined`,
                edit: statusMsg.key
            });
            await react('✅');
            return;
        }

        // Try to join - this will give us the JID on success
        let groupJid;
        let joinError = null;
        let requiresApproval = false;

        try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
        } catch (error) {
            joinError = error;

            // Check for specific error types
            if (error.message?.includes('already-exists') || error.data === 304) {
                // Bot already in group - we should have caught this above but just in case
                await sock.sendMessage(chatId, {
                    text: `✅ *Bot is already a member of this group!*`,
                    edit: statusMsg.key
                });
                await react('✅');
                return;
            }

            if (error.message?.includes('conflict') || error.data === 409 || 
                error.message?.includes('pending') || error.message?.includes('approval')) {
                requiresApproval = true;
            } else {
                // Other error - rethrow
                throw error;
            }
        }

        // If join succeeded, groupJid will be set
        if (groupJid) {
            // Successfully joined
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for metadata to populate
            
            // Get full group metadata
            const groupMetadata = await sock.groupMetadata(groupJid);
            
            // Determine if it's a community or regular group
            const isCommunity = groupMetadata.isCommunity || false;
            const isCommunityAnnounce = groupMetadata.isCommunityAnnounce || false;
            const linkedGroups = groupMetadata.linkedGroups || [];
            
            let typeIcon = isCommunity ? '🏘️' : '👥';
            let typeText = isCommunity ? 'COMMUNITY' : 'GROUP';
            let typeBadge = isCommunity ? '🏘️ COMMUNITY' : '👥 GROUP';
            
            if (isCommunityAnnounce) {
                typeBadge = '📢 COMMUNITY ANNOUNCEMENT';
                typeIcon = '📢';
            }

            // Format creation date
            const groupName = groupMetadata.subject || 'Unnamed';
            const memberCount = groupMetadata.participants?.length || 0;
            const groupDesc = groupMetadata.desc || 'No description';
            const groupOwner = groupMetadata.owner || 'Unknown';
            const groupCreation = groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleString() : 'Unknown';
            const groupRestrict = groupMetadata.restrict ? 'Yes 🔒' : 'No 🔓';
            const groupAnnounce = groupMetadata.announce ? 'Yes 🔇' : 'No 💬';
            const groupJoinApproval = groupMetadata.joinApprovalMode ? 'Yes ✅' : 'No ❌';
            
            // Check if bot is admin
            const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const botParticipant = groupMetadata.participants?.find(p => p.id === botId);
            const isBotAdmin = botParticipant?.admin ? true : false;
            const botRole = botParticipant?.admin === 'superadmin' ? 'Super Admin' : 
                           botParticipant?.admin === 'admin' ? 'Admin' : 'Member';

            // Get linked communities/groups if any
            let linkedInfo = '';
            if (isCommunity && linkedGroups.length > 0) {
                linkedInfo = `\n🔗 *Linked Groups:* ${linkedGroups.length}`;
            }

            // Build success message
            let successMsg = `✅ *SUCCESSFULLY JOINED ${typeBadge}*\n\n`;
            successMsg += `${typeIcon} *Name:* ${groupName}\n`;
            successMsg += `👥 *Members:* ${memberCount}\n`;
            successMsg += `📝 *Description:* ${groupDesc.substring(0, 200)}${groupDesc.length > 200 ? '...' : ''}\n`;
            successMsg += `👑 *Owner:* ${groupOwner.split('@')[0]}\n`;
            successMsg += `📅 *Created:* ${groupCreation}\n`;
            successMsg += `🔒 *Restricted Mode:* ${groupRestrict}\n`;
            successMsg += `🔇 *Announcement Mode:* ${groupAnnounce}\n`;
            successMsg += `✅ *Join Approval:* ${groupJoinApproval}\n`;
            successMsg += linkedInfo;
            successMsg += `\n\n🤖 *Bot Status:*\n`;
            successMsg += `• Role: ${botRole}\n`;
            successMsg += `• Admin: ${isBotAdmin ? 'Yes ✅' : 'No ❌'}\n`;
            successMsg += `\n🔗 *JID:* \`${groupJid}\``;

            await sock.sendMessage(chatId, {
                text: successMsg,
                edit: statusMsg.key
            });
            
            console.log(`✅ Bot joined ${typeText}: ${groupName} (${groupJid})`);
            await react('✅');
            return;
        }

        // Handle approval required case
        if (requiresApproval) {
            let approvalMsg = `⏳ *REQUEST TO JOIN GROUP*\n\n`;
            
            if (inviteInfo) {
                const groupName = inviteInfo.subject || 'Unknown Group';
                const memberCount = inviteInfo.size || 'Unknown';
                const groupDesc = inviteInfo.desc || 'No description available';
                const isCommunity = inviteInfo.isCommunity || false;
                
                let typeIcon = isCommunity ? '🏘️' : '👥';
                let typeText = isCommunity ? 'Community' : 'Group';
                
                approvalMsg += `${typeIcon} *${typeText}:* ${groupName}\n`;
                approvalMsg += `👥 *Members:* ${memberCount}\n`;
                approvalMsg += `📝 *Description:* ${groupDesc.substring(0, 200)}${groupDesc.length > 200 ? '...' : ''}\n`;
                approvalMsg += `\n📋 *This ${typeText.toLowerCase()} requires approval to join.*\n`;
                approvalMsg += `✅ Your request has been sent!\n`;
                approvalMsg += `⏱️ You'll be added when an admin approves.\n\n`;
                
                if (inviteInfo.requestApproval) {
                    approvalMsg += `*Request Approval Required:* Yes ✅\n`;
                }
                
                if (inviteInfo.approvalRequired) {
                    approvalMsg += `*Admin Approval Required:* Yes ✅\n`;
                }
            } else {
                approvalMsg += `📋 *This group requires approval to join.*\n`;
                approvalMsg += `✅ Your request has been sent!\n`;
                approvalMsg += `⏱️ You'll be added when an admin approves.\n`;
            }
            
            approvalMsg += `\n🔗 *Invite Code:* \`${inviteCode}\``;
            
            await sock.sendMessage(chatId, {
                text: approvalMsg,
                edit: statusMsg.key
            });
            
            console.log(`⏳ Join request sent for group with code: ${inviteCode}`);
            await react('⏳');
            return;
        }

    } catch (error) {
        console.error('Group/Community join error:', error);
        
        // Handle specific error cases
        if (error.message?.includes('not-authorized') || error.data === 401) {
            await sock.sendMessage(chatId, {
                text: `❌ *Invalid or expired invite link.*\n\nThe invite link may be invalid or the group might not exist.`,
                edit: statusMsg.key
            });
        } else if (error.message?.includes('forbidden') || error.data === 403) {
            await sock.sendMessage(chatId, {
                text: `❌ *Cannot join this group.*\n\nBot may be banned or the group has restrictions.`,
                edit: statusMsg.key
            });
        } else if (error.message?.includes('group-full') || error.data === 500) {
            await sock.sendMessage(chatId, {
                text: `❌ *Group is full!*\n\nMaximum participant limit reached.`,
                edit: statusMsg.key
            });
        } else if (error.message?.includes('invite-revoked')) {
            await sock.sendMessage(chatId, {
                text: `❌ *Invite link has been revoked.*`,
                edit: statusMsg.key
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to join*\n\nError: ${error.message}`,
                edit: statusMsg.key
            });
        }
        await react('❌');
    }
}

async function handleChannelJoin(sock, chatId, statusMsg, channelId, context) {
    const { react } = context;

    try {
        // Format channel JID
        const channelJid = channelId.includes('@newsletter') ? channelId : `${channelId}@newsletter`;
        
        // Try to get channel info first (if supported)
        let channelInfo = null;
        let channelName = 'Unknown Channel';
        let channelSubscribers = 'Unknown';
        let channelVerified = false;
        let channelDescription = 'No description';
        let channelCreation = 'Unknown';

        try {
            // Try different methods to get channel info
            if (sock.newsletterMetadata) {
                const metadata = await sock.newsletterMetadata('me', [channelJid]);
                if (metadata && metadata[channelJid]) {
                    channelInfo = metadata[channelJid];
                    channelName = channelInfo.name || channelInfo.title || 'Unknown Channel';
                    channelSubscribers = channelInfo.subscriber_count || channelInfo.followers || 'Unknown';
                    channelVerified = channelInfo.verified || false;
                    channelDescription = channelInfo.description || channelInfo.desc || 'No description';
                    channelCreation = channelInfo.creation_time ? new Date(channelInfo.creation_time * 1000).toLocaleString() : 'Unknown';
                }
            }
        } catch (infoError) {
            console.log('Could not fetch channel metadata:', infoError);
            // Continue anyway
        }

        // Check if already following
        let alreadyFollowing = false;
        try {
            // Try to check if already following (if method exists)
            if (sock.newsletterFollowing) {
                const following = await sock.newsletterFollowing();
                if (following && following.includes(channelJid)) {
                    alreadyFollowing = true;
                }
            }
        } catch (checkError) {
            console.log('Could not check following status:', checkError);
        }

        if (alreadyFollowing) {
            await sock.sendMessage(chatId, {
                text: `✅ *Already following this channel!*\n\n` +
                      `📢 *Channel:* ${channelName}\n` +
                      `👥 *Subscribers:* ${channelSubscribers}\n` +
                      `✅ *Verified:* ${channelVerified ? 'Yes' : 'No'}\n` +
                      `📝 *Description:* ${channelDescription.substring(0, 200)}${channelDescription.length > 200 ? '...' : ''}\n` +
                      `🔗 *JID:* \`${channelJid}\``,
                edit: statusMsg.key
            });
            await react('✅');
            return;
        }

        // Try to follow the channel
        let followed = false;
        let followError = null;

        // Try different possible method names
        const followMethods = [
            'newsletterFollow',
            'followNewsletter', 
            'joinNewsletter',
            'subscribeNewsletter'
        ];

        for (const method of followMethods) {
            if (sock[method] && typeof sock[method] === 'function') {
                try {
                    await sock[method](channelJid);
                    followed = true;
                    console.log(`✅ Followed channel using method: ${method}`);
                    break;
                } catch (err) {
                    followError = err;
                    // If it's "already following" error, we're good
                    if (err.message?.includes('already-exists') || err.data === 304) {
                        followed = true;
                        break;
                    }
                    // Otherwise try next method
                }
            }
        }

        if (!followed) {
            // No method succeeded
            if (followError) {
                throw followError;
            } else {
                throw new Error('Channel joining not supported in this Baileys version');
            }
        }

        // Successfully followed
        let successMsg = `✅ *SUCCESSFULLY JOINED CHANNEL!*\n\n`;
        successMsg += `📢 *Channel:* ${channelName}\n`;
        successMsg += `👥 *Subscribers:* ${channelSubscribers}\n`;
        successMsg += `✅ *Verified:* ${channelVerified ? 'Yes' : 'No'}\n`;
        successMsg += `📝 *Description:* ${channelDescription.substring(0, 200)}${channelDescription.length > 200 ? '...' : ''}\n`;
        successMsg += `📅 *Created:* ${channelCreation}\n`;
        successMsg += `\n🔗 *JID:* \`${channelJid}\``;

        await sock.sendMessage(chatId, {
            text: successMsg,
            edit: statusMsg.key
        });

        console.log(`📢 Bot joined channel: ${channelName} (${channelJid})`);
        await react('✅');

    } catch (error) {
        console.error('Channel join error:', error);

        // Handle specific error cases
        if (error.message?.includes('Bad Request') || error.data === 400) {
            await sock.sendMessage(chatId, {
                text: `❌ *Invalid channel link*\n\nChannel does not exist or link is incorrect.`,
                edit: statusMsg.key
            });
        } else if (error.message?.includes('not-authorized')) {
            await sock.sendMessage(chatId, {
                text: `❌ *Cannot join channel*\n\nBot may be blocked or channel is private.`,
                edit: statusMsg.key
            });
        } else if (error.message?.includes('already-exists') || error.data === 304) {
            await sock.sendMessage(chatId, {
                text: `✅ *Already following this channel!*`,
                edit: statusMsg.key
            });
        } else if (error.message?.includes('not supported')) {
            await sock.sendMessage(chatId, {
                text: `❌ *Channel joining not supported*\n\nYour Baileys version may need an update.`,
                edit: statusMsg.key
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to join channel*\n\nError: ${error.message}`,
                edit: statusMsg.key
            });
        }
        await react('❌');
    }
}
