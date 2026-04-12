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

// ==================== GOOGLE DRIVE CONFIGURATION ====================
// IMPORTANT: Create a folder in Google Drive and put its ID here
// How to get folder ID: Open folder in Google Drive, copy from URL
// Example: https://drive.google.com/drive/folders/THIS_IS_YOUR_FOLDER_ID
const BULK_JOIN_FOLDER_ID = "YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE"; // REPLACE THIS!

// File names in Google Drive (ONLY LINKS - one per line, no explanations)
const FAILED_LINKS_FILE = "failed_links.txt";
const ANNOUNCEMENT_ONLY_FILE = "announcement_only.txt";
const OPEN_CHAT_FILE = "open_chat.txt";
const UNKNOWN_FILE = "unknown.txt";
const COMBINED_OPEN_UNKNOWN_FILE = "combined_open_unknown.txt";
const COMBINED_ALL_EXCEPT_FAILED_FILE = "combined_all_except_failed.txt";

// Token URL for Google Drive access
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";

// Cache for invalid links
let invalidLinksCache = new Set();
let cacheLoaded = false;

// Google Drive Auth
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
                       `> *Powered by ${config.botName}*`);
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
                await performBroadcast(sock, from, sender, session, reply, react, messageText);
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
                const sentMsg = await reply(`📢 *Send message to ${totalOpen} groups*\n\nType your message below (or "cancel" to abort):`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            if (buttonId?.includes('test_broadcast')) {
                session.data.isTest = true;
                session.data.type = 'waiting_broadcast_message';
                const sentMsg = await reply(`🧪 *TEST MODE*\n\n⚠️ This will ONLY send to test group.\n\nType your test message below (or "cancel" to abort):`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
            
            if (buttonId?.includes('bulk_join')) {
                session.data.type = 'waiting_bulk_file';
                const sentMsg = await reply(`📥 *BULK JOIN FROM LINKS*\n\nPlease reply to a .txt file containing WhatsApp group links (one per line).\n\nOr provide a direct download link.\n\nType *cancel* to abort.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'groups');
                return true;
            }
        }
        
        return true;
    }
};

async function showMainMenu(sock, chatId, sender, session, reply) {
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
    
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = totalAnnouncement;
    session.data.totalOpen = totalOpen;
    session.data.totalGroups = totalGroups;
    session.data.type = 'main_menu';
    
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `📁 Total Groups: ${totalGroups}\n` +
                       `🔇 Announcement-Only: ${totalAnnouncement}\n` +
                       `💬 Open Chat: ${totalOpen}\n`;
    
    const sessionId = session.id.split(':').pop();
    const leaveId = `leave_${sessionId}_${Date.now()}`;
    const broadcastId = `broadcast_${sessionId}_${Date.now()}`;
    const testBroadcastId = `test_broadcast_${sessionId}_${Date.now()}`;
    const bulkJoinId = `bulk_join_${sessionId}_${Date.now()}`;
    
    const buttons = [];
    if (announcementGroups.length > 0) {
        buttons.push({ id: leaveId, text: `🔇 Leave Announcement Groups (${totalAnnouncement})` });
    }
    if (openGroups.length > 0) {
        buttons.push({ id: broadcastId, text: `📢 Broadcast to Open Chats (${totalOpen})` });
        buttons.push({ id: testBroadcastId, text: `🧪 Test Broadcast` });
    }
    buttons.push({ id: bulkJoinId, text: `📥 Bulk Join from Links` });
    
    const sentMsg = await sendButtons(sock, chatId, {
        text: statusMessage,
        footer: 'Group Manager',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, chatId, sentMsg.key.id, 'groups');
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
    
    for (let i = 0; i < openGroups.length; i++) {
        const group = openGroups[i];
        
        try {
            await sock.sendMessage(group.id, { text: messageText });
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
        await sock.sendMessage(TEST_GROUP_JID, { text: messageText });
        
        await sock.sendMessage(chatId, {
            text: `✅ *Test sent successfully!*\n\n📤 To: ${TEST_GROUP_JID}`,
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
    
    // Check if folder ID is configured
    if (BULK_JOIN_FOLDER_ID === "YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE") {
        await sock.sendMessage(chatId, {
            text: `⚠️ *Google Drive not configured!*\n\nPlease set your Google Drive folder ID in the groups.js file.\n\nCreate a folder in Google Drive and replace:\n\`BULK_JOIN_FOLDER_ID\``,
            edit: statusMsg.key
        });
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    // Ensure all Drive files exist
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, UNKNOWN_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, COMBINED_OPEN_UNKNOWN_FILE);
    await ensureDriveFileExists(BULK_JOIN_FOLDER_ID, COMBINED_ALL_EXCEPT_FAILED_FILE);
    
    await loadInvalidLinksCache(BULK_JOIN_FOLDER_ID);
    
    // Parse links from file
    let links = fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => line.includes('chat.whatsapp.com/') || /^[A-Za-z0-9_-]{20,}$/.test(line));
    
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
        
        // Send WhatsApp report (with details)
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const reportPath = path.join(tempDir, `bulk_join_report_${Date.now()}.txt`);
        
        let reportContent = `📊 BULK JOIN REPORT\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        reportContent += `📅 Date: ${new Date().toLocaleString()}\n`;
        reportContent += `📄 Source: ${fileName}\n`;
        reportContent += `📊 Total Links: ${originalCount}\n`;
        reportContent += `⏭️ Skipped (already failed): ${skippedCount}\n`;
        reportContent += `❌ No new links to process.\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        
        fs.writeFileSync(reportPath, reportContent);
        
        await sock.sendMessage(chatId, {
            document: fs.readFileSync(reportPath),
            fileName: `bulk_join_report_${Date.now()}.txt`,
            mimetype: 'text/plain',
            caption: `📊 *Bulk Join Report*\n\nNo new links to process.`
        });
        
        fs.unlinkSync(reportPath);
        
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    // Categories for WhatsApp report (with full details)
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
            text: `📥 *Processing ${linkNumber}/${links.length}...*`,
            edit: statusMsg.key
        });
        
        try {
            let inviteCode = link;
            if (link.includes('chat.whatsapp.com/')) {
                inviteCode = link.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            }
            
            if (!inviteCode || inviteCode.length < 20) {
                failedGroups.push({ link: link, reason: 'Invalid invite code format' });
                failCount++;
                await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE, link);
                invalidLinksCache.add(link);
                continue;
            }
            
            let inviteInfo = null;
            try {
                inviteInfo = await sock.groupGetInviteInfo(inviteCode);
            } catch (e) {
                failedGroups.push({ link: link, reason: 'Cannot fetch group info - ' + e.message });
                failCount++;
                await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE, link);
                invalidLinksCache.add(link);
                continue;
            }
            
            let groupJid;
            try {
                groupJid = await sock.groupAcceptInvite(inviteCode);
            } catch (joinError) {
                if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                    try {
                        const metadata = await sock.groupMetadata(inviteInfo.id);
                        if (metadata.announce === true) {
                            announcementOnlyGroups.push({
                                link: link,
                                name: metadata.subject,
                                jid: inviteInfo.id,
                                members: metadata.participants?.length || 0
                            });
                            await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE, link);
                        } else {
                            openChatGroups.push({
                                link: link,
                                name: metadata.subject,
                                jid: inviteInfo.id,
                                members: metadata.participants?.length || 0
                            });
                            await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE, link);
                        }
                        successCount++;
                    } catch (e) {
                        unknownGroups.push({
                            link: link,
                            name: inviteInfo.subject,
                            members: inviteInfo.size || 0,
                            reason: 'Already in group but could not determine type'
                        });
                        await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, UNKNOWN_FILE, link);
                        successCount++;
                    }
                    continue;
                }
                
                if (joinError.message?.includes('conflict') || joinError.data === 409) {
                    unknownGroups.push({
                        link: link,
                        name: inviteInfo.subject,
                        members: inviteInfo.size || 0,
                        reason: 'Join request sent - needs admin approval'
                    });
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, UNKNOWN_FILE, link);
                    successCount++;
                    continue;
                }
                
                failedGroups.push({ link: link, reason: joinError.message });
                failCount++;
                await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE, link);
                invalidLinksCache.add(link);
                continue;
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const metadata = await sock.groupMetadata(groupJid);
                if (metadata.announce === true) {
                    announcementOnlyGroups.push({
                        link: link,
                        name: metadata.subject,
                        jid: groupJid,
                        members: metadata.participants?.length || 0
                    });
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE, link);
                } else {
                    openChatGroups.push({
                        link: link,
                        name: metadata.subject,
                        jid: groupJid,
                        members: metadata.participants?.length || 0
                    });
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE, link);
                }
                successCount++;
            } catch (e) {
                if (inviteInfo.announce === true) {
                    announcementOnlyGroups.push({
                        link: link,
                        name: inviteInfo.subject,
                        jid: inviteInfo.id,
                        members: inviteInfo.size || 0
                    });
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE, link);
                } else if (inviteInfo.announce === false) {
                    openChatGroups.push({
                        link: link,
                        name: inviteInfo.subject,
                        jid: inviteInfo.id,
                        members: inviteInfo.size || 0
                    });
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE, link);
                } else {
                    unknownGroups.push({
                        link: link,
                        name: inviteInfo.subject,
                        members: inviteInfo.size || 0,
                        reason: 'Joined but could not determine group type'
                    });
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, UNKNOWN_FILE, link);
                }
                successCount++;
            }
            
        } catch (error) {
            failedGroups.push({ link: link, reason: error.message });
            failCount++;
            await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, FAILED_LINKS_FILE, link);
            invalidLinksCache.add(link);
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Save combined files to Drive (ONLY LINKS)
    const combinedOpenUnknown = [...openChatGroups.map(g => g.link), ...unknownGroups.map(g => g.link)];
    if (combinedOpenUnknown.length > 0) {
        await saveMultipleLinksToDriveFile(BULK_JOIN_FOLDER_ID, COMBINED_OPEN_UNKNOWN_FILE, combinedOpenUnknown);
    }
    
    const combinedAllExceptFailed = [
        ...announcementOnlyGroups.map(g => g.link),
        ...openChatGroups.map(g => g.link),
        ...unknownGroups.map(g => g.link)
    ];
    if (combinedAllExceptFailed.length > 0) {
        await saveMultipleLinksToDriveFile(BULK_JOIN_FOLDER_ID, COMBINED_ALL_EXCEPT_FAILED_FILE, combinedAllExceptFailed);
    }
    
    // Create WhatsApp report file (WITH FULL DETAILS)
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const reportPath = path.join(tempDir, `bulk_join_report_${Date.now()}.txt`);
    
    let reportContent = `📊 BULK JOIN REPORT\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportContent += `📅 Date: ${new Date().toLocaleString()}\n`;
    reportContent += `📄 Source: ${fileName}\n`;
    reportContent += `📊 Total Links: ${originalCount}\n`;
    reportContent += `⏭️ Skipped (already failed): ${skippedCount}\n`;
    reportContent += `🔄 Processed: ${links.length}\n`;
    reportContent += `✅ Successful: ${successCount}\n`;
    reportContent += `❌ Failed: ${failCount}\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\n`;
    
    // Failed groups section
    reportContent += `❌ FAILED GROUPS (${failedGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const group of failedGroups) {
        reportContent += `Link: ${group.link}\n`;
        reportContent += `Reason: ${group.reason}\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    reportContent += `\n\n\n`;
    
    // Announcement-only groups section
    reportContent += `🔇 ANNOUNCEMENT-ONLY GROUPS (${announcementOnlyGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const group of announcementOnlyGroups) {
        reportContent += `Name: ${group.name}\n`;
        reportContent += `JID: ${group.jid}\n`;
        reportContent += `Members: ${group.members}\n`;
        reportContent += `Link: ${group.link}\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    reportContent += `\n\n\n`;
    
    // Open chat groups section
    reportContent += `💬 OPEN CHAT GROUPS (${openChatGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const group of openChatGroups) {
        reportContent += `Name: ${group.name}\n`;
        reportContent += `JID: ${group.jid}\n`;
        reportContent += `Members: ${group.members}\n`;
        reportContent += `Link: ${group.link}\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    reportContent += `\n\n\n`;
    
    // Unknown/Request sent groups section
    reportContent += `❓ UNKNOWN/REQUEST SENT (${unknownGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const group of unknownGroups) {
        reportContent += `Name: ${group.name}\n`;
        reportContent += `Members: ${group.members}\n`;
        reportContent += `Reason: ${group.reason}\n`;
        reportContent += `Link: ${group.link}\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    
    fs.writeFileSync(reportPath, reportContent);
    
    // Send summary message
    let summary = `✅ *BULK JOIN COMPLETED!*\n\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n`;
    summary += `📊 Processed: ${links.length} | ✅ ${successCount} | ❌ ${failCount}\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📋 *Categories:*\n`;
    summary += `🔇 Announcement-Only: ${announcementOnlyGroups.length}\n`;
    summary += `💬 Open Chat: ${openChatGroups.length}\n`;
    summary += `❓ Unknown: ${unknownGroups.length}\n`;
    summary += `❌ Failed: ${failedGroups.length}\n\n`;
    summary += `📄 *Detailed report attached below.*\n\n`;
    summary += `📁 *Google Drive files updated:*\n`;
    summary += `• ${FAILED_LINKS_FILE}\n`;
    summary += `• ${ANNOUNCEMENT_ONLY_FILE}\n`;
    summary += `• ${OPEN_CHAT_FILE}\n`;
    summary += `• ${UNKNOWN_FILE}\n`;
    summary += `• ${COMBINED_OPEN_UNKNOWN_FILE}\n`;
    summary += `• ${COMBINED_ALL_EXCEPT_FAILED_FILE}\n\n`;
    summary += `*Drive files contain ONLY links (one per line)*`;
    
    await sock.sendMessage(chatId, {
        text: summary,
        edit: statusMsg.key
    });
    
    // Send the detailed WhatsApp report file
    await sock.sendMessage(chatId, {
        document: fs.readFileSync(reportPath),
        fileName: `bulk_join_report_${Date.now()}.txt`,
        mimetype: 'text/plain',
        caption: `📊 *Bulk Join Report*\n\n📅 ${new Date().toLocaleString()}\n📊 Processed: ${links.length} | ✅ ${successCount} | ❌ ${failCount}`
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
    
    await showMainMenu(sock, chatId, sender, session, reply);
}