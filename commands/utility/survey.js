const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'survey',
    aliases: [],
    description: 'Take a quick survey with media support',
    usage: 'survey',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 1,
            answers: {}
        });
        
        await react('📝');
        const sentMsg = await reply(`📋 *Survey*\n\nStep 1/3: What's your name?`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        
        console.log(`✅ Survey session created: ${session.id}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, isButtonClick } = context;
        
        // Check if message has media
        const hasMedia = !!msg.message?.imageMessage || 
                         !!msg.message?.videoMessage || 
                         !!msg.message?.documentMessage || 
                         !!msg.message?.audioMessage;
        
        // Get text from message (could be caption or conversation)
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else if (msg.message?.imageMessage?.caption) {
            text = msg.message.imageMessage.caption;
        } else if (msg.message?.videoMessage?.caption) {
            text = msg.message.videoMessage.caption;
        }
        
        text = text.trim();
        
        if (isButtonClick) {
            await reply(`❌ Please type your response or send media, don't use buttons for this command.`);
            return true;
        }
        
        switch (session.step) {
            case 1:
                // Handle name (text only)
                if (hasMedia) {
                    await reply(`❌ Please type your name, don't send media for this step.`);
                    return true;
                }
                
                if (!text) {
                    await reply('❌ Please enter your name.');
                    return true;
                }
                
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, name: text }
                });
                
                const sentMsg1 = await reply(`👋 Nice to meet you, *${text}*!\n\nStep 2/3: How old are you?`);
                sessionManager.addPendingMessage(sender, from, sentMsg1.key.id, this.name);
                break;
                
            case 2:
                // Handle age (text only)
                if (hasMedia) {
                    await reply(`❌ Please type your age, don't send media for this step.`);
                    return true;
                }
                
                const userAge = parseInt(text);
                if (isNaN(userAge) || userAge < 1 || userAge > 120) {
                    await reply('❌ Please enter a valid age (1-120).');
                    return true;
                }
                
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, age: userAge }
                });
                
                const sentMsg2 = await reply(`📊 Age recorded: *${userAge}*\n\nStep 3/3: Send me a photo of your favorite thing!`);
                sessionManager.addPendingMessage(sender, from, sentMsg2.key.id, this.name);
                break;
                
            case 3:
                // Handle media (image)
                if (!hasMedia) {
                    await reply(`❌ Please send a photo (image) of your favorite thing.`);
                    return true;
                }
                
                if (!msg.message?.imageMessage) {
                    await reply(`❌ Please send an image file.`);
                    return true;
                }
                
                await reply(`📸 Thanks for the photo! Downloading...`);
                
                try {
                    // Download the image
                    const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                    const buffer = [];
                    for await (const chunk of stream) {
                        buffer.push(chunk);
                    }
                    const imageBuffer = Buffer.concat(buffer);
                    
                    // Save to temp folder
                    const tempDir = path.join(process.cwd(), 'temp');
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                    
                    const filename = `survey_${sender.split('@')[0]}_${Date.now()}.jpg`;
                    const filepath = path.join(tempDir, filename);
                    fs.writeFileSync(filepath, imageBuffer);
                    
                    const { name, age } = session.data.answers;
                    
                    // Clear the session
                    sessionManager.clearSession(session.id);
                    
                    // Send the image back with results
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: `✅ *Survey Complete!*\n\n` +
                                `📋 *Your Answers:*\n` +
                                `• Name: *${name}*\n` +
                                `• Age: *${age}*\n` +
                                `• Favorite Thing: (see attached photo)\n\n` +
                                `Thanks for participating! 🎉`
                    });
                    
                    // Clean up temp file
                    fs.unlinkSync(filepath);
                    
                } catch (error) {
                    console.error('Error downloading image:', error);
                    await reply(`❌ Failed to download your image. Please try again.`);
                }
                break;
                
            default:
                sessionManager.clearSession(session.id);
                await reply('❌ Session error. Please start over with `.survey`');
        }
        
        return true;
    }
};
