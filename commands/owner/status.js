/**
 * Status Command - Upload text, image, video status to WhatsApp
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const FORCE_AI_MODE = true;

// Status broadcast JID
const STATUS_JID = 'status@broadcast';

// Font types for text status
const FONTS = {
    1: 'Sans Serif',
    2: 'Serif',
    3: 'Norse',
    4: 'Bryndan Write',
    5: 'Thin',
    6: 'Bold',
    7: 'Light'
};

module.exports = {
    name: 'status',
    aliases: ['story', 'uploadstatus', 'poststatus'],
    category: 'owner',
    description: 'Upload text, image, or video status to WhatsApp',
    usage: '.status <text>\n.status (reply to image/video)\n.status --help',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--help') {
            return reply(`📱 *STATUS UPLOAD COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `• Text status: \`.status Hello everyone!\`\n` +
                       `• Text with font: \`.status Hello --font 2\` (1-7)\n` +
                       `• Text with background: \`.status Hello --bg #FF0000\`\n` +
                       `• Image status: Reply to an image with \`.status\`\n` +
                       `• Video status: Reply to a video with \`.status\`\n` +
                       `• With caption: \`.status My caption\` (reply to media)\n\n` +
                       `*Font Options:*\n` +
                       `• 1 - Sans Serif | 2 - Serif | 3 - Norse\n` +
                       `• 4 - Bryndan Write | 5 - Thin | 6 - Bold | 7 - Light\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('📱');
        
        // Check if replying to a message
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const hasImage = !!msg.message?.imageMessage || !!quotedMessage?.imageMessage;
        const hasVideo = !!msg.message?.videoMessage || !!quotedMessage?.videoMessage;
        const hasText = args.length > 0 && !args[0].startsWith('--');
        
        // Extract options
        let caption = '';
        let backgroundColor = '#075E54'; // WhatsApp green default
        let font = 1; // Default font
        
        // Parse arguments for options
        let remainingArgs = [...args];
        
        for (let i = 0; i < remainingArgs.length; i++) {
            const arg = remainingArgs[i];
            if (arg === '--bg' && remainingArgs[i + 1]) {
                backgroundColor = remainingArgs[i + 1];
                remainingArgs.splice(i, 2);
                i--;
            } else if (arg === '--font' && remainingArgs[i + 1]) {
                font = parseInt(remainingArgs[i + 1]);
                if (isNaN(font) || font < 1 || font > 7) font = 1;
                remainingArgs.splice(i, 2);
                i--;
            }
        }
        
        const textContent = remainingArgs.join(' ');
        
        if (!hasImage && !hasVideo && textContent) {
            // Text only status
            const text = textContent;
            
            if (text.length > 700) {
                return reply(`❌ *Text too long!*\n\nStatus text cannot exceed 700 characters.\nCurrent: ${text.length} chars`);
            }
            
            const processingMsg = await reply(`📱 *Posting text status...*\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            
            try {
                // CORRECT METHOD FOR TEXT STATUS
                const statusOptions = {
                    backgroundColor: backgroundColor,
                    font: font,
                    statusJidList: [sock.user.id] // Send to own status
                };
                
                const result = await sock.sendMessage(STATUS_JID, {
                    text: text
                }, statusOptions);
                
                console.log('[STATUS] Text status result:', result);
                
                await sock.sendMessage(from, {
                    text: `✅ *Status posted successfully!*\n\n📝 *Text:* ${text}\n🎨 *Background:* ${backgroundColor}\n🔤 *Font:* ${FONTS[font] || 'Default'}\n⏰ Expires in 24 hours`,
                    edit: processingMsg.key
                });
                
                await react('✅');
                
            } catch (error) {
                console.error('[STATUS] Text status error:', error);
                await sock.sendMessage(from, {
                    text: `❌ *Failed to post status*\n\nError: ${error.message}\n\nMake sure your WhatsApp account is active.`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
            
        } else if (hasImage || hasVideo) {
            // Media status (image or video)
            const isImage = hasImage;
            const isVideo = hasVideo;
            
            // Get caption from remaining args
            if (textContent) {
                caption = textContent;
            }
            
            if (caption.length > 700) {
                return reply(`❌ *Caption too long!*\n\nStatus caption cannot exceed 700 characters.\nCurrent: ${caption.length} chars`);
            }
            
            const processingMsg = await reply(`📱 *Processing ${isImage ? 'image' : 'video'} status...*\n\n${caption ? `📝 Caption: ${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}\n` : ''}⏳ Please wait...`);
            
            try {
                let mediaBuffer;
                let mimetype;
                
                // Get the media message
                let mediaMsg = msg.message?.imageMessage || msg.message?.videoMessage;
                
                if (!mediaMsg && quotedMessage) {
                    mediaMsg = quotedMessage.imageMessage || quotedMessage.videoMessage;
                }
                
                if (!mediaMsg) {
                    throw new Error('No media found');
                }
                
                // Download media
                const mediaType = isImage ? 'image' : 'video';
                const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                const buffer = [];
                for await (const chunk of stream) {
                    buffer.push(chunk);
                }
                mediaBuffer = Buffer.concat(buffer);
                mimetype = mediaMsg.mimetype;
                
                // Check file size limits
                const sizeMB = mediaBuffer.length / (1024 * 1024);
                if (isImage && sizeMB > 5) {
                    throw new Error('Image too large! Max 5MB for status images.');
                }
                if (isVideo && sizeMB > 16) {
                    throw new Error('Video too large! Max 16MB for status videos.');
                }
                
                // CORRECT METHOD FOR MEDIA STATUS
                const statusOptions = {
                    statusJidList: [sock.user.id] // Send to own status
                };
                
                let result;
                if (isImage) {
                    result = await sock.sendMessage(STATUS_JID, {
                        image: mediaBuffer,
                        caption: caption || '',
                        mimetype: mimetype
                    }, statusOptions);
                } else {
                    result = await sock.sendMessage(STATUS_JID, {
                        video: mediaBuffer,
                        caption: caption || '',
                        mimetype: mimetype,
                        gifPlayback: false
                    }, statusOptions);
                }
                
                console.log('[STATUS] Media status result:', result);
                
                await sock.sendMessage(from, {
                    text: `✅ *Status posted successfully!*\n\n📹 *Type:* ${isImage ? 'Image' : 'Video'}\n${caption ? `📝 *Caption:* ${caption}\n` : ''}📊 *Size:* ${sizeMB.toFixed(2)} MB\n⏰ Expires in 24 hours`,
                    edit: processingMsg.key
                });
                
                await react('✅');
                
            } catch (error) {
                console.error('[STATUS] Media status error:', error);
                await sock.sendMessage(from, {
                    text: `❌ *Failed to post status*\n\nError: ${error.message}\n\nRequirements:\n• Images: Max 5MB\n• Videos: Max 16MB, Max 60 seconds`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
            
        } else {
            return reply(`📱 *Status Upload*\n\n` +
                       `*How to use:*\n` +
                       `• Text: \`.status Hello world!\`\n` +
                       `• Text with font: \`.status Hello --font 2\`\n` +
                       `• Text with background: \`.status Hello --bg #FF0000\`\n` +
                       `• Image: Reply to an image with \`.status\`\n` +
                       `• Video: Reply to a video with \`.status\`\n` +
                       `• With caption: Reply to media with \`.status My caption\`\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
    }
};