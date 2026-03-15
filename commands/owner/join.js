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

        // Send initial processing message
        await reply(`🔍 *Analyzing ${linkType} link...*\n\nCode: \`${code}\``);

        try {
            if (linkType === 'channel') {
                await handleChannelJoin(sock, from, code, context);
            } else {
                await handleGroupJoin(sock, from, code, context);
            }
        } catch (error) {
            console.error('Join command error:', error);
            await react('❌');
            
            // Send error message
            await sock.sendMessage(from, {
                text: `❌ *Failed to process link*\n\nError: ${error.message}`
            });
        }
    }
};

async function handleGroupJoin(sock, chatId, inviteCode, context) {
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

            // Send new message
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

            // Send new message
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

        // Send new message
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

async function handleChannelJoin(sock, chatId, inviteCode, context) {
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
            console.log('\n🔍🔍🔍 DEBUG: Fetching channel metadata for code:', inviteCode);
            const meta = await sock.newsletterMetadata('invite', inviteCode);
            
            console.log('\n🔥🔥🔥 FULL META OBJECT:');
            console.log(JSON.stringify(meta, null, 2));
            
            if (meta) {
                channelInfo = meta;
                
                // ===== EXTREME DEBUGGING FOR NAME =====
                console.log('\n🔍🔍🔍 CHECKING NAME PATHS:');
                console.log('- meta.name:', meta.name);
                console.log('- meta.name?.text:', meta.name?.text);
                console.log('- meta.title:', meta.title);
                console.log('- meta.thread_metadata?.name:', meta.thread_metadata?.name);
                console.log('- meta.thread_metadata?.name?.text:', meta.thread_metadata?.name?.text);
                console.log('- meta.subject:', meta.subject);
                console.log('- meta.thread_metadata?.subject:', meta.thread_metadata?.subject);
                
                // ===== EXTREME DEBUGGING FOR SUBSCRIBERS =====
                console.log('\n🔍🔍🔍 CHECKING SUBSCRIBERS PATHS:');
                console.log('- meta.subscribers_count:', meta.subscribers_count);
                console.log('- meta.subscriberCount:', meta.subscriberCount);
                console.log('- meta.thread_metadata?.subscribers_count:', meta.thread_metadata?.subscribers_count);
                console.log('- meta.stats?.subscribers:', meta.stats?.subscribers);
                console.log('- meta.metadata?.subscribers:', meta.metadata?.subscribers);
                console.log('- meta.viewer_metadata?.subscribers:', meta.viewer_metadata?.subscribers);
                
                // ===== EXTREME DEBUGGING FOR DESCRIPTION =====
                console.log('\n🔍🔍🔍 CHECKING DESCRIPTION PATHS:');
                console.log('- meta.description:', meta.description);
                console.log('- meta.description?.text:', meta.description?.text);
                console.log('- meta.thread_metadata?.description:', meta.thread_metadata?.description);
                console.log('- meta.thread_metadata?.description?.text:', meta.thread_metadata?.description?.text);
                console.log('- meta.about:', meta.about);
                console.log('- meta.desc:', meta.desc);
                
                // ===== EXTREME DEBUGGING FOR CREATION TIME =====
                console.log('\n🔍🔍🔍 CHECKING CREATION TIME PATHS:');
                console.log('- meta.thread_metadata?.creation_time:', meta.thread_metadata?.creation_time);
                console.log('- meta.creationTime:', meta.creationTime);
                console.log('- meta.created:', meta.created);
                console.log('- meta.timestamp:', meta.timestamp);
                
                // ===== EXTREME DEBUGGING FOR VERIFICATION =====
                console.log('\n🔍🔍🔍 CHECKING VERIFICATION PATHS:');
                console.log('- meta.verification:', meta.verification);
                console.log('- meta.verified:', meta.verified);
                console.log('- meta.isVerified:', meta.isVerified);
                
                // ===== EXTREME DEBUGGING FOR JID =====
                console.log('\n🔍🔍🔍 CHECKING JID PATHS:');
                console.log('- meta.id:', meta.id);
                console.log('- meta.jid:', meta.jid);
                console.log('- meta.thread_metadata?.id:', meta.thread_metadata?.id);
                
                // Try to extract name from every possible path
                if (meta.name?.text) {
                    channelName = meta.name.text;
                    console.log('✅ Found name in meta.name.text:', channelName);
                } else if (meta.name && typeof meta.name === 'string') {
                    channelName = meta.name;
                    console.log('✅ Found name in meta.name (string):', channelName);
                } else if (meta.title) {
                    channelName = meta.title;
                    console.log('✅ Found name in meta.title:', channelName);
                } else if (meta.thread_metadata?.name?.text) {
                    channelName = meta.thread_metadata.name.text;
                    console.log('✅ Found name in meta.thread_metadata.name.text:', channelName);
                } else if (meta.subject) {
                    channelName = meta.subject;
                    console.log('✅ Found name in meta.subject:', channelName);
                }
                
                // Try to extract subscribers from every possible path
                if (meta.subscribers_count) {
                    channelSubscribers = parseInt(meta.subscribers_count) || 0;
                    console.log('✅ Found subscribers in meta.subscribers_count:', channelSubscribers);
                } else if (meta.subscriberCount) {
                    channelSubscribers = parseInt(meta.subscriberCount) || 0;
                    console.log('✅ Found subscribers in meta.subscriberCount:', channelSubscribers);
                } else if (meta.thread_metadata?.subscribers_count) {
                    channelSubscribers = parseInt(meta.thread_metadata.subscribers_count) || 0;
                    console.log('✅ Found subscribers in meta.thread_metadata.subscribers_count:', channelSubscribers);
                } else if (meta.stats?.subscribers) {
                    channelSubscribers = parseInt(meta.stats.subscribers) || 0;
                    console.log('✅ Found subscribers in meta.stats.subscribers:', channelSubscribers);
                }
                
                // Try to extract description from every possible path
                if (meta.description?.text) {
                    channelDescription = meta.description.text;
                    console.log('✅ Found description in meta.description.text');
                } else if (meta.description && typeof meta.description === 'string') {
                    channelDescription = meta.description;
                    console.log('✅ Found description in meta.description (string)');
                } else if (meta.thread_metadata?.description?.text) {
                    channelDescription = meta.thread_metadata.description.text;
                    console.log('✅ Found description in meta.thread_metadata.description.text');
                } else if (meta.about) {
                    channelDescription = meta.about;
                    console.log('✅ Found description in meta.about');
                } else if (meta.desc) {
                    channelDescription = meta.desc;
                    console.log('✅ Found description in meta.desc');
                }
                
                // Try to extract creation time from every possible path
                if (meta.thread_metadata?.creation_time) {
                    channelCreation = new Date(parseInt(meta.thread_metadata.creation_time) * 1000).toLocaleString();
                    console.log('✅ Found creation in meta.thread_metadata.creation_time:', channelCreation);
                } else if (meta.creationTime) {
                    channelCreation = new Date(parseInt(meta.creationTime) * 1000).toLocaleString();
                    console.log('✅ Found creation in meta.creationTime:', channelCreation);
                } else if (meta.created) {
                    channelCreation = new Date(parseInt(meta.created) * 1000).toLocaleString();
                    console.log('✅ Found creation in meta.created:', channelCreation);
                }
                
                // Try to extract verification from every possible path
                if (meta.verification) {
                    channelVerified = meta.verification === 'VERIFIED';
                    console.log('✅ Found verification in meta.verification:', channelVerified);
                } else if (meta.verified) {
                    channelVerified = meta.verified === true;
                    console.log('✅ Found verification in meta.verified:', channelVerified);
                }
                
                // Try to extract JID from every possible path
                if (meta.id) {
                    channelJid = meta.id;
                    console.log('✅ Found JID in meta.id:', channelJid);
                } else if (meta.jid) {
                    channelJid = meta.jid;
                    console.log('✅ Found JID in meta.jid:', channelJid);
                }
            }
        } catch (infoError) {
            console.error('❌ Metadata error:', infoError);
            await sock.sendMessage(chatId, {
                text: `❌ *Channel not found*\n\nInvite code \`${inviteCode}\` is invalid or the channel does not exist.`
            });
            await react('❌');
            return;
        }

        // Send channel info
        await sock.sendMessage(chatId, {
            text: `📢 *Channel Info*\n\n` +
                  `📌 *Name:* ${channelName}\n` +
                  `👥 *Subscribers:* ${channelSubscribers.toLocaleString()}\n` +
                  `✅ *Verified:* ${channelVerified ? 'Yes ✅' : 'No ❌'}\n` +
                  `📝 *Description:* ${channelDescription.substring(0, 200)}${channelDescription.length > 200 ? '...' : ''}\n` +
                  (channelCreation ? `📅 *Created:* ${channelCreation}\n` : '') +
                  (channelJid ? `\n🔗 *JID:* \`${channelJid}\`` : '')
        });

        // Follow the channel
        const jidToFollow = channelJid || (channelInfo ? channelInfo.id : `${inviteCode}@newsletter`);
        let followed = false;

        try {
            if (sock.newsletterFollow) {
                console.log('\n🔍 Attempting to follow channel with JID:', jidToFollow);
                await sock.newsletterFollow(jidToFollow);
                followed = true;
                console.log(`✅ Successfully followed channel: ${channelName}`);
            } else {
                throw new Error('newsletterFollow method not available');
            }
        } catch (followError) {
            console.log('\n❌ Follow error:', followError.message);
            console.log('Follow error data:', followError.data);
            
            // Check if already following (error code 304)
            if (followError.data === 304 || followError.message?.includes('already-exists')) {
                followed = true;
                console.log(`ℹ️ Already following channel: ${channelName}`);
            } else {
                console.log(`⚠️ Follow warning: ${followError.message} - but channel was joined successfully`);
                followed = true;
            }
        }

        if (followed) {
            // Success message
            let successMsg = `✅ *SUCCESSFULLY JOINED CHANNEL!*\n\n`;
            successMsg += `📢 *Channel:* ${channelName}\n`;
            successMsg += `👥 *Subscribers:* ${channelSubscribers.toLocaleString()}\n`;
            successMsg += `✅ *Verified:* ${channelVerified ? 'Yes ✅' : 'No ❌'}\n`;
            successMsg += `📝 *Description:* ${channelDescription.substring(0, 200)}${channelDescription.length > 200 ? '...' : ''}\n`;
            if (channelCreation) successMsg += `📅 *Created:* ${channelCreation}\n`;
            if (channelJid) successMsg += `\n🔗 *JID:* \`${channelJid}\``;

            await sock.sendMessage(chatId, {
                text: successMsg
            });

            console.log(`📢 Bot joined channel: ${channelName} (${channelJid || inviteCode})`);
            
            // Try to fetch latest posts
            await sock.sendMessage(chatId, {
                text: `⏳ Fetching latest posts from ${channelName}...`
            });
            
            try {
                console.log('\n🔍🔍🔍 FETCHING LATEST POSTS...');
                console.log('Using JID:', jidToFollow);
                
                if (sock.newsletterFetchMessages) {
                    console.log('Method newsletterFetchMessages exists, calling...');
                    const messages = await sock.newsletterFetchMessages({
                        jid: jidToFollow,
                        count: 3
                    });
                    
                    console.log('\n🔥🔥🔥 FULL MESSAGES RESPONSE:');
                    console.log(JSON.stringify(messages, null, 2));
                    
                    console.log('\nMessages type:', typeof messages);
                    console.log('Is array:', Array.isArray(messages));
                    console.log('Messages length:', messages?.length);
                    
                    // Check if messages exists and has items
                    if (messages && Array.isArray(messages) && messages.length > 0) {
                        console.log(`✅ Found ${messages.length} posts`);
                        
                        let postsText = `📢 *LATEST POSTS FROM ${channelName}*\n\n`;
                        
                        messages.forEach((msg, index) => {
                            console.log(`\n--- Processing post ${index + 1} ---`);
                            console.log('Raw message:', JSON.stringify(msg, null, 2));
                            
                            // Safely access message
                            if (!msg) {
                                console.log('⚠️ Message is null/undefined');
                                return;
                            }
                            
                            const message = msg.message || msg;
                            
                            // Safely get timestamp with fallback
                            let timestamp = 'Unknown';
                            if (msg.messageTimestamp) {
                                try {
                                    const ts = parseInt(msg.messageTimestamp);
                                    if (!isNaN(ts)) {
                                        timestamp = new Date(ts * 1000).toLocaleString();
                                        console.log('✅ Timestamp parsed:', timestamp);
                                    }
                                } catch (e) {
                                    console.log('❌ Timestamp parse error:', e.message);
                                }
                            }
                            
                            postsText += `*Post ${index + 1}:*\n`;
                            
                            // Safely check message content
                            if (message && message.conversation) {
                                postsText += `💬 ${message.conversation}\n`;
                                console.log('✅ Found conversation:', message.conversation.substring(0, 50));
                            } else if (message && message.extendedTextMessage?.text) {
                                postsText += `💬 ${message.extendedTextMessage.text}\n`;
                                console.log('✅ Found extended text');
                            } else if (message && message.imageMessage) {
                                postsText += `📷 Image`;
                                if (message.imageMessage.caption) {
                                    postsText += `: ${message.imageMessage.caption}`;
                                }
                                postsText += '\n';
                                console.log('✅ Found image');
                            } else if (message && message.videoMessage) {
                                postsText += `🎥 Video`;
                                if (message.videoMessage.caption) {
                                    postsText += `: ${message.videoMessage.caption}`;
                                }
                                postsText += '\n';
                                console.log('✅ Found video');
                            } else if (message && message.documentMessage) {
                                postsText += `📄 Document`;
                                if (message.documentMessage.fileName) {
                                    postsText += `: ${message.documentMessage.fileName}`;
                                }
                                postsText += '\n';
                                console.log('✅ Found document');
                            } else {
                                postsText += `📝 Message\n`;
                                console.log('⚠️ Unknown message type');
                            }
                            
                            postsText += `⏱️ ${timestamp}\n\n`;
                        });
                        
                        await sock.sendMessage(chatId, {
                            text: postsText
                        });
                        console.log('✅ Posts sent to WhatsApp');
                    } else {
                        console.log('⚠️ No messages found or invalid format');
                        await sock.sendMessage(chatId, {
                            text: `📭 *No posts found in ${channelName}*\n\nThe channel may not have any posts yet.`
                        });
                    }
                } else {
                    console.log('❌ newsletterFetchMessages method not available');
                    console.log('Available newsletter methods:', Object.keys(sock).filter(k => k.includes('newsletter')));
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *Cannot fetch posts*\n\nMethod newsletterFetchMessages not available.`
                    });
                }
            } catch (postError) {
                console.log('\n❌❌❌ POST FETCHING ERROR:');
                console.log('Error message:', postError.message);
                console.log('Error stack:', postError.stack);
                console.log('Full error:', JSON.stringify(postError, Object.getOwnPropertyNames(postError), 2));
                
                // Don't show error to user, just show friendly message
                await sock.sendMessage(chatId, {
                    text: `📭 *No posts available*\n\nUnable to fetch posts at this time.`
                });
            }
            
            await react('✅');
        }

    } catch (error) {
        console.error('❌❌❌ CHANNEL JOIN OUTER ERROR:', error);
        
        let errorMsg = '❌ *Failed to join channel*\n\n';
        
        if (error.message?.includes('Bad Request') || error.data === 400) {
            errorMsg += 'Invalid channel link or channel does not exist.';
        } else if (error.message?.includes('not-authorized') || error.data === 401) {
            errorMsg += 'Not authorized to join this channel.';
        } else if (error.message?.includes('forbidden') || error.data === 403) {
            errorMsg += 'Bot is blocked from joining this channel.';
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        
        await sock.sendMessage(chatId, {
            text: errorMsg
        });
        await react('❌');
    }
}
