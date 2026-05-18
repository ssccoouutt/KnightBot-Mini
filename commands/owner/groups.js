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

// Process groups to handle community duplicates
function processGroups(groups) {
    const groupMap = new Map();
    const communityGroups = new Map(); // Store community info by name
    
    // First pass: Group by name to identify communities
    for (const [jid, group] of Object.entries(groups)) {
        const name = group.subject;
        if (!groupMap.has(name)) {
            groupMap.set(name, []);
        }
        groupMap.get(name).push({ jid, group });
    }
    
    // Second pass: Identify communities (groups with same name, different announce status)
    const uniqueGroups = [];
    const processedNames = new Set();
    
    for (const [name, groupList] of groupMap) {
        if (groupList.length > 1) {
            // This is a community - multiple groups with same name
            // Find the announcement-only one (community main) and open one (subgroup)
            const announcementGroup = groupList.find(g => g.group.announce === true);
            const openGroup = groupList.find(g => g.group.announce === false);
            
            if (announcementGroup && openGroup) {
                // This is a community - add as one entry (announcement-only for leave, open for broadcast?)
                // Actually, community main is announcement-only, subgroup is open but it's the same community
                // For leave: leave both? For broadcast: cannot broadcast to community main
                // Add as special community type
                uniqueGroups.push({
                    id: announcementGroup.jid,
                    subject: name,
                    type: 'community',
                    announce: true,
                    members: announcementGroup.group.participants?.length || 0,
                    openSubgroup: openGroup.jid,
                    openSubgroupName: name,
                    participants: announcementGroup.group.participants || []
                });
                processedNames.add(name);
            } else {
                // Just add all as separate
                for (const g of groupList) {
                    uniqueGroups.push({
                        id: g.jid,
                        subject: name,
                        type: g.group.announce ? 'announcement' : 'open',
                        announce: g.group.announce,
                        members: g.group.participants?.length || 0,
                        participants: g.group.participants || []
                    });
                }
                processedNames.add(name);
            }
        } else {
            // Single group - not a community
            const g = groupList[0];
            uniqueGroups.push({
                id: g.jid,
                subject: name,
                type: g.group.announce ? 'announcement' : 'open',
                announce: g.group.announce,
                members: g.group.participants?.length || 0,
                participants: g.group.participants || []
            });
            processedNames.add(name);
        }
    }
    
    // Separate into announcement-only and open chat groups
    const announcementGroups = [];
    const openGroups = [];
    
    for (const group of uniqueGroups) {
        if (group.type === 'community' || group.announce === true) {
            announcementGroups.push({ id: group.id, subject: group.subject, members: group.members });
        } else {
            openGroups.push({ id: group.id, subject: group.subject, members: group.members });
        }
    }
    
    return { announcementGroups, openGroups, totalUnique: uniqueGroups.length };
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
    const groupList = Object.values(groups);
    
    // Process groups to handle community duplicates
    const { announcementGroups, openGroups, totalUnique } = processGroups(groups);
    
    const totalAnnouncement = announcementGroups.length;
    const totalOpen = openGroups.length;
    const totalGroups = totalUnique;
    
    session.data.announcementGroups = announcementGroups;
    session.data.openGroups = openGroups;
    session.data.totalAnnouncement = totalAnnouncement;
    session.data.totalOpen = totalOpen;
    session.data.totalGroups = totalGroups;
    session.data.type = 'main_menu';
    
    let statusMessage = `📊 *GROUP STATISTICS*\n\n` +
                       `📁 Total Groups: ${totalGroups}\n` +
                       `🔇 Announcement-Only: ${totalAnnouncement}\n` +
                       `💬 Open Chat: ${totalOpen}\n\n` +
                       `⚠️ *Note:* Only "Open Chat" groups can receive broadcasts.\n` +
                       `Announcement-only groups require bot to be admin.`;
    
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

async function startBroadcast(sock, chatId, sender, session, reply, react, messageText) {
    const openGroups = session.data.openGroups;
    const totalOpen = openGroups.length;
    
    if (!messageText || openGroups.length === 0) {
        await reply(`❌ No message or no open chat groups to broadcast to.\n\nOnly "Open Chat" groups can receive broadcasts.`);
        session.data.type = 'main_menu';
        await showMainMenu(sock, chatId, sender, session, reply);
        return;
    }
    
    if (session.data.totalAnnouncement > 0) {
        await reply(`⚠️ *Note:* ${session.data.totalAnnouncement} announcement-only group(s) are NOT included.\n\nOnly ${totalOpen} open chat groups will receive the message.`);
    }
    
    await react('📢');
    
    sessionManager.updateSession(sender, chatId, {
        broadcastMessage: messageText,
        broadcastIndex: 0,
        broadcastSuccess: 0,
        broadcastFailed: 0,
        broadcastFailDetails: [],
        type: 'broadcasting'
    });
    
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
    
    const statusMsg = await reply(`📢 *Broadcasting to ${totalOpen} open chat groups...*\n\n` +
                                 `Progress: ${currentIndex}/${totalOpen} groups\n` +
                                 `✅ Success: ${successCount}\n` +
                                 `❌ Failed: ${failCount}\n\n` +
                                 `Sending to groups ${currentIndex + 1} to ${endIndex}...`);
    
    const groupLinkMatch = messageText.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
    
    for (let i = currentIndex; i < endIndex; i++) {
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
            
            if ((groupNumber - currentIndex) % 2 === 0 || groupNumber === endIndex) {
                await sock.sendMessage(chatId, {
                    text: `📢 *Broadcasting...*\n\n` +
                          `Progress: ${groupNumber}/${totalOpen} groups\n` +
                          `✅ Success: ${successCount}\n` +
                          `❌ Failed: ${failCount}`,
                    edit: statusMsg.key
                });
            }
            
        } catch (error) {
            failCount++;
            failDetails.push(`${group.subject}: ${error.message}`);
            
            await sock.sendMessage(chatId, {
                text: `📢 *Broadcasting...*\n\n` +
                      `Progress: ${groupNumber}/${totalOpen} groups\n` +
                      `✅ Success: ${successCount}\n` +
                      `❌ Failed: ${failCount}\n\n` +
                      `⚠️ Failed: ${group.subject}`,
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
                        `📊 Total Groups: ${totalOpen}\n` +
                        `✅ Success: ${successCount}\n` +
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
        return;
    }
    
    const remaining = totalOpen - endIndex;
    const nextBatchEnd = Math.min(endIndex + batchSize, totalOpen);
    
    const confirmMsg = await sendButtons(sock, chatId, {
        text: `📢 *Broadcast Progress*\n\n` +
              `✅ Sent: ${endIndex}/${totalOpen}\n` +
              `✅ Success: ${successCount}\n` +
              `❌ Failed: ${failCount}\n\n` +
              `Remaining: ${remaining} groups\n` +
              `Next: ${endIndex + 1} to ${nextBatchEnd}\n\nContinue?`,
        footer: 'Continue',
        buttons: [
            { id: 'broadcast_continue', text: '✅ Continue' },
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
        
        await sock.sendMessage(chatId, { text: `✅ *Test sent!*\n\n📤 To: ${TEST_GROUP_JID}`, edit: statusMsg.key });
        await react('✅');
    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ *Test failed!*\n\nError: ${error.message}`, edit: statusMsg.key });
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
        await sock.sendMessage(chatId, { text: `📥 *Processing ${i+1}/${links.length}...*`, edit: statusMsg.key });
        
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
    const statusMsg = await reply(`🚪 *Leaving ${totalAnnouncement} groups...*\n\n0/${totalAnnouncement} left`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < announcementGroups.length; i++) {
        const group = announcementGroups[i];
        try {
            await sock.groupLeave(group.id);
            successCount++;
            await sock.sendMessage(chatId, { text: `🚪 *Leaving...*\n\n✅ ${successCount}/${totalAnnouncement} left\n❌ Failed: ${failCount}`, edit: statusMsg.key });
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (error) {
            failCount++;
        }
    }
    
    await sock.sendMessage(chatId, { text: `✅ *Leave Complete!*\n\n✅ Left: ${successCount}\n❌ Failed: ${failCount}`, edit: statusMsg.key });
    await react('✅');
    await showMainMenu(sock, chatId, sender, session, reply);
}