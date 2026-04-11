/**
 * Anti-Delete Command - Catch and report deleted messages
 * Stores messages and sends deleted content to owner
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

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
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, groups: {} };
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { enabled: false, groups: {} };
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
        const sender = message.key.participant || message.key.remoteJid;
        const isGroup = message.key.remoteJid.endsWith('@g.us');

        // Check if group has antidelete enabled
        if (isGroup && antiDeleteConfig.groups && antiDeleteConfig.groups[message.key.remoteJid] === false) {
            return;
        }

        // Unwrap view-once messages
        const viewOnceContainer = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;
        if (viewOnceContainer) {
            if (viewOnceContainer.imageMessage) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            } else if (viewOnceContainer.videoMessage) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            }
        } 
        // Regular messages
        else if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
            const mime = message.message.audioMessage.mimetype || '';
            const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
            const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
            await writeFile(mediaPath, buffer);
        }

        // Store message data
        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: isGroup ? message.key.remoteJid : null,
            timestamp: Date.now()
        });

        // Anti-ViewOnce: forward immediately to owner
        if (isViewOnce && mediaType && fs.existsSync(mediaPath)) {
            try {
                const ownerNumber = config.ownerNumber[0] + '@s.whatsapp.net';
                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `*🔰 ANTI-VIEWONCE*\n\n👤 From: @${senderName}\n📱 ${sender}`,
                    mentions: [sender]
                };
                
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerNumber, { image: fs.readFileSync(mediaPath), ...mediaOptions });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(ownerNumber, { video: fs.readFileSync(mediaPath), ...mediaOptions });
                }
                
                fs.unlinkSync(mediaPath);
            } catch (e) {
                console.error('[ANTIDELETE] ViewOnce forward error:', e);
            }
        }

        // Auto-cleanup old messages (older than 10 minutes)
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

        if (original.content) {
            report += `\n*💬 Deleted Message:*\n${original.content}\n`;
        }

        // Send report
        await sock.sendMessage(ownerNumber, {
            text: report,
            mentions: [deletedBy, sender]
        });

        // Send media if exists
        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaCaption = `*Deleted ${original.mediaType}*\nFrom: @${senderName}`;
            
            try {
                const mediaBuffer = fs.readFileSync(original.mediaPath);
                
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerNumber, {
                            image: mediaBuffer,
                            caption: mediaCaption,
                            mentions: [sender]
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerNumber, {
                            sticker: mediaBuffer
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerNumber, {
                            video: mediaBuffer,
                            caption: mediaCaption,
                            mentions: [sender]
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(ownerNumber, {
                            audio: mediaBuffer,
                            mimetype: 'audio/mpeg',
                            ptt: false
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(ownerNumber, {
                    text: `⚠️ Error sending media: ${err.message}`
                });
            }
            
            // Cleanup
            fs.unlinkSync(original.mediaPath);
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
    description: 'Catch and report deleted messages',
    usage: '.antidelete\n.antidelete on\n.antidelete off',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const action = args[0]?.toLowerCase();
        const antiDeleteConfig = loadAntideleteConfig();
        
        if (!action) {
            const statusMsg = `🔰 *ANTIDELETE SYSTEM*\n\n` +
                            `📊 *Status:* ${antiDeleteConfig.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                            `📁 *Stored Messages:* ${messageStore.size}\n` +
                            `💾 *Temp Folder Size:* ${getFolderSizeInMB(TEMP_MEDIA_DIR).toFixed(2)} MB\n\n` +
                            `*Commands:*\n` +
                            `• \`.antidelete on\` - Enable system\n` +
                            `• \`.antidelete off\` - Disable system\n\n` +
                            `> *When enabled, all deleted messages will be forwarded to owner*`;
            
            return reply(statusMsg);
        }
        
        if (action === 'on') {
            antiDeleteConfig.enabled = true;
            saveAntideleteConfig(antiDeleteConfig);
            await react('✅');
            return reply(`✅ *Antidelete System ENABLED*\n\nAll deleted messages will now be forwarded to owner.`);
        }
        
        if (action === 'off') {
            antiDeleteConfig.enabled = false;
            saveAntideleteConfig(antiDeleteConfig);
            await react('❌');
            return reply(`❌ *Antidelete System DISABLED*\n\nNo longer tracking deleted messages.`);
        }
        
        return reply(`❌ Invalid option. Use: \`.antidelete on\` or \`.antidelete off\``);
    }
};

// Export helper functions for handler.js
module.exports.storeMessage = storeMessage;
module.exports.handleMessageRevocation = handleMessageRevocation;