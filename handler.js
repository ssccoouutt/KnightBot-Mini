/**
 * Message Handler - Processes incoming messages and executes commands
 */

const config = require('./config');
const database = require('./database');
const { loadCommands } = require('./utils/commandLoader');
const { addMessage } = require('./utils/groupstats');
const { jidDecode, jidEncode, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sessionManager = require('./utils/sessionManager');

// Group metadata cache to prevent rate limiting
const groupMetadataCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

// Load all commands
const commands = loadCommands();

// Helper function to convert stream to buffer
const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

// Check if message should be forwarded based on filters
const shouldForwardMessage = (messageContent, filters) => {
  if (!filters) return true;
  
  const messageType = Object.keys(messageContent)[0];
  
  // Determine message type
  let type = messageType;
  if (type === 'conversation' || type === 'extendedTextMessage') type = 'text';
  else if (type === 'imageMessage') type = 'image';
  else if (type === 'videoMessage') type = 'video';
  else if (type === 'audioMessage') type = 'audio';
  else if (type === 'documentMessage') type = 'document';
  else if (type === 'stickerMessage') type = 'sticker';
  else if (type === 'locationMessage') type = 'location';
  else if (type === 'contactMessage') type = 'contact';
  else if (type === 'pollCreationMessage') type = 'poll';
  else type = 'other';
  
  // Check if message type is allowed
  if (filters.types && filters.types.length > 0 && !filters.types.includes(type)) {
    return false;
  }
  
  // Check caption filters
  const hasCaption = messageContent.imageMessage?.caption || 
                     messageContent.videoMessage?.caption || 
                     messageContent.documentMessage?.caption;
  
  if (filters.onlyWithCaption && !hasCaption) return false;
  if (filters.onlyWithoutCaption && hasCaption) return false;
  
  // Check exclude filters
  const isMedia = messageContent.imageMessage || 
                  messageContent.videoMessage || 
                  messageContent.audioMessage || 
                  messageContent.documentMessage ||
                  messageContent.stickerMessage;
  const isText = messageContent.conversation || messageContent.extendedTextMessage;
  
  if (filters.excludeMedia && isMedia) return false;
  if (filters.excludeText && isText) return false;
  
  return true;
};

// Unwrap WhatsApp containers (ephemeral, view once, etc.)
const getMessageContent = (msg) => {
  if (!msg || !msg.message) return null;
  
  let m = msg.message;
  
  // Common wrappers in modern WhatsApp
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  
  return m;
};

// Cached group metadata getter with rate limit handling (for non-admin checks)
const getCachedGroupMetadata = async (sock, groupId) => {
  try {
    if (!groupId || !groupId.endsWith('@g.us')) {
      return null;
    }
    
    const cached = groupMetadataCache.get(groupId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    const metadata = await sock.groupMetadata(groupId);
    
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      groupMetadataCache.set(groupId, {
        data: null,
        timestamp: Date.now()
      });
      return null;
    }
    
    if (error.message && error.message.includes('rate-overlimit')) {
      const cached = groupMetadataCache.get(groupId);
      if (cached) {
        return cached.data;
      }
      return null;
    }
    
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    
    return null;
  }
};

// Live group metadata getter (always fresh, no cache) - for admin checks
const getLiveGroupMetadata = async (sock, groupId) => {
  try {
    const metadata = await sock.groupMetadata(groupId);
    
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    return null;
  }
};

// Alias for backward compatibility (non-admin features use cached)
const getGroupMetadata = getCachedGroupMetadata;

// Helper functions
const isOwner = (sender) => {
  if (!sender) return false;
  
  const normalizedSender = normalizeJidWithLid(sender);
  const senderNumber = normalizeJid(normalizedSender);
  
  return config.ownerNumber.some(owner => {
    const normalizedOwner = normalizeJidWithLid(owner.includes('@') ? owner : `${owner}@s.whatsapp.net`);
    const ownerNumber = normalizeJid(normalizedOwner);
    return ownerNumber === senderNumber;
  });
};

const isMod = (sender) => {
  const number = sender.split('@')[0];
  return database.isModerator(number);
};

// LID mapping cache
const lidMappingCache = new Map();

// Helper to normalize JID to just the number part
const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  
  if (jid.includes(':')) {
    return jid.split(':')[0];
  }
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
};

// Get LID mapping value from session files
const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    return lidMappingCache.get(cacheKey);
  }
  
  const sessionPath = path.join(__dirname, config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  
  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
  
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch (error) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

// Normalize JID handling LID conversion
const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    }
    
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    
    if (server === 'hosted') {
      return jidEncode(user, 'hosted');
    }
    return jidEncode(user, 's.whatsapp.net');
  } catch (error) {
    return jid;
  }
};

// Build comparable JID variants (PN + LID) for matching
const buildComparableIds = (jid) => {
  if (!jid) return [];
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return [normalizeJidWithLid(jid)].filter(Boolean);
    }
    
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    variants.add(jidEncode(decoded.user, normalizedServer));
    
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) {
        const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
        variants.add(jidEncode(lidUser, lidServer));
      }
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) {
        const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        variants.add(jidEncode(pnUser, pnServer));
      }
    }
    
    return Array.from(variants);
  } catch (error) {
    return [jid];
  }
};

// Find participant by either PN JID or LID JID
const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  
  if (!targets.length) return null;
  
  return participants.find(participant => {
    if (!participant) return false;
    
    const participantIds = [
      participant.id,
      participant.lid,
      participant.userJid
    ]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

const isAdmin = async (sock, participant, groupId, groupMetadata = null) => {
  if (!participant) return false;
  
  if (!groupId || !groupId.endsWith('@g.us')) {
    return false;
  }
  
  let liveMetadata = groupMetadata;
  if (!liveMetadata || !liveMetadata.participants) {
    if (groupId) {
      liveMetadata = await getLiveGroupMetadata(sock, groupId);
    } else {
      return false;
    }
  }
  
  if (!liveMetadata || !liveMetadata.participants) return false;
  
  const foundParticipant = findParticipant(liveMetadata.participants, participant);
  if (!foundParticipant) return false;
  
  return foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin';
};

const isBotAdmin = async (sock, groupId, groupMetadata = null) => {
  if (!sock.user || !groupId) return false;
  
  if (!groupId.endsWith('@g.us')) {
    return false;
  }
  
  try {
    const botId = sock.user.id;
    const botLid = sock.user.lid;
    
    if (!botId) return false;
    
    const botJids = [botId];
    if (botLid) {
      botJids.push(botLid);
    }
    
    const liveMetadata = await getLiveGroupMetadata(sock, groupId);
    
    if (!liveMetadata || !liveMetadata.participants) return false;
    
    const participant = findParticipant(liveMetadata.participants, botJids);
    if (!participant) return false;
    
    return participant.admin === 'admin' || participant.admin === 'superadmin';
  } catch (error) {
    return false;
  }
};

const isUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return urlRegex.test(text);
};

const hasGroupLink = (text) => {
  const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i;
  return linkRegex.test(text);
};

// System JID filter - checks if JID is from broadcast/status/newsletter
const isSystemJid = (jid) => {
  if (!jid) return true;
  return jid.includes('@broadcast') || 
         jid.includes('status.broadcast') || 
         jid.includes('@newsletter') ||
         jid.includes('@newsletter.');
};

// ===== GROUP FORWARDING FEATURE WITH FILTERS AND DRIVE STORAGE =====
const checkAndForwardMessage = async (sock, msg, from, content) => {
  try {
    // Only forward messages from groups
    if (!from.endsWith('@g.us')) return;
    
    // Get forwarding configuration from Drive
    const forwardingConfig = await database.getGroupForwarding(from);
    
    // Check if forwarding is enabled
    if (!forwardingConfig || !forwardingConfig.enabled) return;
    
    const targetGroupId = forwardingConfig.targetGroupId;
    if (!targetGroupId) return;
    
    // Don't forward messages from the bot itself (to avoid loops)
    if (msg.key.fromMe) return;
    
    // Don't forward system messages
    const isSystem = from.includes('@broadcast') || 
                     from.includes('status.broadcast') || 
                     from.includes('@newsletter');
    if (isSystem) return;
    
    // Get message content
    const messageContent = content || getMessageContent(msg);
    if (!messageContent) return;
    
    // Check filters
    const filters = forwardingConfig.filters;
    const shouldForward = shouldForwardMessage(messageContent, filters);
    
    if (!shouldForward) {
      return;
    }
    
    try {
      // Handle different message types - FORWARD EXACTLY AS IS (NO HEADERS)
      
      // Text message
      if (messageContent.conversation) {
        await sock.sendMessage(targetGroupId, { 
          text: messageContent.conversation
        });
      }
      // Extended text message
      else if (messageContent.extendedTextMessage) {
        await sock.sendMessage(targetGroupId, { 
          text: messageContent.extendedTextMessage.text || ''
        });
      }
      // Image message
      else if (messageContent.imageMessage) {
        const image = messageContent.imageMessage;
        
        try {
          const stream = await downloadContentFromMessage(image, 'image');
          const buffer = [];
          for await (const chunk of stream) {
            buffer.push(chunk);
          }
          const imageBuffer = Buffer.concat(buffer);
          
          await sock.sendMessage(targetGroupId, {
            image: imageBuffer,
            caption: image.caption || '',
            mimetype: image.mimetype
          });
        } catch (downloadErr) {
          console.error(`❌ Failed to download image:`, downloadErr.message);
        }
      }
      // Video message
      else if (messageContent.videoMessage) {
        const video = messageContent.videoMessage;
        
        try {
          const stream = await downloadContentFromMessage(video, 'video');
          const buffer = [];
          for await (const chunk of stream) {
            buffer.push(chunk);
          }
          const videoBuffer = Buffer.concat(buffer);
          
          await sock.sendMessage(targetGroupId, {
            video: videoBuffer,
            caption: video.caption || '',
            mimetype: video.mimetype
          });
        } catch (downloadErr) {
          console.error(`❌ Failed to download video:`, downloadErr.message);
        }
      }
      // Audio message
      else if (messageContent.audioMessage) {
        const audio = messageContent.audioMessage;
        
        try {
          const stream = await downloadContentFromMessage(audio, 'audio');
          const buffer = [];
          for await (const chunk of stream) {
            buffer.push(chunk);
          }
          const audioBuffer = Buffer.concat(buffer);
          
          await sock.sendMessage(targetGroupId, {
            audio: audioBuffer,
            mimetype: audio.mimetype,
            ptt: audio.ptt || false
          });
        } catch (downloadErr) {
          console.error(`❌ Failed to download audio:`, downloadErr.message);
        }
      }
      // Document message
      else if (messageContent.documentMessage) {
        const doc = messageContent.documentMessage;
        
        try {
          const stream = await downloadContentFromMessage(doc, 'document');
          const buffer = [];
          for await (const chunk of stream) {
            buffer.push(chunk);
          }
          const docBuffer = Buffer.concat(buffer);
          
          await sock.sendMessage(targetGroupId, {
            document: docBuffer,
            mimetype: doc.mimetype,
            fileName: doc.fileName,
            caption: doc.caption || ''
          });
        } catch (downloadErr) {
          console.error(`❌ Failed to download document:`, downloadErr.message);
        }
      }
      // Sticker message
      else if (messageContent.stickerMessage) {
        const sticker = messageContent.stickerMessage;
        
        try {
          const stream = await downloadContentFromMessage(sticker, 'sticker');
          const buffer = [];
          for await (const chunk of stream) {
            buffer.push(chunk);
          }
          const stickerBuffer = Buffer.concat(buffer);
          
          await sock.sendMessage(targetGroupId, {
            sticker: stickerBuffer
          });
        } catch (downloadErr) {
          console.error(`❌ Failed to download sticker:`, downloadErr.message);
        }
      }
      // Location message
      else if (messageContent.locationMessage) {
        const location = messageContent.locationMessage;
        await sock.sendMessage(targetGroupId, {
          location: {
            degreesLatitude: location.degreesLatitude,
            degreesLongitude: location.degreesLongitude
          }
        });
      }
      // Contact message
      else if (messageContent.contactMessage) {
        const contact = messageContent.contactMessage;
        await sock.sendMessage(targetGroupId, {
          contacts: {
            displayName: contact.displayName,
            vcard: contact.vcard
          }
        });
      }
      // Poll creation message
      else if (messageContent.pollCreationMessage) {
        const poll = messageContent.pollCreationMessage;
        await sock.sendMessage(targetGroupId, {
          poll: {
            name: poll.name,
            options: poll.options.map(opt => opt.optionName),
            selectableCount: poll.selectableCount || 1
          }
        });
      }
      // Button response message
      else if (messageContent.buttonsResponseMessage) {
        const btn = messageContent.buttonsResponseMessage;
        await sock.sendMessage(targetGroupId, {
          text: btn.selectedDisplayText || 'Button response'
        });
      }
      // List response message
      else if (messageContent.listResponseMessage) {
        const list = messageContent.listResponseMessage;
        const selected = list.singleSelectReply;
        await sock.sendMessage(targetGroupId, {
          text: selected?.title || 'List selection'
        });
      }
      
    } catch (forwardError) {
      console.error(`❌ Error forwarding message:`, forwardError.message);
    }
    
  } catch (error) {
    console.error('❌ Error in checkAndForwardMessage:', error.message);
  }
};

// Main message handler
const handleMessage = async (sock, msg) => {
  try {
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    
    // System message filter - ignore broadcast/status/newsletter messages
    if (isSystemJid(from)) {
      return;
    }
    
    // Auto-React System
    try {
      delete require.cache[require.resolve('./config')];
      const config = require('./config');

      if (config.autoReact && msg.message && !msg.key.fromMe) {
        const content = msg.message.ephemeralMessage?.message || msg.message;
        const text = content.conversation || content.extendedTextMessage?.text || '';
        const jid = msg.key.remoteJid;
        const emojis = ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'];
        const mode = config.autoReactMode || 'bot';

        if (mode === 'bot') {
          const prefixList = ['.', '/', '#'];
          if (prefixList.includes(text?.trim()[0])) {
            await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          }
        }

        if (mode === 'all') {
          const rand = emojis[Math.floor(Math.random() * emojis.length)];
          await sock.sendMessage(jid, { react: { text: rand, key: msg.key } });
        }
      }
    } catch (e) {
      console.error('[AutoReact Error]', e.message);
    }
    
    // Unwrap containers first
    const content = getMessageContent(msg);
    
    // ===== CHECK AND FORWARD MESSAGE =====
    await checkAndForwardMessage(sock, msg, from, content);
    
    // Still check for actual message content for regular processing
    let actualMessageTypes = [];
    if (content) {
      const allKeys = Object.keys(content);
      const protocolMessages = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
      actualMessageTypes = allKeys.filter(key => !protocolMessages.includes(key));
    }
    
    const sender = msg.key.fromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    const groupMetadata = isGroup ? await getGroupMetadata(sock, from) : null;
    
    // Anti-group mention protection
    if (isGroup) {
      try {
        await handleAntigroupmention(sock, msg, groupMetadata);
      } catch (error) {
        console.error('Error in antigroupmention handler:', error);
      }
    }
    
    // Track group message statistics
    if (isGroup) {
      addMessage(from, sender);
    }
    
    // Return early for non-group messages with no recognizable content
    if (!content || actualMessageTypes.length === 0) return;
    
    // Button response handling
    const btn = content.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
    if (btn) {
      const buttonId = btn.selectedButtonId;
      const displayText = btn.selectedDisplayText;
      
      if (buttonId === 'btn_menu') {
        const menuCmd = commands.get('menu');
        if (menuCmd) {
          await menuCmd.execute(sock, msg, [], {
            from, sender, isGroup, groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_ping') {
        const pingCmd = commands.get('ping');
        if (pingCmd) {
          await pingCmd.execute(sock, msg, [], {
            from, sender, isGroup, groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_help') {
        const listCmd = commands.get('list');
        if (listCmd) {
          await listCmd.execute(sock, msg, [], {
            from, sender, isGroup, groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      }
      
      console.log(`🔘 Button clicked: ${displayText} (${buttonId}) - letting through`);
      return;
    }
    
    // Get message body
    let body = '';
    if (content.conversation) {
      body = content.conversation;
    } else if (content.extendedTextMessage) {
      body = content.extendedTextMessage.text || '';
    } else if (content.imageMessage) {
      body = content.imageMessage.caption || '';
    } else if (content.videoMessage) {
      body = content.videoMessage.caption || '';
    }
    
    body = (body || '').trim();
    
    // Check antiall protection (owner only feature)
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.antiall) {
        const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
        const senderIsOwner = isOwner(sender);
        
        if (!senderIsAdmin && !senderIsOwner) {
          const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
          if (botIsAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
          }
        }
      }
      
      // Anti-tag protection
      if (groupSettings.antitag && !msg.key.fromMe) {
        const ctx = content.extendedTextMessage?.contextInfo;
        const mentionedJids = ctx?.mentionedJid || [];
        
        const messageText = (body || content.imageMessage?.caption || content.videoMessage?.caption || '');
        const textMentions = messageText.match(/@[\d+\s\-()~.]+/g) || [];
        const numericMentions = messageText.match(/@\d{10,}/g) || [];
        
        const uniqueNumericMentions = new Set();
        numericMentions.forEach((mention) => {
          const numMatch = mention.match(/@(\d+)/);
          if (numMatch) uniqueNumericMentions.add(numMatch[1]);
        });
        
        const mentionedJidCount = mentionedJids.length;
        const numericMentionCount = uniqueNumericMentions.size;
        const totalMentions = Math.max(mentionedJidCount, numericMentionCount);
        
        if (totalMentions >= 3) {
          try {
            const participants = groupMetadata.participants || [];
            const mentionThreshold = Math.max(3, Math.ceil(participants.length * 0.5));
            const hasManyNumericMentions = numericMentionCount >= 10 ||
              (numericMentionCount >= 5 && numericMentionCount >= mentionThreshold);
            
            if (totalMentions >= mentionThreshold || hasManyNumericMentions) {
              const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
              const senderIsOwner = isOwner(sender);
              
              if (!senderIsAdmin && !senderIsOwner) {
                const action = (groupSettings.antitagAction || 'delete').toLowerCase();
                
                if (action === 'delete') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { 
                      text: '⚠️ *Tagall Detected!*',
                      mentions: [sender]
                    }, { quoted: msg });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                } else if (action === 'kick') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                  
                  const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
                  if (botIsAdmin) {
                    try {
                      await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    } catch (e) {
                      console.error('Failed to kick for antitag:', e);
                    }
                    const usernames = [`@${sender.split('@')[0]}`];
                    await sock.sendMessage(from, {
                      text: `🚫 *Antitag Detected!*\n\n${usernames.join(', ')} has been kicked for tagging all members.`,
                      mentions: [sender],
                    }, { quoted: msg });
                  }
                }
                return;
              }
            }
          } catch (e) {
            console.error('Error during anti-tag enforcement:', e);
          }
        }
      }
    }
    
    // AutoSticker feature
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.autosticker) {
        const mediaMessage = content?.imageMessage || content?.videoMessage;
        
        if (mediaMessage && !body.startsWith(config.prefix)) {
          try {
            const stickerCmd = commands.get('sticker');
            if (stickerCmd) {
              await stickerCmd.execute(sock, msg, [], {
                from, sender, isGroup, groupMetadata,
                isOwner: isOwner(sender),
                isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                isMod: isMod(sender),
                reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
              });
              return;
            }
          } catch (error) {
            console.error('[AutoSticker Error]:', error);
          }
        }
      }
    }

    // Check for active bomb games
    try {
      const bombModule = require('./commands/fun/bomb');
      if (bombModule.gameState && bombModule.gameState.has(sender)) {
        const bombCommand = commands.get('bomb');
        if (bombCommand && bombCommand.execute) {
          await bombCommand.execute(sock, msg, [], {
            from, sender, isGroup, groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          return;
        }
      }
    } catch (e) {}
    
    // Check for active tictactoe games
    try {
      const tictactoeModule = require('./commands/fun/tictactoe');
      if (tictactoeModule.handleTicTacToeMove) {
        const isInGame = Object.values(tictactoeModule.games || {}).some(room => 
          room.id.startsWith('tictactoe') && 
          [room.game.playerX, room.game.playerO].includes(sender) && 
          room.state === 'PLAYING'
        );
        
        if (isInGame) {
          const handled = await tictactoeModule.handleTicTacToeMove(sock, msg, {
            from, sender, isGroup, groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          if (handled) return;
        }
      }
    } catch (e) {}
    
    // ===== UNIVERSAL SESSION DETECTION =====
    const quotedMessageId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const isButtonClick = !!(msg.message?.buttonsResponseMessage || 
                            msg.message?.listResponseMessage || 
                            msg.message?.interactiveResponseMessage ||
                            msg.message?.templateButtonReplyMessage);

    if (isButtonClick) {
        console.log(`🔘 BUTTON CLICK DETECTED!`);
        
        let buttonId = null;
        let buttonText = null;
        
        if (msg.message?.buttonsResponseMessage) {
            buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
        } else if (msg.message?.listResponseMessage) {
            const listReply = msg.message.listResponseMessage.singleSelectReply;
            if (listReply) {
                buttonId = listReply.selectedRowId;
                buttonText = listReply.title;
            }
        } else if (msg.message?.interactiveResponseMessage) {
            const interactive = msg.message.interactiveResponseMessage;
            if (interactive.nativeFlowResponseMessage) {
                try {
                    const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                    buttonId = params.id;
                    buttonText = params.display_text;
                } catch (e) {}
            }
        } else if (msg.message?.templateButtonReplyMessage) {
            buttonId = msg.message.templateButtonReplyMessage.selectedId;
            buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
        }
        
        if (buttonId) {
            let sessionFound = null;
            let sessionCommand = null;
            
            const idParts = buttonId.split('_');
            if (idParts.length >= 2) {
                const sessionIdentifier = idParts[1];
                const userSessions = sessionManager.getUserSessions(sender, from);
                for (const sess of userSessions) {
                    if (sess.id.includes(sessionIdentifier)) {
                        sessionFound = sess;
                        sessionCommand = commands.get(sess.command);
                        break;
                    }
                }
            }
            
            if (!sessionFound && quotedMessageId) {
                const sessionInfo = sessionManager.findSessionByRepliedMessage(quotedMessageId, sender);
                if (sessionInfo) {
                    sessionFound = sessionInfo.session;
                    sessionCommand = commands.get(sessionInfo.pendingInfo.command);
                }
            }
            
            if (!sessionFound) {
                const userSessions = sessionManager.getUserSessions(sender, from);
                if (userSessions.length > 0) {
                    sessionFound = userSessions.sort((a, b) => b.lastActivity - a.lastActivity)[0];
                    sessionCommand = commands.get(sessionFound.command);
                }
            }
            
            if (sessionFound && sessionCommand && typeof sessionCommand.handleSession === 'function') {
                sessionManager.activateSession(sender, from, sessionFound.id);
                
                const handled = await sessionCommand.handleSession(sock, msg, sessionFound, {
                    from, sender, isGroup, groupMetadata,
                    isOwner: isOwner(sender),
                    isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                    isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                    isMod: isMod(sender),
                    isButtonClick: true,
                    reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                    react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                
                if (handled) return;
            }
        }
    }

    const isCommand = body.startsWith(config.prefix);
    
    if (quotedMessageId && !isButtonClick && !isCommand) {
        const sessionInfo = sessionManager.findSessionByRepliedMessage(quotedMessageId, sender);
        
        if (sessionInfo) {
            const { session, pendingInfo } = sessionInfo;
            const sessionExists = sessionManager.isSessionActive(session.id);
            
            if (!sessionExists) return;
            
            sessionManager.activateSession(sender, from, session.id);
            const sessionCommand = commands.get(pendingInfo.command);
            
            if (sessionCommand && typeof sessionCommand.handleSession === 'function') {
                const handled = await sessionCommand.handleSession(sock, msg, session, {
                    from, sender, isGroup, groupMetadata,
                    isOwner: isOwner(sender),
                    isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                    isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                    isMod: isMod(sender),
                    isButtonClick: false,
                    reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                    react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                
                if (handled) return;
            }
        } else {
            return;
        }
    }

    if (!isCommand) {
        const latestSession = sessionManager.getLatestSession(sender, from);
        
        if (latestSession && !sessionManager.isSessionFrozen(latestSession.id)) {
            const sessionCommand = commands.get(latestSession.command);
            
            if (sessionCommand && typeof sessionCommand.handleSession === 'function') {
                const handled = await sessionCommand.handleSession(sock, msg, latestSession, {
                    from, sender, isGroup, groupMetadata,
                    isOwner: isOwner(sender),
                    isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                    isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                    isMod: isMod(sender),
                    isButtonClick: false,
                    reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                    react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                
                if (handled) return;
            }
        }
    }
    
    // Check if message starts with prefix
    if (!body.startsWith(config.prefix)) return;
    
    // Parse command
    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    
    const command = commands.get(commandName);
    if (!command) return;
    
    // ===== SELF MODE & SUBSCRIPTION CHECK =====
    // Complete block - no commands allowed for non-subscribed users
    if (config.selfMode) {
        const canUse = await database.canUseBot(sender);
        
        if (!canUse) {
            // Silent block - absolutely no response
            console.log(`[SELF-MODE] Blocked command "${commandName}" from non-subscribed user ${sender}`);
            return;
        }
    }
    
    // Check self mode (private mode) - additional safety fallback
    if (config.selfMode && !isOwner(sender) && !(await database.isUserAllowed(sender))) {
        // Silent block - no response
        console.log(`[SELF-MODE] Fallback block for user ${sender}`);
        return;
    }
    
    // Permission checks
    if (command.ownerOnly && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.ownerOnly }, { quoted: msg });
    }
    
    if (command.modOnly && !isMod(sender) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: '🔒 This command is only for moderators!' }, { quoted: msg });
    }
    
    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(from, { text: config.messages.groupOnly }, { quoted: msg });
    }
    
    if (command.privateOnly && isGroup) {
      return sock.sendMessage(from, { text: config.messages.privateOnly }, { quoted: msg });
    }
    
    if (command.adminOnly && !(await isAdmin(sock, sender, from, groupMetadata)) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.adminOnly }, { quoted: msg });
    }
    
    if (command.botAdminNeeded) {
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      if (!botIsAdmin) {
        return sock.sendMessage(from, { text: config.messages.botAdminNeeded }, { quoted: msg });
      }
    }
    
    // Auto-typing
    if (config.autoTyping) {
      await sock.sendPresenceUpdate('composing', from);
    }
    
    console.log(`Executing command: ${commandName} from ${sender}`);
    
    await command.execute(sock, msg, args, {
      from, sender, isGroup, groupMetadata,
      isOwner: isOwner(sender),
      isAdmin: await isAdmin(sock, sender, from, groupMetadata),
      isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
      isMod: isMod(sender),
      reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
    });
    
  } catch (error) {
    console.error('Error in message handler:', error);
    
    if (error.message && error.message.includes('rate-overlimit')) {
      console.warn('⚠️ Rate limit reached.');
      return;
    }
    
    try {
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `${config.messages.error}\n\n${error.message}` 
      }, { quoted: msg });
    } catch (e) {}
  }
};

// Group participant update handler
const handleGroupUpdate = async (sock, update) => {
  try {
    const { id, participants, action } = update;
    
    if (!id || !id.endsWith('@g.us')) return;
    
    const groupSettings = database.getGroupSettings(id);
    if (!groupSettings.welcome && !groupSettings.goodbye) return;
    
    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return;
    
    const getParticipantJid = (participant) => {
      if (typeof participant === 'string') return participant;
      if (participant && participant.id) return participant.id;
      if (participant && typeof participant === 'object') return participant.jid || participant.participant || null;
      return null;
    };
    
    for (const participant of participants) {
      const participantJid = getParticipantJid(participant);
      if (!participantJid) continue;
      
      const participantNumber = participantJid.split('@')[0];
      
      if (action === 'add' && groupSettings.welcome) {
        try {
          let displayName = participantNumber;
          
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          let phoneJid = null;
          if (participantInfo && participantInfo.phoneNumber) {
            phoneJid = participantInfo.phoneNumber;
          } else {
            try {
              const normalized = normalizeJidWithLid(participantJid);
              if (normalized && normalized.includes('@s.whatsapp.net')) {
                phoneJid = normalized;
              }
            } catch (e) {
              if (participantJid.includes('@s.whatsapp.net')) {
                phoneJid = participantJid;
              }
            }
          }
          
          if (phoneJid) {
            try {
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
                  displayName = contact.name.trim();
                }
              }
              
              if (displayName === participantNumber) {
                try {
                  await sock.onWhatsApp(phoneJid);
                  if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                    const contact = sock.store.contacts[phoneJid];
                    if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                      displayName = contact.notify.trim();
                    }
                  }
                } catch (fetchError) {}
              }
            } catch (contactError) {}
          }
          
          if (displayName === participantNumber && participantInfo) {
            if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
              displayName = participantInfo.notify.trim();
            } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
              displayName = participantInfo.name.trim();
            }
          }
          
          let profilePicUrl = '';
          try {
            profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
          } catch (ppError) {
            profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
          }
          
          const groupName = groupMetadata.subject || 'the group';
          const groupDesc = groupMetadata.desc || 'No description';
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          
          const welcomeMsg = `╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @${displayName} 👋\n┃Member count: #${groupMetadata.participants.length}\n┃𝚃𝙸𝙼𝙴: ${timeString}⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@${displayName}* Welcome to *${groupName}*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\n${groupDesc}\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName}*`;
          
          const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?type=join&textcolor=white&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
          
          const imageResponse = await axios.get(apiUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);
          
          await sock.sendMessage(id, { 
            image: imageBuffer,
            caption: welcomeMsg,
            mentions: [participantJid] 
          });
        } catch (welcomeError) {
          let message = groupSettings.welcomeMessage || 'Welcome @user to @group! 👋\nEnjoy your stay!';
          message = message.replace('@user', `@${participantNumber}`);
          message = message.replace('@group', groupMetadata.subject || 'the group');
          
          await sock.sendMessage(id, { 
            text: message, 
            mentions: [participantJid] 
          });
        }
      } else if (action === 'remove' && groupSettings.goodbye) {
        try {
          let displayName = participantNumber;
          
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          let phoneJid = null;
          if (participantInfo && participantInfo.phoneNumber) {
            phoneJid = participantInfo.phoneNumber;
          } else {
            try {
              const normalized = normalizeJidWithLid(participantJid);
              if (normalized && normalized.includes('@s.whatsapp.net')) {
                phoneJid = normalized;
              }
            } catch (e) {
              if (participantJid.includes('@s.whatsapp.net')) {
                phoneJid = participantJid;
              }
            }
          }
          
          if (phoneJid) {
            try {
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
                  displayName = contact.name.trim();
                }
              }
              
              if (displayName === participantNumber) {
                try {
                  await sock.onWhatsApp(phoneJid);
                  if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                    const contact = sock.store.contacts[phoneJid];
                    if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                      displayName = contact.notify.trim();
                    }
                  }
                } catch (fetchError) {}
              }
            } catch (contactError) {}
          }
          
          if (displayName === participantNumber && participantInfo) {
            if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
              displayName = participantInfo.notify.trim();
            } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
              displayName = participantInfo.name.trim();
            }
          }
          
          let profilePicUrl = '';
          try {
            profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
          } catch (ppError) {
            profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
          }
          
          const groupName = groupMetadata.subject || 'the group';
          const goodbyeMsg = `Goodbye @${displayName} 👋 We will never miss you!`;
          
          const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?type=leave&textcolor=white&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
          
          const imageResponse = await axios.get(apiUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);
          
          await sock.sendMessage(id, { 
            image: imageBuffer,
            caption: goodbyeMsg,
            mentions: [participantJid] 
          });
        } catch (goodbyeError) {
          const goodbyeMsg = `Goodbye @${participantNumber} 👋 We will never miss you! 💀`;
          await sock.sendMessage(id, { 
            text: goodbyeMsg, 
            mentions: [participantJid] 
          });
        }
      }
    }
  } catch (error) {
    if (!error.message || !error.message.includes('forbidden')) {
      console.error('Error handling group update:', error);
    }
  }
};

// Antilink handler
const handleAntilink = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antilink) return;
    
    const body = msg.message?.conversation || 
                  msg.message?.extendedTextMessage?.text || 
                  msg.message?.imageMessage?.caption || 
                  msg.message?.videoMessage?.caption || '';
    
    const linkPattern = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;
    
    if (linkPattern.test(body)) {
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = isOwner(sender);
      
      if (senderIsAdmin || senderIsOwner) return;
      
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action = (groupSettings.antilinkAction || 'delete').toLowerCase();
      
      if (action === 'kick' && botIsAdmin) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await sock.sendMessage(from, { 
            text: `🔗 Anti-link triggered. Link removed.`,
            mentions: [sender]
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to kick for antilink:', e);
        }
      } else {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.sendMessage(from, { 
            text: `🔗 Anti-link triggered. Link removed.`,
            mentions: [sender]
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to delete message for antilink:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error in antilink handler:', error);
  }
};

// Anti-group mention handler
const handleAntigroupmention = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antigroupmention) return;
    
    let isForwardedStatus = false;
    
    if (msg.message) {
      isForwardedStatus = isForwardedStatus || !!msg.message.groupStatusMentionMessage;
      isForwardedStatus = isForwardedStatus || (msg.message.protocolMessage && msg.message.protocolMessage.type === 25);
      
      isForwardedStatus = isForwardedStatus || 
        (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo && 
         msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.conversation && msg.message.contextInfo && 
         msg.message.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.imageMessage && msg.message.imageMessage.contextInfo && 
         msg.message.imageMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.videoMessage && msg.message.videoMessage.contextInfo && 
         msg.message.videoMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.contextInfo && msg.message.contextInfo.forwardedNewsletterMessageInfo);
      
      if (msg.message.contextInfo) {
        const ctx = msg.message.contextInfo;
        isForwardedStatus = isForwardedStatus || !!ctx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!ctx.forwardingScore;
        isForwardedStatus = isForwardedStatus || !!ctx.quotedMessageTimestamp;
      }
      
      if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo) {
        const extCtx = msg.message.extendedTextMessage.contextInfo;
        isForwardedStatus = isForwardedStatus || !!extCtx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!extCtx.forwardingScore;
      }
    }
    
    if (isForwardedStatus) {
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = isOwner(sender);
      
      if (senderIsAdmin || senderIsOwner) return;
      
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action = (groupSettings.antigroupmentionAction || 'delete').toLowerCase();
      
      if (action === 'kick' && botIsAdmin) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
        } catch (e) {
          console.error('Failed to kick for antigroupmention:', e);
        }
      } else {
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (e) {
          console.error('Failed to delete message for antigroupmention:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error in antigroupmention handler:', error);
  }
};

// Anti-call feature initializer
const initializeAntiCall = (sock) => {
  sock.ev.on('call', async (calls) => {
    try {
      delete require.cache[require.resolve('./config')];
      const config = require('./config');
      
      if (!config.defaultGroupSettings.anticall) return;

      for (const call of calls) {
        if (call.status === 'offer') {
          await sock.rejectCall(call.id, call.from);
          await sock.updateBlockStatus(call.from, 'block');
          await sock.sendMessage(call.from, {
            text: '🚫 Calls are not allowed. You have been blocked.'
          });
        }
      }
    } catch (err) {
      console.error('[ANTICALL ERROR]', err);
    }
  });
};

module.exports = {
  handleMessage,
  handleGroupUpdate,
  handleAntilink,
  handleAntigroupmention,
  initializeAntiCall,
  isOwner,
  isAdmin,
  isBotAdmin,
  isMod,
  getGroupMetadata,
  findParticipant
};
