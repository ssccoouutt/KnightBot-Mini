/**
 * Telegram Bridge Command - Full featured Telegram to WhatsApp bridge with scheduling
 * EXACT COPY of the working standalone script
 */

const { Telegraf } = require('telegraf');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { google } = require('googleapis');
const config = require('../../config');

// ===== CONFIGURATION =====
const TELEGRAM_BOT_TOKEN = "8717510346:AAH2IcCpTdIxZ8TJxK17UcFrTaS_6-qIUNo";
const TELEGRAM_CHANNEL_ID = "-1001287988079";

// WhatsApp targets
const WHATSAPP_NUMBER = "923247220362";
const WHATSAPP_GROUPS = [
    "120363140590753276@g.us",
    "120363162260844407@g.us",
    "120363042237526273@g.us",
    "120363023394033137@g.us",
    "120363161222427319@g.us"
];
const WHATSAPP_CHANNEL = "120363304414452603@newsletter";

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const POSTS_FOLDER_ID = "1sEKMKP_pT_oZR5OJgkDjs4peR-6ixlq_";
const MEDIA_FOLDER_ID = "1pll1-8s83ZUna1K9lL_miFkYsiEvxh-z";
const SCHEDULE_FILE_ID = "1tzY2CysClbADcj1zEgLwfzzRAFYOr6Wu";

// ===== SCHEDULE CONFIGURATION =====
const MIN_DELAY_HOURS = 2;
const MAX_DELAY_HOURS = 3;
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 4;
const MISSED_POST_WINDOW_MS = 15 * 60 * 1000;

// ===== CONSTANTS =====
const TEMP_DIR = path.join(process.cwd(), 'temp');
const RATE_LIMIT_DELAY = 3000;

// ===== STATE =====
let telegrafBot = null;
let sendBot = null;
let whatsappSock = null;
let isTelegramActive = false;
let scheduledTask = null;
let lastSendTime = null;
const processingPosts = new Set();

// Create temp directory
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ===== TIMEZONE HELPER FUNCTIONS =====
function getPakistanTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (5 * 60 * 60000));
}

function formatPakistanTime(date = null) {
    const time = date || getPakistanTime();
    const year = time.getFullYear();
    const month = String(time.getMonth() + 1).padStart(2, '0');
    const day = String(time.getDate()).padStart(2, '0');
    const hours = String(time.getHours()).padStart(2, '0');
    const minutes = String(time.getMinutes()).padStart(2, '0');
    const seconds = String(time.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

function getPakistanHour() {
    return getPakistanTime().getHours();
}

function isNightTime() {
    const hour = getPakistanHour();
    return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

function getRandomDelayHours() {
    return MIN_DELAY_HOURS + Math.random() * (MAX_DELAY_HOURS - MIN_DELAY_HOURS);
}

function addRandomHours(date) {
    const delayHours = getRandomDelayHours();
    const newDate = new Date(date);
    newDate.setHours(newDate.getHours() + delayHours);
    const fractionalHours = delayHours - Math.floor(delayHours);
    newDate.setMinutes(newDate.getMinutes() + Math.floor(fractionalHours * 60));
    return newDate;
}

// ===== GOOGLE DRIVE FUNCTIONS =====
let cachedAuth = null;
let tokenExpiry = null;

async function getDriveAuth() {
    if (cachedAuth && tokenExpiry && new Date() < tokenExpiry) {
        return cachedAuth;
    }
    
    console.log('[DRIVE] 📥 Getting auth...');
    const tokenResponse = await axios({
        method: 'GET',
        url: TOKEN_URL,
        responseType: 'stream',
        timeout: 30000
    });
    
    const tokenFilename = path.join(TEMP_DIR, `token_${Date.now()}.json`);
    const tokenWriter = fs.createWriteStream(tokenFilename);
    tokenResponse.data.pipe(tokenWriter);
    await new Promise((resolve, reject) => {
        tokenWriter.on('finish', resolve);
        tokenWriter.on('error', reject);
    });
    
    const tokenData = JSON.parse(fs.readFileSync(tokenFilename, 'utf8'));
    fs.unlinkSync(tokenFilename);
    
    console.log('[DRIVE] ✅ Token loaded');
    
    const expiryDate = new Date(tokenData.expiry);
    if (new Date() > expiryDate) {
        console.log('[DRIVE] 🔄 Refreshing token...');
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

async function saveScheduleToDrive() {
    try {
        const auth = await getDriveAuth();
        const content = lastSendTime ? lastSendTime.toISOString() : '';
        const tempFile = path.join(TEMP_DIR, 'schedule.txt');
        fs.writeFileSync(tempFile, content);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[DRIVE] 📤 SAVING SCHEDULE`);
        console.log(`[DRIVE] File ID: ${SCHEDULE_FILE_ID}`);
        console.log(`[DRIVE] Content: "${content}"`);
        
        const drive = google.drive({ version: 'v3', headers: auth });
        const media = { mimeType: 'text/plain', body: fs.createReadStream(tempFile) };
        await drive.files.update({ fileId: SCHEDULE_FILE_ID, media: media, fields: 'id' });
        
        fs.unlinkSync(tempFile);
        console.log(`[DRIVE] ✅ Schedule saved successfully`);
        console.log(`${'='.repeat(60)}\n`);
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to save schedule:', error.message);
    }
}

async function loadScheduleFromDrive() {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        const response = await drive.files.get({ fileId: SCHEDULE_FILE_ID, alt: 'media' }, { responseType: 'text' });
        const content = response.data;
        console.log(`[DRIVE] Loaded content: "${content}"`);
        
        if (content) {
            lastSendTime = new Date(content);
            console.log(`[DRIVE] ✅ Schedule loaded - Last send: ${formatPakistanTime(lastSendTime)}`);
        } else {
            lastSendTime = null;
            console.log('[DRIVE] Schedule file empty, starting fresh');
        }
    } catch (error) {
        console.log('[DRIVE] No schedule found, starting fresh');
        lastSendTime = null;
    }
}

async function saveMediaToDrive(buffer, mimeType, extension) {
    try {
        const auth = await getDriveAuth();
        const filename = `media_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${extension}`;
        const tempFile = path.join(TEMP_DIR, filename);
        fs.writeFileSync(tempFile, buffer);
        
        const drive = google.drive({ version: 'v3', headers: auth });
        const requestBody = { name: filename, parents: [MEDIA_FOLDER_ID], mimeType: mimeType };
        const media = { mimeType: mimeType, body: fs.createReadStream(tempFile) };
        const response = await drive.files.create({ requestBody, media, fields: 'id' });
        
        fs.unlinkSync(tempFile);
        console.log(`[DRIVE] ✅ Media saved: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to save media:', error.message);
        throw error;
    }
}

async function loadMediaFromDrive(fileId) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to load media:', error.message);
        throw error;
    }
}

async function deleteMediaFromDrive(fileId) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        await drive.files.delete({ fileId: fileId });
        console.log(`[DRIVE] ✅ Deleted media: ${fileId}`);
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to delete media:', error.message);
    }
}

async function savePostToDrive(messageData, uniqueId, scheduledTime, position, mediaFileId = null) {
    try {
        const auth = await getDriveAuth();
        
        const saveData = {
            type: messageData.type,
            content: messageData.content,
            originalText: messageData.originalText,
            entities: messageData.entities,
            timestamp: messageData.timestamp,
            scheduledTime: scheduledTime.toISOString(),
            position: position,
            mediaFileId: mediaFileId
        };
        
        if (messageData.type === 'media') {
            saveData.mediaType = messageData.mediaType;
            saveData.size = messageData.size;
            saveData.mimeType = messageData.mimeType;
            saveData.fileName = messageData.fileName;
            saveData.caption = messageData.caption;
            saveData.originalCaption = messageData.originalCaption;
            saveData.captionEntities = messageData.captionEntities;
        }
        
        const filename = `post_${uniqueId}_${Date.now()}_${position}.json`;
        const tempFile = path.join(TEMP_DIR, filename);
        fs.writeFileSync(tempFile, JSON.stringify(saveData, null, 2));
        
        const drive = google.drive({ version: 'v3', headers: auth });
        const requestBody = { name: filename, parents: [POSTS_FOLDER_ID], mimeType: 'application/json' };
        const media = { mimeType: 'application/json', body: fs.createReadStream(tempFile) };
        const response = await drive.files.create({ requestBody, media, fields: 'id' });
        
        fs.unlinkSync(tempFile);
        console.log(`[DRIVE] ✅ Post saved: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to save post:', error.message);
        throw error;
    }
}

async function loadPostFromDrive(fileId) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'text' });
        const messageData = JSON.parse(response.data);
        
        if (messageData.type === 'media' && messageData.mediaFileId) {
            messageData.buffer = await loadMediaFromDrive(messageData.mediaFileId);
        }
        return messageData;
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to load post:', error.message);
        throw error;
    }
}

async function deletePostFromDrive(fileId) {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        await drive.files.delete({ fileId: fileId });
        console.log(`[DRIVE] ✅ Deleted post: ${fileId}`);
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to delete post:', error.message);
    }
}

async function loadPendingPosts() {
    try {
        const auth = await getDriveAuth();
        const drive = google.drive({ version: 'v3', headers: auth });
        const response = await drive.files.list({
            q: `'${POSTS_FOLDER_ID}' in parents and name contains 'post_'`,
            fields: 'files(id,name,createdTime)',
            orderBy: 'createdTime asc'
        });
        
        const files = response.data.files || [];
        const posts = [];
        
        for (const file of files) {
            if (processingPosts.has(file.id)) continue;
            try {
                const fileResponse = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' });
                const postData = JSON.parse(fileResponse.data);
                posts.push({
                    id: file.id,
                    data: postData,
                    scheduledTime: new Date(postData.scheduledTime),
                    position: postData.position
                });
            } catch (e) {}
        }
        
        return posts.sort((a, b) => a.scheduledTime - b.scheduledTime);
    } catch (error) {
        console.error('[DRIVE] ❌ Failed to load posts:', error.message);
        return [];
    }
}

// ===== FORMATTING FUNCTIONS =====
async function generateThumbnail(buffer) {
    try {
        return await sharp(buffer).resize(200, 200, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    } catch (err) {
        return null;
    }
}

function cleanWhitespace(text) {
    if (!text) return text;
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
}

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyFormatting(text, entities) {
    if (!text) return '';
    if (!entities || entities.length === 0) return escapeHtml(text);
    
    const sortedEntities = [...entities].sort((a, b) => a.offset - b.offset);
    let result = '';
    let lastIndex = 0;
    let i = 0;
    
    while (i < sortedEntities.length) {
        const entity = sortedEntities[i];
        
        if (entity.offset > lastIndex) {
            result += escapeHtml(text.substring(lastIndex, entity.offset));
        }
        
        const entityEnd = entity.offset + entity.length;
        const nestedEntities = [];
        let j = i + 1;
        while (j < sortedEntities.length) {
            const nextEntity = sortedEntities[j];
            if (nextEntity.offset >= entity.offset && nextEntity.offset + nextEntity.length <= entityEnd) {
                nestedEntities.push({
                    type: nextEntity.type,
                    offset: nextEntity.offset - entity.offset,
                    length: nextEntity.length,
                    url: nextEntity.url
                });
                j++;
            } else {
                break;
            }
        }
        
        let entityContent = text.substring(entity.offset, entityEnd);
        
        if (nestedEntities.length > 0) {
            entityContent = applyFormattingSimple(entityContent, nestedEntities);
        } else {
            entityContent = escapeHtml(entityContent);
        }
        
        let openTag = '', closeTag = '';
        switch (entity.type) {
            case 'bold': openTag = '<b>'; closeTag = '</b>'; break;
            case 'italic': openTag = '<i>'; closeTag = '</i>'; break;
            case 'underline': openTag = '<u>'; closeTag = '</u>'; break;
            case 'strikethrough': openTag = '<s>'; closeTag = '</s>'; break;
            case 'spoiler': openTag = '<tg-spoiler>'; closeTag = '</tg-spoiler>'; break;
            case 'code': openTag = '<code>'; closeTag = '</code>'; break;
            case 'pre': openTag = '<pre>'; closeTag = '</pre>'; break;
            case 'text_link': openTag = `<a href="${escapeHtml(entity.url)}">`; closeTag = '</a>'; break;
            case 'url': openTag = ''; closeTag = ''; break;
            case 'blockquote': openTag = '<blockquote>'; closeTag = '</blockquote>'; break;
            default: openTag = ''; closeTag = '';
        }
        
        result += openTag + entityContent + closeTag;
        i += 1 + nestedEntities.length;
        lastIndex = entityEnd;
    }
    
    if (lastIndex < text.length) {
        result += escapeHtml(text.substring(lastIndex));
    }
    
    return result;
}

function applyFormattingSimple(text, entities) {
    if (!entities || entities.length === 0) return escapeHtml(text);
    
    let result = escapeHtml(text);
    const sortedEntities = [...entities].sort((a, b) => b.offset - a.offset);
    
    for (const entity of sortedEntities) {
        let openTag = '', closeTag = '';
        switch (entity.type) {
            case 'bold': openTag = '<b>'; closeTag = '</b>'; break;
            case 'italic': openTag = '<i>'; closeTag = '</i>'; break;
            case 'underline': openTag = '<u>'; closeTag = '</u>'; break;
            case 'strikethrough': openTag = '<s>'; closeTag = '</s>'; break;
            case 'spoiler': openTag = '<tg-spoiler>'; closeTag = '</tg-spoiler>'; break;
            case 'code': openTag = '<code>'; closeTag = '</code>'; break;
            case 'pre': openTag = '<pre>'; closeTag = '</pre>'; break;
            case 'text_link': openTag = `<a href="${escapeHtml(entity.url)}">`; closeTag = '</a>'; break;
            case 'url': openTag = ''; closeTag = ''; break;
            case 'blockquote': openTag = '<blockquote>'; closeTag = '</blockquote>'; break;
            default: continue;
        }
        
        const start = entity.offset;
        const end = start + entity.length;
        if (start < 0 || end > result.length || start >= end) continue;
        
        const content = result.substring(start, end);
        result = result.substring(0, start) + openTag + content + closeTag + result.substring(end);
    }
    
    return result;
}

function entitiesToWhatsApp(text, entities) {
    if (!text) return text;
    
    let cleanText = text;
    cleanText = cleanText.replace(/\*\*/g, '');
    cleanText = cleanText.replace(/__/g, '');
    cleanText = cleanText.replace(/~~/g, '');
    cleanText = cleanText.replace(/`/g, '');
    
    if (!entities || entities.length === 0) {
        let formatted = cleanText;
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
        formatted = formatted.replace(/__(.*?)__/g, '_$1_');
        formatted = formatted.replace(/~~(.*?)~~/g, '~$1~');
        formatted = formatted.replace(/`(.*?)`/g, '```$1```');
        return cleanWhitespace(formatted);
    }
    
    const sortedEntities = [...entities].sort((a, b) => b.offset - a.offset);
    let textArray = cleanText.split('');
    
    for (const entity of sortedEntities) {
        const start = entity.offset;
        const end = start + entity.length;
        if (start >= textArray.length || end > textArray.length) continue;
        
        const content = cleanText.substring(start, end);
        
        let prefix = '', suffix = '';
        switch (entity.type) {
            case 'bold': prefix = '*'; suffix = '*'; break;
            case 'italic': prefix = '_'; suffix = '_'; break;
            case 'strikethrough': prefix = '~'; suffix = '~'; break;
            case 'code': prefix = '```'; suffix = '```'; break;
            case 'pre': prefix = '```\n'; suffix = '\n```'; break;
            default: continue;
        }
        
        let replacement;
        if (entity.type === 'pre') {
            replacement = prefix + content + suffix;
        } else {
            const lines = content.split('\n');
            const wrappedLines = [];
            for (const line of lines) {
                if (line.trim()) {
                    wrappedLines.push(prefix + line.trim() + suffix);
                } else {
                    wrappedLines.push('');
                }
            }
            replacement = wrappedLines.join('\n');
        }
        
        textArray.splice(start, end - start, replacement);
    }
    
    let result = textArray.join('');
    return cleanWhitespace(result);
}

// ===== FORWARDING FUNCTIONS =====
async function sendToWhatsAppChannel(messageData) {
    if (!whatsappSock) return false;
    if (messageData.type === 'text') {
        await whatsappSock.sendMessage(WHATSAPP_CHANNEL, { text: messageData.content });
    } else if (messageData.type === 'media' && messageData.buffer) {
        const mediaBuffer = messageData.buffer;
        const mediaCaption = messageData.caption || '';
        let thumbnail = null;
        if (messageData.mediaType === 'photo') thumbnail = await generateThumbnail(mediaBuffer);
        
        const messageOptions = {
            [messageData.mediaType === 'photo' ? 'image' : messageData.mediaType === 'video' ? 'video' : 'document']: mediaBuffer,
            caption: mediaCaption
        };
        if (thumbnail && messageData.mediaType === 'photo') messageOptions.jpegThumbnail = thumbnail;
        await whatsappSock.sendMessage(WHATSAPP_CHANNEL, messageOptions);
    }
    return true;
}

async function sendToTelegramChannel(messageData) {
    if (!sendBot) return false;
    if (messageData.type === 'text') {
        const formattedText = applyFormatting(messageData.originalText, messageData.entities);
        await sendBot.sendMessage(TELEGRAM_CHANNEL_ID, formattedText, { parse_mode: 'HTML' });
    } else if (messageData.type === 'media' && messageData.buffer) {
        const caption = messageData.originalCaption || '';
        const formattedCaption = applyFormatting(caption, messageData.captionEntities);
        const mediaBuffer = messageData.buffer;
        const ext = messageData.mediaType === 'photo' ? 'jpg' : messageData.mediaType === 'video' ? 'mp4' : 'bin';
        const tempFilePath = path.join(TEMP_DIR, `send_tg_${Date.now()}.${ext}`);
        fs.writeFileSync(tempFilePath, mediaBuffer);
        try {
            if (messageData.mediaType === 'photo') {
                await sendBot.sendPhoto(TELEGRAM_CHANNEL_ID, tempFilePath, { caption: formattedCaption, parse_mode: 'HTML' });
            } else if (messageData.mediaType === 'video') {
                await sendBot.sendVideo(TELEGRAM_CHANNEL_ID, tempFilePath, { caption: formattedCaption, parse_mode: 'HTML' });
            } else {
                await sendBot.sendDocument(TELEGRAM_CHANNEL_ID, tempFilePath, { caption: formattedCaption, parse_mode: 'HTML' });
            }
        } finally {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }
    }
    return true;
}

async function sendToAllGroups(messageData) {
    if (!whatsappSock) return false;
    let successCount = 0;
    for (let i = 0; i < WHATSAPP_GROUPS.length; i++) {
        const target = WHATSAPP_GROUPS[i];
        try {
            if (messageData.type === 'text') {
                await whatsappSock.sendMessage(target, { text: messageData.content });
                successCount++;
            } else if (messageData.type === 'media' && messageData.buffer) {
                let thumbnail = null;
                if (messageData.mediaType === 'photo') thumbnail = await generateThumbnail(messageData.buffer);
                const messageOptions = {
                    [messageData.mediaType === 'photo' ? 'image' : messageData.mediaType === 'video' ? 'video' : 'document']: messageData.buffer,
                    caption: messageData.caption || ''
                };
                if (thumbnail && messageData.mediaType === 'photo') messageOptions.jpegThumbnail = thumbnail;
                await whatsappSock.sendMessage(target, messageOptions);
                successCount++;
            }
            if (i < WHATSAPP_GROUPS.length - 1) await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        } catch (err) {}
    }
    return successCount > 0;
}

async function sendToOwnChat(messageData) {
    if (!whatsappSock) return false;
    const jid = WHATSAPP_NUMBER.includes('@') ? WHATSAPP_NUMBER : `${WHATSAPP_NUMBER}@s.whatsapp.net`;
    if (messageData.type === 'text') {
        await whatsappSock.sendMessage(jid, { text: messageData.content });
    } else if (messageData.type === 'media' && messageData.buffer) {
        let thumbnail = null;
        if (messageData.mediaType === 'photo') thumbnail = await generateThumbnail(messageData.buffer);
        const messageOptions = {
            [messageData.mediaType === 'photo' ? 'image' : messageData.mediaType === 'video' ? 'video' : 'document']: messageData.buffer,
            caption: messageData.caption || ''
        };
        if (thumbnail && messageData.mediaType === 'photo') messageOptions.jpegThumbnail = thumbnail;
        await whatsappSock.sendMessage(jid, messageOptions);
    }
    return true;
}

async function sendToAllDestinations(messageData) {
    let allSuccess = true;
    if (!await sendToWhatsAppChannel(messageData)) allSuccess = false;
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!await sendToTelegramChannel(messageData)) allSuccess = false;
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!await sendToAllGroups(messageData)) allSuccess = false;
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!await sendToOwnChat(messageData)) allSuccess = false;
    return allSuccess;
}

// ===== SCHEDULER FUNCTIONS =====
async function sendPost(postData) {
    const messageData = {
        type: postData.type,
        content: postData.content,
        originalText: postData.originalText,
        entities: postData.entities,
        timestamp: postData.timestamp
    };
    
    if (postData.type === 'media') {
        messageData.mediaType = postData.mediaType;
        messageData.size = postData.size;
        messageData.mimeType = postData.mimeType;
        messageData.fileName = postData.fileName;
        messageData.caption = postData.caption;
        messageData.originalCaption = postData.originalCaption;
        messageData.captionEntities = postData.captionEntities;
        messageData.buffer = postData.buffer;
        if (!messageData.buffer || messageData.buffer.length === 0) return false;
    }
    
    return await sendToAllDestinations(messageData);
}

async function processQueue() {
    const posts = await loadPendingPosts();
    if (posts.length === 0) {
        scheduledTask = null;
        return;
    }
    
    const now = getPakistanTime();
    const nextPost = posts[0];
    const timeDiff = now - nextPost.scheduledTime;
    
    if (nextPost.scheduledTime > now) {
        const delay = nextPost.scheduledTime - now;
        scheduledTask = setTimeout(processQueue, delay);
        return;
    }
    
    if (timeDiff > MISSED_POST_WINDOW_MS) {
        if (nextPost.data.mediaFileId) await deleteMediaFromDrive(nextPost.data.mediaFileId);
        await deletePostFromDrive(nextPost.id);
        setImmediate(processQueue);
        return;
    }
    
    processingPosts.add(nextPost.id);
    const loadedPost = await loadPostFromDrive(nextPost.id);
    
    if (loadedPost) {
        const success = await sendPost(loadedPost);
        if (success) {
            if (loadedPost.mediaFileId) await deleteMediaFromDrive(loadedPost.mediaFileId);
            await deletePostFromDrive(nextPost.id);
            lastSendTime = now;
            await saveScheduleToDrive();
        }
    }
    
    processingPosts.delete(nextPost.id);
    setImmediate(processQueue);
}

async function queuePost(messageData, uniqueId) {
    const posts = await loadPendingPosts();
    const position = posts.length + 1;
    let scheduledTime;
    let mediaFileId = null;
    let mediaBuffer = null;
    
    if (messageData.type === 'media' && messageData.buffer && messageData.buffer.length > 0) {
        mediaBuffer = messageData.buffer;
        const ext = messageData.mediaType === 'photo' ? 'jpg' : messageData.mediaType === 'video' ? 'mp4' : 'bin';
        mediaFileId = await saveMediaToDrive(mediaBuffer, messageData.mimeType, ext);
    }
    
    if (posts.length === 0 && !lastSendTime) {
        scheduledTime = getPakistanTime();
    } else {
        let lastTime;
        if (posts.length > 0) {
            lastTime = posts[posts.length - 1].scheduledTime;
        } else if (lastSendTime) {
            lastTime = lastSendTime;
        } else {
            lastTime = getPakistanTime();
        }
        scheduledTime = addRandomHours(lastTime);
        const scheduledHour = scheduledTime.getHours();
        if (scheduledHour >= NIGHT_START_HOUR || scheduledHour < NIGHT_END_HOUR) {
            const morningTime = new Date(scheduledTime);
            morningTime.setHours(NIGHT_END_HOUR, 0, 0, 0);
            if (morningTime <= scheduledTime) morningTime.setDate(morningTime.getDate() + 1);
            scheduledTime = morningTime;
        }
    }
    
    const postId = await savePostToDrive(messageData, uniqueId, scheduledTime, position, mediaFileId);
    const now = getPakistanTime();
    const isImmediate = scheduledTime <= now;
    
    if (isImmediate && mediaBuffer) {
        messageData.buffer = mediaBuffer;
        const success = await sendToAllDestinations(messageData);
        if (success) {
            if (mediaFileId) await deleteMediaFromDrive(mediaFileId);
            await deletePostFromDrive(postId);
            lastSendTime = now;
            await saveScheduleToDrive();
            return { scheduledTime, position, sent: true };
        }
    }
    
    if (!scheduledTask) {
        const nextPosts = await loadPendingPosts();
        if (nextPosts.length > 0) {
            const delay = Math.max(0, nextPosts[0].scheduledTime - now);
            if (delay > 0) {
                scheduledTask = setTimeout(processQueue, delay);
            } else {
                processQueue();
            }
        }
    }
    
    return { scheduledTime, position, sent: false };
}

async function forceSendNextPost() {
    const posts = await loadPendingPosts();
    if (posts.length === 0) return { success: false, message: "No posts in queue" };
    
    const nextPost = posts[0];
    processingPosts.add(nextPost.id);
    const loadedPost = await loadPostFromDrive(nextPost.id);
    
    if (!loadedPost) {
        processingPosts.delete(nextPost.id);
        return { success: false, message: "Failed to load post" };
    }
    
    const success = await sendPost(loadedPost);
    
    if (success) {
        if (loadedPost.mediaFileId) await deleteMediaFromDrive(loadedPost.mediaFileId);
        await deletePostFromDrive(nextPost.id);
        lastSendTime = getPakistanTime();
        await saveScheduleToDrive();
        processingPosts.delete(nextPost.id);
        return { success: true, message: `Post #${nextPost.position} sent` };
    }
    
    processingPosts.delete(nextPost.id);
    return { success: false, message: "Failed to send" };
}

// ===== TELEGRAM BOT HANDLER =====
function initTelegramBot() {
    sendBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    telegrafBot = new Telegraf(TELEGRAM_BOT_TOKEN);
    
    console.log('🤖 Telegram Bot Started!');
    console.log(`👥 Groups: ${WHATSAPP_GROUPS.length} groups configured`);
    console.log(`📁 Posts Folder: ${POSTS_FOLDER_ID}`);
    console.log(`📁 Media Folder: ${MEDIA_FOLDER_ID}`);
    console.log(`📁 Schedule File ID: ${SCHEDULE_FILE_ID}`);
    console.log(`⏰ Random delay: ${MIN_DELAY_HOURS}-${MAX_DELAY_HOURS} hours`);
    console.log(`🕐 Current PKT: ${formatPakistanTime()}\n`);
    
    telegrafBot.command('start', (ctx) => {
        ctx.reply(
            `🤖 *WhatsApp Forwarder Bot*\n\n` +
            `Send any message and choose where to forward it.\n\n` +
            `*Options:*\n` +
            `• 📺 *WhatsApp Channel* - Send to WhatsApp channel\n` +
            `• 🌐 *Telegram Channel* - Send to Telegram channel\n` +
            `• 👥 *ALL GROUPS* - Send to ${WHATSAPP_GROUPS.length} groups\n` +
            `• 📱 *Own Chat* - Send only to your WhatsApp\n` +
            `• ⏰ *SCHEDULE TO ALL* - Send to ALL destinations with ${MIN_DELAY_HOURS}-${MAX_DELAY_HOURS}h delay\n` +
            `• 🚀 *SEND NOW TO ALL* - Send immediately to ALL destinations\n` +
            `• ❌ *Cancel*\n\n` +
            `*Commands:*\n` +
            `• /queue - Check queue status\n` +
            `• /time - Current Pakistan time\n` +
            `• /send - Force send next post`,
            { parse_mode: 'Markdown' }
        );
    });
    
    telegrafBot.command('send', async (ctx) => {
        await ctx.reply('⏰ *Force sending next post...*\n\nI will notify you when it\'s sent.', { parse_mode: 'Markdown' });
        
        forceSendNextPost().then(result => {
            if (result.success) {
                ctx.telegram.sendMessage(ctx.chat.id, `✅ *${result.message}*`, { parse_mode: 'Markdown' });
            } else {
                ctx.telegram.sendMessage(ctx.chat.id, `❌ *${result.message}*`, { parse_mode: 'Markdown' });
            }
        }).catch(err => {
            console.error('Force send error:', err);
            ctx.telegram.sendMessage(ctx.chat.id, '❌ Failed to send post.');
        });
    });
    
    telegrafBot.command('time', (ctx) => {
        ctx.reply(`🕐 *Pakistan Time:* ${formatPakistanTime()}\n🌙 *Night Mode:* ${isNightTime() ? 'ACTIVE' : 'INACTIVE'}`, { parse_mode: 'Markdown' });
    });
    
    telegrafBot.command('queue', async (ctx) => {
        const posts = await loadPendingPosts();
        if (posts.length === 0) {
            await ctx.reply('📭 No posts in queue.');
            return;
        }
        let msg = `📋 *Queue Status*\n\n📊 *Total queued:* ${posts.length}\n🕐 *Current PKT:* ${formatPakistanTime()}\n\n*Scheduled times:*\n`;
        for (let i = 0; i < Math.min(posts.length, 10); i++) {
            msg += `${i + 1}. Post #${posts[i].position}: ${formatPakistanTime(posts[i].scheduledTime)}\n`;
        }
        await ctx.reply(msg, { parse_mode: 'Markdown' });
    });
    
    const pendingMessages = new Map();
    
    telegrafBot.on('text', async (ctx) => {
        const originalText = ctx.message.text;
        const entities = ctx.message.entities || [];
        const simpleEntities = entities.map(e => ({ type: e.type, offset: e.offset, length: e.length, url: e.url }));
        const formattedForWhatsApp = entitiesToWhatsApp(originalText, simpleEntities);
        const uniqueId = `${ctx.chat.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        pendingMessages.set(uniqueId, {
            type: 'text',
            content: formattedForWhatsApp,
            originalText: originalText,
            entities: simpleEntities,
            timestamp: Date.now()
        });
        
        await ctx.reply(
            `📨 New Message\n\nPreview: ${originalText.substring(0, 100)}...\n\nForward to?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `📺 WhatsApp Channel`, callback_data: `${uniqueId}_channel` }],
                        [{ text: `🌐 Telegram Channel`, callback_data: `${uniqueId}_telegram` }],
                        [{ text: `👥 ALL GROUPS (${WHATSAPP_GROUPS.length})`, callback_data: `${uniqueId}_groups` }],
                        [{ text: `📱 Own Chat`, callback_data: `${uniqueId}_own` }],
                        [{ text: `⏰ SCHEDULE TO ALL (${MIN_DELAY_HOURS}-${MAX_DELAY_HOURS}h)`, callback_data: `${uniqueId}_schedule` }],
                        [{ text: `🚀 SEND NOW TO ALL`, callback_data: `${uniqueId}_sendnow` }],
                        [{ text: `❌ Cancel`, callback_data: `${uniqueId}_cancel` }]
                    ]
                }
            }
        );
    });
    
    telegrafBot.on('photo', async (ctx) => {
        const caption = ctx.message.caption || '';
        const entities = ctx.message.caption_entities || [];
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        
        try {
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const simpleEntities = entities.map(e => ({ type: e.type, offset: e.offset, length: e.length, url: e.url }));
            const formattedCaption = entitiesToWhatsApp(caption, simpleEntities);
            const uniqueId = `${ctx.chat.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            pendingMessages.set(uniqueId, {
                type: 'media',
                mediaType: 'photo',
                buffer: buffer,
                size: buffer.length,
                caption: formattedCaption,
                originalCaption: caption,
                captionEntities: simpleEntities,
                timestamp: Date.now()
            });
            
            await ctx.reply(
                `📨 New Photo\n\nCaption: ${caption.substring(0, 100)}...\n\nForward to?`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `📺 WhatsApp Channel`, callback_data: `${uniqueId}_channel` }],
                            [{ text: `🌐 Telegram Channel`, callback_data: `${uniqueId}_telegram` }],
                            [{ text: `👥 ALL GROUPS (${WHATSAPP_GROUPS.length})`, callback_data: `${uniqueId}_groups` }],
                            [{ text: `📱 Own Chat`, callback_data: `${uniqueId}_own` }],
                            [{ text: `⏰ SCHEDULE TO ALL (${MIN_DELAY_HOURS}-${MAX_DELAY_HOURS}h)`, callback_data: `${uniqueId}_schedule` }],
                            [{ text: `🚀 SEND NOW TO ALL`, callback_data: `${uniqueId}_sendnow` }],
                            [{ text: `❌ Cancel`, callback_data: `${uniqueId}_cancel` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error processing photo:', error.message);
            await ctx.reply('❌ Failed to process image.');
        }
    });
    
    telegrafBot.on('video', async (ctx) => {
        const caption = ctx.message.caption || '';
        const entities = ctx.message.caption_entities || [];
        const video = ctx.message.video;
        
        try {
            const fileLink = await ctx.telegram.getFileLink(video.file_id);
            const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const simpleEntities = entities.map(e => ({ type: e.type, offset: e.offset, length: e.length, url: e.url }));
            const formattedCaption = entitiesToWhatsApp(caption, simpleEntities);
            const uniqueId = `${ctx.chat.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            pendingMessages.set(uniqueId, {
                type: 'media',
                mediaType: 'video',
                buffer: buffer,
                size: buffer.length,
                caption: formattedCaption,
                originalCaption: caption,
                captionEntities: simpleEntities,
                timestamp: Date.now()
            });
            
            await ctx.reply(
                `📨 New Video\n\nCaption: ${caption.substring(0, 100)}...\n\nForward to?`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `📺 WhatsApp Channel`, callback_data: `${uniqueId}_channel` }],
                            [{ text: `🌐 Telegram Channel`, callback_data: `${uniqueId}_telegram` }],
                            [{ text: `👥 ALL GROUPS (${WHATSAPP_GROUPS.length})`, callback_data: `${uniqueId}_groups` }],
                            [{ text: `📱 Own Chat`, callback_data: `${uniqueId}_own` }],
                            [{ text: `⏰ SCHEDULE TO ALL (${MIN_DELAY_HOURS}-${MAX_DELAY_HOURS}h)`, callback_data: `${uniqueId}_schedule` }],
                            [{ text: `🚀 SEND NOW TO ALL`, callback_data: `${uniqueId}_sendnow` }],
                            [{ text: `❌ Cancel`, callback_data: `${uniqueId}_cancel` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error processing video:', error.message);
            await ctx.reply('❌ Failed to process video.');
        }
    });
    
    telegrafBot.action(/.+/, async (ctx) => {
        const callbackData = ctx.callbackQuery.data;
        const parts = callbackData.split('_');
        const target = parts.pop();
        const uniqueId = parts.join('_');
        
        const messageData = pendingMessages.get(uniqueId);
        
        if (!messageData) {
            await ctx.answerCbQuery('❌ Message expired!');
            await ctx.editMessageText('❌ This message has expired.');
            return;
        }
        
        pendingMessages.delete(uniqueId);
        
        if (target === 'cancel') {
            await ctx.answerCbQuery('Cancelled');
            await ctx.editMessageText('❌ Cancelled.');
            return;
        }
        
        if (target === 'schedule') {
            await ctx.answerCbQuery('⏰ Scheduling post...');
            await ctx.editMessageText('⏰ *Post is being scheduled...*\n\nIt will be sent to ALL destinations at the scheduled time.', { parse_mode: 'Markdown' });
            
            queuePost(messageData, uniqueId).then(({ position, sent }) => {
                if (sent) {
                    ctx.telegram.sendMessage(ctx.chat.id, `✅ *Post #${position} sent immediately to ALL destinations!*`, { parse_mode: 'Markdown' });
                } else {
                    ctx.telegram.sendMessage(ctx.chat.id, `⏰ *Post #${position} scheduled!*\n\nIt will be sent to ALL destinations at the scheduled time.`, { parse_mode: 'Markdown' });
                }
            }).catch(err => {
                console.error('Background processing error:', err);
                ctx.telegram.sendMessage(ctx.chat.id, '❌ Failed to schedule post.');
            });
            return;
        }
        
        if (target === 'sendnow') {
            await ctx.answerCbQuery('🚀 Sending post now...');
            await ctx.editMessageText('🚀 *Sending post to ALL destinations...*\n\nPlease wait.', { parse_mode: 'Markdown' });
            
            const success = await sendToAllDestinations(messageData);
            
            if (success) {
                await ctx.telegram.sendMessage(ctx.chat.id, '✅ *Post sent immediately to ALL destinations!*', { parse_mode: 'Markdown' });
            } else {
                await ctx.telegram.sendMessage(ctx.chat.id, '❌ Failed to send post to ALL destinations.', { parse_mode: 'Markdown' });
            }
            return;
        }
        
        await ctx.answerCbQuery('⏳ Processing...');
        
        let success = false;
        let targetText = '';
        
        if (target === 'channel') {
            success = await sendToWhatsAppChannel(messageData);
            targetText = 'WhatsApp channel';
        } else if (target === 'telegram') {
            success = await sendToTelegramChannel(messageData);
            targetText = 'Telegram channel';
        } else if (target === 'groups') {
            success = await sendToAllGroups(messageData);
            targetText = `${WHATSAPP_GROUPS.length} groups`;
        } else if (target === 'own') {
            success = await sendToOwnChat(messageData);
            targetText = 'your chat';
        }
        
        if (success) {
            await ctx.editMessageText(`✅ Successfully forwarded to ${targetText}`);
        } else {
            await ctx.editMessageText('❌ Failed to forward.');
        }
    });
    
    telegrafBot.launch();
}

// ===== MAIN COMMAND =====
module.exports = {
    name: 'telegram',
    aliases: ['tg', 'bridge'],
    category: 'owner',
    description: 'Telegram to WhatsApp bridge with scheduling',
    usage: '.telegram\n.telegram on\n.telegram off\n.telegram status',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        const sub = args[0]?.toLowerCase();
        
        whatsappSock = sock;
        
        if (!sub || sub === 'status') {
            let statusText = `🤖 *Telegram Bridge*\n\n`;
            statusText += `Active: ${isTelegramActive ? '✅' : '❌'}\n`;
            statusText += `WhatsApp: ${WHATSAPP_NUMBER}\n`;
            statusText += `Groups: ${WHATSAPP_GROUPS.length}\n`;
            statusText += `Channel: ${WHATSAPP_CHANNEL}\n`;
            statusText += `Telegram Channel: ${TELEGRAM_CHANNEL_ID}\n`;
            statusText += `Delay: ${MIN_DELAY_HOURS}-${MAX_DELAY_HOURS} hours\n`;
            statusText += `Night Mode: ${NIGHT_START_HOUR}:00 - ${NIGHT_END_HOUR}:00 PKT\n\n`;
            statusText += `*Commands:*\n`;
            statusText += `• \`.telegram on\` - Start bridge\n`;
            statusText += `• \`.telegram off\` - Stop bridge\n`;
            statusText += `• \`.telegram status\` - Show status`;
            
            await reply(statusText);
            return;
        }
        
        if (sub === 'on' || sub === 'start') {
            if (isTelegramActive) {
                await reply('⚠️ Bridge is already active!');
                return;
            }
            
            await react('⏳');
            await reply('🔄 Starting Telegram bridge...');
            
            try {
                initTelegramBot();
                isTelegramActive = true;
                
                await react('✅');
                await reply(`✅ *Telegram Bridge Active*\n\n` +
                           `👥 Groups: ${WHATSAPP_GROUPS.length}\n` +
                           `📺 Channel: ${WHATSAPP_CHANNEL}\n` +
                           `📱 Own Chat: ${WHATSAPP_NUMBER}\n\n` +
                           `Send messages to your Telegram bot!`);
                
            } catch (error) {
                console.error('[TELEGRAM] Start error:', error);
                await react('❌');
                await reply(`❌ Failed to start: ${error.message}`);
            }
            return;
        }
        
        if (sub === 'off' || sub === 'stop') {
            if (!isTelegramActive) {
                await reply('⚠️ Bridge is not active!');
                return;
            }
            
            await react('⏳');
            
            try {
                if (telegrafBot) {
                    telegrafBot.stop();
                    telegrafBot = null;
                }
                if (sendBot) {
                    sendBot = null;
                }
                if (scheduledTask) {
                    clearTimeout(scheduledTask);
                    scheduledTask = null;
                }
                
                isTelegramActive = false;
                
                await react('🔴');
                await reply('🔴 *Telegram Bridge Stopped*');
                
            } catch (error) {
                console.error('[TELEGRAM] Stop error:', error);
                await react('❌');
                await reply(`❌ Error stopping: ${error.message}`);
            }
            return;
        }
        
        await reply(`❌ Unknown: ${sub}\nUse \`.telegram\` for help`);
    }
};

// ===== AUTO-START FUNCTION =====
module.exports.autoStart = async function(sock) {
    if (isTelegramActive) return true;
    
    console.log('🔄 Auto-starting Telegram bridge...');
    whatsappSock = sock;
    
    try {
        initTelegramBot();
        isTelegramActive = true;
        console.log('✅ Telegram bridge auto-started');
        return true;
    } catch (error) {
        console.error('❌ Telegram bridge auto-start failed:', error.message);
        return false;
    }
};
