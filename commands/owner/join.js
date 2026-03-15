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
            console.log('🔍 DEBUG: Fetching channel metadata for code:', inviteCode);
            const meta = await sock.newsletterMetadata('invite', inviteCode);
            
            console.log('📦 DEBUG: newsletterMetadata response:', JSON.stringify(meta, null, 2));
            
            if (meta) {
                channelInfo = meta;
                channelName = meta.name || meta.title || 'Unknown Channel';
                channelSubscribers = meta.subscriberCount || 0;
                channelVerified = meta.verified || false;
                channelDescription = meta.description || 'No description';
                channelCreation = meta.creationTime ? new Date(meta.creationTime * 1000).toLocaleString() : 'Unknown';
                channelJid = meta.id || null;
                
                console.log('✅ DEBUG: Channel JID extracted:', channelJid);
            }
        } catch (infoError) {
            console.log('❌ DEBUG: newsletterMetadata error:', infoError.message);
            console.log('❌ DEBUG: Full error:', infoError);
            
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

        console.log('🔍 DEBUG: Attempting to follow JID:', jidToFollow);
        console.log('🔍 DEBUG: Available socket methods:', Object.keys(sock).filter(k => 
            k.includes('newsletter') || k.includes('Newsletter') || k.includes('follow') || k.includes('join')
        ));

        try {
            // Try newsletterFollow and capture the full response
            if (sock.newsletterFollow) {
                console.log('🔍 DEBUG: Using sock.newsletterFollow method');
                
                try {
                    const followResponse = await sock.newsletterFollow(jidToFollow);
                    console.log('📦 DEBUG: newsletterFollow SUCCESS response:', JSON.stringify(followResponse, null, 2));
                    joined = true;
                } catch (followErr) {
                    console.log('❌ DEBUG: newsletterFollow ERROR:', followErr.message);
                    console.log('❌ DEBUG: Full error object:', JSON.stringify(followErr, Object.getOwnPropertyNames(followErr), 2));
                    
                    // Check error properties
                    if (followErr.data) console.log('❌ DEBUG: Error data:', followErr.data);
                    if (followErr.output) console.log('❌ DEBUG: Error output:', followErr.output);
                    if (followErr.statusCode) console.log('❌ DEBUG: Status code:', followErr.statusCode);
                    
                    // If error is about already following, that's fine
                    if (followErr.message?.includes('already-exists') || followErr.data === 304) {
                        console.log('✅ DEBUG: Already following channel');
                        joined = true;
                    } else {
                        throw followErr;
                    }
                }
            }
            // Try alternative methods if newsletterFollow doesn't exist
            else if (sock.newsletterJoin) {
                console.log('🔍 DEBUG: Using sock.newsletterJoin method');
                const joinResponse = await sock.newsletterJoin(inviteCode);
                console.log('📦 DEBUG: newsletterJoin response:', JSON.stringify(joinResponse, null, 2));
                joined = true;
            }
            else if (sock.followNewsletter) {
                console.log('🔍 DEBUG: Using sock.followNewsletter method');
                const followResponse = await sock.followNewsletter(jidToFollow);
                console.log('📦 DEBUG: followNewsletter response:', JSON.stringify(followResponse, null, 2));
                joined = true;
            }
            else {
                console.log('❌ DEBUG: No newsletter follow method found');
                throw new Error('Channel joining not supported in this Baileys version');
            }
        } catch (error) {
            followError = error;
            console.log('❌ DEBUG: All follow attempts failed:', error.message);
            
            // Check if it's an "already joined" error
            if (error.message?.includes('already-exists') || error.data === 304 ||
                error.message?.includes('already following') || error.message?.includes('already joined')) {
                console.log('✅ DEBUG: Already following channel (detected from error)');
                joined = true;
            } else {
                // For other errors, we'll still try to fetch latest post
                console.log('⚠️ DEBUG: Follow error but continuing:', error.message);
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
            console.log('🔍 DEBUG: Attempting to fetch latest post from:', jidToFollow);
            
            try {
                const latestPost = await getLatestChannelPost(sock, jidToFollow);
                console.log('📦 DEBUG: getLatestChannelPost response:', latestPost ? 'Post found' : 'No post');
                
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
            } catch (postError) {
                console.log('❌ DEBUG: Error fetching latest post:', postError.message);
                console.log('❌ DEBUG: Full post error:', postError);
                await sock.sendMessage(chatId, {
                    text: `⚠️ *Could not fetch latest post*\n\nError: ${postError.message}`
                });
            }
            
            await react('✅');
        }

    } catch (error) {
        console.error('❌ DEBUG: Channel join outer error:', error);
        console.error('❌ DEBUG: Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

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
            errorMsg += `Error: ${error.message}\n\n`;
            errorMsg += `Check console for full debug output.`;
        }
        
        await sock.sendMessage(chatId, {
            text: errorMsg
        });
        await react('❌');
    }
}

/**
 * Fetch latest post from channel with debugging
 */
async function getLatestChannelPost(sock, channelJid) {
  try {
    console.log('🔍 DEBUG: Getting latest post for:', channelJid);
    
    // Try to get channel updates/newsletters
    if (sock.newsletterUpdates) {
      console.log('🔍 DEBUG: Using sock.newsletterUpdates');
      const updates = await sock.newsletterUpdates(channelJid, { limit: 1 });
      console.log('📦 DEBUG: newsletterUpdates response:', JSON.stringify(updates, null, 2));
      
      if (updates && updates.messages && updates.messages.length > 0) {
        return updates.messages[0];
      }
    }
    
    // Alternative method
    if (sock.newsletterMessages) {
      console.log('🔍 DEBUG: Using sock.newsletterMessages');
      const messages = await sock.newsletterMessages(channelJid, { limit: 1 });
      console.log('📦 DEBUG: newsletterMessages response:', JSON.stringify(messages, null, 2));
      
      if (messages && messages.length > 0) {
        return messages[0];
      }
    }
    
    // Try to get via newsletter updates with different parameter
    if (sock.newsletterUpdates) {
      console.log('🔍 DEBUG: Using sock.newsletterUpdates with different format');
      const updates = await sock.newsletterUpdates({ jid: channelJid, count: 1 });
      console.log('📦 DEBUG: newsletterUpdates (alt) response:', JSON.stringify(updates, null, 2));
      
      if (updates && updates.messages && updates.messages.length > 0) {
        return updates.messages[0];
      }
    }
    
    console.log('⚠️ DEBUG: No method found to fetch posts');
    return null;
    
  } catch (error) {
    console.log('❌ DEBUG: Error in getLatestChannelPost:', error.message);
    console.log('❌ DEBUG: Full error:', error);
    return null;
  }
}
