/**
 * Groups Command - Show group statistics and manage announcement-only groups
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { google } = require('googleapis');

const botConfig = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Test group JID for testing broadcast
const TEST_GROUP_JID = '120363408035540146@g.us';

// Hardcoded thumbnail URL for link previews
const THUMBNAIL_URL = "https://drive.usercontent.google.com/download?id=1V1h-ncE4v12Bkvkz4yBd4_k13RffEABC&export=download&confirm=t";

// ==================== GOOGLE DRIVE CONFIGURATION ====================
const BULK_JOIN_FOLDER_ID = "11XKmEGAfN5QrygCxy4p2wNRo0iK_tSD8";

const FAILED_LINKS_FILE = "failed_links.txt";
const ANNOUNCEMENT_ONLY_FILE = "announcement_only.txt";
const OPEN_CHAT_FILE = "open_chat.txt";
const UNKNOWN_FILE = "unknown.txt";
const COMBINED_OPEN_UNKNOWN_FILE = "combined_open_unknown.txt";
const COMBINED_ALL_EXCEPT_FAILED_FILE = "combined_all_except_failed.txt";

const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";

let invalidLinksCache = new Set();
let cacheLoaded = false;
let cachedAuth = null;
let tokenExpiry = null;

async function getDriveAuth() {
    if (cachedAuth && tokenExpiry && new Date() > tokenExpiry) {
        return cachedAuth;
    }
    
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
}

async function ensureDriveFileExists(folderId, filename) {
    try {
        const auth = await getDriveAuth();
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
            
            const requestBody = {
                name: filename,
                parents: [folderId],
                mimeType: 'text/plain'
            };
            const media = {
                mimeType: 'text/plain',
                body: fs.createReadStream(tempFile)
            };
            await drive.files.create({
                requestBody: requestBody,
                media: media
            });
            fs.unlinkSync(tempFile);
        }
    } catch (error) {
        console.error(`[DRIVE] Failed to ensure file ${filename}:`, error.message);
    }
}

async function saveLinkToDriveFile(folderId, filename, link) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name='${filename}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        if (files.length === 0) return;
        
        const fileId = files[0].id;
        
        const contentResponse = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'text' });
        
        let existingContent = contentResponse.data;
        
        if (existingContent.includes(link + '\n') || existingContent.includes(link)) {
            return;
        }
        
        let newContent = existingContent;
        if (newContent && !newContent.endsWith('\n')) {
            newContent += '\n';
        }
        newContent += link + '\n';
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, filename);
        fs.writeFileSync(tempFile, newContent);
        
        const media = {
            mimeType: 'text/plain',
            body: fs.createReadStream(tempFile)
        };
        await drive.files.update({
            fileId: fileId,
            media: media
        });
        
        fs.unlinkSync(tempFile);
        
    } catch (error) {
        console.error(`[DRIVE] Failed to save to ${filename}:`, error.message);
    }
}

async function saveMultipleLinksToDriveFile(folderId, filename, links) {
    if (links.length === 0) return;
    
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name='${filename}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        if (files.length === 0) return;
        
        const fileId = files[0].id;
        
        const contentResponse = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'text' });
        
        let existingContent = contentResponse.data;
        let newContent = existingContent;
        
        for (const link of links) {
            if (!newContent.includes(link + '\n') && !newContent.includes(link)) {
                if (newContent && !newContent.endsWith('\n')) {
                    newContent += '\n';
                }
                newContent += link + '\n';
            }
        }
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, filename);
        fs.writeFileSync(tempFile, newContent);
        
        const media = {
            mimeType: 'text/plain',
            body: fs.createReadStream(tempFile)
        };
        await drive.files.update({
            fileId: fileId,
            media: media
        });
        
        fs.unlinkSync(tempFile);
        
    } catch (error) {
        console.error(`[DRIVE] Failed to save to ${filename}:`, error.message);
    }
}

async function loadInvalidLinksCache(folderId) {
    if (cacheLoaded) return invalidLinksCache;
    
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name='${FAILED_LINKS_FILE}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        if (files.length > 0) {
            const fileId = files[0].id;
            const contentResponse = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'text' });
            
            const lines = contentResponse.data.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    invalidLinksCache.add(trimmed);
                }
            }
        }
        cacheLoaded = true;
    } catch (error) {
        cacheLoaded = true;
    }
    
    return invalidLinksCache;
}

// Process groups - communities are identified by duplicate names
function processGroups(groups) {
    // Group by name to find communities (same name appears twice)
    const groupsByName = new Map();
    const announcementGroups = [];
    const openGroups = [];
    const smallGroups = []; // Groups with less than 5 members
    
    // First pass: Group by name
    for (const [jid, group] of Object.entries(groups)) {
        const name = group.subject;
        if (!groupsByName.has(name)) {
            groupsByName.set(name, []);
        }
        groupsByName.get(name).push({ jid, group });
    }
    
    // Second pass: Process each name group
    for (const [name, groupList] of groupsByName) {
        if (groupList.length > 1) {
            // This is a community - same name appears multiple times
            const announcementGroup = groupList.find(g => g.group.announce === true);
            if (announcementGroup) {
                const memberCount = announcementGroup.group.participants?.length || 0;
                if (memberCount < 5) {
                    smallGroups.push({ 
                        id: announcementGroup.jid, 
                        subject: name, 
                        members: memberCount,
                        type: 'community_small'
                    });
                } else {
                    announcementGroups.push({ 
                        id: announcementGroup.jid, 
                        subject: name, 
                        members: memberCount,
                        type: 'community'
                    });
                }
                console.log(`[GROUPS] Community detected: ${name} (${memberCount} members)`);
            }
        } else {
            // Single group - not a community
            const g = groupList[0];
            const memberCount = g.group.participants?.length || 0;
            
            if (g.group.announce === true) {
                if (memberCount < 5) {
                    smallGroups.push({ 
                        id: g.jid, 
                        subject: name, 
                        members: memberCount,
                        type: 'announcement_small'
                    });
                } else {
                    announcementGroups.push({ 
                        id: g.jid, 
                        subject: name, 
                        members: memberCount,
                        type: 'announcement'
                    });
                }
            } else {
                // Open chat group - check member count
                if (memberCount < 5) {
                    smallGroups.push({ 
                        id: g.jid, 
                        subject: name, 
                        members: memberCount,
                        type: 'open_small'
                    });
                    console.log(`[GROUPS] Open chat group excluded (${memberCount} members): ${name}`);
                } else {
                    openGroups.push({ 
                        id: g.jid, 
                        subject: name, 
                        members: memberCount,
                        type: 'open'
                    });
                }
            }
        }
    }
    
    console.log(`[GROUPS] Total raw groups: ${Object.keys(groups).length}`);
    console.log(`[GROUPS] Announcement groups: ${announcementGroups.length}`);
    console.log(`[GROUPS] Open chat groups (5+ members): ${openGroups.length}`);
    console.log(`[GROUPS] Small groups excluded (<5 members): ${smallGroups.length}`);
    
    return { announcementGroups, openGroups, smallGroups, totalUnique: announcementGroups.length + openGroups.length + smallGroups.length };
}

// List all chats - shows ONLY unique groups (communities shown once)
async function listAllChats(sock, chatId, sender, reply, react) {
    await react('📋');
    const statusMsg = await reply(`📋 *Fetching all chats...*\n⏳ This may take a moment...`);
    
    try {
        const groups = await sock.groupFetchAllParticipating();
        
        // Group by name to find communities
        const groupsByName = new Map();
        
        for (const [jid, group] of Object.entries(groups)) {
            const name = group.subject;
            if (!groupsByName.has(name)) {
                groupsByName.set(name, []);
            }
            groupsByName.get(name).push({ jid, group });
        }
        
        // Build report with unique groups only
        let report = `╔════════════════════════════════════════╗\n`;
        report += `║     WHATSAPP CHATS EXPORT             ║\n`;
        report += `╚════════════════════════════════════════╝\n\n`;
        report += `Generated: ${new Date().toLocaleString()}\n`;
        report += `Bot Number: ${sock.user.id.split(':')[0]}\n\n`;
        
        report += `📊 *SUMMARY*\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `Raw Groups (API): ${Object.keys(groups).length}\n`;
        report += `Unique Groups: ${groupsByName.size}\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        report += `👥 *ALL UNIQUE GROUPS (${groupsByName.size})*\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        let index = 1;
        for (const [name, groupList] of groupsByName) {
            const isCommunity = groupList.length > 1;
            const mainGroup = groupList[0];
            const isAnnouncement = mainGroup.group.announce === true;
            const memberCount = mainGroup.group.participants?.length || 0;
            
            report += `[${index}] ${name}\n`;
            report += `    ────────────────────────────────────────────────\n`;
            
            if (isCommunity) {
                report += `    🏘️ TYPE: COMMUNITY GROUP\n`;
                report += `    🔇 Announcement-Only: YES (Community Main)\n`;
                report += `    📊 Sub-groups in this community: ${groupList.length}\n`;
            } else {
                report += `    🏷️ TYPE: ${isAnnouncement ? 'ANNOUNCEMENT-ONLY' : 'OPEN CHAT'}\n`;
            }
            
            report += `    👥 Members: ${memberCount}\n`;
            if (memberCount < 5) {
                report += `    ⚠️ NOTE: Less than 5 members - excluded from broadcast\n`;
            }
            report += `    🆔 JID: ${mainGroup.jid}\n`;
            if (mainGroup.group.owner) {
                report += `    👑 Creator: ${mainGroup.group.owner.split('@')[0]}\n`;
            }
            if (mainGroup.group.creation) {
                report += `    📅 Created: ${new Date(mainGroup.group.creation * 1000).toLocaleString()}\n`;
            }
            report += `\n`;
            index++;
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const reportFile = path.join(tempDir, `chats_${timestamp}.txt`);
        fs.writeFileSync(reportFile, report);
        
        await sock.sendMessage(chatId, {
            document: fs.readFileSync(reportFile),
            fileName: `whatsapp_chats_${timestamp}.txt`,
            mimetype: 'text/plain',
            caption: `📊 *Chats Export Complete*\n\n📁 Raw Groups: ${Object.keys(groups).length}\n📁 Unique Groups: ${groupsByName.size}\n👥 Communities: ${Array.from(groupsByName.values()).filter(list => list.length > 1).length}\n\n✅ Full report attached!`
        });
        
        fs.unlinkSync(reportFile);
        await react('✅');
        
    } catch (error) {
        console.error('[GROUPS] List chats error:', error);
        await reply(`❌ Failed to fetch chats: ${error.message}`);
        await react('❌');
    }
}

module.exports = {
    name: 'groups',
    aliases: ['grouplist', 'groupsinfo', 'mygroups'],
    category: 'owner',
    description: 'Show group statistics and manage announcement-only groups',
    usage: '.groups\n.groups --help',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--help') {
            return reply(`📊 *GROUPS COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `• \`.groups\` - Show group statistics\n` +
                       `• \`.groups --help\` - Show this help\n\n` +
                       `> *Powered by ${botConfig.botName}*`);
        }
        
        await react('📊');
        
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'groups') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        const session = sessionManager.createSession(sender, from, this.name, {
            type: 'main_menu'
        });
        
        await showMainMenu(sock, from, sender, session, reply);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'groups') return true;
        
        if (session.data.type === 'waiting_broadcast_message') {
            let messageText = '';
            if (msg.message?.conversation) {
                messageText = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                messageText = msg.message.extendedTextMessage.text;
            }
            
            if (!messageText) return true;
            
            if (messageText.toLowerCase() === 'cancel') {
                sessionManager.updateSession(sender, from, { type: 'main_menu' });
                await showMainMenu(sock, from, sender, session, reply);
                return true;
            }
            
            if (session.data.isTest) {
                await performTestBroadcast(sock, from, sender, session, reply, react, messageText);
            } else {
                await startBroadcast(sock, from, sender, session, reply, react, messageText);
            }
            return true;
        }
        
        if (session.data.type === 'waiting_bulk_file') {
            let fileContent = null;
            let fileName = null;
            
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text;
            }
            
            if (text && text.toLowerCase() === 'cancel') {
                session.data.type = 'main_menu';
                await showMainMenu(sock, from, sender, session, reply);
                return true;
            }
            
            if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                await reply(`📥 *Downloading file from URL...*`);
                try {
                    const response = await axios.get(text, {
                        responseType: 'arraybuffer',
                        timeout: 30000
                    });
                    fileContent = response.data.toString('utf-8');
                    fileName = text.split('/').pop() || 'groups.txt';
                } catch (error) {
                    await reply(`❌ Failed to download: ${error.message}`);
                    session.data.type = 'main_menu';
                    await showMainMenu(sock, from, sender, session, reply);
                    return true;
                }
            } else {
                const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quotedMessage?.documentMessage) {
                    await reply(`❌ *No file provided!*\n\nPlease reply to a .txt file containing WhatsApp group links.\n\nOr provide a direct download link.\n\nType *cancel* to abort.`);
                    return true;
                }
                
                const document = quotedMessage.documentMessage;
                fileName = document.fileName || 'groups.txt';
                
                if (!fileName.endsWith('.txt') && document.mimetype !== 'text/plain') {
                    await reply(`❌ *Invalid file type!*\n\nPlease upload a .txt file.`);
                    return true;
                }
                
                await reply(`📥 *Downloading file...*`);
                
                try {
                    const stream = await downloadContentFromMessage(document, 'document');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    fileContent = Buffer.concat(buffer).toString('utf-8');
                } catch (error) {
                    await reply(`❌ Failed to download: ${error.message}`);
                    session.data.type = 'main_menu';
                    await showMainMenu(sock, from, sender, session, reply);
                    return true;
                }
            }
            
            if (fileContent) {
                await performBulkJoin(sock, from, sender, session, reply, react, fileContent, fileName);
            }
            return true;
        }
        
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId?.includes('leave')) {
                await performLeave(sock, from, sender, session, reply, react);
                return true;
            }
            
            if (buttonId?.includes('broadcast') && !buttonId?.includes('test')) {
                session.data.isTest = false;
                session.data.type = 'waiting_broadcast_message';
                const totalOpen = session.data.openGroups.length;
                const sentMsg = await reply(`📢 *Send message to ${totalOpen} groups*\n\nType your message below (or "cancel" to abort):\n\n*Note:* WhatsApp group links will show a join button preview.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            if (buttonId?.includes('test_broadcast')) {
                session.data.isTest = true;
                session.data.type = 'waiting_broadcast_message';
                const sentMsg = await reply(`🧪 *TEST MODE*\n\n⚠️ This will ONLY send to test group.\n\nType your test message below (or "cancel" to abort):\n\n*Note:* WhatsApp group links will show a join button preview.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            if (buttonId?.includes('bulk_join')) {
                session.data.type = 'waiting_bulk_file';
                const sentMsg = await reply(`📥 *BULK JOIN FROM LINKS*\n\nPlease reply to a .txt file containing WhatsApp group links (one per line).\n\nOr provide a direct download link.\n\nType *cancel* to abort.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            if (buttonId?.includes('listchats')) {
                await listAllChats(sock, from, sender, reply, react);
                return true;
            }
        }
        
        return true;
    }
};

async function showMainMenu(sock, chatId, sender, session, reply) {
    const groups = await sock.groupFetchAllParticipating();
    
    // Process groups to handle communities (same name = community)
    const { announcementGroups, openGroups, smallGroups, totalUnique } = processGroups(groups);
    
    const totalAnnouncement = announcementGroups.length;
    const totalOpen = openGroups.length;
    const totalSmall = smallGroups.length;
    const totalGroups = totalUnique;
    const totalRawGroups = Object.keys(groups).length;
    
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = totalAnnouncement;
    session.data.totalOpen = totalOpen;
    session.data.totalGroups = totalGroups;
    session.data.type = 'main_menu';
    
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `📁 Raw Groups (API): ${totalRawGroups}\n` +
                       `📁 Processed Unique: ${totalGroups}\n` +
                       `🔇 Announcement-Only: ${totalAnnouncement}\n` +
                       `💬 Open Chat (5+ members): ${totalOpen}\n` +
                       `⚠️ Small Groups (<5 members): ${totalSmall}\n\n` +
                       `ℹ️ Groups with less than 5 members are excluded from broadcast.\n` +
                       `📋 Use "List All Chats" to see all groups.`;
    
    const sessionId = session.id.split(':').pop();
    const leaveId = `leave_${sessionId}_${Date.now()}`;
    const broadcastId = `broadcast_${sessionId}_${Date.now()}`;
    const testBroadcastId = `test_broadcast_${sessionId}_${Date.now()}`;
    const bulkJoinId = `bulk_join_${sessionId}_${Date.now()}`;
    const listChatsId = `listchats_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
    }
    if (openGroups.length > 0) {
        buttons.push({ id: broadcastId, text: `📢 Broadcast to Open Chats (${totalOpen})` });
        buttons.push({ id: testBroadcastId, text: `🧪 Test Broadcast` });
    }
    buttons.push({ id: bulkJoinId, text: `📥 Bulk Join from Links` });
    buttons.push({ id: listChatsId, text: `📋 List All Chats` });
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: statusMessage,
        footer: 'Group Manager',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function startBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    
    if (!messageText || openGroups.length === 0) {
        await reply(`❌ No message or no open chat groups (5+ members) to broadcast to.\n\nOnly groups with 5+ members can receive broadcasts.`);
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    if (session.data.totalAnnouncement > 0) {
        await reply(`⚠️ *Note:* ${session.data.totalAnnouncement} announcement-only group(s) are NOT included.\n\nOnly ${totalOpen} open chat groups (5+ members) will receive the message.`);
    }
    
    await react('📢');
    
    const statusMsg = await reply(`📢 *Broadcasting to ${totalOpen} open chat groups...*\n\n⏳ Sending messages...\n\n✅ Success: 0\n❌ Failed: 0`);
    
    let successCount = 0;
    let failCount = 0;
    const failDetails = [];
    const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
    
    for (let i = 0; i < openGroups.length; i++) {
        const group = openGroups[i];
        const groupNumber = i + 1;
        
        try {
            if (groupLinkMatch) {
                const inviteCode = groupLinkMatch[1];
                try {
                    const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                    await sock.sendMessage(group.id, {
                        text: messageText,
                        contextInfo: {
                            externalAdReply: {
                                title: inviteInfo.subject || 'WhatsApp Group',
                                body: `👥 ${inviteInfo.size || 0} members • Click to join`,
                                thumbnailUrl: THUMBNAIL_URL,
                                sourceUrl: messageText.match(/https?:\/\/[^\s]+/)[0],
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    });
                } catch (e) {
                    await sock.sendMessage(group.id, { text: messageText });
                }
            } else {
                await sock.sendMessage(group.id, { text: messageText });
            }
            successCount++;
            
            // Update progress every 5 groups
            if (groupNumber % 5 === 0 || groupNumber === totalOpen) {
                await sock.sendMessage(chatId, {
                    text: `📢 *Broadcasting...*\n\n📊 Progress: ${groupNumber}/${totalOpen}\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`,
                    edit: statusMsg.key
                });
            }
            
        } catch (error) {
            failCount++;
            failDetails.push(`${group.subject}: ${error.message}`);
            console.error(`[BROADCAST] ❌ Failed to send to ${group.subject}:`, error.message);
            
            await sock.sendMessage(chatId, {
                text: `📢 *⚠️ Failed:* ${group.subject}\n📊 Progress: ${groupNumber}/${totalOpen}\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`,
                edit: statusMsg.key
            });
        }
        
        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // Final result
    let resultMsg = `✅ *BROADCAST COMPLETE!*\n\n` +
                    `📊 Total Groups: ${totalOpen}\n` +
                    `✅ Successful: ${successCount}\n` +
                    `❌ Failed: ${failCount}`;
    
    if (failDetails.length > 0 && failDetails.length <= 10) {
        resultMsg += `\n\n❌ *Failed Groups:*\n`;
        for (const detail of failDetails) {
            resultMsg += `• ${detail.substring(0, 100)}\n`;
        }
    } else if (failDetails.length > 10) {
        resultMsg += `\n\n❌ Failed: ${failDetails.length} groups`;
    }
    
    await sock.sendMessage(chatId, { text: resultMsg, edit: statusMsg.key });
    await react('✅');
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performTestBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    await react('🧪');
    const statusMsg = await reply(`🧪 *TEST BROADCAST*\n\n📤 Target: ${TEST_GROUP_JID}\n⏳ Sending test message...`);
    
    try {
        const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
        
        if (groupLinkMatch) {
            const inviteCode = groupLinkMatch[1];
            try {
                const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                await sock.sendMessage(TEST_GROUP_JID, {
                    text: messageText,
                    contextInfo: {
                        externalAdReply: {
                            title: inviteInfo.subject || 'WhatsApp Group',
                            body: `👥 ${inviteInfo.size || 0} members • Click to join`,
                            thumbnailUrl: THUMBNAIL_URL,
                            sourceUrl: messageText.match(/https?:\/\/[^\s]+/)[0],
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                });
            } catch (e) {
                await sock.sendMessage(TEST_GROUP_JID, { text: messageText });
            }
        } else {
            await sock.sendMessage(TEST_GROUP_JID, { text: messageText });
        }
        
        await sock.sendMessage(chatId, { 
            text: `✅ *TEST BROADCAST SUCCESSFUL!*\n\n📤 Sent to: ${TEST_GROUP_JID}`,
            edit: statusMsg.key 
        });
        await react('✅');
    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ *TEST BROADCAST FAILED!*\n\nError: ${error.message}`,
            edit: statusMsg.key 
        });
        await react('❌');
    }
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performBulkJoin(sock, chatId, sender, session, reply, react, fileContent, fileName) {
    await react('📥');
    const statusMsg = await reply(`📥 *Processing bulk join...*\n\nLoading cache...`);
    
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, UNKNOWN_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, COMBINED_OPEN_UNKNOWN_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, COMBINED_ALL_EXCEPT_FAILED_FILE);
    
    await loadInvalidLinksCache(BULK_JOIN_FOLDER_ID);
    
    let links = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => line.includes('chat.whatsapp.com/') || /^[A-Za-z0-9_-]{20,}$/.test(line));
    
    const originalCount = links.length;
    links = links.filter(link => !invalidLinksCache.has(link));
    const skippedCount = originalCount - links.length;
    
    await sock.sendMessage(chatId, {
        text: `📥 *Links loaded*\n\nTotal: ${originalCount}\nSkipped: ${skippedCount}\nTo process: ${links.length}`,
        edit: statusMsg.key
    });
    
    if (links.length === 0) {
        await sock.sendMessage(chatId, { text: `❌ *No new links to process!*`, edit: statusMsg.key });
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    const failedGroups = [];
    const announcementOnlyGroups = [];
    const openChatGroups = [];
    const unknownGroups = [];
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        await sock.sendMessage(chatId, { text: `📥 *Processing ${i+1}/${links.length}...*\n🔗 ${link}`, edit: statusMsg.key });
        
        try {
            let inviteCode = link.includes('chat.whatsapp.com/') ? link.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim() : link;
            if (!inviteCode || inviteCode.length < 20) throw new Error('Invalid invite code');
            
            const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
            let groupJid;
            
            try {
                groupJid = await sock.groupAcceptInvite(inviteCode);
            } catch (joinError) {
                if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                    const metadata = await sock.groupMetadata(inviteInfo.id);
                    if (metadata.announce === true) announcementOnlyGroups.push(link);
                    else openChatGroups.push(link);
                    successCount++;
                    continue;
                }
                if (joinError.message?.includes('conflict') || joinError.data === 409) {
                    unknownGroups.push(link);
                    successCount++;
                    continue;
                }
                throw joinError;
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            const metadata = await sock.groupMetadata(groupJid);
            if (metadata.announce === true) announcementOnlyGroups.push(link);
            else openChatGroups.push(link);
            successCount++;
            
        } catch (error) {
            failedGroups.push({ link, reason: error.message });
            failCount++;
            await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE, link);
            invalidLinksCache.add(link);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    const combinedOpenUnknown = [...openChatGroups, ...unknownGroups];
    if (combinedOpenUnknown.length > 0) {
        await saveMultipleLinksToDriveFile(BULK_JOIN_FOLDER_ID, COMBINED_OPEN_UNKNOWN_FILE, combinedOpenUnknown);
    }
    const combinedAllExceptFailed = [...announcementOnlyGroups, ...openChatGroups, ...unknownGroups];
    if (combinedAllExceptFailed.length > 0) {
        await saveMultipleLinksToDriveFile(BULK_JOIN_FOLDER_ID, COMBINED_ALL_EXCEPT_FAILED_FILE, combinedAllExceptFailed);
    }
    
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const reportPath = path.join(tempDir, `bulk_join_report_${Date.now()}.txt`);
    let reportContent = `📊 BULK JOIN REPORT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📅 Date: ${new Date().toLocaleString()}\n📄 Source: ${fileName}\n📊 Total: ${originalCount} | Skipped: ${skippedCount} | Processed: ${links.length}\n✅ Success: ${successCount} | ❌ Failed: ${failCount}\n\n`;
    
    reportContent += `❌ FAILED (${failedGroups.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const f of failedGroups) reportContent += `Link: ${f.link}\nReason: ${f.reason}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    reportContent += `\n\n\n🔇 ANNOUNCEMENT-ONLY (${announcementOnlyGroups.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${announcementOnlyGroups.join('\n')}\n\n\n`;
    reportContent += `💬 OPEN CHAT (${openChatGroups.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${openChatGroups.join('\n')}\n\n\n`;
    reportContent += `❓ UNKNOWN (${unknownGroups.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${unknownGroups.join('\n')}\n`;
    
    fs.writeFileSync(reportPath, reportContent);
    
    await sock.sendMessage(chatId, {
        text: `✅ *BULK JOIN COMPLETED!*\n\n📊 Processed: ${links.length} | ✅ ${successCount} | ❌ ${failCount}\n\n📋 Categories:\n🔇 ${announcementOnlyGroups.length} | 💬 ${openChatGroups.length} | ❓ ${unknownGroups.length} | ❌ ${failedGroups.length}\n\n📄 Report attached.`,
        edit: statusMsg.key
    });
    await sock.sendMessage(chatId, {
        document: fs.readFileSync(reportPath),
        fileName: `bulk_join_report_${Date.now()}.txt`,
        mimetype: 'text/plain',
        caption: `📊 Bulk Join Report`
    });
    fs.unlinkSync(reportPath);
    await react('✅');
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performLeave(sock, chatId, sender, session, reply, react) {
    const announcementGroups = session.data.announcementGroups;
    const totalAnnouncement = announcementGroups.length;
    
    if (totalAnnouncement === 0) {
        await reply(`❌ No announcement-only groups to leave.`);
        return;
    }
    
    await react('🚪');
    const statusMsg = await reply(`🚪 *Leaving ${totalAnnouncement} announcement-only groups...*\n\n0/${totalAnnouncement} left`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        try {
            await sock.groupLeave(group.id);
            successCount++;
            await sock.sendMessage(chatId, { 
                text: `🚪 *Leaving...*\n\n✅ Left: ${group.subject}\n📊 Progress: ${successCount}/${totalAnnouncement}\n❌ Failed: ${failCount}`, 
                edit: statusMsg.key 
            });
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (error) {
            failCount++;
            await sock.sendMessage(chatId, { 
                text: `🚪 *Failed to leave:* ${group.subject}\n⚠️ Error: ${error.message}`,
                edit: statusMsg.key 
            });
        }
    }
    
    await sock.sendMessage(chatId, { 
        text: `✅ *Leave Complete!*\n\n✅ Left: ${successCount}\n❌ Failed: ${failCount}`, 
        edit: statusMsg.key 
    });
    await react('✅');
    await showMainMenu(sock, chatId, sender, session, reply);
}