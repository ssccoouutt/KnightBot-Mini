const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const giftedBtns = require('gifted-btns');

const { 
    sendButtons, 
    sendInteractiveMessage 
} = giftedBtns;

// Google Drive API Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

// Force AI mode ON
const FORCE_AI_MODE = true;

module.exports = {
    name: 'drive',
    aliases: ['gdrive', 'upload', 'gdupload'],
    description: 'Upload files to Google Drive from URL or media',
    usage: 'drive',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 1,
            data: {}
        });
        
        await react('📤');
        
        // Create unique button IDs that include session reference
        const sessionId = session.id.split(':').pop();
        const urlId = `url_${sessionId}_${Date.now()}`;
        const mediaId = `media_${sessionId}_${Date.now()}`;
        const cancelId = `cancel_${sessionId}_${Date.now()}`;
        
        const buttons = [
            { id: urlId, text: '🔗 From URL' },
            { id: mediaId, text: '📎 From Media' },
            { id: cancelId, text: '❌ Cancel' }
        ];
        
        const sentMsg = await sendButtons(sock, from, {
            text: '📤 *Google Drive Uploader*\n\n' +
                  'How would you like to upload?\n\n' +
                  '• *From URL* - Provide a direct download link\n' +
                  '• *From Media* - Send a file directly',
            footer: 'Choose upload method',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Drive session created: ${session.id}`);
        console.log(`📌 Button IDs: URL=${urlId}, Media=${mediaId}, Cancel=${cancelId}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        console.log(`📨 Drive session handling - isButtonClick from context: ${isButtonClick}, current step: ${session.step}`);
        
        // Get the button ID from the message if this is a button click
        let buttonId = null;
        let buttonText = null;
        
        if (isButtonClick) {
            // Extract button ID based on message type
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
            }
            else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                }
                if (!buttonText && msg.message.listResponseMessage.title) {
                    buttonText = msg.message.listResponseMessage.title;
                }
            }
            else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                    } catch (e) {
                        console.error('Error parsing interactive response:', e);
                    }
                }
            }
            else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
            }
            
            console.log(`🔘 Button click in drive: ID=${buttonId}, Text=${buttonText}`);
            
            // Handle button clicks immediately and RETURN - CRITICAL!
            if (buttonId) {
                const handled = await handleButtonClick(sock, msg, session, context, buttonId, buttonText);
                if (handled) {
                    console.log('✅ Button click handled, returning early to prevent further processing');
                    return true;
                }
            }
        }
        
        // Detect media types
        const hasImage = !!msg.message?.imageMessage;
        const hasVideo = !!msg.message?.videoMessage;
        const hasDocument = !!msg.message?.documentMessage;
        const hasAudio = !!msg.message?.audioMessage;
        const hasMedia = hasImage || hasVideo || hasDocument || hasAudio;
        
        // Get text from message
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else if (msg.message?.imageMessage?.caption) {
            text = msg.message.imageMessage.caption;
        } else if (msg.message?.videoMessage?.caption) {
            text = msg.message.videoMessage.caption;
        } else if (msg.message?.documentMessage?.caption) {
            text = msg.message.documentMessage.caption;
        }
        text = text.trim();
        
        console.log(`📨 Drive session step ${session.step}: text="${text}", hasMedia=${hasMedia}, isButtonClick=${isButtonClick}, buttonId=${buttonId}`);
        
        // Process based on current step (non-button inputs)
        switch (session.step) {
            case 1: // Welcome screen - should only get here if button wasn't handled
                await reply('❌ Please use the buttons above to choose upload method.');
                return true;
                
            case 2: // Waiting for URL
                return await handleUrlInput(sock, msg, session, context);
                
            case 3: // Waiting for media file
                return await handleMediaInput(sock, msg, session, context);
                
            default:
                sessionManager.clearSession(session.id);
                await reply('❌ Session error. Please start over with `.drive`');
                return true;
        }
    }
};

// ==================== BUTTON CLICK HANDLER ====================
async function handleButtonClick(sock, msg, session, context, buttonId, buttonText) {
    const { from, sender, reply } = context;
    
    console.log(`🔘 Handling button click in drive: current step=${session.step}, id=${buttonId}, text=${buttonText}`);
    
    // Handle based on current step
    if (session.step === 1) {
        if (buttonId?.includes('url')) {
            console.log('✅ URL button clicked, updating to step 2');
            // Force update the session
            session.step = 2;
            sessionManager.updateSession(sender, from, { step: 2 });
            const sentMsg = await reply(`🔗 *Upload from URL*\n\nPlease send me the direct download link.\n\nExample: \`https://example.com/file.zip\``);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'drive');
            return true;
            
        } else if (buttonId?.includes('media')) {
            console.log('✅ Media button clicked, updating to step 3');
            // Force update the session
            session.step = 3;
            sessionManager.updateSession(sender, from, { step: 3 });
            const sentMsg = await reply(`📎 *Upload from Media*\n\nPlease send me the file (image, video, document, audio)`);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'drive');
            return true;
            
        } else if (buttonId?.includes('cancel')) {
            console.log('✅ Cancel button clicked');
            sessionManager.clearSession(session.id);
            await reply('❌ Upload cancelled.');
            return true;
        }
    }
    
    console.log(`ℹ️ Unhandled button click at step ${session.step}: ${buttonId}`);
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
        const result = await processUpload(url, null);
        
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
    
    console.log('📁 handleMediaInput called - step 3');
    
    // Check for media
    const hasImage = !!msg.message?.imageMessage;
    const hasVideo = !!msg.message?.videoMessage;
    const hasDocument = !!msg.message?.documentMessage;
    const hasAudio = !!msg.message?.audioMessage;
    const hasMedia = hasImage || hasVideo || hasDocument || hasAudio;
    
    console.log(`📁 Media detection: image=${hasImage}, video=${hasVideo}, document=${hasDocument}, audio=${hasAudio}`);
    
    if (!hasMedia) {
        // If no media, check if it's a text message
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation.trim();
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.trim();
        }
        
        if (text) {
            // Check if it's a URL
            if (text.startsWith('http://') || text.startsWith('https://')) {
                console.log('📝 Received URL instead of media, redirecting to URL handler');
                session.step = 2;
                sessionManager.updateSession(sender, from, { step: 2 });
                return await handleUrlInput(sock, msg, session, context);
            }
            
            // If it's just the button text (like "📎 From Media"), ignore it
            if (text.includes('📎 From Media') || text.includes('🔗 From URL') || text.includes('❌ Cancel')) {
                console.log('⚠️ Ignoring button text message');
                return true;
            }
        }
        
        await reply('❌ Please send a valid media file (image, video, document, or audio)');
        return true;
    }
    
    await reply(`📥 Processing your media...\n\nUploading to Google Drive...`);
    
    try {
        // Determine media type
        let mediaType = 'document';
        let mediaMessage = null;
        let filename = 'file';
        
        if (hasImage) {
            mediaType = 'image';
            mediaMessage = msg.message.imageMessage;
            filename = `image_${Date.now()}.jpg`;
            if (mediaMessage.caption) {
                const caption = mediaMessage.caption.trim();
                if (!caption.includes(' ') && (caption.includes('.') || caption.length < 20)) {
                    filename = caption;
                }
            }
        } else if (hasVideo) {
            mediaType = 'video';
            mediaMessage = msg.message.videoMessage;
            filename = `video_${Date.now()}.mp4`;
            if (mediaMessage.caption) {
                const caption = mediaMessage.caption.trim();
                if (!caption.includes(' ') && (caption.includes('.') || caption.length < 20)) {
                    filename = caption;
                }
            }
        } else if (hasDocument) {
            mediaType = 'document';
            mediaMessage = msg.message.documentMessage;
            filename = mediaMessage.fileName || `document_${Date.now()}.bin`;
        } else if (hasAudio) {
            mediaType = 'audio';
            mediaMessage = msg.message.audioMessage;
            filename = `audio_${Date.now()}.mp3`;
        }
        
        console.log(`📁 Downloading ${mediaType}: ${filename}`);
        
        // Download the media
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const mediaBuffer = Buffer.concat(buffer);
        
        console.log(`✅ Downloaded ${mediaBuffer.length} bytes`);
        
        // Create temp file
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, mediaBuffer);
        
        // Upload to Google Drive
        const result = await processUpload(null, filepath, filename);
        
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
async function processUpload(fileUrl, filePath, customFilename = null) {
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
        let fileSize = 0;
        
        if (fileUrl) {
            // Download from URL
            console.log(`📥 Downloading file from: ${fileUrl}`);
            
            // Extract filename from URL
            filename = fileUrl.split('/').pop().split('?')[0];
            if (!filename || filename === '' || !filename.includes('.')) {
                // Try to get filename from Content-Disposition
                const headResponse = await axios({
                    method: 'HEAD',
                    url: fileUrl,
                    timeout: 10000,
                    maxRedirects: 5
                }).catch(() => ({ headers: {} }));
                
                const contentDisposition = headResponse.headers['content-disposition'];
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (match) filename = match[1].replace(/['"]/g, '');
                }
                
                if (!filename || filename === '' || !filename.includes('.')) {
                    filename = `file_${Date.now()}.bin`;
                }
            }
            
            // Download file
            localFilename = path.join(process.cwd(), 'temp', `upload_${Date.now()}_${filename}`);
            const fileStream = fs.createWriteStream(localFilename);
            
            const fileResponse = await axios({
                method: 'GET',
                url: fileUrl,
                responseType: 'stream',
                timeout: 300000,
                maxRedirects: 5
            });
            
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
            filename = customFilename || path.basename(filePath);
            const stats = fs.statSync(filePath);
            fileSize = stats.size;
        }
        
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        console.log(`✅ File ready: ${filename} (${fileSizeMB} MB)`);
        
        // Step 3: Upload to Google Drive
        console.log('📤 Uploading to Google Drive...');
        
        // Create form data
        const formData = new FormData();
        const metadata = {
            name: filename,
            parents: ["root"]
        };
        
        formData.append('metadata', JSON.stringify(metadata), {
            contentType: 'application/json',
            filename: 'metadata'
        });
        
        formData.append('file', fs.createReadStream(localFilename), {
            filename: filename,
            contentType: 'application/octet-stream'
        });
        
        // Upload
        const uploadResponse = await axios.post(UPLOAD_URL, formData, {
            headers: {
                'Authorization': `Bearer ${tokenData.token}`,
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        const result = uploadResponse.data;
        const fileId = result.id;
        
        console.log(`✅ Uploaded with ID: ${fileId}`);
        
        // Step 4: Make file public (set permission)
        console.log('🔓 Making file public...');
        
        try {
            const permissionData = {
                role: 'reader',
                type: 'anyone'
            };
            
            await axios.post(`${FILE_URL}/${fileId}/permissions`, permissionData, {
                headers: {
                    'Authorization': `Bearer ${tokenData.token}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ File is now public');
        } catch (permError) {
            console.log('⚠️ Could not set public permission:', permError.message);
        }
        
        // Generate links in the requested formats
        const viewLink = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
        const downloadLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        
        // Success message with both link formats
        const successMessage = 
            `✅ *File Successfully Uploaded to Google Drive!*\n\n` +
            `📁 *File Name:* ${filename}\n` +
            `📊 *File Size:* ${fileSizeMB} MB\n` +
            `🆔 *File ID:* \`${fileId}\`\n\n` +
            `🔗 *View Link:*\n${viewLink}\n\n` +
            `📥 *Direct Download Link:*\n${downloadLink}`;
        
        return successMessage;
        
    } catch (error) {
        console.error('Upload error:', error);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
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
