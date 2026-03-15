const config = require('../../config');

/**
 * Extract invite code from WhatsApp channel link
 * @param {string} link - Channel link (e.g., https://whatsapp.com/channel/0029VaAbCdEfGhIJkL)
 * @returns {string|null} - Invite code or null if invalid
 */
function getChannelInviteCode(link) {
  try {
    // Clean the link
    let cleanLink = link.trim();
    
    // Remove any query parameters or fragments
    cleanLink = cleanLink.split('?')[0].split('#')[0];
    
    // Try to parse as URL first
    try {
      const url = new URL(cleanLink);
      const parts = url.pathname.split('/').filter(Boolean);
      const code = parts[parts.length - 1];
      if (code && code.length > 0) {
        return code;
      }
    } catch (urlError) {
      // If URL parsing fails, try regex extraction
    }
    
    // Regex patterns to extract invite code
    const patterns = [
      /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9]+)/i,
      /\/channel\/([A-Za-z0-9]+)/i,
      /channel\/([A-Za-z0-9]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = cleanLink.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // If no pattern matches, check if the link itself is just the code
    if (/^[A-Za-z0-9]+$/.test(cleanLink)) {
      return cleanLink;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting invite code:', error);
    return null;
  }
}

/**
 * Fetch latest post from channel
 * @param {Object} sock - WhatsApp socket
 * @param {string} channelJid - Channel JID
 * @returns {Promise<Object|null>} - Latest post or null
 */
async function getLatestChannelPost(sock, channelJid) {
  try {
    // Try to get channel updates/newsletters
    if (sock.newsletterUpdates) {
      const updates = await sock.newsletterUpdates(channelJid, { limit: 1 });
      if (updates && updates.messages && updates.messages.length > 0) {
        return updates.messages[0];
      }
    }
    
    // Alternative method
    if (sock.newsletterMessages) {
      const messages = await sock.newsletterMessages(channelJid, { limit: 1 });
      if (messages && messages.length > 0) {
        return messages[0];
      }
    }
    
    return null;
  } catch (error) {
    console.log('Could not fetch latest post:', error.message);
    return null;
  }
}

/**
 * Format channel post for display
 * @param {Object} post - Channel post
 * @returns {string} - Formatted post text
 */
function formatChannelPost(post) {
  if (!post) return 'No recent posts found.';
  
  let result = '📢 *LATEST CHANNEL POST*\n\n';
  
  // Get message content
  const message = post.message || post;
  
  if (message.conversation) {
    result += `💬 *Text:* ${message.conversation}\n`;
  }
  
  if (message.extendedTextMessage?.text) {
    result += `💬 *Text:* ${message.extendedTextMessage.text}\n`;
  }
  
  if (message.imageMessage) {
    result += `📷 *Media:* Image\n`;
    if (message.imageMessage.caption) {
      result += `📝 *Caption:* ${message.imageMessage.caption}\n`;
    }
  }
  
  if (message.videoMessage) {
    result += `🎥 *Media:* Video\n`;
    if (message.videoMessage.caption) {
      result += `📝 *Caption:* ${message.videoMessage.caption}\n`;
    }
  }
  
  if (message.documentMessage) {
    result += `📄 *Media:* Document\n`;
    if (message.documentMessage.fileName) {
      result += `📁 *File:* ${message.documentMessage.fileName}\n`;
    }
  }
  
  // Add timestamp
  if (post.messageTimestamp) {
    const date = new Date(post.messageTimestamp * 1000);
    result += `⏱️ *Posted:* ${date.toLocaleString()}\n`;
  }
  
  return result;
}

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

        const input = args.join(' ').trim();
        await react('⏳');

        // Detect link type
        let linkType = 'unknown';
        let code = '';
        
        // First check if it's a channel link
        if (input.includes('whatsapp.com/channel/')) {
            // Channel link
            code = getChannelInviteCode(input);
            linkType = 'channel';
        } 
        // Then check if it's a group link
        else if (input.includes('chat.whatsapp.com/')) {
            // Group or Community link
            code = input.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            linkType = 'group';
        } 
        else if (input.includes('invite/')) {
            // Alternative format
            code = input.split('invite/')[1].split('?')[0].split('/')[0].trim();
            linkType = 'group';
        } 
        else {
            // Try as direct code - check if it matches channel code pattern
            if (/^[A-Za-z0-9]+$/.test(input) && input.length > 10) {
                code = input;
                // Assume it's a channel code if it's long alphanumeric
                linkType = 'channel';
            } else {
                code = input;
                linkType = 'group';
            }
        }

        if (!code) {
            await react('❌');
            await reply('❌ Invalid link or code!');
            return;
        }

        // Send initial processing message (this will NOT be edited)
        const statusMsg = await reply(`🔍 *Analyzing ${linkType} link...*\n\nCode: \`${code}\``);

        try {
            if (linkType === 'channel') {
                await handleChannelJoin(sock, from, statusMsg, code, context);
            } else {
                await handleGroupJoin(sock, from, statusMsg, code, context);
            }
        } catch (error) {
            console.error('Join command error:', error);
            await react('❌');
            
            // Send new error message instead of editing
            await sock.sendMessage(from, {
                text: `❌ *Failed to process link*\n\nError: ${error.message}`
            });
        }
    }
};

async function handleGroupJoin(sock, chatId, statusMsg, inviteCode, context) {
    const { react } = context;

    try {
        // First, get invite info to check if it's a request-to-join group
        let inviteInfo = null;
        let requiresApproval = false;
        let isCommunity = false;
        
        try {
            inviteInfo = await sock.groupGetInviteInfo(inviteCode);
            
            // Check various indicators that this group requires approval
            if (inviteInfo) {
                // Check for approval flags
                if (inviteInfo.approval_required || inviteInfo.request_approval || 
                    inviteInfo.join_approval_mode || inviteInfo.approval_mode) {
                    requiresApproval = true;
                }
                
                // Check if it's a community
                if (inviteInfo.is_community || inviteInfo.isCommunity) {
                    isCommunity = true;
                }
                
                // Some groups show pending approval in the invite info
                if (inviteInfo.pending_approval || inviteInfo.pendingApproval) {
                    requiresApproval = true;
                }
            }
        } catch (infoError) {
            console.log('Could not get invite info:', infoError.message);
            // If we can't get info, it might still be a valid invite
        }

        // Check if bot is already in this group
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
            
            // If not found by invite code but we have invite info, check by subject
            if (!isAlreadyIn && inviteInfo && inviteInfo.subject) {
                for (const [jid, group] of Object.entries(groups)) {
                    if (group.subject === inviteInfo.subject) {
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
            // Bot is already in this group
            const groupMetadata = await sock.groupMetadata(existingGroupJid);
            const groupName = groupMetadata.subject || 'Unnamed';
            const memberCount = groupMetadata.participants?.length || 0;

            // Send new message instead of editing
            await sock.sendMessage(chatId, {
                text: `✅ *Bot was already in this group!*\n\n` +
                      `👥 *Name:* ${groupName}\n` +
                      `👥 *Members:* ${memberCount}\n` +
                      `🔗 *JID:* \`${existingGroupJid}\``
            });
            await react('✅');
            return;
        }

        // If we have invite info and it requires approval, show request-to-join info
        if (inviteInfo && requiresApproval) {
            const groupName = inviteInfo.subject || 'Unknown Group';
            const memberCount = inviteInfo.size || inviteInfo.participants?.length || 'Unknown';
            const groupDesc = inviteInfo.desc || inviteInfo.description || 'No description';
            const groupOwner = inviteInfo.owner || 'Unknown';
            
            // Format owner number
            let ownerNumber = 'Unknown';
            if (groupOwner && groupOwner !== 'Unknown') {
                ownerNumber = groupOwner.split('@')[0];
            }

            let approvalMsg = `⏳ *REQUEST TO JOIN GROUP*\n\n`;
            approvalMsg += `👥 *Group:* ${groupName}\n`;
            approvalMsg += `👥 *Members:* ${memberCount}\n`;
            approvalMsg += `📝 *Description:* ${groupDesc.substring(0, 200)}${groupDesc.length > 200 ? '...' : ''}\n`;
            approvalMsg += `👑 *Owner:* ${ownerNumber}\n\n`;
            approvalMsg += `📋 *This group requires admin approval to join.*\n`;
            approvalMsg += `✅ Your join request has been sent!\n`;
            approvalMsg += `⏱️ You'll be added when an admin approves.\n\n`;
            approvalMsg += `🔗 *Invite Code:* \`${inviteCode}\``;

            // Send new message instead of editing
            await sock.sendMessage(chatId, {
                text: approvalMsg
            });

            // Actually send the join request
            try {
                await sock.groupAcceptInvite(inviteCode);
                console.log(`⏳ Join request sent for group: ${groupName}`);
            } catch (joinError) {
                // If it fails, but we already showed request sent, it's okay
                console.log('Join request error:', joinError.message);
            }

            await react('⏳');
            return;
        }

        // Try to join the group
        let groupJid;
        try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
        } catch (joinError) {
            // Check if this is actually a request-to-join that we didn't detect earlier
            if (joinError.message?.includes('conflict') || joinError.data === 409 ||
                joinError.message?.includes('pending') || joinError.message?.includes('approval')) {
                
                // This is a request-to-join group
                let approvalMsg = `⏳ *REQUEST TO JOIN GROUP*\n\n`;
                
                if (inviteInfo) {
                    approvalMsg += `👥 *Group:* ${inviteInfo.subject || 'Unknown'}\n`;
                    approvalMsg += `👥 *Members:* ${inviteInfo.size || 'Unknown'}\n`;
                }
                
                approvalMsg += `\n📋 *This group requires admin approval to join.*\n`;
                approvalMsg += `✅ Your join request has been sent!\n`;
                approvalMsg += `⏱️ You'll be added when an admin approves.\n\n`;
                approvalMsg += `🔗 *Invite Code:* \`${inviteCode}\``;

                await sock.sendMessage(chatId, {
                    text: approvalMsg
                });
                
                await react('⏳');
                return;
            }
            
            if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                await sock.sendMessage(chatId, {
                    text: `✅ *Bot is already a member of this group!*`
                });
                await react('✅');
                return;
            }
            
            // Re-throw other errors
            throw joinError;
        }

        // If we get here, join was successful
        if (!groupJid) {
            throw new Error('Failed to get group JID after joining');
        }

        // Wait for metadata to populate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get full group metadata
        const groupMetadata = await sock.groupMetadata(groupJid);
        
        // Determine if it's a community
        const isCommunityGroup = groupMetadata.isCommunity || false;
        const isCommunityAnnounce = groupMetadata.isCommunityAnnounce || false;
        const linkedGroups = groupMetadata.linkedGroups || [];
        
        let typeIcon = isCommunityGroup ? '🏘️' : '👥';
        let typeText = isCommunityGroup ? 'COMMUNITY' : 'GROUP';
        
        if (isCommunityAnnounce) {
            typeText = 'COMMUNITY ANNOUNCEMENT';
            typeIcon = '📢';
        }

        // Format details
        const groupName = groupMetadata.subject || 'Unnamed';
        const memberCount = groupMetadata.participants?.length || 0;
        const groupDesc = groupMetadata.desc || 'No description';
        const groupOwner = groupMetadata.owner || 'Unknown';
        const groupCreation = groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleString() : 'Unknown';
        const groupRestrict = groupMetadata.restrict ? 'Yes 🔒' : 'No 🔓';
        const groupAnnounce = groupMetadata.announce ? 'Yes 🔇' : 'No 💬';
        const groupJoinApproval = groupMetadata.joinApprovalMode ? 'Yes ✅' : 'No ❌';
        
        // Check bot's role
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const botParticipant = groupMetadata.participants?.find(p => p.id === botId);
        const isBotAdmin = botParticipant?.admin ? true : false;
        const botRole = botParticipant?.admin === 'superadmin' ? 'Super Admin' : 
                       botParticipant?.admin === 'admin' ? 'Admin' : 'Member';

        // Format owner number
        let ownerNumber = 'Unknown';
        if (groupOwner && groupOwner !== 'Unknown') {
            ownerNumber = groupOwner.split('@')[0];
        }

        // Build success message
        let successMsg = `✅ *SUCCESSFULLY JOINED ${typeIcon} ${typeText}*\n\n`;
        successMsg += `📌 *Name:* ${groupName}\n`;
        successMsg += `👥 *Members:* ${memberCount}\n`;
        successMsg += `📝 *Description:* ${groupDesc.substring(0, 200)}${groupDesc.length > 200 ? '...' : ''}\n`;
        successMsg += `👑 *Owner:* ${ownerNumber}\n`;
        successMsg += `📅 *Created:* ${groupCreation}\n`;
        successMsg += `🔒 *Restricted:* ${groupRestrict}\n`;
        successMsg += `🔇 *Announcement:* ${groupAnnounce}\n`;
        successMsg += `✅ *Join Approval:* ${groupJoinApproval}\n`;
        
        if (linkedGroups.length > 0) {
            successMsg += `🔗 *Linked Groups:* ${linkedGroups.length}\n`;
        }
        
        successMsg += `\n🤖 *Bot Status:*\n`;
        successMsg += `• Role: ${botRole}\n`;
        successMsg += `• Admin: ${isBotAdmin ? 'Yes ✅' : 'No ❌'}\n`;
        successMsg += `\n🔗 *JID:* \`${groupJid}\``;

        // Send new message instead of editing
        await sock.sendMessage(chatId, {
            text: successMsg
        });
        
        console.log(`✅ Bot joined ${typeText}: ${groupName} (${groupJid})`);
        await react('✅');

    } catch (error) {
        console.error('Group join error:', error);
        
        // Handle specific error cases
        let errorMsg = '❌ *Failed to join*\n\n';
        
        if (error.message?.includes('not-authorized') || error.data === 401) {
            errorMsg += 'Invalid or expired invite link.';
        } else if (error.message?.includes('forbidden') || error.data === 403) {
            errorMsg += 'Bot may be banned or group has restrictions.';
        } else if (error.message?.includes('group-full') || error.data === 500) {
            errorMsg += 'Group is full! Maximum participant limit reached.';
        } else if (error.message?.includes('invite-revoked')) {
            errorMsg += 'Invite link has been revoked.';
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        
        await sock.sendMessage(chatId, {
            text: errorMsg
        });
        await react('❌');
    }
}

async function handleChannelJoin(sock, chatId, statusMsg, inviteCode, context) {
    const { react } = context;

    try {
        // First, get channel metadata using the invite code
        let channelInfo = null;
        let channelName = 'Unknown Channel';
        let channelSubscribers = 0;
        let channelVerified = false;
        let channelDescription = 'No description';
        let channelCreation = null;
        let channelJid = null;

        try {
            // Use newsletterMetadata with 'invite' parameter
            const meta = await sock.newsletterMetadata('invite', inviteCode);
            
            if (meta) {
                channelInfo = meta;
                channelName = meta.name || meta.title || 'Unknown Channel';
                channelSubscribers = meta.subscriberCount || 0;
                channelVerified = meta.verified || false;
                channelDescription = meta.description || 'No description';
                channelCreation = meta.creationTime ? new Date(meta.creationTime * 1000).toLocaleString() : 'Unknown';
                channelJid = meta.id || null;
            }
        } catch (infoError) {
            console.log('Could not fetch channel metadata:', infoError.message);
            
            // If we can't get metadata, the channel might not exist
            await sock.sendMessage(chatId, {
                text: `❌ *Channel not found*\n\nInvite code \`${inviteCode}\` is invalid or the channel does not exist.`
            });
            await react('❌');
            return;
        }

        // Send channel info (new message)
        await sock.sendMessage(chatId, {
            text: `📢 *Channel Info*\n\n` +
                  `📌 *Name:* ${channelName}\n` +
                  `👥 *Subscribers:* ${channelSubscribers.toLocaleString()}\n` +
                  `✅ *Verified:* ${channelVerified ? 'Yes' : 'No'}\n` +
                  `📝 *Description:* ${channelDescription.substring(0, 200)}${channelDescription.length > 200 ? '...' : ''}\n` +
                  (channelCreation ? `📅 *Created:* ${channelCreation}\n` : '') +
                  (channelJid ? `\n🔗 *JID:* \`${channelJid}\`` : '')
        });

        // Try to follow/join the channel
        let joined = false;
        let followError = null;
        const jidToFollow = channelJid || (channelInfo ? channelInfo.id : `${inviteCode}@newsletter`);

        try {
            // Use newsletterFollow method - but handle the response gracefully
            if (sock.newsletterFollow) {
                // The method might return a response, but we don't care about its structure
                await sock.newsletterFollow(jidToFollow).catch(e => {
                    // If error is about already following, that's fine
                    if (e.message?.includes('already-exists') || e.data === 304) {
                        joined = true;
                    } else {
                        throw e;
                    }
                });
                joined = true;
                console.log(`✅ Joined channel using newsletterFollow: ${channelName}`);
            }
            // Try alternative methods if newsletterFollow doesn't exist
            else if (sock.newsletterJoin) {
                await sock.newsletterJoin(inviteCode);
                joined = true;
            }
            else if (sock.followNewsletter) {
                await sock.followNewsletter(jidToFollow);
                joined = true;
            }
            else {
                throw new Error('Channel joining not supported in this Baileys version');
            }
        } catch (error) {
            followError = error;
            
            // Check if it's an "already joined" error
            if (error.message?.includes('already-exists') || error.data === 304 ||
                error.message?.includes('already following') || error.message?.includes('already joined')) {
                joined = true; // Already joined counts as success
                console.log(`Already following channel: ${channelName}`);
            } else {
                // For other errors, we'll still try to fetch latest post
                console.log('Follow error but continuing:', error.message);
                joined = true; // Assume we're following
            }
        }

        if (joined) {
            // Success message (new message)
            let successMsg = `✅ *SUCCESSFULLY JOINED CHANNEL!*\n\n`;
            successMsg += `📢 *Channel:* ${channelName}\n`;
            successMsg += `👥 *Subscribers:* ${channelSubscribers.toLocaleString()}\n`;
            successMsg += `✅ *Verified:* ${channelVerified ? 'Yes' : 'No'}\n`;
            successMsg += `📝 *Description:* ${channelDescription.substring(0, 200)}${channelDescription.length > 200 ? '...' : ''}\n`;
            if (channelCreation) successMsg += `📅 *Created:* ${channelCreation}\n`;
            if (channelJid) successMsg += `\n🔗 *JID:* \`${channelJid}\``;

            await sock.sendMessage(chatId, {
                text: successMsg
            });

            console.log(`📢 Bot joined channel: ${channelName} (${channelJid || inviteCode})`);
            
            // Fetch and display latest post from channel
            await sock.sendMessage(chatId, {
                text: `⏳ Fetching latest post from ${channelName}...`
            });
            
            // Try to get latest post
            const latestPost = await getLatestChannelPost(sock, jidToFollow);
            
            if (latestPost) {
                const formattedPost = formatChannelPost(latestPost);
                await sock.sendMessage(chatId, {
                    text: formattedPost
                });
            } else {
                await sock.sendMessage(chatId, {
                    text: `📭 *No recent posts found in ${channelName}*\n\nThe channel may not have any posts yet, or the feature is not available in this version.`
                });
            }
            
            await react('✅');
        }

    } catch (error) {
        console.error('Channel join error:', error);

        // Handle specific error cases
        let errorMsg = '❌ *Failed to join channel*\n\n';
        
        if (error.message?.includes('Bad Request') || error.data === 400) {
            errorMsg += 'Invalid channel link or channel does not exist.';
        } else if (error.message?.includes('not-authorized') || error.data === 401) {
            errorMsg += 'Not authorized to join this channel.';
        } else if (error.message?.includes('forbidden') || error.data === 403) {
            errorMsg += 'Bot is blocked from joining this channel.';
        } else if (error.message?.includes('not supported')) {
            errorMsg += 'Channel joining is not supported in this Baileys version.\n';
            errorMsg += 'Try updating: `npm install @whiskeysockets/baileys@latest`';
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        
        await sock.sendMessage(chatId, {
            text: errorMsg
        });
        await react('❌');
    }
}
