const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const phoneNumber = require('awesome-phonenumber');
const config = require('../../config');

module.exports = {
    name: 'send',
    aliases: ['sendmsg', 'sms', 'message'],
    description: 'Send a message to any WhatsApp number',
    usage: 'send [number] - [message]\n\nReply to a media message with .send [number] - [caption] to forward media',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, message, args, context) {
        const { from, reply, react } = context;

        // Parse the command: .send [number] - [message]
        const fullText = args.join(' ');
        const separatorIndex = fullText.indexOf('-');
        
        if (separatorIndex === -1) {
            await reply(`❌ *Invalid format!*\n\nUsage: \`${config.prefix}send [WhatsApp number] - [message]\`\n\n*Example:* \`${config.prefix}send 1234567890 - Hello, how are you?\`\n\n*To forward media:* Reply to any image/video/document with \`${config.prefix}send [number] - [caption]\`\n\n📱 Include country code without + or spaces`);
            return;
        }

        // Extract number and message
        let targetNumber = fullText.substring(0, separatorIndex).trim();
        const messageText = fullText.substring(separatorIndex + 1).trim();

        // Clean the phone number (remove any non-numeric characters)
        targetNumber = targetNumber.replace(/[^0-9]/g, '');

        // Validate phone number
        const pn = phoneNumber('+' + targetNumber);
        if (!pn.isValid()) {
            await reply(`❌ *Invalid phone number!*\n\nPlease include country code.\n*Examples:*\n• US: \`15551234567\`\n• UK: \`447911123456\`\n• India: \`919876543210\``);
            return;
        }

        if (!messageText) {
            await reply('❌ *Please provide a message to send!*');
            return;
        }

        // Show typing indicator
        await react('⏳');

        // Format the target JID
        const targetJid = targetNumber + '@s.whatsapp.net';

        // Check if this is a reply to a message (to forward media)
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        try {
            // Send typing indicator to target
            await sock.sendPresenceUpdate('composing', targetJid);
            
            // Prepare the message to send
            let sendOptions = {};

            // If replying to media, forward it
            if (quotedMessage) {
                // Image forwarding
                if (quotedMessage.imageMessage) {
                    await reply(`📷 *Forwarding image to ${pn.getNumber('international')}...*`);
                    
                    const stream = await downloadContentFromMessage(quotedMessage.imageMessage, 'image');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    sendOptions = {
                        image: Buffer.concat(buffer),
                        caption: messageText || '',
                        mimetype: quotedMessage.imageMessage.mimetype,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                } 
                // Video forwarding
                else if (quotedMessage.videoMessage) {
                    await reply(`🎥 *Forwarding video to ${pn.getNumber('international')}...*`);
                    
                    const stream = await downloadContentFromMessage(quotedMessage.videoMessage, 'video');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    sendOptions = {
                        video: Buffer.concat(buffer),
                        caption: messageText || '',
                        mimetype: quotedMessage.videoMessage.mimetype,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                } 
                // Document forwarding
                else if (quotedMessage.documentMessage) {
                    await reply(`📄 *Forwarding document to ${pn.getNumber('international')}...*`);
                    
                    const stream = await downloadContentFromMessage(quotedMessage.documentMessage, 'document');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    sendOptions = {
                        document: Buffer.concat(buffer),
                        fileName: quotedMessage.documentMessage.fileName || 'document',
                        caption: messageText || '',
                        mimetype: quotedMessage.documentMessage.mimetype,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                } 
                // Audio forwarding
                else if (quotedMessage.audioMessage) {
                    await reply(`🎵 *Forwarding audio to ${pn.getNumber('international')}...*`);
                    
                    const stream = await downloadContentFromMessage(quotedMessage.audioMessage, 'audio');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    sendOptions = {
                        audio: Buffer.concat(buffer),
                        mimetype: quotedMessage.audioMessage.mimetype,
                        ptt: quotedMessage.audioMessage.ptt || false, // Voice note if true
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                } 
                // Sticker forwarding
                else if (quotedMessage.stickerMessage) {
                    await reply(`🖼️ *Forwarding sticker to ${pn.getNumber('international')}...*`);
                    
                    const stream = await downloadContentFromMessage(quotedMessage.stickerMessage, 'sticker');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    sendOptions = {
                        sticker: Buffer.concat(buffer),
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                } 
                // Contact forwarding
                else if (quotedMessage.contactMessage) {
                    sendOptions = {
                        contacts: {
                            displayName: quotedMessage.contactMessage.displayName,
                            contacts: [{
                                vcard: quotedMessage.contactMessage.vcard
                            }]
                        },
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                }
                // Location forwarding
                else if (quotedMessage.locationMessage) {
                    sendOptions = {
                        location: {
                            degreesLatitude: quotedMessage.locationMessage.degreesLatitude,
                            degreesLongitude: quotedMessage.locationMessage.degreesLongitude
                        },
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                }
                else {
                    // If quoted message type not supported, just send text
                    sendOptions = {
                        text: messageText,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                                newsletterName: config.botName || 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    };
                }
            } else {
                // Just text message
                sendOptions = {
                    text: messageText,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
                            newsletterName: config.botName || 'KnightBot MD',
                            serverMessageId: -1
                        }
                    }
                };
            }

            // Send the message
            await sock.sendMessage(targetJid, sendOptions);

            // Stop typing indicator
            await sock.sendPresenceUpdate('paused', targetJid);

            // Confirm to the user
            const formattedNumber = pn.getNumber('international');
            const displayMessage = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
            
            let successMsg = `✅ *Message sent successfully!*\n\n`;
            successMsg += `📱 *To:* ${formattedNumber}\n`;
            successMsg += `📝 *Message:* ${displayMessage}\n`;
            
            if (quotedMessage) {
                let mediaType = 'media';
                if (quotedMessage.imageMessage) mediaType = '📷 Image';
                else if (quotedMessage.videoMessage) mediaType = '🎥 Video';
                else if (quotedMessage.documentMessage) mediaType = '📄 Document';
                else if (quotedMessage.audioMessage) mediaType = '🎵 Audio';
                else if (quotedMessage.stickerMessage) mediaType = '🖼️ Sticker';
                successMsg += `📎 *Media:* ${mediaType} forwarded\n`;
            }
            
            successMsg += `\n⏱️ ${new Date().toLocaleString()}`;

            await sock.sendMessage(from, { 
                text: successMsg
            });

            await react('✅');

            // Log the action
            console.log(`📤 Message sent to ${formattedNumber} by ${from.split('@')[0]}`);

        } catch (error) {
            console.error('Send command error:', error);
            
            // Stop typing indicator
            try {
                await sock.sendPresenceUpdate('paused', targetJid);
            } catch (e) {}
            
            await react('❌');
            
            // Check for specific errors
            let errorMsg = '❌ *Failed to send message.*\n\n';
            
            if (error.message?.includes('not-authorized') || error.data === 401) {
                errorMsg += 'The number may not have WhatsApp or has blocked the bot.';
            } else if (error.message?.includes('rate-overlimit')) {
                errorMsg += 'Rate limit reached. Please try again later.';
            } else if (error.message?.includes('message too long')) {
                errorMsg += 'Message is too long. Please shorten it.';
            } else {
                errorMsg += 'Make sure the number is valid and has WhatsApp.';
            }
            
            await sock.sendMessage(from, { 
                text: errorMsg
            });
        }
    }
};
