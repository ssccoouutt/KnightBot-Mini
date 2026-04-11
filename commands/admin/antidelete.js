/**
 * Anti-Delete Command - Catch and report deleted messages
 * Stores messages and sends deleted content to owner
 * Also captures and forwards view-once messages
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const config = require('../../config');

// Paths
const DATA_DIR = path.join(__dirname, '../../database');
const CONFIG_PATH = path.join(DATA_DIR, 'antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../../temp/antidelete');

// Message store (in-memory cache)
const messageStore = new Map();

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, viewOnceForward: true };
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { enabled: false, viewOnceForward: true };
    }
}

// Save config
function saveAntideleteConfig(data) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[ANTIDELETE] Config save error:', err);
    }
}

// Get folder size in MB
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }
        return totalSize / (1024 * 1024);
    } catch (err) {
        return 0;
    }
};

// Clean temp folder if size exceeds 200MB
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                fs.unlinkSync(path.join(TEMP_MEDIA_DIR, file));
            }
            console.log('[ANTIDELETE] Temp folder cleaned');
        }
    } catch (err) {
        console.error('[ANTIDELETE] Temp cleanup error:', err);
    }
};

// Periodic cleanup every minute
setInterval(cleanTempFolderIfLarge, 60 * 1000);

// Send message to owner
async function sendToOwner(sock, content, type, options = {}) {
    try {
        const ownerNumber = config.ownerNumber[0] + '@s.whatsapp.net';
        
        if (type === 'text') {
            await sock.sendMessage(ownerNumber, { text: content });
        } else if (type === 'image') {
            await sock.sendMessage(ownerNumber, { image: content, ...options });
        } else if (type === 'video') {
            await sock.sendMessage(ownerNumber, { video: content, ...options });
        } else if (type === 'sticker') {
            await sock.sendMessage(ownerNumber, { sticker: content, ...options });
        } else if (type === 'audio') {
            await sock.sendMessage(ownerNumber, { audio: content, ...options });
        }
    } catch (err) {
        console.error('[ANTIDELETE] Send to owner error:', err);
    }
}

// Store incoming messages
async function storeMessage(sock, message) {
    try {
        const antiDeleteConfig = loadAntideleteConfig();
        if (!antiDeleteConfig.enabled) return;

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let isViewOnce = false;
        let viewOnceMedia = null;
        const sender = message.key.participant || message.key.remoteJid;
        const isGroup = message.key.remoteJid.endsWith('@g.us');
        const ownerNumber = config.ownerNumber[0] + '@s.whatsapp.net';
        const senderName = sender.split('@')[0];

        // Check if group has antidelete enabled
        if (isGroup && antiDeleteConfig.groups && antiDeleteConfig.groups[message.key.remoteJid] === false) {
            return;
        }

        // ===== HANDLE VIEW-ONCE MESSAGES =====
        // Check for view-once message (V2 format - newer WhatsApp)
        const viewOnceMessageV2 = message.message?.viewOnceMessageV2?.message;
        const viewOnceMessageV1 = message.message?.viewOnceMessage?.message;
        const viewOnceContainer = viewOnceMessageV2 || viewOnceMessageV1;
        
        if (viewOnceContainer) {
            console.log(`[ANTIDELETE] View-once message detected from ${sender}`);
            isViewOnce = true;
            
            // Check for image in view-once
            if (viewOnceContainer.imageMessage) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                
                try {
                    const stream = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    const imageBuffer = Buffer.concat(buffer);
                    mediaPath = path.join(TEMP_MEDIA_DIR, `viewonce_${messageId}.jpg`);
                    await writeFile(mediaPath, imageBuffer);
                    
                    // FORWARD VIEW-ONCE IMAGE IMMEDIATELY TO OWNER
                    const caption = `*🔰 ANTI-VIEWONCE CAPTURED*\n\n` +
                                  `👤 *From:* @${senderName}\n` +
                                  `📱 *Number:* ${sender}\n` +
                                  `🕒 *Time:* ${new Date().toLocaleString()}\n` +
                                  `${content ? `\n📝 *Caption:* ${content}` : ''}\n\n` +
                                  `> *This is a view-once message that was captured*`;
                    
                    await sendToOwner(sock, imageBuffer, 'image', {
                        caption: caption,
                        mentions: [sender]
                    });
                    
                    console.log(`[ANTIDELETE] View-once image forwarded to owner`);
                } catch (err) {
                    console.error('[ANTIDELETE] View-once image download error:', err);
                }
            }
            // Check for video in view-once
            else if (viewOnceContainer.videoMessage) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                
                try {
                    const stream = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    const videoBuffer = Buffer.concat(buffer);
                    mediaPath = path.join(TEMP_MEDIA_DIR, `viewonce_${messageId}.mp4`);
                    await writeFile(mediaPath, videoBuffer);
                    
                    // FORWARD VIEW-ONCE VIDEO IMMEDIATELY TO OWNER
                    const caption = `*🔰 ANTI-VIEWONCE CAPTURED*\n\n` +
                                  `👤 *From:* @${senderName}\n` +
                                  `📱 *Number:* ${sender}\n` +
                                  `🕒 *Time:* ${new Date().toLocaleString()}\n` +
                                  `${content ? `\n📝 *Caption:* ${content}` : ''}\n\n` +
                                  `> *This is a view-once message that was captured*`;
                    
                    await sendToOwner(sock, videoBuffer, 'video', {
                        caption: caption,
                        mentions: [sender]
                    });
                    
                    console.log(`[ANTIDELETE] View-once video forwarded to owner`);
                } catch (err) {
                    console.error('[ANTIDELETE] View-once video download error:', err);
                }
            }
            
            // Store view-once message info
            messageStore.set(messageId, {
                content,
                mediaType,
                mediaPath,
                sender,
                group: isGroup ? message.key.remoteJid : null,
                timestamp: Date.now(),
                isViewOnce: true,
                forwarded: true
            });
            
            // Auto-cleanup after 5 minutes for view-once
            setTimeout(() => {
                if (messageStore.has(messageId)) {
                    const stored = messageStore.get(messageId);
                    if (stored.mediaPath && fs.existsSync(stored.mediaPath)) {
                        fs.unlinkSync(stored.mediaPath);
                    }
                    messageStore.delete(messageId);
                }
            }, 5 * 60 * 1000);
            
            return; // Don't store as regular message since already handled
        }
        
        // ===== HANDLE REGULAR MESSAGES =====
        // Text message
        if (message.message?.conversation) {
            content = message.message.conversation;
            mediaType = 'text';
        } 
        // Extended text message
        else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
            mediaType = 'text';
        } 
        // Image message
        else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
                const buffer = [];
                for await (const chunk of stream) {
                    buffer.push(chunk);
                }
                const imageBuffer = Buffer.concat(buffer);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, imageBuffer);
            } catch (err) {
                console.error('[ANTIDELETE] Image download error:', err);
            }
        } 
        // Sticker message
        else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            try {
                const stream = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                const buffer = [];
                for await (const chunk of stream) {
                    buffer.push(chunk);
                }
                const stickerBuffer = Buffer.concat(buffer);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                await writeFile(mediaPath, stickerBuffer);
            } catch (err) {
                console.error('[ANTIDELETE] Sticker download error:', err);
            }
        } 
        // Video message
        else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(message.message.videoMessage, 'video');
                const buffer = [];
                for await (const chunk of stream) {
                    buffer.push(chunk);
                }
                const videoBuffer = Buffer.concat(buffer);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, videoBuffer);
            } catch (err) {
                console.error('[ANTIDELETE] Video download error:', err);
            }
        } 
        // Audio message
        else if (message.message?.audioMessage) {
            mediaType = 'audio';
            try {
                const stream = await downloadContentFromMessage(message.message.audioMessage, 'audio');
                const buffer = [];
                for await (const chunk of stream) {
                    buffer.push(chunk);
                }
                const audioBuffer = Buffer.concat(buffer);
                const mime = message.message.audioMessage.mimetype || '';
                const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                await writeFile(mediaPath, audioBuffer);
            } catch (err) {
                console.error('[ANTIDELETE] Audio download error:', err);
            }
        }

        // Store regular message data
        if (content || mediaPath) {
            messageStore.set(messageId, {
                content,
                mediaType,
                mediaPath,
                sender,
                group: isGroup ? message.key.remoteJid : null,
                timestamp: Date.now(),
                isViewOnce: false
            });
        }

        // Auto-cleanup after 10 minutes for regular messages
        setTimeout(() => {
            if (messageStore.has(messageId)) {
                const stored = messageStore.get(messageId);
                if (stored.mediaPath && fs.existsSync(stored.mediaPath)) {
                    fs.unlinkSync(stored.mediaPath);
                }
                messageStore.delete(messageId);
            }
        }, 10 * 60 * 1000);

    } catch (err) {
        console.error('[ANTIDELETE] Store error:', err);
    }
}

// Handle message deletion/revocation
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const antiDeleteConfig = loadAntideleteConfig();
        if (!antiDeleteConfig.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        const ownerNumber = config.ownerNumber[0] + '@s.whatsapp.net';

        // Don't report if bot or owner deleted
        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        // Don't report view-once messages (already forwarded)
        if (original.isViewOnce) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const deletedByName = deletedBy.split('@')[0];
        
        let groupName = '';
        if (original.group) {
            try {
                const metadata = await sock.groupMetadata(original.group);
                groupName = metadata.subject;
            } catch (e) {}
        }

        const time = new Date(original.timestamp).toLocaleString('en-US', {
            timeZone: config.timezone || 'Asia/Kolkata',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let report = `*🔰 ANTIDELETE REPORT*\n\n` +
                    `*🗑️ Deleted By:* @${deletedByName}\n` +
                    `*👤 Sender:* @${senderName}\n` +
                    `*📱 Number:* ${sender}\n` +
                    `*🕒 Time:* ${time}\n`;

        if (groupName) report += `*👥 Group:* ${groupName}\n`;

        if (original.content && original.mediaType === 'text') {
            report += `\n*💬 Deleted Message:*\n${original.content}\n`;
        }

        // Send report
        await sendToOwner(sock, report, 'text');

        // Send media if exists
        if (original.mediaPath && fs.existsSync(original.mediaPath)) {
            const mediaCaption = `*Deleted ${original.mediaType}*\nFrom: @${senderName}`;
            const mediaBuffer = fs.readFileSync(original.mediaPath);
            
            try {
                switch (original.mediaType) {
                    case 'image':
                        await sendToOwner(sock, mediaBuffer, 'image', { caption: mediaCaption, mentions: [sender] });
                        break;
                    case 'sticker':
                        await sendToOwner(sock, mediaBuffer, 'sticker');
                        break;
                    case 'video':
                        await sendToOwner(sock, mediaBuffer, 'video', { caption: mediaCaption, mentions: [sender] });
                        break;
                    case 'audio':
                        await sendToOwner(sock, mediaBuffer, 'audio', { mimetype: 'audio/mpeg', ptt: false });
                        break;
                }
            } catch (err) {
                console.error('[ANTIDELETE] Media send error:', err);
            }
            
            // Cleanup
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {}
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('[ANTIDELETE] Revocation error:', err);
    }
}

// Command Handler
module.exports = {
    name: 'antidelete',
    aliases: ['anti-delete', 'ad'],
    category: 'admin',
    description: 'Catch and report deleted messages and view-once messages',
    usage: '.antidelete\n.antidelete on\n.antidelete off',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const action = args[0]?.toLowerCase();
        const antiDeleteConfig = loadAntideleteConfig();
        
        if (!action) {
            const statusMsg = `🔰 *ANTIDELETE SYSTEM*\n\n` +
                            `📊 *Status:* ${antiDeleteConfig.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                            `👁️ *ViewOnce Capture:* ${antiDeleteConfig.viewOnceForward !== false ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                            `📁 *Stored Messages:* ${messageStore.size}\n` +
                            `💾 *Temp Folder Size:* ${getFolderSizeInMB(TEMP_MEDIA_DIR).toFixed(2)} MB\n\n` +
                            `*Commands:*\n` +
                            `• \`.antidelete on\` - Enable system\n` +
                            `• \`.antidelete off\` - Disable system\n\n` +
                            `> *When enabled:*\n` +
                            `> • All deleted messages will be forwarded to owner\n` +
                            `> • All view-once messages will be captured and forwarded`;
            
            return reply(statusMsg);
        }
        
        if (action === 'on') {
            antiDeleteConfig.enabled = true;
            antiDeleteConfig.viewOnceForward = true;
            saveAntideleteConfig(antiDeleteConfig);
            await react('✅');
            return reply(`✅ *Antidelete System ENABLED*\n\n• All deleted messages will be forwarded to owner\n• All view-once messages will be captured and forwarded`);
        }
        
        if (action === 'off') {
            antiDeleteConfig.enabled = false;
            saveAntideleteConfig(antiDeleteConfig);
            await react('❌');
            return reply(`❌ *Antidelete System DISABLED*\n\nNo longer tracking deleted messages or view-once messages.`);
        }
        
        return reply(`❌ Invalid option. Use: \`.antidelete on\` or \`.antidelete off\``);
    }
};

// Export helper functions for handler.js
module.exports.storeMessage = storeMessage;
module.exports.handleMessageRevocation = handleMessageRevocation;