const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const giftedBtns = require('gifted-btns');

const { sendButtons } = giftedBtns;

// Google Drive API Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

module.exports = {
    name: 'drive',
    aliases: ['gdrive', 'upload', 'gdupload'],
    description: 'Upload files to Google Drive from URL or media',
    usage: 'drive - Start upload process\n' +
           'Then send a direct download link or media file',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Check if user has any active session
        const existingSession = sessionManager.getLatestSession(sender, from);
        if (existingSession) {
            await reply(`⚠️ You already have an active session. Please complete or cancel it first.`);
            return;
        }
        
        // Create session for drive upload
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 1,
            data: {
                method: null, // 'url' or 'media'
                url: null,
                fileInfo: null
            }
        });
        
        await react('📤');
        
        // Create unique button IDs with session reference
        const sessionId = session.id.split(':').pop();
        const urlId = `url_${sessionId}_${Date.now()}`;
        const mediaId = `media_${sessionId}_${Date.now()}`;
        const cancelId = `cancel_${sessionId}_${Date.now()}`;
        
        const buttons = [
            { id: urlId, text: '🔗 From URL' },
            { id: mediaId, text: '📎 From Media' },
            { id: cancelId, text: '❌ Cancel' }
        ];
        
        // Use sendButtons from gifted-btns (same as button.js)
        const sentMsg = await sendButtons(sock, from, {
            text: '📤 *Google Drive Uploader*\n\n' +
                  'How would you like to upload?\n\n' +
                  '• *From URL* - Provide a direct download link\n' +
                  '• *From Media* - Send a file directly',
            footer: 'Choose upload method',
            buttons: buttons,
            aimode: true
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Drive session created: ${session.id}`);
        console.log(`📌 Button IDs: URL=${urlId}, Media=${mediaId}, Cancel=${cancelId}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        console.log(`📨 Drive session step ${session.step}, isButtonClick=${isButtonClick}`);
        
        // Handle button clicks
        if (isButtonClick) {
            return await handleButtonClick(sock, msg, session, context);
        }
        
        // Handle based on current step
        switch (session.step) {
            case 2: // Waiting for URL
                return await handleUrlInput(sock, msg, session, context);
                
            case 3: // Waiting for media file
                return await handleMediaInput(sock, msg, session, context);
                
            default:
                await reply('❌ Session error. Please start over with `.drive`');
                sessionManager.clearSession(session.id);
                return true;
        }
    }
};

// ==================== BUTTON CLICK HANDLER ====================
async function handleButtonClick(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    let buttonId = null;
    let buttonText = null;
    
    // Extract button info based on message type
    if (msg.message?.buttonsResponseMessage) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
    } else if (msg.message?.templateButtonReplyMessage) {
        buttonId = msg.message.templateButtonReplyMessage.selectedId;
        buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
    }
    
    console.log(`🔘 Drive button click: ID=${buttonId}, Text=${buttonText}`);
    
    // Handle method selection (step 1)
    if (session.step === 1) {
        if (buttonId?.includes('url')) {
            sessionManager.updateSession(sender, from, { step: 2 });
            const sentMsg = await reply(`🔗 *Upload from URL*\n\nPlease send me the direct download link.\n\nExample: \`https://example.com/file.zip\``);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'drive');
            return true;
            
        } else if (buttonId?.includes('media')) {
            sessionManager.updateSession(sender, from, { step: 3 });
            const sentMsg = await reply(`📎 *Upload from Media*\n\nPlease send me the file (image, video, document, etc.)`);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'drive');
            return true;
            
        } else if (buttonId?.includes('cancel')) {
            sessionManager.clearSession(session.id);
            await reply('❌ Upload cancelled.');
            return true;
        }
    }
    
    await reply(`❌ Unhandled button click. Please try again.`);
    return true;
}

// ==================== URL INPUT HANDLER ====================
async function handleUrlInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Get URL from message
    let url = '';
    if (msg.message?.conversation) {
        url = msg.message.conversation.trim();
    } else if (msg.message?.extendedTextMessage?.text) {
        url = msg.message.extendedTextMessage.text.trim();
    }
    
    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        await reply('❌ Please send a valid URL starting with http:// or https://');
        return true;
    }
    
    await reply(`📥 Processing URL: ${url.substring(0, 50)}...\n\nDownloading and uploading to Google Drive...`);
    
    try {
        // Process the upload
        const result = await processUpload(url, null, sender, from, reply);
        
        // Send result
        await sock.sendMessage(from, {
            text: result,
            linkPreview: false
        });
        
        // Clear session
        sessionManager.clearSession(session.id);
        
    } catch (error) {
        console.error('Upload error:', error);
        await reply(`❌ Upload failed: ${error.message}`);
        sessionManager.clearSession(session.id);
    }
    
    return true;
}

// ==================== MEDIA INPUT HANDLER ====================
async function handleMediaInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Check for media
    const hasImage = !!msg.message?.imageMessage;
    const hasVideo = !!msg.message?.videoMessage;
    const hasDocument = !!msg.message?.documentMessage;
    const hasAudio = !!msg.message?.audioMessage;
    
    if (!hasImage && !hasVideo && !hasDocument && !hasAudio) {
        await reply('❌ Please send a valid media file (image, video, document, or audio)');
        return true;
    }
    
    await reply(`📥 Processing your media...\n\nUploading to Google Drive...`);
    
    try {
        // Determine media type
        let mediaType = 'document';
        let mediaMessage = null;
        
        if (hasImage) {
            mediaType = 'image';
            mediaMessage = msg.message.imageMessage;
        } else if (hasVideo) {
            mediaType = 'video';
            mediaMessage = msg.message.videoMessage;
        } else if (hasDocument) {
            mediaType = 'document';
            mediaMessage = msg.message.documentMessage;
        } else if (hasAudio) {
            mediaType = 'audio';
            mediaMessage = msg.message.audioMessage;
        }
        
        // Download the media
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const mediaBuffer = Buffer.concat(buffer);
        
        // Create temp file
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        // Generate filename
        let filename = 'file';
        if (hasImage) filename = `image_${Date.now()}.jpg`;
        else if (hasVideo) filename = `video_${Date.now()}.mp4`;
        else if (hasDocument) filename = mediaMessage.fileName || `document_${Date.now()}.bin`;
        else if (hasAudio) filename = `audio_${Date.now()}.mp3`;
        
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, mediaBuffer);
        
        // Upload to Google Drive
        const result = await processUpload(null, filepath, sender, from, reply);
        
        // Clean up temp file
        fs.unlinkSync(filepath);
        
        // Send result
        await sock.sendMessage(from, {
            text: result,
            linkPreview: false
        });
        
        // Clear session
        sessionManager.clearSession(session.id);
        
    } catch (error) {
        console.error('Media upload error:', error);
        await reply(`❌ Upload failed: ${error.message}`);
        sessionManager.clearSession(session.id);
    }
    
    return true;
}

// ==================== GOOGLE DRIVE UPLOAD PROCESSOR ====================
async function processUpload(fileUrl, filePath, sender, chatId, reply) {
    let tokenFilename = null;
    let localFilename = null;
    
    try {
        // Step 1: Download token.json from Google Drive
        console.log('📥 Downloading token.json...');
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        // Save token.json
        tokenFilename = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenWriter = fs.createWriteStream(tokenFilename);
        tokenResponse.data.pipe(tokenWriter);
        
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        
        // Load token data
        const tokenData = JSON.parse(fs.readFileSync(tokenFilename, 'utf8'));
        console.log('✅ Token loaded successfully');
        
        // Check if token is expired
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('🔄 Token expired, refreshing...');
            
            // Refresh token
            const refreshData = {
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            
            const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
            const newToken = refreshResponse.data;
            
            tokenData.token = newToken.access_token;
            tokenData.expiry = new Date(Date.now() + 3600 * 1000).toISOString();
            
            console.log('✅ Token refreshed');
        }
        
        // Step 2: Get the file
        let filename = '';
        let fileStream = null;
        let fileSize = 0;
        
        if (fileUrl) {
            // Download from URL
            console.log(`📥 Downloading file from: ${fileUrl}`);
            
            // Extract filename from URL
            filename = fileUrl.split('/').pop().split('?')[0];
            if (!filename || filename === '' || !filename.includes('.')) {
                filename = `file_${Date.now()}.bin`;
            }
            
            // Download file
            const fileResponse = await axios({
                method: 'GET',
                url: fileUrl,
                responseType: 'stream',
                timeout: 300000, // 5 minutes timeout
                maxRedirects: 5
            });
            
            // Try to get filename from Content-Disposition
            const contentDisposition = fileResponse.headers['content-disposition'];
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) filename = match[1].replace(/['"]/g, '');
            }
            
            localFilename = path.join(process.cwd(), 'temp', `upload_${Date.now()}_${filename}`);
            fileStream = fs.createWriteStream(localFilename);
            
            let downloadedSize = 0;
            fileResponse.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
            });
            
            fileResponse.data.pipe(fileStream);
            
            await new Promise((resolve, reject) => {
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });
            
            fileSize = downloadedSize;
            
        } else if (filePath) {
            // Use local file
            localFilename = filePath;
            filename = path.basename(filePath);
            const stats = fs.statSync(filePath);
            fileSize = stats.size;
        }
        
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        console.log(`✅ File downloaded: ${filename} (${fileSizeMB} MB)`);
        
        // Step 3: Upload to Google Drive
        console.log('📤 Uploading to Google Drive...');
        
        const formData = new FormData();
        const metadata = {
            name: filename,
            parents: ["root"]
        };
        
        formData.append('metadata', JSON.stringify(metadata));
        formData.append('file', fs.createReadStream(localFilename));
        
        const uploadResponse = await axios.post(UPLOAD_URL, formData, {
            headers: {
                'Authorization': `Bearer ${tokenData.token}`,
                'Content-Type': 'multipart/form-data'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        const result = uploadResponse.data;
        
        // Success message
        const successMessage = 
            `✅ *File Successfully Uploaded to Google Drive!*\n\n` +
            `📁 *File Name:* ${filename}\n` +
            `📊 *File Size:* ${fileSizeMB} MB\n` +
            `🆔 *File ID:* \`${result.id}\`\n\n` +
            `🔗 *View on Google Drive:*\n` +
            `https://drive.google.com/file/d/${result.id}/view\n\n` +
            `📥 *Download URL:*\n` +
            `https://drive.google.com/uc?export=download&id=${result.id}`;
        
        return successMessage;
        
    } catch (error) {
        console.error('Upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
        
    } finally {
        // Clean up temp files
        if (tokenFilename && fs.existsSync(tokenFilename)) {
            fs.unlinkSync(tokenFilename);
        }
        if (localFilename && fs.existsSync(localFilename) && localFilename !== filePath) {
            fs.unlinkSync(localFilename);
        }
    }
}
