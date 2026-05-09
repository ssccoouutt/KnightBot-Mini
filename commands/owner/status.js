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

// Status visibility options
const STATUS_VISIBILITY = {
    'all': 'Everyone',
    'contacts': 'Only Contacts',
    'contacts_except': 'Contacts Except...',
    'only_share_with': 'Only Share With...'
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
                       `• Image status: Reply to an image with \`.status\`\n` +
                       `• Video status: Reply to a video with \`.status\`\n` +
                       `• With caption: \`.status My caption\` (reply to media)\n\n` +
                       `*Options:*\n` +
                       `• \`.status --help\` - Show this help\n` +
                       `• \`.status --background\` - Set custom background color\n\n` +
                       `*Note:* Status expires after 24 hours\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('📱');
        
        // Check if replying to a message
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const hasImage = !!msg.message?.imageMessage || !!quotedMessage?.imageMessage;
        const hasVideo = !!msg.message?.videoMessage || !!quotedMessage?.videoMessage;
        const hasText = args.length > 0 && !args[0].startsWith('--');
        
        // Extract caption if provided
        let caption = '';
        let backgroundColor = '#075E54'; // WhatsApp green default
        
        // Check for background color option
        const bgIndex = args.findIndex(a => a === '--background');
        if (bgIndex !== -1 && args[bgIndex + 1]) {
            backgroundColor = args[bgIndex + 1];
            args.splice(bgIndex, 2);
        }
        
        if (!hasImage && !hasVideo && hasText) {
            // Text only status
            const text = args.join(' ');
            
            if (text.length > 700) {
                return reply(`❌ *Text too long!*\n\nStatus text cannot exceed 700 characters.\nCurrent: ${text.length} chars`);
            }
            
            const processingMsg = await reply(`📱 *Posting text status...*\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            
            try {
                // Send text status
                await sock.sendMessage(sender, {
                    text: text,
                    status: true,
                    backgroundColor: backgroundColor
                });
                
                await sock.sendMessage(from, {
                    text: `✅ *Status posted successfully!*\n\n📝 *Text:* ${text}\n🎨 *Background:* ${backgroundColor}\n⏰ Expires in 24 hours`,
                    edit: processingMsg.key
                });
                
                await react('✅');
                
            } catch (error) {
                console.error('[STATUS] Text status error:', error);
                await sock.sendMessage(from, {
                    text: `❌ *Failed to post status*\n\nError: ${error.message}`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
            
        } else if (hasImage || hasVideo) {
            // Media status (image or video)
            const isImage = hasImage;
            const isVideo = hasVideo;
            
            // Get caption from args if provided
            if (args.length > 0 && !args[0].startsWith('--')) {
                caption = args.join(' ');
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
                let isQuoted = false;
                
                if (!mediaMsg && quotedMessage) {
                    mediaMsg = quotedMessage.imageMessage || quotedMessage.videoMessage;
                    isQuoted = true;
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
                
                // Send media status
                if (isImage) {
                    await sock.sendMessage(sender, {
                        image: mediaBuffer,
                        caption: caption || '',
                        status: true,
                        mimetype: mimetype
                    });
                } else {
                    await sock.sendMessage(sender, {
                        video: mediaBuffer,
                        caption: caption || '',
                        status: true,
                        mimetype: mimetype
                    });
                }
                
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
                       `• Image: Reply to an image with \`.status\`\n` +
                       `• Video: Reply to a video with \`.status\`\n` +
                       `• With caption: Reply to media with \`.status My caption\`\n` +
                       `• Custom background: \`.status Hello --background #FF0000\`\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
    }
};