/**
 * UP4 Command - Upload files to up-4ever.net
 * Uploads documents, images, videos, and audio files with custom filename support
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { google } = require('googleapis');

const botConfig = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Google Drive config for cookies
const COOKIES_FOLDER_ID = "1euugJq55mn2C5a1egcIFF8FLcFu0QsGN";
const COOKIES_FILE_NAME = "cookies.txt";

// Upload server configurations
const UP4EVER_BASE = "https://www.up-4ever.net";
const UPLOAD_URL = "https://www.up-4ever.net/";

// Supported file types
const SUPPORTED_TYPES = [
    'document', 'image', 'video', 'audio', 
    'documentMessage', 'imageMessage', 'videoMessage', 'audioMessage'
];

module.exports = {
    name: 'up4',
    aliases: ['upload', 'up4ever', 'uploadfile'],
    category: 'owner',
    description: 'Upload files to up-4ever.net with custom filename',
    usage: '.up4 [filename]\n.up4 --help\n\nReply to a file or provide filename to rename',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react, isReply } = context;
        
        if (args[0] === '--help') {
            return reply(`📤 *UP4EVER UPLOAD COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `• \`.up4\` - Upload replied file with custom filename prompt\n` +
                       `• \`.up4 filename.txt\` - Upload replied file with custom name\n` +
                       `• \`.up4 --help\` - Show this help\n\n` +
                       `*Supported:* Documents, Images, Videos, Audio\n` +
                       `*Max Size:* 1GB (up-4ever limit)\n\n` +
                       `> *Powered by ${botConfig.botName}*`);
        }
        
        await react('📤');
        
        // Check if replying to a message with file
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let hasFile = false;
        let fileType = null;
        let fileData = null;
        
        if (quotedMessage) {
            // Check for document
            if (quotedMessage.documentMessage) {
                hasFile = true;
                fileType = 'document';
                fileData = quotedMessage.documentMessage;
            }
            // Check for image
            else if (quotedMessage.imageMessage) {
                hasFile = true;
                fileType = 'image';
                fileData = quotedMessage.imageMessage;
            }
            // Check for video
            else if (quotedMessage.videoMessage) {
                hasFile = true;
                fileType = 'video';
                fileData = quotedMessage.videoMessage;
            }
            // Check for audio
            else if (quotedMessage.audioMessage) {
                hasFile = true;
                fileType = 'audio';
                fileData = quotedMessage.audioMessage;
            }
        }
        
        if (!hasFile) {
            return reply(`❌ *No file found!*\n\nPlease reply to a file (document, image, video, or audio) with:\n\`.up4\`\n\nOr specify a filename:\n\`.up4 myfile.txt\``);
        }
        
        // Get custom filename from args
        let customFilename = null;
        if (args.length > 0 && args[0] !== '--help') {
            customFilename = args.join(' ');
            // Clean the filename
            customFilename = customFilename.replace(/[<>:"/\\|?*]/g, '_');
            if (!customFilename.includes('.')) {
                // Add extension from original
                const ext = path.extname(fileData.fileName || '');
                if (ext) customFilename += ext;
            }
        }
        
        // Create session
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'up4') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        const session = sessionManager.createSession(sender, from, this.name, {
            type: 'upload',
            fileType: fileType,
            fileData: fileData,
            customFilename: customFilename,
            status: 'processing'
        });
        
        // Start upload process
        await processUpload(sock, from, sender, session, reply, react);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'up4') return true;
        
        // Handle filename input
        if (session.data.type === 'waiting_filename') {
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text;
            }
            
            if (!text) return true;
            
            if (text.toLowerCase() === 'cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Upload cancelled.`);
                return true;
            }
            
            // Clean the filename
            let cleanName = text.replace(/[<>:"/\\|?*]/g, '_');
            const originalExt = path.extname(session.data.originalFileName || '');
            if (!cleanName.includes('.') && originalExt) {
                cleanName += originalExt;
            }
            
            session.data.customFilename = cleanName;
            session.data.type = 'upload';
            
            await processUpload(sock, from, sender, session, reply, react);
            return true;
        }
        
        if (isButtonClick) {
            let buttonId = null;
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId === 'up4_cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Upload cancelled.`);
                return true;
            }
            
            if (buttonId === 'up4_retry') {
                session.data.type = 'upload';
                await processUpload(sock, from, sender, session, reply, react);
                return true;
            }
        }
        
        return true;
    }
};

async function processUpload(sock, chatId, sender, session, reply, react) {
    const { fileType, fileData, customFilename, originalFileName } = session.data;
    
    if (!fileData) {
        await reply(`❌ File data not found. Please try again.`);
        sessionManager.clearSession(session.id);
        return;
    }
    
    const statusMsg = await reply(`📤 *Processing file...*\n\n⏳ Downloading file...`);
    
    try {
        // Download the file
        const fileBuffer = await downloadFile(fileType, fileData);
        if (!fileBuffer) {
            await sock.sendMessage(chatId, { 
                text: `❌ *Failed to download file!*`, 
                edit: statusMsg.key 
            });
            sessionManager.clearSession(session.id);
            return;
        }
        
        // Get original filename
        const originalName = fileData.fileName || `file_${Date.now()}`;
        session.data.originalFileName = originalName;
        
        // Determine final filename
        let finalFilename = customFilename || originalName;
        
        // Ask for filename if not provided
        if (!customFilename && session.data.type !== 'waiting_filename') {
            const ext = path.extname(originalName);
            const nameWithoutExt = path.basename(originalName, ext);
            
            const message = `📝 *Filename Customization*\n\n` +
                           `Current filename: \`${originalName}\`\n\n` +
                           `Options:\n` +
                           `1️⃣ Keep original - Reply with: \`keep\`\n` +
                           `2️⃣ Change filename - Reply with new name (including extension)\n` +
                           `   Example: \`my_video.mp4\`\n\n` +
                           `⏱️ You have 5 minutes to respond.\n` +
                           `Type \`cancel\` to abort.`;
            
            await sock.sendMessage(chatId, { text: message, edit: statusMsg.key });
            session.data.type = 'waiting_filename';
            
            // Wait for user response (handled in handleSession)
            return;
        }
        
        // If user said "keep" or "original"
        if (customFilename && customFilename.toLowerCase() === 'keep') {
            finalFilename = originalName;
        }
        
        // Save file temporarily
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, `up4_${Date.now()}_${finalFilename}`);
        fs.writeFileSync(tempFile, fileBuffer);
        
        const fileSize = fileBuffer.length;
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        
        await sock.sendMessage(chatId, { 
            text: `📤 *Uploading to up-4ever.net...*\n\n📄 File: \`${finalFilename}\`\n📏 Size: ${fileSizeMB} MB\n⏳ Please wait...`,
            edit: statusMsg.key 
        });
        
        // Get cookies and upload
        const cookies = await getCookies();
        if (!cookies) {
            await sock.sendMessage(chatId, { 
                text: `❌ *Failed to get authentication cookies!*`, 
                edit: statusMsg.key 
            });
            fs.unlinkSync(tempFile);
            sessionManager.clearSession(session.id);
            return;
        }
        
        const uploadResult = await uploadToUp4ever(tempFile, finalFilename, cookies);
        
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch(e) {}
        
        if (uploadResult.success) {
            await sock.sendMessage(chatId, {
                text: `✅ *Upload Successful!*\n\n` +
                      `📄 File: \`${finalFilename}\`\n` +
                      `📏 Size: ${fileSizeMB} MB\n` +
                      `👤 Account: ${uploadResult.account || 'Unknown'}\n\n` +
                      `🔗 *Download Link:*\n${uploadResult.link}\n\n` +
                      `💡 File available for 30 days\n` +
                      `${originalName !== finalFilename ? `📝 Original name: \`${originalName}\`` : ''}`,
                edit: statusMsg.key
            });
            await react('✅');
            sessionManager.clearSession(session.id);
        } else {
            // Show retry option
            const errorMsg = uploadResult.error || 'Unknown error';
            await sock.sendMessage(chatId, {
                text: `❌ *Upload Failed!*\n\nError: ${errorMsg}\n\nPlease try again later.`,
                edit: statusMsg.key
            });
            await react('❌');
            
            // Show retry button
            const sessionId = session.id.split(':').pop();
            await sendButtons(sock, chatId, {
                text: `❌ Upload failed. Retry?`,
                footer: 'up-4ever Upload',
                buttons: [
                    { id: `up4_retry_${sessionId}_${Date.now()}`, text: '🔄 Retry' },
                    { id: `up4_cancel_${sessionId}_${Date.now()}`, text: '❌ Cancel' }
                ],
                aimode: FORCE_AI_MODE
            }, {});
            session.data.type = 'waiting_retry';
        }
        
    } catch (error) {
        console.error('[UP4] Upload error:', error);
        await sock.sendMessage(chatId, {
            text: `❌ *Error uploading file!*\n\n${error.message}`,
            edit: statusMsg.key
        });
        await react('❌');
        sessionManager.clearSession(session.id);
    }
}

async function downloadFile(fileType, fileData) {
    try {
        let messageType;
        switch(fileType) {
            case 'document': messageType = 'document'; break;
            case 'image': messageType = 'image'; break;
            case 'video': messageType = 'video'; break;
            case 'audio': messageType = 'audio'; break;
            default: messageType = 'document';
        }
        
        const stream = await downloadContentFromMessage(fileData, messageType);
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        return Buffer.concat(buffer);
    } catch (error) {
        console.error('[UP4] Download error:', error);
        return null;
    }
}

async function getCookies() {
    try {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        // Try to get from Google Drive
        const cookiesData = await downloadCookiesFromDrive();
        if (cookiesData) {
            return parseCookies(cookiesData);
        }
        
        console.error('[UP4] Failed to get cookies from Drive');
        return null;
    } catch (error) {
        console.error('[UP4] Cookie error:', error);
        return null;
    }
}

async function downloadCookiesFromDrive() {
    try {
        const drive = google.drive({ version: 'v3' });
        
        // Use API key or OAuth - simplified approach
        const response = await axios({
            method: 'GET',
            url: `https://drive.usercontent.google.com/download?id=${COOKIES_FOLDER_ID}&export=download`,
            responseType: 'text',
            timeout: 30000
        });
        
        return response.data;
    } catch (error) {
        console.error('[UP4] Failed to download cookies from Drive:', error.message);
        return null;
    }
}

function parseCookies(cookieData) {
    const cookies = {};
    const lines = cookieData.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Parse Netscape cookie format
        const parts = trimmed.split('\t');
        if (parts.length >= 7) {
            const domain = parts[0];
            const name = parts[5];
            const value = parts[6];
            
            if (domain.includes('up-4ever.net') || domain.includes('up4ever')) {
                cookies[name] = value;
                if (name === 'login') {
                    cookies['login'] = value;
                }
            }
        }
    }
    
    // Get sess_id
    if (cookies.xfss) {
        cookies.sess_id = cookies.xfss;
    }
    
    return Object.keys(cookies).length > 0 ? cookies : null;
}

async function uploadToUp4ever(filepath, filename, cookies) {
    try {
        const fileSize = fs.statSync(filepath).size;
        
        // Create session with cookies
        const session = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.up-4ever.net/upload/'
            },
            timeout: 600000 // 10 minutes
        });
        
        // Set cookies
        if (cookies) {
            for (const [name, value] of Object.entries(cookies)) {
                if (name !== 'login' && name !== 'sess_id') {
                    session.defaults.headers.Cookie = 
                        (session.defaults.headers.Cookie || '') + `${name}=${value}; `;
                }
            }
        }
        
        // Get upload server
        const startData = {
            op: 'start_upload',
            file_name: filename,
            file_size: fileSize,
            file_public: '1'
        };
        
        const startResponse = await session.post(UPLOAD_URL, new URLSearchParams(startData), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        let serverUrl = 'https://s13.up4ever.download/cgi-bin/upload.cgi';
        try {
            const startInfo = startResponse.data;
            if (typeof startInfo === 'string') {
                const match = startInfo.match(/"url":"([^"]+)"/);
                if (match) {
                    serverUrl = match[1].replace(/\\/g, '');
                    if (!serverUrl.endsWith('upload.cgi')) {
                        serverUrl = serverUrl.replace(/\/$/, '') + '/upload.cgi';
                    }
                }
            } else if (startInfo.url) {
                serverUrl = startInfo.url;
                if (!serverUrl.endsWith('upload.cgi')) {
                    serverUrl = serverUrl.replace(/\/$/, '') + '/upload.cgi';
                }
            }
        } catch(e) {
            console.warn('[UP4] Failed to parse server URL, using fallback');
        }
        
        // Get sess_id
        let sessId = cookies?.xfss || cookies?.sess_id || '';
        if (!sessId) {
            try {
                const uploadPage = await session.get('https://www.up-4ever.net/upload/');
                const match = uploadPage.data.match(/name="sess_id" value="([^"]*)"/) ||
                             uploadPage.data.match(/sess_id = '([^']*)'/);
                if (match) sessId = match[1];
            } catch(e) {}
        }
        
        if (!sessId) {
            sessId = Math.random().toString(36).substring(2, 14);
        }
        
        // Perform upload
        const formData = new FormData();
        formData.append('sess_id', sessId);
        formData.append('utype', 'reg');
        formData.append('file_public', '1');
        formData.append('tos', '1');
        formData.append('submit_btn', 'Start Uploading');
        formData.append('file_0', fs.createReadStream(filepath), filename);
        
        const uploadResponse = await session.post(serverUrl, formData, {
            headers: {
                ...formData.getHeaders(),
                'Accept': 'application/json, text/plain, */*'
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
        
        // Parse response
        let fileCode = null;
        try {
            if (typeof uploadResponse.data === 'string') {
                const match = uploadResponse.data.match(/file_code["\s:]+["']([^"']+)["']/);
                if (match) fileCode = match[1];
            } else {
                const data = uploadResponse.data;
                if (Array.isArray(data) && data.length > 0 && data[0].file_code) {
                    fileCode = data[0].file_code;
                } else if (data.file_code) {
                    fileCode = data.file_code;
                }
            }
        } catch(e) {
            console.error('[UP4] Failed to parse response:', e);
        }
        
        if (fileCode) {
            const link = `https://www.up-4ever.net/${fileCode}`;
            const account = cookies?.login || 'Unknown';
            
            return {
                success: true,
                link: link,
                account: account
            };
        } else {
            return {
                success: false,
                error: 'Failed to extract file code from response'
            };
        }
    } catch (error) {
        console.error('[UP4] Upload error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}