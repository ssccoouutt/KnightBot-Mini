/**
 * UP4 Command - Upload files to up-4ever.net from direct download links
 * Usage: .up4 https://example.com/file.zip -filename newname.zip
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { google } = require('googleapis');

const botConfig = require('../../config');
const sessionManager = require('../../utils/sessionManager');

const FORCE_AI_MODE = true;

// Google Drive config for cookies
const COOKIES_FOLDER_ID = "1euugJq55mn2C5a1egcIFF8FLcFu0QsGN";

// Upload server configurations
const UP4EVER_BASE = "https://www.up-4ever.net";
const UPLOAD_URL = "https://www.up-4ever.net/";

module.exports = {
    name: 'up4',
    aliases: ['upload', 'up4ever'],
    category: 'owner',
    description: 'Upload files to up-4ever.net from direct download links',
    usage: '.up4 https://example.com/file.zip -filename newname.zip',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--help' || args.length === 0) {
            return reply(`📤 *UP4EVER UPLOAD COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `• \`.up4 https://example.com/file.zip\` - Upload with original name\n` +
                       `• \`.up4 https://example.com/file.zip -filename newname.zip\` - Upload with custom name\n` +
                       `• \`.up4 --help\` - Show this help\n\n` +
                       `*Supported:* Any file type\n` +
                       `*Max Size:* 1GB (up-4ever limit)\n\n` +
                       `> *Powered by ${botConfig.botName}*`);
        }
        
        await react('📤');
        
        // Parse arguments
        let downloadLink = null;
        let customFilename = null;
        
        for (let i = 0; i < args.length; i++) {
            if (args[i].startsWith('-filename') || args[i].startsWith('-name') || args[i] === '-n') {
                if (i + 1 < args.length) {
                    customFilename = args[i + 1];
                    i++;
                }
            } else if (args[i].startsWith('http://') || args[i].startsWith('https://')) {
                downloadLink = args[i];
            }
        }
        
        if (!downloadLink) {
            return reply(`❌ *No download link provided!*\n\nUsage: \`.up4 https://example.com/file.zip -filename newname.zip\``);
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
            downloadLink: downloadLink,
            customFilename: customFilename,
            status: 'processing'
        });
        
        // Start upload process
        await processUpload(sock, from, sender, session, reply, react);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'up4') return true;
        
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
    const { downloadLink, customFilename } = session.data;
    
    const statusMsg = await reply(`📤 *Processing file...*\n\n⏳ Downloading from:\n${downloadLink}`);
    
    try {
        // Download the file
        const response = await axios({
            method: 'GET',
            url: downloadLink,
            responseType: 'arraybuffer',
            timeout: 600000, // 10 minutes timeout
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            onDownloadProgress: (progressEvent) => {
                // Optional: Could send progress updates here
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                if (percent % 10 === 0) {
                    // Avoid spamming, update every 10%
                }
            }
        });
        
        const fileBuffer = Buffer.from(response.data);
        const fileSize = fileBuffer.length;
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        
        // Get filename from URL or custom
        let originalFilename = customFilename;
        if (!originalFilename) {
            // Extract filename from URL
            const urlPath = new URL(downloadLink).pathname;
            originalFilename = path.basename(urlPath);
            if (!originalFilename || originalFilename === '/') {
                originalFilename = `file_${Date.now()}`;
            }
            // Add extension if missing
            if (!originalFilename.includes('.')) {
                const contentType = response.headers['content-type'];
                if (contentType) {
                    const ext = getExtensionFromMime(contentType);
                    if (ext) originalFilename += ext;
                }
            }
        }
        
        // Validate filename
        originalFilename = originalFilename.replace(/[<>:"/\\|?*]/g, '_');
        
        // Save file temporarily
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, `up4_${Date.now()}_${originalFilename}`);
        fs.writeFileSync(tempFile, fileBuffer);
        
        await sock.sendMessage(chatId, { 
            text: `📤 *Uploading to up-4ever.net...*\n\n📄 File: \`${originalFilename}\`\n📏 Size: ${fileSizeMB} MB\n⏳ Please wait...`,
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
        
        const uploadResult = await uploadToUp4ever(tempFile, originalFilename, cookies);
        
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch(e) {}
        
        if (uploadResult.success) {
            await sock.sendMessage(chatId, {
                text: `✅ *Upload Successful!*\n\n` +
                      `📄 File: \`${originalFilename}\`\n` +
                      `📏 Size: ${fileSizeMB} MB\n` +
                      `👤 Account: ${uploadResult.account || 'Unknown'}\n\n` +
                      `🔗 *Download Link:*\n${uploadResult.link}\n\n` +
                      `💡 File available for 30 days`,
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
            const { sendButtons } = require('gifted-btns');
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

function getExtensionFromMime(mimeType) {
    const mimeMap = {
        'application/zip': '.zip',
        'application/x-zip-compressed': '.zip',
        'application/x-rar-compressed': '.rar',
        'application/x-7z-compressed': '.7z',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/json': '.json',
        'application/xml': '.xml',
        'text/plain': '.txt',
        'text/csv': '.csv',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/mpeg': '.mpeg',
        'video/quicktime': '.mov',
        'video/x-msvideo': '.avi',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/ogg': '.ogg',
        'audio/webm': '.webm'
    };
    return mimeMap[mimeType] || '';
}

async function getCookies() {
    try {
        // Download cookies from Google Drive
        const cookieResponse = await axios({
            method: 'GET',
            url: `https://drive.usercontent.google.com/download?id=${COOKIES_FOLDER_ID}&export=download`,
            responseType: 'text',
            timeout: 30000
        });
        
        return parseCookies(cookieResponse.data);
    } catch (error) {
        console.error('[UP4] Cookie error:', error);
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
    
    // Get sess_id from xfss
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
        
        // Set cookies in headers
        let cookieString = '';
        if (cookies) {
            for (const [name, value] of Object.entries(cookies)) {
                if (name !== 'login' && name !== 'sess_id') {
                    cookieString += `${name}=${value}; `;
                }
            }
            if (cookieString) {
                session.defaults.headers.Cookie = cookieString;
            }
        }
        
        // Get upload server
        const startData = new URLSearchParams({
            op: 'start_upload',
            file_name: filename,
            file_size: fileSize,
            file_public: '1'
        });
        
        const startResponse = await session.post(UPLOAD_URL, startData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        let serverUrl = 'https://s13.up4ever.download/cgi-bin/upload.cgi';
        try {
            const startInfo = typeof startResponse.data === 'string' ? 
                JSON.parse(startResponse.data) : startResponse.data;
            
            if (startInfo.url) {
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
            } catch(e) {
                console.warn('[UP4] Failed to get sess_id, generating fallback');
            }
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
        
        // Parse response for file code
        let fileCode = null;
        try {
            let responseData = uploadResponse.data;
            
            // If response is string, try to parse JSON
            if (typeof responseData === 'string') {
                // Try to find file_code in JSON
                const jsonMatch = responseData.match(/\{.*"file_code"\s*:\s*"([^"]+)".*\}/);
                if (jsonMatch) {
                    fileCode = jsonMatch[1];
                } else {
                    // Try regex for file_code in various formats
                    const match = responseData.match(/file_code["\s:]+["']([^"']+)["']/);
                    if (match) fileCode = match[1];
                }
            } else if (Array.isArray(responseData) && responseData.length > 0) {
                fileCode = responseData[0].file_code || responseData[0].file_code;
            } else if (responseData.file_code) {
                fileCode = responseData.file_code;
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
            // Try to extract error message
            let errorMsg = 'Failed to extract file code from response';
            try {
                const data = typeof uploadResponse.data === 'string' ? 
                    JSON.parse(uploadResponse.data) : uploadResponse.data;
                if (data.error) errorMsg = data.error;
            } catch(e) {}
            
            return {
                success: false,
                error: errorMsg
            };
        }
    } catch (error) {
        console.error('[UP4] Upload error:', error);
        return {
            success: false,
            error: error.message || 'Upload failed'
        };
    }
}