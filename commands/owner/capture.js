/**
 * Capture Command - Automatically capture WhatsApp group links from all messages
 * Runs as a background service - ENABLED BY DEFAULT
 * Checks against bulk join report files to avoid duplicates
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const config = require('../../config');

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const CAPTURE_FILE_ID = "1a2CMxij0K7ZcvZEsxCEKNwvDW5hHSGqH"; // Your file ID
const CAPTURE_FILE_NAME = "captured_links.txt";

// Bulk Join Report Files to check against
const BULK_JOIN_FOLDER_ID = "11XKmEGAfN5QrygCxy4p2wNRo0iK_tSD8";
const BULK_JOIN_FILES = [
    "failed_links.txt",
    "announcement_only.txt", 
    "open_chat.txt",
    "unknown.txt",
    "combined_open_unknown.txt",
    "combined_all_except_failed.txt"
];

// State - ENABLED BY DEFAULT
let captureEnabled = true;
let cachedLinks = new Set();
let bulkJoinLinksCache = new Set();
let cacheLoaded = false;
let bulkJoinCacheLoaded = false;
let cachedAuth = null;
let tokenExpiry = null;

// Config file path for persistence
const CONFIG_PATH = path.join(__dirname, '../../database/capture_config.json');

// Ensure database directory exists
const DATA_DIR = path.join(__dirname, '../../database');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load capture config
function loadCaptureConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            captureEnabled = data.enabled !== undefined ? data.enabled : true;
            console.log(`[CAPTURE] Config loaded: ${captureEnabled ? 'ENABLED' : 'DISABLED'}`);
        } else {
            captureEnabled = true;
            saveCaptureConfig();
            console.log('[CAPTURE] No config found, created with ENABLED by default');
        }
    } catch (error) {
        console.error('[CAPTURE] Failed to load config:', error.message);
        captureEnabled = true;
    }
}

// Save capture config
function saveCaptureConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ enabled: captureEnabled }, null, 2));
    } catch (error) {
        console.error('[CAPTURE] Failed to save config:', error.message);
    }
}

// Get Google Drive Auth
async function getDriveAuth() {
    if (cachedAuth && tokenExpiry && new Date() < tokenExpiry) {
        return cachedAuth;
    }
    
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

// Load all links from bulk join report files
async function loadBulkJoinLinks() {
    if (bulkJoinCacheLoaded) return bulkJoinLinksCache;
    
    try {
        const auth = await getDriveAuth();
        if (!auth) return bulkJoinLinksCache;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        
        for (const fileName of BULK_JOIN_FILES) {
            try {
                const response = await drive.files.list({
                    q: `'${BULK_JOIN_FOLDER_ID}' in parents and name='${fileName}'`,
                    fields: 'files(id,name)'
                });
                
                const files = response.data.files || [];
                if (files.length > 0) {
                    const fileId = files[0].id;
                    const contentResponse = await drive.files.get({
                        fileId: fileId,
                        alt: 'media'
                    }, { responseType: 'text' });
                    
                    const content = contentResponse.data;
                    const lines = content.split('\n');
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed) {
                            bulkJoinLinksCache.add(trimmed);
                        }
                    }
                    console.log(`[CAPTURE] Loaded ${lines.filter(l => l.trim()).length} links from ${fileName}`);
                }
            } catch (e) {
                console.log(`[CAPTURE] Could not load ${fileName}:`, e.message);
            }
        }
        
        console.log(`[CAPTURE] Total loaded from bulk join files: ${bulkJoinLinksCache.size}`);
        bulkJoinCacheLoaded = true;
        
    } catch (error) {
        console.error('[CAPTURE] Failed to load bulk join links:', error.message);
        bulkJoinCacheLoaded = true;
    }
    
    return bulkJoinLinksCache;
}

// Load existing links from capture file
async function loadExistingLinks() {
    if (cacheLoaded) return cachedLinks;
    
    try {
        const auth = await getDriveAuth();
        if (!auth) return cachedLinks;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        
        const response = await drive.files.get({
            fileId: CAPTURE_FILE_ID,
            alt: 'media'
        }, { responseType: 'text' });
        
        const content = response.data;
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                cachedLinks.add(trimmed);
            }
        }
        
        console.log(`[CAPTURE] Loaded ${cachedLinks.size} existing links from capture file`);
        cacheLoaded = true;
        
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('[CAPTURE] Capture file not found, will create new file');
        } else {
            console.error('[CAPTURE] Failed to load links:', error.message);
        }
        cacheLoaded = true;
    }
    
    return cachedLinks;
}

// Check if link exists in any bulk join file or capture file
async function isLinkAlreadyExists(link) {
    await loadBulkJoinLinks();
    await loadExistingLinks();
    
    // Check in bulk join files
    if (bulkJoinLinksCache.has(link)) {
        console.log(`[CAPTURE] Link already exists in bulk join files, skipping: ${link}`);
        return true;
    }
    
    // Check in capture file
    if (cachedLinks.has(link)) {
        console.log(`[CAPTURE] Link already exists in capture file, skipping: ${link}`);
        return true;
    }
    
    return false;
}

// Append new link to Google Drive file
async function appendLinkToDrive(link) {
    try {
        const auth = await getDriveAuth();
        if (!auth) return false;
        
        const drive = google.drive({ version: 'v3', headers: auth });
        
        // First, check if file exists and get current content
        let existingContent = '';
        try {
            const response = await drive.files.get({
                fileId: CAPTURE_FILE_ID,
                alt: 'media'
            }, { responseType: 'text' });
            existingContent = response.data;
        } catch (e) {
            console.log('[CAPTURE] Creating new capture file');
        }
        
        // Prepare new content
        let newContent = existingContent;
        if (newContent && !newContent.endsWith('\n')) {
            newContent += '\n';
        }
        newContent += link + '\n';
        
        // Save to temp file
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, `capture_${Date.now()}.txt`);
        fs.writeFileSync(tempFile, newContent);
        
        // Upload/Update file
        const media = {
            mimeType: 'text/plain',
            body: fs.createReadStream(tempFile)
        };
        
        if (existingContent) {
            await drive.files.update({
                fileId: CAPTURE_FILE_ID,
                media: media
            });
        } else {
            const requestBody = {
                name: CAPTURE_FILE_NAME,
                mimeType: 'text/plain'
            };
            await drive.files.create({
                requestBody: requestBody,
                media: media,
                fields: 'id'
            });
        }
        
        fs.unlinkSync(tempFile);
        console.log(`[CAPTURE] Appended link to capture file: ${link}`);
        return true;
        
    } catch (error) {
        console.error('[CAPTURE] Failed to append link:', error.message);
        return false;
    }
}

// Capture link from message
async function captureLink(sock, message, link) {
    if (!captureEnabled) return false;
    
    try {
        // Check if link already exists in any report file
        const alreadyExists = await isLinkAlreadyExists(link);
        if (alreadyExists) {
            console.log(`[CAPTURE] Skipping duplicate link: ${link}`);
            return false;
        }
        
        // Add to cache and save to Drive
        cachedLinks.add(link);
        const saved = await appendLinkToDrive(link);
        
        if (saved) {
            console.log(`[CAPTURE] New link captured: ${link}`);
            
            // Optional: Notify owner (commented out to avoid spam)
            // const ownerNumber = config.ownerNumber[0] + '@s.whatsapp.net';
            // const sender = message.key.participant || message.key.remoteJid;
            // const senderName = sender.split('@')[0];
            // 
            // await sock.sendMessage(ownerNumber, {
            //     text: `🔗 *New WhatsApp Group Link Captured*\n\n` +
            //           `👤 From: @${senderName}\n` +
            //           `🔗 Link: ${link}\n` +
            //           `📅 Time: ${new Date().toLocaleString()}\n\n` +
            //           `Total captured: ${cachedLinks.size}`,
            //     mentions: [sender]
            // }).catch(() => {});
        }
        
        return saved;
        
    } catch (error) {
        console.error('[CAPTURE] Capture error:', error.message);
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
            if (match[0].startsWith('http')) {
                return match[0];
            }
            return `https://chat.whatsapp.com/${match[1]}`;
        }
    }
    
    const inviteCodeMatch = text.match(/^([A-Za-z0-9_-]{20,})$/);
    if (inviteCodeMatch) {
        return `https://chat.whatsapp.com/${inviteCodeMatch[1]}`;
    }
    
    return null;
}

// Command Handler
module.exports = {
    name: 'capture',
    aliases: ['capturelinks', 'linkcapture'],
    category: 'owner',
    description: 'Automatically capture WhatsApp group links from all messages',
    usage: '.capture\n.capture on\n.capture off\n.capture stats',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const action = args[0]?.toLowerCase();
        
        if (!action || action === '--help') {
            const status = captureEnabled ? '✅ ENABLED' : '❌ DISABLED';
            return reply(`🔗 *LINK CAPTURE SYSTEM*\n\n` +
                       `📊 *Status:* ${status}\n` +
                       `📁 *Google Drive File ID:*\n\`${CAPTURE_FILE_ID}\`\n` +
                       `📊 *Captured Links:* ${cachedLinks.size}\n` +
                       `📊 *Bulk Join Links:* ${bulkJoinLinksCache.size}\n\n` +
                       `*Commands:*\n` +
                       `• \`.capture on\` - Enable link capture\n` +
                       `• \`.capture off\` - Disable link capture\n` +
                       `• \`.capture stats\` - Show statistics\n` +
                       `• \`.capture reload\` - Reload links from Drive\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        if (action === 'on') {
            captureEnabled = true;
            saveCaptureConfig();
            await loadExistingLinks();
            await loadBulkJoinLinks();
            await react('✅');
            return reply(`✅ *Link Capture ENABLED*\n\nAll WhatsApp group links from incoming messages will be automatically captured and saved to Google Drive.\n\nFile: ${CAPTURE_FILE_NAME}`);
        }
        
        if (action === 'off') {
            captureEnabled = false;
            saveCaptureConfig();
            await react('❌');
            return reply(`❌ *Link Capture DISABLED*\n\nNo longer capturing WhatsApp group links.`);
        }
        
        if (action === 'stats') {
            await loadExistingLinks();
            await loadBulkJoinLinks();
            return reply(`📊 *CAPTURE STATISTICS*\n\n` +
                       `📁 *Status:* ${captureEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                       `🔗 *Captured Links:* ${cachedLinks.size}\n` +
                       `📊 *Bulk Join Links:* ${bulkJoinLinksCache.size}\n` +
                       `📄 *Capture File:* ${CAPTURE_FILE_NAME}\n` +
                       `🆔 *File ID:* \`${CAPTURE_FILE_ID}\`\n\n` +
                       `💡 Use \`.capture on/off\` to control capture`);
        }
        
        if (action === 'reload') {
            cacheLoaded = false;
            bulkJoinCacheLoaded = false;
            cachedLinks.clear();
            bulkJoinLinksCache.clear();
            await loadExistingLinks();
            await loadBulkJoinLinks();
            await react('🔄');
            return reply(`🔄 *Links reloaded!*\n\nCaptured links: ${cachedLinks.size}\nBulk join links: ${bulkJoinLinksCache.size}`);
        }
        
        return reply(`❌ Invalid option. Use \`.capture\` for help.`);
    }
};

// Export for handler.js
module.exports.captureLink = captureLink;
module.exports.extractGroupLink = extractGroupLink;
module.exports.isCaptureEnabled = () => captureEnabled;

// Initialize config on load
loadCaptureConfig();

// Start loading links in background
setTimeout(() => {
    loadExistingLinks().catch(err => console.error('[CAPTURE] Initial load error:', err));
    loadBulkJoinLinks().catch(err => console.error('[CAPTURE] Bulk join load error:', err));
}, 5000);