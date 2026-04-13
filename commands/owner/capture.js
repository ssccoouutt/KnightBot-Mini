/**
 * Capture Command - Automatically capture WhatsApp group links from all messages
 * Runs as a background service - Settings from config.js
 * Auto-joins groups and sends welcome message to open chat groups
 * Automatically updates bulk join report files
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const config = require('../../config');

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const CAPTURE_FILE_ID = "1a2CMxij0K7ZcvZEsxCEKNwvDW5hHSGqH";
const CAPTURE_FILE_NAME = "captured_links.txt";

// Bulk Join Report Files to check against and update
const BULK_JOIN_FOLDER_ID = "11XKmEGAfN5QrygCxy4p2wNRo0iK_tSD8";
const BULK_JOIN_FILES = {
    FAILED: "failed_links.txt",
    ANNOUNCEMENT_ONLY: "announcement_only.txt",
    OPEN_CHAT: "open_chat.txt",
    UNKNOWN: "unknown.txt",
    COMBINED_OPEN_UNKNOWN: "combined_open_unknown.txt",
    COMBINED_ALL_EXCEPT_FAILED: "combined_all_except_failed.txt"
};

// Thumbnail URL for previews
const THUMBNAIL_URL = "https://drive.usercontent.google.com/download?id=1V1h-ncE4v12Bkvkz4yBd4_k13RffEABC&export=download&confirm=t";

// Welcome message for open chat groups
const WELCOME_MESSAGE = `https://chat.whatsapp.com/EznCdo0Bq8dF1iG9Rtx5C3

♡𝘠𝘰𝘶 𝘞𝘪𝘭𝘭 𝘍𝘪𝘯𝘥 𝘖𝘶𝘵 𝘈𝘭𝘭 𝘛𝘦𝘤𝘩 𝘙𝘦𝘭𝘢𝘵𝘦𝘥 𝘊𝘰𝘯𝘵𝘦𝘯𝘵 𝘏𝘦𝘳𝘦♡

● Free Internet Tricks
● Premium MOD Apps
● Free Online Courses
● Free TV Apps
● All Tech Tricks
● All Mobile Tricks
● Earning Tricks
● Binance Offers
● Fake Whatsapp Tricks

*Our WhatsApp Channel:*
https://whatsapp.com/channel/0029VacnMpyHrDZldKwMod38`;

// State - Read from config.js
let captureEnabled = config.captureEnabled !== undefined ? config.captureEnabled : true;
let autoJoinEnabled = config.autoJoinEnabled !== undefined ? config.autoJoinEnabled : true;
let autoMessageEnabled = config.autoMessageEnabled !== undefined ? config.autoMessageEnabled : true;
let cachedLinks = new Set();
let bulkJoinLinksCache = new Set();
let cacheLoaded = false;
let bulkJoinCacheLoaded = false;
let cachedAuth = null;
let tokenExpiry = null;
let isProcessing = false;

// Config file path for persistence (to save runtime changes)
const CONFIG_PATH = path.join(__dirname, '../../database/capture_config.json');
const DATA_DIR = path.join(__dirname, '../../database');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load capture config (for runtime changes via commands)
function loadCaptureConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            // Runtime settings override config.js, but config.js provides defaults
            captureEnabled = data.enabled !== undefined ? data.enabled : (config.captureEnabled !== undefined ? config.captureEnabled : true);
            autoJoinEnabled = data.autoJoin !== undefined ? data.autoJoin : (config.autoJoinEnabled !== undefined ? config.autoJoinEnabled : true);
            autoMessageEnabled = data.autoMessage !== undefined ? data.autoMessage : (config.autoMessageEnabled !== undefined ? config.autoMessageEnabled : true);
        } else {
            // Use values from config.js
            captureEnabled = config.captureEnabled !== undefined ? config.captureEnabled : true;
            autoJoinEnabled = config.autoJoinEnabled !== undefined ? config.autoJoinEnabled : true;
            autoMessageEnabled = config.autoMessageEnabled !== undefined ? config.autoMessageEnabled : true;
            saveCaptureConfig();
        }
        console.log(`[CAPTURE] Config - Capture: ${captureEnabled ? 'ON' : 'OFF'}, Auto-Join: ${autoJoinEnabled ? 'ON' : 'OFF'}, Auto-Message: ${autoMessageEnabled ? 'ON' : 'OFF'}`);
    } catch (error) {
        console.error('[CAPTURE] Config error:', error.message);
        // Fallback to config.js values
        captureEnabled = config.captureEnabled !== undefined ? config.captureEnabled : true;
        autoJoinEnabled = config.autoJoinEnabled !== undefined ? config.autoJoinEnabled : true;
        autoMessageEnabled = config.autoMessageEnabled !== undefined ? config.autoMessageEnabled : true;
    }
}

function saveCaptureConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ 
            enabled: captureEnabled, 
            autoJoin: autoJoinEnabled, 
            autoMessage: autoMessageEnabled 
        }, null, 2));
    } catch (error) {
        console.error('[CAPTURE] Save error:', error.message);
    }
}

// Google Drive Auth
async function getDriveAuth() {
    if (cachedAuth && tokenExpiry && new Date() < tokenExpiry) return cachedAuth;
    
    try {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        const tokenFilename = path.join(tempDir, `token_${Date.now()}.json`);
        const tokenWriter = fs.createWriteStream(tokenFilename);
        tokenResponse.data.pipe(tokenWriter);
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        
        const tokenData = JSON.parse(fs.readFileSync(tokenFilename, 'utf8'));
        fs.unlinkSync(tokenFilename);
        
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            const refreshData = {
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
            tokenData.token = refreshResponse.data.access_token;
            tokenData.expiry = new Date(Date.now() + 3600 * 1000).toISOString();
        }
        
        tokenExpiry = new Date(tokenData.expiry);
        cachedAuth = { Authorization: `Bearer ${tokenData.token}` };
        return cachedAuth;
    } catch (error) {
        console.error('[CAPTURE] Auth error:', error.message);
        return null;
    }
}

// Ensure file exists in Drive
async function ensureDriveFileExists(folderId, filename) {
    try {
        const auth = await getDriveAuth();
        if (!auth) return;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name='${filename}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        if (files.length === 0) {
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const tempFile = path.join(tempDir, filename);
            fs.writeFileSync(tempFile, '');
            
            const requestBody = { name: filename, parents: [folderId], mimeType: 'text/plain' };
            const media = { mimeType: 'text/plain', body: fs.createReadStream(tempFile) };
            await drive.files.create({ requestBody, media });
            fs.unlinkSync(tempFile);
        }
    } catch (error) {
        console.error(`[CAPTURE] Ensure file error:`, error.message);
    }
}

// Append link to Drive file
async function appendLinkToDriveFile(folderId, filename, link) {
    try {
        const auth = await getDriveAuth();
        if (!auth) return false;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name='${filename}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        if (files.length === 0) return false;
        
        const fileId = files[0].id;
        const contentResponse = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
        let existingContent = contentResponse.data;
        
        if (existingContent.includes(link + '\n') || existingContent.includes(link)) return false;
        
        let newContent = existingContent;
        if (newContent && !newContent.endsWith('\n')) newContent += '\n';
        newContent += link + '\n';
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, filename);
        fs.writeFileSync(tempFile, newContent);
        
        const media = { mimeType: 'text/plain', body: fs.createReadStream(tempFile) };
        await drive.files.update({ fileId, media });
        fs.unlinkSync(tempFile);
        return true;
    } catch (error) {
        console.error(`[CAPTURE] Append error:`, error.message);
        return false;
    }
}

// Load bulk join links cache
async function loadBulkJoinLinks() {
    if (bulkJoinCacheLoaded) return bulkJoinLinksCache;
    
    try {
        const auth = await getDriveAuth();
        if (!auth) return bulkJoinLinksCache;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        
        for (const [key, fileName] of Object.entries(BULK_JOIN_FILES)) {
            try {
                const response = await drive.files.list({
                    q: `'${BULK_JOIN_FOLDER_ID}' in parents and name='${fileName}'`,
                    fields: 'files(id,name)'
                });
                
                const files = response.data.files || [];
                if (files.length > 0) {
                    const contentResponse = await drive.files.get({ fileId: files[0].id, alt: 'media' }, { responseType: 'text' });
                    const lines = contentResponse.data.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed) bulkJoinLinksCache.add(trimmed);
                    }
                }
            } catch (e) {}
        }
        
        bulkJoinCacheLoaded = true;
        console.log(`[CAPTURE] Loaded ${bulkJoinLinksCache.size} existing links from bulk join files`);
    } catch (error) {
        console.error('[CAPTURE] Bulk join load error:', error.message);
        bulkJoinCacheLoaded = true;
    }
    return bulkJoinLinksCache;
}

// Load capture file links
async function loadExistingLinks() {
    if (cacheLoaded) return cachedLinks;
    
    try {
        const auth = await getDriveAuth();
        if (!auth) return cachedLinks;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        
        try {
            const response = await drive.files.get({ fileId: CAPTURE_FILE_ID, alt: 'media' }, { responseType: 'text' });
            const lines = response.data.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) cachedLinks.add(trimmed);
            }
        } catch (e) {}
        
        cacheLoaded = true;
        console.log(`[CAPTURE] Loaded ${cachedLinks.size} links from capture file`);
    } catch (error) {
        console.error('[CAPTURE] Load error:', error.message);
        cacheLoaded = true;
    }
    return cachedLinks;
}

// Check if link already exists
async function isLinkAlreadyExists(link) {
    await loadBulkJoinLinks();
    await loadExistingLinks();
    return bulkJoinLinksCache.has(link) || cachedLinks.has(link);
}

// Send notification to owner
async function notifyOwner(sock, message, type, link = null, groupName = null) {
    try {
        const ownerNumber = config.ownerNumber[0] + '@s.whatsapp.net';
        let notification = '';
        
        switch(type) {
            case 'new_link':
                notification = `🔗 *NEW LINK CAPTURED*\n\n👤 From: ${message.senderName}\n🔗 Link: ${link}\n📅 Time: ${new Date().toLocaleString()}\n📊 Total captured: ${cachedLinks.size}`;
                break;
            case 'join_success':
                notification = `✅ *AUTO-JOIN SUCCESS*\n\n🔗 Link: ${link}\n👥 Group: ${groupName || 'Unknown'}\n📅 Time: ${new Date().toLocaleString()}`;
                break;
            case 'join_failed':
                notification = `❌ *AUTO-JOIN FAILED*\n\n🔗 Link: ${link}\n⚠️ Reason: ${message}\n📅 Time: ${new Date().toLocaleString()}`;
                break;
            case 'message_sent':
                notification = `💬 *WELCOME MESSAGE SENT*\n\n👥 Group: ${groupName}\n🔗 Link: ${link}\n📅 Time: ${new Date().toLocaleString()}`;
                break;
            case 'already_member':
                notification = `ℹ️ *ALREADY MEMBER*\n\n🔗 Link: ${link}\n👥 Group: ${groupName || 'Unknown'}\n📅 Time: ${new Date().toLocaleString()}`;
                break;
        }
        
        await sock.sendMessage(ownerNumber, { text: notification });
    } catch (error) {
        console.error('[CAPTURE] Notification error:', error.message);
    }
}

// Update bulk join files after joining
async function updateBulkJoinFiles(link, groupType, groupJid, groupName, members) {
    try {
        // Ensure all files exist
        for (const fileName of Object.values(BULK_JOIN_FILES)) {
            await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, fileName);
        }
        
        // Add to appropriate files
        if (groupType === 'announcement') {
            await appendLinkToDriveFile(BULK_JOIN_FOLDER_ID, BULK_JOIN_FILES.ANNOUNCEMENT_ONLY, link);
        } else if (groupType === 'open') {
            await appendLinkToDriveFile(BULK_JOIN_FOLDER_ID, BULK_JOIN_FILES.OPEN_CHAT, link);
            await appendLinkToDriveFile(BULK_JOIN_FOLDER_ID, BULK_JOIN_FILES.COMBINED_OPEN_UNKNOWN, link);
        } else {
            await appendLinkToDriveFile(BULK_JOIN_FOLDER_ID, BULK_JOIN_FILES.UNKNOWN, link);
            await appendLinkToDriveFile(BULK_JOIN_FOLDER_ID, BULK_JOIN_FILES.COMBINED_OPEN_UNKNOWN, link);
        }
        
        // Add to combined all except failed
        await appendLinkToDriveFile(BULK_JOIN_FOLDER_ID, BULK_JOIN_FILES.COMBINED_ALL_EXCEPT_FAILED, link);
        
        // Update cache
        bulkJoinLinksCache.add(link);
        
        console.log(`[CAPTURE] Updated bulk join files for: ${link} (${groupType})`);
    } catch (error) {
        console.error('[CAPTURE] Failed to update bulk join files:', error.message);
    }
}

// Auto-join group and send welcome message
async function autoJoinAndMessage(sock, link, inviteCode) {
    if (!autoJoinEnabled) return false;
    
    try {
        // Get group info first
        let inviteInfo;
        try {
            inviteInfo = await sock.groupGetInviteInfo(inviteCode);
        } catch (e) {
            await notifyOwner(sock, `Cannot fetch group info: ${e.message}`, 'join_failed', link);
            return false;
        }
        
        const groupName = inviteInfo.subject || 'Unknown';
        const isAnnouncement = inviteInfo.announce === true;
        
        // Try to join
        let groupJid;
        try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
        } catch (joinError) {
            if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                await notifyOwner(sock, null, 'already_member', link, groupName);
                
                // Still update files since we have the group info
                const groupType = isAnnouncement ? 'announcement' : 'open';
                await updateBulkJoinFiles(link, groupType, inviteInfo.id, groupName, inviteInfo.size);
                return true;
            }
            await notifyOwner(sock, joinError.message, 'join_failed', link);
            return false;
        }
        
        await notifyOwner(sock, null, 'join_success', link, groupName);
        
        // Get full metadata
        let metadata;
        try {
            metadata = await sock.groupMetadata(groupJid);
        } catch (e) {
            metadata = { subject: groupName, participants: [] };
        }
        
        const groupType = metadata.announce === true ? 'announcement' : 'open';
        const memberCount = metadata.participants?.length || inviteInfo.size || 0;
        
        // Update bulk join files
        await updateBulkJoinFiles(link, groupType, groupJid, metadata.subject || groupName, memberCount);
        
        // Send welcome message only for open chat groups (not announcement-only)
        if (autoMessageEnabled && groupType === 'open') {
            try {
                // Send with rich preview
                await sock.sendMessage(groupJid, {
                    text: WELCOME_MESSAGE,
                    contextInfo: {
                        externalAdReply: {
                            title: 'Tech Zone',
                            body: 'Your Tech Destination',
                            thumbnailUrl: THUMBNAIL_URL,
                            sourceUrl: 'https://whatsapp.com/channel/0029VacnMpyHrDZldKwMod38',
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                });
                await notifyOwner(sock, null, 'message_sent', link, metadata.subject || groupName);
                console.log(`[CAPTURE] Welcome message sent to: ${metadata.subject || groupName}`);
            } catch (msgError) {
                console.error('[CAPTURE] Failed to send welcome message:', msgError.message);
            }
        } else if (groupType === 'announcement') {
            console.log(`[CAPTURE] Skipped welcome message (announcement-only group): ${metadata.subject || groupName}`);
        }
        
        return true;
        
    } catch (error) {
        console.error('[CAPTURE] Auto-join error:', error.message);
        await notifyOwner(sock, error.message, 'join_failed', link);
        return false;
    }
}

// Capture link from message
async function captureLink(sock, message, link) {
    if (!captureEnabled) return false;
    if (isProcessing) return false;
    
    isProcessing = true;
    
    try {
        const alreadyExists = await isLinkAlreadyExists(link);
        if (alreadyExists) {
            console.log(`[CAPTURE] Skipping duplicate link: ${link}`);
            isProcessing = false;
            return false;
        }
        
        // Extract invite code
        let inviteCode = link;
        if (link.includes('chat.whatsapp.com/')) {
            inviteCode = link.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
        }
        
        const sender = message.key.participant || message.key.remoteJid;
        const senderName = sender.split('@')[0];
        
        // Add to capture file
        cachedLinks.add(link);
        await appendLinkToDriveFile(null, null, link);
        
        // Notify owner about new link
        await notifyOwner(sock, { senderName }, 'new_link', link);
        
        // Auto-join the group
        if (autoJoinEnabled && inviteCode && inviteCode.length >= 20) {
            // Run auto-join in background
            autoJoinAndMessage(sock, link, inviteCode).catch(err => {
                console.error('[CAPTURE] Background auto-join error:', err);
            });
        }
        
        isProcessing = false;
        return true;
        
    } catch (error) {
        console.error('[CAPTURE] Capture error:', error.message);
        isProcessing = false;
        return false;
    }
}

// Extract WhatsApp group link from text
function extractGroupLink(text) {
    if (!text) return null;
    
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i,
        /(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)(?:\?[^\s]*)?/i,
        /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            if (match[0].startsWith('http')) return match[0];
            return `https://chat.whatsapp.com/${match[1]}`;
        }
    }
    
    const inviteCodeMatch = text.match(/^([A-Za-z0-9_-]{20,})$/);
    if (inviteCodeMatch) return `https://chat.whatsapp.com/${inviteCodeMatch[1]}`;
    
    return null;
}

// Helper to append to capture file
async function appendLinkToDriveFile(folderId, filename, link) {
    try {
        const auth = await getDriveAuth();
        if (!auth) return false;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        
        let existingContent = '';
        try {
            const response = await drive.files.get({ fileId: CAPTURE_FILE_ID, alt: 'media' }, { responseType: 'text' });
            existingContent = response.data;
        } catch (e) {}
        
        let newContent = existingContent;
        if (newContent && !newContent.endsWith('\n')) newContent += '\n';
        newContent += link + '\n';
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, `capture_${Date.now()}.txt`);
        fs.writeFileSync(tempFile, newContent);
        
        const media = { mimeType: 'text/plain', body: fs.createReadStream(tempFile) };
        
        if (existingContent) {
            await drive.files.update({ fileId: CAPTURE_FILE_ID, media });
        } else {
            const requestBody = { name: CAPTURE_FILE_NAME, mimeType: 'text/plain' };
            await drive.files.create({ requestBody, media });
        }
        
        fs.unlinkSync(tempFile);
        return true;
    } catch (error) {
        console.error('[CAPTURE] Append to capture file error:', error.message);
        return false;
    }
}

// Command Handler
module.exports = {
    name: 'capture',
    aliases: ['capturelinks', 'linkcapture'],
    category: 'owner',
    description: 'Automatically capture WhatsApp group links from all messages',
    usage: '.capture\n.capture on\n.capture off\n.capture stats\n.capture autojoin on/off\n.capture automessage on/off',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        const action = args[0]?.toLowerCase();
        const subAction = args[1]?.toLowerCase();
        
        if (!action || action === '--help') {
            return reply(`🔗 *LINK CAPTURE SYSTEM*\n\n` +
                       `📊 *Status:* ${captureEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `🚀 *Auto-Join:* ${autoJoinEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `💬 *Auto-Message:* ${autoMessageEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `📊 *Captured Links:* ${cachedLinks.size}\n` +
                       `📊 *Bulk Join Links:* ${bulkJoinLinksCache.size}\n\n` +
                       `*Commands:*\n` +
                       `• \`.capture on/off\` - Enable/disable capture\n` +
                       `• \`.capture autojoin on/off\` - Enable/disable auto-join\n` +
                       `• \`.capture automessage on/off\` - Enable/disable welcome message\n` +
                       `• \`.capture stats\` - Show statistics\n` +
                       `• \`.capture reload\` - Reload links from Drive\n\n` +
                       `*Config.js defaults:*\n` +
                       `• captureEnabled: ${config.captureEnabled !== undefined ? config.captureEnabled : true}\n` +
                       `• autoJoinEnabled: ${config.autoJoinEnabled !== undefined ? config.autoJoinEnabled : true}\n` +
                       `• autoMessageEnabled: ${config.autoMessageEnabled !== undefined ? config.autoMessageEnabled : true}\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        if (action === 'on') {
            captureEnabled = true;
            saveCaptureConfig();
            await loadExistingLinks();
            await loadBulkJoinLinks();
            await react('✅');
            return reply(`✅ *Link Capture ENABLED*\n\nAll WhatsApp group links will be captured and auto-joined.`);
        }
        
        if (action === 'off') {
            captureEnabled = false;
            saveCaptureConfig();
            await react('❌');
            return reply(`❌ *Link Capture DISABLED*`);
        }
        
        if (action === 'autojoin') {
            if (subAction === 'on') {
                autoJoinEnabled = true;
                saveCaptureConfig();
                await react('✅');
                return reply(`✅ *Auto-Join ENABLED*\n\nBot will automatically join captured group links.`);
            } else if (subAction === 'off') {
                autoJoinEnabled = false;
                saveCaptureConfig();
                await react('❌');
                return reply(`❌ *Auto-Join DISABLED*`);
            }
        }
        
        if (action === 'automessage') {
            if (subAction === 'on') {
                autoMessageEnabled = true;
                saveCaptureConfig();
                await react('✅');
                return reply(`✅ *Auto-Message ENABLED*\n\nBot will send welcome message to open chat groups after joining.`);
            } else if (subAction === 'off') {
                autoMessageEnabled = false;
                saveCaptureConfig();
                await react('❌');
                return reply(`❌ *Auto-Message DISABLED*`);
            }
        }
        
        if (action === 'stats') {
            await loadExistingLinks();
            await loadBulkJoinLinks();
            return reply(`📊 *CAPTURE STATISTICS*\n\n` +
                       `📁 *Status:* ${captureEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `🚀 *Auto-Join:* ${autoJoinEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `💬 *Auto-Message:* ${autoMessageEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `🔗 *Captured Links:* ${cachedLinks.size}\n` +
                       `📊 *Bulk Join Links:* ${bulkJoinLinksCache.size}\n` +
                       `📄 *Capture File ID:* \`${CAPTURE_FILE_ID}\``);
        }
        
        if (action === 'reload') {
            cacheLoaded = false;
            bulkJoinCacheLoaded = false;
            cachedLinks.clear();
            bulkJoinLinksCache.clear();
            await loadExistingLinks();
            await loadBulkJoinLinks();
            await react('🔄');
            return reply(`🔄 *Links reloaded!*\n\nCaptured: ${cachedLinks.size}\nBulk join: ${bulkJoinLinksCache.size}`);
        }
        
        return reply(`❌ Invalid option. Use \`.capture\` for help.`);
    }
};

// Exports
module.exports.captureLink = captureLink;
module.exports.extractGroupLink = extractGroupLink;
module.exports.isCaptureEnabled = () => captureEnabled;
module.exports.isAutoJoinEnabled = () => autoJoinEnabled;
module.exports.isAutoMessageEnabled = () => autoMessageEnabled;

// Initialize
loadCaptureConfig();
setTimeout(() => {
    loadExistingLinks().catch(err => console.error('[CAPTURE] Initial load error:', err));
    loadBulkJoinLinks().catch(err => console.error('[CAPTURE] Bulk join load error:', err));
}, 5000);
