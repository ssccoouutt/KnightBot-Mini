/**
 * Anti-ViewOnce Command - Automatically capture and forward view-once messages
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');

// Paths
const DATA_DIR = path.join(__dirname, '../../database');
const CONFIG_PATH = path.join(DATA_DIR, 'antivv.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../../temp/antivv');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

// Get owner number safely
function getOwnerNumber() {
    if (config.ownerNumber && Array.isArray(config.ownerNumber) && config.ownerNumber.length > 0) {
        return config.ownerNumber[0] + '@s.whatsapp.net';
    }
    return '923401809397@s.whatsapp.net';
}

// Load config
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: true };
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { enabled: true };
    }
}

// Save config
function saveConfig(data) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[ANTIVV] Config save error:', err);
    }
}

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
        }
    } catch (err) {
        console.error('[ANTIVV] Send error:', err);
    }
}

// Capture view-once messages
async function captureViewOnce(sock, message) {
    try {
        const cfg = loadConfig();
        if (!cfg.enabled) return;

        const quotedMsg = message.message;
        if (!quotedMsg) return;
        
        // Check for view-once (same logic as viewonce.js)
        const hasViewOnce =
            !!quotedMsg?.viewOnceMessageV2 ||
            !!quotedMsg?.viewOnceMessageV2Extension ||
            !!quotedMsg?.viewOnceMessage ||
            !!quotedMsg?.viewOnce ||
            !!quotedMsg?.imageMessage?.viewOnce ||
            !!quotedMsg?.videoMessage?.viewOnce ||
            !!quotedMsg?.audioMessage?.viewOnce;

        if (!hasViewOnce) return;

        console.log('[ANTIVV] View-once message detected');

        let actualMsg = null;
        let mtype = null;

        // Extract actual message (exactly like viewonce.js)
        if (quotedMsg.viewOnceMessageV2Extension?.message) {
            actualMsg = quotedMsg.viewOnceMessageV2Extension.message;
            mtype = Object.keys(actualMsg)[0];
        } else if (quotedMsg.viewOnceMessageV2?.message) {
            actualMsg = quotedMsg.viewOnceMessageV2.message;
            mtype = Object.keys(actualMsg)[0];
        } else if (quotedMsg.viewOnceMessage?.message) {
            actualMsg = quotedMsg.viewOnceMessage.message;
            mtype = Object.keys(actualMsg)[0];
        } else if (quotedMsg.imageMessage?.viewOnce) {
            actualMsg = { imageMessage: quotedMsg.imageMessage };
            mtype = 'imageMessage';
        } else if (quotedMsg.videoMessage?.viewOnce) {
            actualMsg = { videoMessage: quotedMsg.videoMessage };
            mtype = 'videoMessage';
        } else if (quotedMsg.audioMessage?.viewOnce) {
            actualMsg = { audioMessage: quotedMsg.audioMessage };
            mtype = 'audioMessage';
        }

        if (!actualMsg || !mtype) return;

        const sender = message.key.participant || message.key.remoteJid;
        const senderName = sender ? sender.split('@')[0] : 'Unknown';
        const mediaCaption = actualMsg[mtype]?.caption || '';
        const downloadType = mtype === 'imageMessage' ? 'image' : (mtype === 'videoMessage' ? 'video' : 'audio');

        // Download the media
        const stream = await downloadContentFromMessage(actualMsg[mtype], downloadType);
        const buffer = [];
        for await (const chunk of stream) buffer.push(chunk);
        const mediaBuffer = Buffer.concat(buffer);

        // Forward to owner immediately
        const caption = `🔰 *VIEW-ONCE CAPTURED*\n\n` +
                      `👤 From: @${senderName}\n` +
                      `📱 ${sender}\n` +
                      `🕒 ${new Date().toLocaleString()}\n` +
                      `${mediaCaption ? `\n📝 ${mediaCaption}` : ''}`;

        if (mtype === 'imageMessage') {
            await sendToOwner(sock, mediaBuffer, 'image', { caption, mentions: [sender] });
        } else if (mtype === 'videoMessage') {
            await sendToOwner(sock, mediaBuffer, 'video', { caption, mentions: [sender] });
        }

        console.log('[ANTIVV] View-once captured and forwarded');

    } catch (err) {
        console.error('[ANTIVV] Capture error:', err);
    }
}

// Command Handler
module.exports = {
    name: 'antivv',
    aliases: ['avv', 'antiviewonce'],
    category: 'admin',
    description: 'Automatically capture and forward view-once messages',
    usage: '.antivv\n.antivv on\n.antivv off',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { reply, react } = context;
        const action = args[0]?.toLowerCase();
        const cfg = loadConfig();
        
        if (!action) {
            return reply(`🔰 *ANTI-VIEWONCE*\n\nStatus: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n\n.antivv on - Enable\n.antivv off - Disable`);
        }
        
        if (action === 'on') {
            cfg.enabled = true;
            saveConfig(cfg);
            await react('✅');
            return reply(`✅ Anti-ViewOnce ENABLED - View-once messages will be captured`);
        }
        
        if (action === 'off') {
            cfg.enabled = false;
            saveConfig(cfg);
            await react('❌');
            return reply(`❌ Anti-ViewOnce DISABLED`);
        }
        
        return reply(`❌ Invalid. Use .antivv on/off`);
    }
};

// Export for handler
module.exports.captureViewOnce = captureViewOnce;