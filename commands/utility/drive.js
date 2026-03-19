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
            type: 'choosing', // just tracking what they're doing
            url: null
        });
        
        await react('📤');
        
        // Create unique button IDs
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
            text: '📤 *Google Drive Uploader*\n\nHow would you like to upload?',
            footer: 'Choose an option',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Drive session created: ${session.id}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        // Handle button clicks
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId?.includes('url')) {
                // URL SESSION - just wait for URL
                sessionManager.updateSession(sender, from, { type: 'url' });
                const sentMsg = await reply(`🔗 Send me the direct download link.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'drive');
                return true;
                
            } else if (buttonId?.includes('media')) {
                // MEDIA SESSION - just wait for media
                sessionManager.updateSession(sender, from, { type: 'media' });
                const sentMsg = await reply(`📎 Send me the file.`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'drive');
                return true;
                
            } else if (buttonId?.includes('cancel')) {
                sessionManager.clearSession(session.id);
                await reply('❌ Cancelled.');
                return true;
            }
        }
        
        // Handle based on session type
        if (session.data.type === 'url') {
            // Get URL from message
            let url = '';
            if (msg.message?.conversation) {
                url = msg.message.conversation.trim();
            } else if (msg.message?.extendedTextMessage?.text) {
                url = msg.message.extendedTextMessage.text.trim();
            }
            
            if (!url.startsWith('http')) {
                await reply('❌ Send a valid URL starting with http:// or https://');
                return true;
            }
            
            await reply(`📥 Processing URL...`);
            
            try {
                const result = await processUpload(url, null);
                await sock.sendMessage(from, { text: result, linkPreview: false });
                sessionManager.clearSession(session.id);
            } catch (error) {
                await reply(`❌ Failed: ${error.message}`);
                sessionManager.clearSession(session.id);
            }
            
        } else if (session.data.type === 'media') {
            // Check for media
            const hasImage = !!msg.message?.imageMessage;
            const hasVideo = !!msg.message?.videoMessage;
            const hasDocument = !!msg.message?.documentMessage;
            const hasAudio = !!msg.message?.audioMessage;
            
            if (!hasImage && !hasVideo && !hasDocument && !hasAudio) {
                await reply('❌ Send a media file (image, video, document)');
                return true;
            }
            
            await reply(`📥 Processing media...`);
            
            try {
                // Download media
                let mediaType = 'document';
                let mediaMessage = null;
                let filename = 'file';
                
                if (hasImage) {
                    mediaType = 'image';
                    mediaMessage = msg.message.imageMessage;
                    filename = `image_${Date.now()}.jpg`;
                } else if (hasVideo) {
                    mediaType = 'video';
                    mediaMessage = msg.message.videoMessage;
                    filename = `video_${Date.now()}.mp4`;
                } else if (hasDocument) {
                    mediaType = 'document';
                    mediaMessage = msg.message.documentMessage;
                    filename = mediaMessage.fileName || `file_${Date.now()}.bin`;
                }
                
                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                const buffer = [];
                for await (const chunk of stream) buffer.push(chunk);
                const mediaBuffer = Buffer.concat(buffer);
                
                const tempDir = path.join(process.cwd(), 'temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                
                const filepath = path.join(tempDir, filename);
                fs.writeFileSync(filepath, mediaBuffer);
                
                const result = await processUpload(null, filepath, filename);
                fs.unlinkSync(filepath);
                
                await sock.sendMessage(from, { text: result, linkPreview: false });
                sessionManager.clearSession(session.id);
                
            } catch (error) {
                await reply(`❌ Failed: ${error.message}`);
                sessionManager.clearSession(session.id);
            }
        }
        
        return true;
    }
};

// ==================== GOOGLE DRIVE UPLOAD PROCESSOR ====================
async function processUpload(fileUrl, filePath, customFilename = null) {
    let tokenFilename = null;
    let localFilename = null;
    
    try {
        // Download token.json
        console.log('📥 Downloading token.json...');
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        tokenFilename = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenWriter = fs.createWriteStream(tokenFilename);
        tokenResponse.data.pipe(tokenWriter);
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        
        const tokenData = JSON.parse(fs.readFileSync(tokenFilename, 'utf8'));
        console.log('✅ Token loaded');
        
        // Refresh if expired
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('🔄 Refreshing token...');
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
        
        // Get file
        let filename = '';
        let fileSize = 0;
        
        if (fileUrl) {
            console.log(`📥 Downloading from URL...`);
            filename = fileUrl.split('/').pop().split('?')[0] || `file_${Date.now()}.bin`;
            
            localFilename = path.join(process.cwd(), 'temp', `upload_${Date.now()}_${filename}`);
            const fileStream = fs.createWriteStream(localFilename);
            
            const fileResponse = await axios({
                method: 'GET',
                url: fileUrl,
                responseType: 'stream',
                timeout: 300000
            });
            
            fileResponse.data.pipe(fileStream);
            await new Promise((resolve, reject) => {
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });
            
            fileSize = fs.statSync(localFilename).size;
            
        } else if (filePath) {
            localFilename = filePath;
            filename = customFilename || path.basename(filePath);
            fileSize = fs.statSync(filePath).size;
        }
        
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        console.log(`✅ File: ${filename} (${fileSizeMB} MB)`);
        
        // Upload to Google Drive
        console.log('📤 Uploading...');
        
        const formData = new FormData();
        formData.append('metadata', JSON.stringify({ name: filename, parents: ["root"] }), {
            contentType: 'application/json'
        });
        formData.append('file', fs.createReadStream(localFilename));
        
        const uploadResponse = await axios.post(UPLOAD_URL, formData, {
            headers: {
                'Authorization': `Bearer ${tokenData.token}`,
                ...formData.getHeaders()
            }
        });
        
        const fileId = uploadResponse.data.id;
        
        // Make public
        try {
            await axios.post(`${FILE_URL}/${fileId}/permissions`, {
                role: 'reader',
                type: 'anyone'
            }, {
                headers: { 'Authorization': `Bearer ${tokenData.token}` }
            });
        } catch (e) {}
        
        const viewLink = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
        const downloadLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        
        return `✅ *Uploaded!*\n\n📁 *File:* ${filename}\n📊 *Size:* ${fileSizeMB} MB\n\n🔗 *View:* ${viewLink}\n\n📥 *Direct:* ${downloadLink}`;
        
    } finally {
        if (tokenFilename && fs.existsSync(tokenFilename)) fs.unlinkSync(tokenFilename);
        if (localFilename && fs.existsSync(localFilename) && localFilename !== filePath) fs.unlinkSync(localFilename);
    }
}
