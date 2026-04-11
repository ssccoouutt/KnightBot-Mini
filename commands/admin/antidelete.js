/**
 * Anti-Delete Command - Catch and report deleted messages
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

// Message store
const messageStore = new Map();

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

// Get owner number safely
function getOwnerNumber() {
    if (config.ownerNumber && Array.isArray(config.ownerNumber) && config.ownerNumber.length > 0) {
        return config.ownerNumber[0] + '@s.whatsapp.net';
    }
    // Fallback - you should replace this with your actual number
    return '923401809397@s.whatsapp.net';
}

// Load config
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { enabled: false };
    }
}

// Save config
function saveConfig(data) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[ANTIDELETE] Config save error:', err);
    }
}

// Get folder size
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

// Clean temp folder
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

setInterval(cleanTempFolderIfLarge, 60 * 1000);

// Send to owner
async function sendToOwner(sock, content, type, options = {}) {
    try {
        const ownerNumber = getOwnerNumber();
        if (type === 'text') {
            await sock.sendMessage(ownerNumber, { text: content });
        } else if (type === 'image') {
            await sock.sendMessage(ownerNumber, { image: content, ...options });
        } else if (type === 'video') {
            await sock.sendMessage(ownerNumber, { video: content, ...options });
        } else if (type === 'sticker') {
            await sock.sendMessage(ownerNumber, { sticker: content, ...options });
        }
    } catch (err) {
        console.error('[ANTIDELETE] Send error:', err);
    }
}

// Store incoming messages
async function storeMessage(sock, message) {
    try {
        const cfg = loadConfig();
        if (!cfg.enabled) return;
        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        const sender = message.key.participant || message.key.remoteJid;
        const isGroup = message.key.remoteJid.endsWith('@g.us');

        // Text message
        if (message.message?.conversation) {
            content = message.message.conversation;
            mediaType = 'text';
        } 
        else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
            mediaType = 'text';
        } 
        else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
                const buffer = [];
                for await (const chunk of stream) buffer.push(chunk);
                const imageBuffer = Buffer.concat(buffer);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, imageBuffer);
            } catch (err) {}
        } 
        else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(message.message.videoMessage, 'video');
                const buffer = [];
                for await (const chunk of stream) buffer.push(chunk);
                const videoBuffer = Buffer.concat(buffer);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, videoBuffer);
            } catch (err) {}
        }

        if (content || mediaPath) {
            messageStore.set(messageId, {
                content, mediaType, mediaPath, sender,
                group: isGroup ? message.key.remoteJid : null,
                timestamp: Date.now()
            });
        }

        // Auto-cleanup after 10 minutes
        setTimeout(() => {
            if (messageStore.has(messageId)) {
                const stored = messageStore.get(messageId);
                if (stored.mediaPath && fs.existsSync(stored.mediaPath)) fs.unlinkSync(stored.mediaPath);
                messageStore.delete(messageId);
            }
        }, 10 * 60 * 1000);

    } catch (err) {
        console.error('[ANTIDELETE] Store error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const cfg = loadConfig();
        if (!cfg.enabled) return;

        // Safely extract message ID
        const messageId = revocationMessage.message?.protocolMessage?.key?.id;
        if (!messageId) return;

        const deletedBy = revocationMessage.participant || revocationMessage.key?.participant || revocationMessage.key?.remoteJid;
        if (!deletedBy) return;

        const ownerNumber = getOwnerNumber();

        // Don't report if bot or owner deleted
        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const senderName = original.sender.split('@')[0];
        const deletedByName = deletedBy.split('@')[0];
        
        let groupName = '';
        if (original.group) {
            try {
                const metadata = await sock.groupMetadata(original.group);
                groupName = metadata.subject;
            } catch (e) {}
        }

        const time = new Date(original.timestamp).toLocaleString();

        let report = `🔰 *DELETED MESSAGE*\n\n` +
                    `🗑️ Deleted By: @${deletedByName}\n` +
                    `👤 Sender: @${senderName}\n` +
                    `🕒 Time: ${time}\n`;

        if (groupName) report += `👥 Group: ${groupName}\n`;

        if (original.content) {
            report += `\n💬 Message:\n${original.content}\n`;
        }

        await sendToOwner(sock, report, 'text');

        if (original.mediaPath && fs.existsSync(original.mediaPath)) {
            const mediaBuffer = fs.readFileSync(original.mediaPath);
            const caption = `*Deleted ${original.mediaType}*\nFrom: @${senderName}`;
            
            if (original.mediaType === 'image') {
                await sendToOwner(sock, mediaBuffer, 'image', { caption, mentions: [original.sender] });
            } else if (original.mediaType === 'video') {
                await sendToOwner(sock, mediaBuffer, 'video', { caption, mentions: [original.sender] });
            }
            
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
    aliases: ['ad'],
    category: 'admin',
    description: 'Track and report deleted messages',
    usage: '.antidelete\n.antidelete on\n.antidelete off',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { reply, react } = context;
        const action = args[0]?.toLowerCase();
        const cfg = loadConfig();
        
        if (!action) {
            return reply(`🔰 *ANTIDELETE*\n\nStatus: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n\n.antidelete on - Enable\n.antidelete off - Disable`);
        }
        
        if (action === 'on') {
            cfg.enabled = true;
            saveConfig(cfg);
            await react('✅');
            return reply(`✅ Antidelete ENABLED - Deleted messages will be forwarded`);
        }
        
        if (action === 'off') {
            cfg.enabled = false;
            saveConfig(cfg);
            await react('❌');
            return reply(`❌ Antidelete DISABLED`);
        }
        
        return reply(`❌ Invalid. Use .antidelete on/off`);
    }
};

// Exports for handler
module.exports.storeMessage = storeMessage;
module.exports.handleMessageRevocation = handleMessageRevocation;