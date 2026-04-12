/**
 * Groups Command - Show group statistics and manage announcement-only groups
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { google } = require('googleapis');

const FORCE_AI_MODE = true;

// Test group JID for testing broadcast
const TEST_GROUP_JID = '120363408035540146@g.us';

// Google Drive Configuration for Bulk Join
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const BULK_JOIN_FOLDER_ID = "1BulkJoinFolderID"; // Replace with your actual folder ID

// File names in Google Drive
const FAILED_LINKS_FILE = "failed_links.txt";
const ANNOUNCEMENT_ONLY_FILE = "announcement_only.txt";
const OPEN_CHAT_FILE = "open_chat.txt";
const UNKNOWN_FILE = "unknown.txt";
const COMBINED_OPEN_UNKNOWN_FILE = "combined_open_unknown.txt";
const COMBINED_ALL_EXCEPT_FAILED_FILE = "combined_all_except_failed.txt";

// Cache for invalid links
let invalidLinksCache = new Set();
let cacheLoaded = false;

// Google Drive Auth
let cachedAuth = null;
let tokenExpiry = null;

async function getDriveAuth() {
    if (cachedAuth && tokenExpiry && new Date() < tokenExpiry) {
        return cachedAuth;
    }
    
    console.log('[DRIVE] Getting auth token...');
    const tokenResponse = await axios({
        method: 'GET',
        url: TOKEN_URL,
        responseType: 'stream',
        timeout: 30000
    });
    
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
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
        console.log('[DRIVE] Refreshing token...');
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

async function createFolderIfNotExists(folderId, folderName) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        // Check if folder exists
        try {
            await drive.files.get({ fileId: folderId });
            console.log(`[DRIVE] Folder exists: ${folderName}`);
            return folderId;
        } catch (e) {
            // Folder doesn't exist, create it
            console.log(`[DRIVE] Creating folder: ${folderName}`);
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };
            const response = await drive.files.create({
                requestBody: fileMetadata,
                fields: 'id'
            });
            console.log(`[DRIVE] Folder created: ${response.data.id}`);
            return response.data.id;
        }
    } catch (error) {
        console.error('[DRIVE] Folder error:', error.message);
        return folderId;
    }
}

async function loadInvalidLinksCache() {
    if (cacheLoaded) return invalidLinksCache;
    
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        // Find the failed links file
        const response = await drive.files.list({
            q: `'${BULK_JOIN_FOLDER_ID}' in parents and name='${FAILED_LINKS_FILE}'`,
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
            console.log(`[DRIVE] Loaded ${invalidLinksCache.size} invalid links from cache`);
        }
        cacheLoaded = true;
    } catch (error) {
        console.log('[DRIVE] No existing failed links file, starting fresh');
        cacheLoaded = true;
    }
    
    return invalidLinksCache;
}

async function saveLinkToDriveFile(filename, link, isAppend = true) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        // Find existing file
        const response = await drive.files.list({
            q: `'${BULK_JOIN_FOLDER_ID}' in parents and name='${filename}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        let fileId;
        let existingContent = '';
        
        if (files.length > 0) {
            fileId = files[0].id;
            if (isAppend) {
                // Get existing content
                const contentResponse = await drive.files.get({
                    fileId: fileId,
                    alt: 'media'
                }, { responseType: 'text' });
                existingContent = contentResponse.data;
            }
        }
        
        // Prepare new content
        let newContent = existingContent;
        if (isAppend) {
            newContent += link + '\n';
        } else {
            newContent = link + '\n';
        }
        
        // Save to temp file
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, filename);
        fs.writeFileSync(tempFile, newContent);
        
        if (fileId) {
            // Update existing file
            const media = {
                mimeType: 'text/plain',
                body: fs.createReadStream(tempFile)
            };
            await drive.files.update({
                fileId: fileId,
                media: media
            });
        } else {
            // Create new file
            const requestBody = {
                name: filename,
                parents: [BULK_JOIN_FOLDER_ID],
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
        }
        
        fs.unlinkSync(tempFile);
        
    } catch (error) {
        console.error(`[DRIVE] Failed to save to ${filename}:`, error.message);
    }
}

async function saveMultipleLinksToDrive(filename, links, overwrite = false) {
    if (links.length === 0) return;
    
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        
        // Find existing file
        const response = await drive.files.list({
            q: `'${BULK_JOIN_FOLDER_ID}' in parents and name='${filename}'`,
            fields: 'files(id,name)'
        });
        
        const files = response.data.files || [];
        let fileId;
        let existingContent = '';
        
        if (files.length > 0 && !overwrite) {
            fileId = files[0].id;
            const contentResponse = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'text' });
            existingContent = contentResponse.data;
        }
        
        // Prepare new content
        let newContent = existingContent;
        for (const link of links) {
            if (!newContent.includes(link + '\n') && !newContent.includes(link)) {
                newContent += link + '\n';
            }
        }
        
        // Save to temp file
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, filename);
        fs.writeFileSync(tempFile, newContent);
        
        if (fileId) {
            const media = {
                mimeType: 'text/plain',
                body: fs.createReadStream(tempFile)
            };
            await drive.files.update({
                fileId: fileId,
                media: media
            });
        } else {
            const requestBody = {
                name: filename,
                parents: [BULK_JOIN_FOLDER_ID],
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
        }
        
        fs.unlinkSync(tempFile);
        
    } catch (error) {
        console.error(`[DRIVE] Failed to save to ${filename}:`, error.message);
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
                       `• \`.groups\` - Show all groups the bot is in\n` +
                       `• \`.groups --help\` - Show this help\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('📊');
        
        // Clear any existing sessions
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'groups') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            type: 'main_menu'
        });
        
        await showMainMenu(sock, from, sender, session, reply);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'groups') return true;
        
        // Handle text input for broadcast message
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
            
            // Send immediately
            if (session.data.isTest) {
                await performTestBroadcast(sock, from, sender, session, reply, react, messageText);
            } else {
                await performBroadcast(sock, from, sender, session, reply, react, messageText);
            }
            return true;
        }
        
        // Handle bulk join file input
        if (session.data.type === 'waiting_bulk_file') {
            // Check if replying to a document or direct link
            let fileContent = null;
            let fileName = null;
            
            // Check for direct link in text
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
                // Direct download link
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
                // Check if replying to a document
                const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quotedMessage?.documentMessage) {
                    await reply(`❌ *No file provided!*\n\nPlease reply to a .txt file containing group links.\n\nOr provide a direct download link:\n\`https://example.com/groups.txt\`\n\nType *cancel* to abort.`);
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
        
        // Handle button clicks
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            console.log(`[GROUPS] Button clicked: ${buttonId}`);
            
            // Handle Cancel
            if (buttonId?.includes('cancel')) {
                sessionManager.clearSession(session.id);
                await reply('❌ Closed.');
                return true;
            }
            
            // Handle Refresh
            if (buttonId?.includes('refresh')) {
                await refreshGroups(sock, from, sender, session, reply);
                return true;
            }
            
            // Handle Leave
            if (buttonId?.includes('leave')) {
                await performLeave(sock, from, sender, session, reply, react);
                return true;
            }
            
            // Handle Broadcast
            if (buttonId?.includes('broadcast') && !buttonId?.includes('test')) {
                session.data.isTest = false;
                session.data.type = 'waiting_broadcast_message';
                const totalOpen = session.data.openGroups.length;
                const sentMsg = await reply(`📢 *Send message to ${totalOpen} groups*\n\nType your message below (or "cancel" to abort):\n\n*Note:* WhatsApp group links will show a join button preview.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            // Handle Test Broadcast
            if (buttonId?.includes('test_broadcast')) {
                session.data.isTest = true;
                session.data.type = 'waiting_broadcast_message';
                const sentMsg = await reply(`🧪 *TEST MODE*\n\n⚠️ This will ONLY send to:\n${TEST_GROUP_JID}\n\nType your test message below (or "cancel" to abort):\n\n*Note:* WhatsApp group links will show a join button preview.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            // Handle Bulk Join
            if (buttonId?.includes('bulk_join')) {
                session.data.type = 'waiting_bulk_file';
                const sentMsg = await reply(`📥 *BULK JOIN FROM LINKS*\n\nPlease reply to a .txt file containing WhatsApp group links (one per line).\n\nOr provide a direct download link:\n\`https://example.com/groups.txt\`\n\nType *cancel* to abort.\n\n*Format:*\nhttps://chat.whatsapp.com/ABC123\nhttps://chat.whatsapp.com/XYZ789`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
        }
        
        return true;
    }
};

async function showMainMenu(sock, chatId, sender, session, reply) {
    // Get fresh group data
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    const announcementGroups = [];
    const openGroups = [];
    
    for (const group of groupList) {
        if (group.announce === true) {
            announcementGroups.push({ id: group.id, subject: group.subject });
        } else {
            openGroups.push({ id: group.id, subject: group.subject });
        }
    }
    
    const totalAnnouncement = announcementGroups.length;
    const totalOpen = openGroups.length;
    const totalGroups = groupList.length;
    
    // Store in session
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = totalAnnouncement;
    session.data.totalOpen = totalOpen;
    session.data.totalGroups = totalGroups;
    session.data.type = 'main_menu';
    
    // Build message
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `📁 Total Groups: ${totalGroups}\n` +
                       `🔇 Announcement-Only: ${totalAnnouncement}\n` +
                       `💬 Open Chat: ${totalOpen}\n\n`;
    
    if (announcementGroups.length > 0) {
        statusMessage += `🔇 *Announcement-Only Groups:*\n`;
        for (let i = 0; i < Math.min(announcementGroups.length, 10); i++) {
            statusMessage += `${i + 1}. ${announcementGroups[i].subject}\n`;
        }
        if (announcementGroups.length > 10) {
            statusMessage += `... and ${announcementGroups.length - 10} more\n`;
        }
        statusMessage += `\n`;
    }
    
    if (openGroups.length > 0) {
        statusMessage += `💬 *Open Chat Groups:*\n`;
        for (let i = 0; i < Math.min(openGroups.length, 10); i++) {
            statusMessage += `${i + 1}. ${openGroups[i].subject}\n`;
        }
        if (openGroups.length > 10) {
            statusMessage += `... and ${openGroups.length - 10} more\n`;
        }
    }
    
    const sessionId = session.id.split(':').pop();
    const leaveId = `leave_${sessionId}_${Date.now()}`;
    const broadcastId = `broadcast_${sessionId}_${Date.now()}`;
    const testBroadcastId = `test_broadcast_${sessionId}_${Date.now()}`;
    const bulkJoinId = `bulk_join_${sessionId}_${Date.now()}`;
    const refreshId = `refresh_${sessionId}_${Date.now()}`;
    const cancelId = `cancel_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
    }
    if (openGroups.length > 0) {
        buttons.push({ id: broadcastId, text: `📢 Broadcast to Open Chats (${totalOpen})` });
        buttons.push({ id: testBroadcastId, text: `🧪 Test Broadcast` });
    }
    buttons.push({ id: bulkJoinId, text: `📥 Bulk Join from Links` });
    buttons.push({ id: refreshId, text: '🔄 Refresh' });
    buttons.push({ id: cancelId, text: '❌ Close' });
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: statusMessage,
        footer: 'Group Manager',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
}

async function refreshGroups(sock, chatId, sender, session, reply) {
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    
    if (!messageText || openGroups.length === 0) {
        await reply(`❌ No message or no groups to broadcast to.`);
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    await react('📢');
    
    const statusMsg = await reply(`📢 *Broadcasting to ${totalOpen} groups...*\n\n0/${totalOpen} sent`);
    
    let successCount = 0;
    let failCount = 0;
    
    const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
    
    for (let i = 0; i < openGroups.length; i++) {
        const group = openGroups[i];
        
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
                                thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/5968/5968841.png",
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
            
            if ((i + 1) % 5 === 0 || i === openGroups.length - 1) {
                await sock.sendMessage(chatId, {
                    text: `📢 *Broadcasting...*\n\n✅ ${successCount}/${totalOpen} sent\n❌ Failed: ${failCount}`,
                    edit: statusMsg.key
                });
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            
        } catch (error) {
            failCount++;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: `✅ *Broadcast Complete!*\n\n✅ Sent: ${successCount}\n❌ Failed: ${failCount}`,
        edit: statusMsg.key
    });
    
    await react('✅');
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performTestBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    await react('🧪');
    
    const statusMsg = await reply(`🧪 *Sending test message...*`);
    
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
                            thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/5968/5968841.png",
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
            text: `✅ *Test sent successfully!*\n\n📤 To: ${TEST_GROUP_JID}\n\n📝 Message: ${messageText}`,
            edit: statusMsg.key
        });
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(chatId, {
            text: `❌ *Test failed!*\n\nError: ${error.message}`,
            edit: statusMsg.key
        });
        await react('❌');
    }
    
    session.data.type = 'main_menu';
    await showMainMenu(sock, chatId, sender, session, reply);
}

async function performBulkJoin(sock, chatId, sender, session, reply, react, fileContent, fileName) {
    await react('📥');
    
    const statusMsg = await reply(`📥 *Processing bulk join...*\n\nLoading invalid links cache...`);
    
    // Create folder if not exists
    await createFolderIfNotExists(BULK_JOIN_FOLDER_ID, "BulkJoinResults");
    
    // Load invalid links cache
    await loadInvalidLinksCache();
    
    // Parse links from file
    let links = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => line.includes('chat.whatsapp.com/') || /^[A-Za-z0-9_-]{20,}$/.test(line));
    
    // Filter out already failed links
    const originalCount = links.length;
    links = links.filter(link => !invalidLinksCache.has(link));
    const skippedCount = originalCount - links.length;
    
    await sock.sendMessage(chatId, {
        text: `📥 *Links loaded*\n\nTotal: ${originalCount}\nSkipped (already failed): ${skippedCount}\nTo process: ${links.length}`,
        edit: statusMsg.key
    });
    
    if (links.length === 0) {
        await sock.sendMessage(chatId, {
            text: `❌ *No new links to process!*\n\nAll ${originalCount} links are already in the failed links list.`,
            edit: statusMsg.key
        });
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    // Categories for report
    const failedGroups = [];
    const announcementOnlyGroups = [];
    const openChatGroups = [];
    const unknownGroups = [];
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const linkNumber = i + 1;
        
        await sock.sendMessage(chatId, {
            text: `📥 *Processing ${linkNumber}/${links.length}...*\n${link.substring(0, 50)}...`,
            edit: statusMsg.key
        });
        
        try {
            // Extract invite code
            let inviteCode = link;
            if (link.includes('chat.whatsapp.com/')) {
                inviteCode = link.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            }
            
            if (!inviteCode || inviteCode.length < 20) {
                failedGroups.push(link);
                failCount++;
                await saveLinkToDriveFile(FAILED_LINKS_FILE, link);
                invalidLinksCache.add(link);
                continue;
            }
            
            // Get invite info first
            let inviteInfo = null;
            try {
                inviteInfo = await sock.groupGetInviteInfo(inviteCode);
            } catch (e) {
                failedGroups.push(link);
                failCount++;
                await saveLinkToDriveFile(FAILED_LINKS_FILE, link);
                invalidLinksCache.add(link);
                continue;
            }
            
            // Try to join
            let groupJid;
            try {
                groupJid = await sock.groupAcceptInvite(inviteCode);
            } catch (joinError) {
                if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                    // Already in group - determine its type
                    try {
                        const metadata = await sock.groupMetadata(inviteInfo.id);
                        if (metadata.announce === true) {
                            announcementOnlyGroups.push(link);
                            await saveLinkToDriveFile(ANNOUNCEMENT_ONLY_FILE, link);
                        } else {
                            openChatGroups.push(link);
                            await saveLinkToDriveFile(OPEN_CHAT_FILE, link);
                        }
                        successCount++;
                    } catch (e) {
                        unknownGroups.push(link);
                        await saveLinkToDriveFile(UNKNOWN_FILE, link);
                        successCount++;
                    }
                    continue;
                }
                
                if (joinError.message?.includes('conflict') || joinError.data === 409) {
                    // Join request sent - needs approval
                    unknownGroups.push(link);
                    await saveLinkToDriveFile(UNKNOWN_FILE, link);
                    successCount++;
                    continue;
                }
                
                failedGroups.push(link);
                failCount++;
                await saveLinkToDriveFile(FAILED_LINKS_FILE, link);
                invalidLinksCache.add(link);
                continue;
            }
            
            // Successfully joined - get metadata to determine group type
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const metadata = await sock.groupMetadata(groupJid);
                if (metadata.announce === true) {
                    announcementOnlyGroups.push(link);
                    await saveLinkToDriveFile(ANNOUNCEMENT_ONLY_FILE, link);
                } else {
                    openChatGroups.push(link);
                    await saveLinkToDriveFile(OPEN_CHAT_FILE, link);
                }
                successCount++;
            } catch (e) {
                // Use invite info if metadata fails
                if (inviteInfo.announce === true) {
                    announcementOnlyGroups.push(link);
                    await saveLinkToDriveFile(ANNOUNCEMENT_ONLY_FILE, link);
                } else if (inviteInfo.announce === false) {
                    openChatGroups.push(link);
                    await saveLinkToDriveFile(OPEN_CHAT_FILE, link);
                } else {
                    unknownGroups.push(link);
                    await saveLinkToDriveFile(UNKNOWN_FILE, link);
                }
                successCount++;
            }
            
        } catch (error) {
            failedGroups.push(link);
            failCount++;
            await saveLinkToDriveFile(FAILED_LINKS_FILE, link);
            invalidLinksCache.add(link);
        }
        
        // Delay between joins
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Save combined files
    const combinedOpenUnknown = [...openChatGroups, ...unknownGroups];
    if (combinedOpenUnknown.length > 0) {
        await saveMultipleLinksToDrive(COMBINED_OPEN_UNKNOWN_FILE, combinedOpenUnknown);
    }
    
    const combinedAllExceptFailed = [...announcementOnlyGroups, ...openChatGroups, ...unknownGroups];
    if (combinedAllExceptFailed.length > 0) {
        await saveMultipleLinksToDrive(COMBINED_ALL_EXCEPT_FAILED_FILE, combinedAllExceptFailed);
    }
    
    // Send summary message
    let summary = `✅ *BULK JOIN COMPLETED!*\n\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n`;
    summary += `📊 Total Links: ${links.length}\n`;
    summary += `✅ Successful: ${successCount}\n`;
    summary += `❌ Failed: ${failCount}\n`;
    summary += `⏭️ Skipped (already failed): ${skippedCount}\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📋 *Categories:*\n`;
    summary += `🔇 Announcement-Only: ${announcementOnlyGroups.length}\n`;
    summary += `💬 Open Chat: ${openChatGroups.length}\n`;
    summary += `❓ Unknown/Request Sent: ${unknownGroups.length}\n`;
    summary += `❌ Failed: ${failedGroups.length}\n\n`;
    summary += `📁 *Files saved to Google Drive folder:*\n`;
    summary += `• ${FAILED_LINKS_FILE}\n`;
    summary += `• ${ANNOUNCEMENT_ONLY_FILE}\n`;
    summary += `• ${OPEN_CHAT_FILE}\n`;
    summary += `• ${UNKNOWN_FILE}\n`;
    summary += `• ${COMBINED_OPEN_UNKNOWN_FILE}\n`;
    summary += `• ${COMBINED_ALL_EXCEPT_FAILED_FILE}\n\n`;
    summary += `📄 *Each file contains one link per line - no explanations.*`;
    
    await sock.sendMessage(chatId, {
        text: summary,
        edit: statusMsg.key
    });
    
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
    
    const statusMsg = await reply(`🚪 *Leaving ${totalAnnouncement} groups...*\n\n0/${totalAnnouncement} left`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        
        try {
            await sock.groupLeave(group.id);
            successCount++;
            
            await sock.sendMessage(chatId, {
                text: `🚪 *Leaving...*\n\n✅ ${successCount}/${totalAnnouncement} left\n❌ Failed: ${failCount}`,
                edit: statusMsg.key
            });
            
            await new Promise(resolve => setTimeout(resolve, 800));
            
        } catch (error) {
            failCount++;
        }
    }
    
    await sock.sendMessage(chatId, {
        text: `✅ *Leave Complete!*\n\n✅ Left: ${successCount}\n❌ Failed: ${failCount}`,
        edit: statusMsg.key
    });
    
    await react('✅');
    
    await refreshGroups(sock, chatId, sender, session, reply);
}