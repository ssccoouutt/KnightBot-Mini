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

// Helper function to detect if a group is a Community group
function isCommunityGroup(group) {
    // Community groups typically have 'parentGroupId' property
    // Or they have 'announce: true' and also appear as a subgroup
    return group.parentGroupId !== undefined && group.parentGroupId !== null;
}

// Helper function to get unique groups (remove community duplicates)
function getUniqueGroups(groups) {
    const uniqueMap = new Map();
    const communityGroupIds = new Set();
    
    // First pass: identify community groups (announcement-only groups that are likely communities)
    for (const [jid, group] of Object.entries(groups)) {
        if (group.announce === true && isCommunityGroup(group)) {
            communityGroupIds.add(jid);
        }
    }
    
    // Second pass: only add groups that are NOT community duplicates
    for (const [jid, group] of Object.entries(groups)) {
        // Skip if this is a community main group (announcement-only)
        if (communityGroupIds.has(jid)) {
            continue;
        }
        
        // Store unique group
        uniqueMap.set(jid, group);
    }
    
    return uniqueMap;
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
        
        if (session.data.type === 'waiting_broadcast_continue') {
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation.trim().toLowerCase();
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text.trim().toLowerCase();
            }
            
            if (text === 'yes' || text === 'y' || text === 'continue') {
                await continueBroadcast(sock, from, sender, session, reply, react);
            } else if (text === 'no' || text === 'n' || text === 'cancel') {
                sessionManager.updateSession(sender, from, { type: 'main_menu' });
                await reply(`❌ Broadcast cancelled.`);
                await showMainMenu(sock, from, sender, session, reply);
            } else {
                await reply(`❌ Please reply with *yes* to continue or *no* to cancel.`);
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
            
            if (buttonId === 'broadcast_continue') {
                await continueBroadcast(sock, from, sender, session, reply, react);
                return true;
            }
            
            if (buttonId === 'broadcast_cancel') {
                sessionManager.updateSession(sender, from, { type: 'main_menu' });
                await reply(`❌ Broadcast cancelled.`);
                await showMainMenu(sock, from, sender, session, reply);
                return true;
            }
        }
        
        return true;
    }
};

async function showMainMenu(sock, chatId, sender, session, reply) {
    const groups = await sock.groupFetchAllParticipating();
    
    // Get unique groups (remove community duplicates)
    const uniqueGroups = getUniqueGroups(groups);
    const groupList = Object.values(uniqueGroups);
    
    const announcementGroups = [];
    const openGroups = [];
    
    for (const group of groupList) {
        // Community groups are always announcement-only
        // But we already filtered them out in getUniqueGroups()
        if (group.announce === true) {
            announcementGroups.push({ id: group.id, subject: group.subject });
        } else {
            openGroups.push({ id: group.id, subject: group.subject });
        }
    }
    
    const totalAnnouncement = announcementGroups.length;
    const totalOpen = openGroups.length;
    const totalGroups = groupList.length;
    const totalCommunityGroups = Object.keys(groups).length - totalGroups;
    
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = totalAnnouncement;
    session.data.totalOpen = totalOpen;
    session.data.totalGroups = totalGroups;
    session.data.type = 'main_menu';
    
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `📁 Total Groups: ${totalGroups}\n` +
                       `🔇 Announcement-Only: ${totalAnnouncement}\n` +
                       `💬 Open Chat: ${totalOpen}\n` +
                       `🏘️ Community Groups (filtered): ${totalCommunityGroups}\n\n` +
                       `⚠️ *Note:* Community groups are announcement-only.\n` +
                       `Only "Open Chat" groups can receive broadcasts.`;
    
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
    } else {
        buttons.push({ id: broadcastId, text: `📢 Broadcast to Open Chats (0)`, disabled: true });
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

async function startBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    
    if (!messageText || openGroups.length === 0) {
        await reply(`❌ No message or no open chat groups to broadcast to.\n\nOnly "Open Chat" groups can receive broadcasts.`);
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    // Show warning about announcement-only groups
    if (session.data.totalAnnouncement > 0) {
        await reply(`⚠️ *Note:* ${session.data.totalAnnouncement} announcement-only group(s) are NOT included in this broadcast.\n\nOnly ${totalOpen} open chat groups will receive the message.`);
    }
    
    await react('📢');
    
    // Store broadcast data in session
    sessionManager.updateSession(sender, chatId, {
        broadcastMessage: messageText,
        broadcastIndex: 0,
        broadcastSuccess: 0,
        broadcastFailed: 0,
        broadcastFailDetails: [],
        type: 'broadcasting'
    });
    
    // Start broadcasting first batch
    await continueBroadcast(sock, chatId, sender, session, reply, react);
}

async function continueBroadcast(sock, chatId, sender, session, reply, react) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    const messageText = session.data.broadcastMessage;
    let currentIndex = session.data.broadcastIndex || 0;
    let successCount = session.data.broadcastSuccess || 0;
    let failCount = session.data.broadcastFailed || 0;
    const failDetails = session.data.broadcastFailDetails || [];
    const batchSize = 10;
    const endIndex = Math.min(currentIndex + batchSize, totalOpen);
    
    console.log('[BROADCAST DEBUG] Total open chat groups:', totalOpen);
    console.log('[BROADCAST DEBUG] Current index:', currentIndex);
    
    const statusMsg = await reply(`📢 *Broadcasting to ${totalOpen} open chat groups...*\n\n` +
                                 `Progress: ${currentIndex}/${totalOpen} groups\n` +
                                 `✅ Success: ${successCount}\n` +
                                 `❌ Failed: ${failCount}\n\n` +
                                 `Sending to groups ${currentIndex + 1} to ${endIndex}...`);
    
    const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
    
    for (let i = currentIndex; i < endIndex; i++) {
        const group = openGroups[i];
        const groupNumber = i + 1;
        
        console.log(`[BROADCAST DEBUG] Sending to open chat group ${groupNumber}: ${group.id} - ${group.subject}`);
        
        try {
            if (!group.id || !group.id.endsWith('@g.us')) {
                throw new Error(`Invalid group ID: ${group.id}`);
            }
            
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
                    console.log(`[BROADCAST DEBUG] ✅ Sent with preview to ${group.subject}`);
                } catch (e) {
                    await sock.sendMessage(group.id, { text: messageText });
                    console.log(`[BROADCAST DEBUG] ✅ Sent plain text to ${group.subject}`);
                }
            } else {
                await sock.sendMessage(group.id, { text: messageText });
                console.log(`[BROADCAST DEBUG] ✅ Sent plain text to ${group.subject}`);
            }
            successCount++;
            
            if ((groupNumber - currentIndex) % 2 === 0 || groupNumber === endIndex) {
                await sock.sendMessage(chatId, {
                    text: `📢 *Broadcasting...*\n\n` +
                          `Progress: ${groupNumber}/${totalOpen} groups\n` +
                          `✅ Success: ${successCount}\n` +
                          `❌ Failed: ${failCount}\n\n` +
                          `Last sent: ${group.subject}`,
                    edit: statusMsg.key
                });
            }
            
        } catch (error) {
            failCount++;
            const errorMsg = `Group: ${group.subject} (${group.id}) - Error: ${error.message}`;
            failDetails.push(errorMsg);
            console.error(`[BROADCAST DEBUG] ❌ Failed to send to ${group.id}:`, error.message);
            
            await sock.sendMessage(chatId, {
                text: `📢 *Broadcasting...*\n\n` +
                      `Progress: ${groupNumber}/${totalOpen} groups\n` +
                      `✅ Success: ${successCount}\n` +
                      `❌ Failed: ${failCount}\n\n` +
                      `⚠️ Failed to send to: ${group.subject}\n` +
                      `Error: ${error.message.substring(0, 100)}`,
                edit: statusMsg.key
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    sessionManager.updateSession(sender, chatId, {
        broadcastIndex: endIndex,
        broadcastSuccess: successCount,
        broadcastFailed: failCount,
        broadcastFailDetails: failDetails
    });
    
    if (endIndex >= totalOpen) {
        let resultMsg = `✅ *Broadcast Complete!*\n\n` +
                        `📊 Total Open Chat Groups: ${totalOpen}\n` +
                        `✅ Successful: ${successCount}\n` +
                        `❌ Failed: ${failCount}`;
        
        if (failDetails.length > 0 && failDetails.length <= 10) {
            resultMsg += `\n\n❌ *Failed Groups:*\n`;
            for (const detail of failDetails) {
                resultMsg += `• ${detail.substring(0, 150)}\n`;
            }
        } else if (failDetails.length > 10) {
            resultMsg += `\n\n❌ Failed: ${failDetails.length} groups`;
        }
        
        await sock.sendMessage(chatId, {
            text: resultMsg,
            edit: statusMsg.key
        });
        
        console.log('[BROADCAST DEBUG] Final results:', {
            total: totalOpen,
            success: successCount,
            failed: failCount
        });
        
        await react('✅');
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    const remaining = totalOpen - endIndex;
    const nextBatchEnd = Math.min(endIndex + batchSize, totalOpen);
    
    const confirmMsg = await sendButtons(sock, chatId, {
        text: `📢 *Broadcast Progress*\n\n` +
              `✅ Sent: ${endIndex}/${totalOpen} groups\n` +
              `✅ Success: ${successCount}\n` +
              `❌ Failed: ${failCount}\n\n` +
              `Remaining: ${remaining} groups\n` +
              `Next batch: Groups ${endIndex + 1} to ${nextBatchEnd}\n\n` +
              `Do you want to continue?`,
        footer: 'Continue Broadcast',
        buttons: [
            { id: 'broadcast_continue', text: '✅ Yes, Continue' },
            { id: 'broadcast_cancel', text: '❌ Cancel' }
        ],
        aimode: FORCE_AI_MODE
    }, { edit: statusMsg.key });
    
    session.data.type = 'waiting_broadcast_continue';
    sessionManager.addPendingMessage(sender, chatId, confirmMsg.key.id, 'groups');
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
        text: `📥 *Links loaded*\n\nTotal: ${originalCount}\nSkipped (already failed): ${skippedCount}\nTo process: ${links.length}`,
        edit: statusMsg.key
    });
    
    if (links.length === 0) {
        await sock.sendMessage(chatId, {
            text: `❌ *No new links to process!*`,
            edit: statusMsg.key
        });
        
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
        
        fs.writeFileSync(reportPath, reportContent);
        
        await sock.sendMessage(chatId, {
            document: fs.readFileSync(reportPath),
            fileName: `bulk_join_report_${Date.now()}.txt`,
            mimetype: 'text/plain',
            caption: `📊 *Bulk Join Report*`
        });
        
        fs.unlinkSync(reportPath);
        
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
                            announcementOnlyGroups.push(link);
                            await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE, link);
                        } else {
                            openChatGroups.push(link);
                            await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE, link);
                        }
                        successCount++;
                    } catch (e) {
                        unknownGroups.push(link);
                        await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, UNKNOWN_FILE, link);
                        successCount++;
                    }
                    continue;
                }
                
                if (joinError.message?.includes('conflict') || joinError.data === 409) {
                    unknownGroups.push(link);
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
                    announcementOnlyGroups.push(link);
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE, link);
                } else {
                    openChatGroups.push(link);
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE, link);
                }
                successCount++;
            } catch (e) {
                if (inviteInfo.announce === true) {
                    announcementOnlyGroups.push(link);
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, ANNOUNCEMENT_ONLY_FILE, link);
                } else if (inviteInfo.announce === false) {
                    openChatGroups.push(link);
                    await saveLinkToDriveFile(BULK_JOIN_FOLDER_ID, OPEN_CHAT_FILE, link);
                } else {
                    unknownGroups.push(link);
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
    
    reportContent += `❌ FAILED GROUPS (${failedGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const group of failedGroups) {
        reportContent += `Link: ${group.link}\n`;
        reportContent += `Reason: ${group.reason}\n`;
        reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    reportContent += `\n\n\n`;
    
    reportContent += `🔇 ANNOUNCEMENT-ONLY GROUPS (${announcementOnlyGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const link of announcementOnlyGroups) {
        reportContent += `${link}\n`;
    }
    reportContent += `\n\n\n`;
    
    reportContent += `💬 OPEN CHAT GROUPS (${openChatGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const link of openChatGroups) {
        reportContent += `${link}\n`;
    }
    reportContent += `\n\n\n`;
    
    reportContent += `❓ UNKNOWN/REQUEST SENT (${unknownGroups.length})\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const link of unknownGroups) {
        reportContent += `${link}\n`;
    }
    
    fs.writeFileSync(reportPath, reportContent);
    
    let summary = `✅ *BULK JOIN COMPLETED!*\n\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n`;
    summary += `📊 Processed: ${links.length} | ✅ ${successCount} | ❌ ${failCount}\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📋 *Categories:*\n`;
    summary += `🔇 Announcement-Only: ${announcementOnlyGroups.length}\n`;
    summary += `💬 Open Chat: ${openChatGroups.length}\n`;
    summary += `❓ Unknown: ${unknownGroups.length}\n`;
    summary += `❌ Failed: ${failedGroups.length}\n\n`;
    summary += `📄 *Detailed report attached below.*`;
    
    await sock.sendMessage(chatId, {
        text: summary,
        edit: statusMsg.key
    });
    
    await sock.sendMessage(chatId, {
        document: fs.readFileSync(reportPath),
        fileName: `bulk_join_report_${Date.now()}.txt`,
        mimetype: 'text/plain',
        caption: `📊 *Bulk Join Report*`
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