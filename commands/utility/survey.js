const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const giftedBtns = require('gifted-btns');

const { 
    sendButtons, 
    sendInteractiveMessage 
} = giftedBtns;

// Store AI mode state (from button.js)
if (!global.aiMode) global.aiMode = new Map();

module.exports = {
    name: 'survey',
    aliases: ['multisurvey', 'fullsurvey'],
    description: 'Complete survey with buttons and media support',
    usage: 'survey',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 1,
            answers: {},
            mediaFiles: []
        });
        
        await react('📋');
        
        // Send welcome message with native buttons
        const buttons = [
            { id: `survey_start_${Date.now()}`, text: '✅ Start Survey' },
            { id: `survey_cancel_${Date.now()}`, text: '❌ Cancel' }
        ];
        
        const sentMsg = await sendButtons(sock, from, {
            text: '📋 *Welcome to the Complete Survey*\n\nThis survey supports:\n• Text input\n• Button selections\n• Images\n• Videos\n• Documents\n• Audio\n\nClick Start to begin!',
            footer: 'Multi-format Survey',
            buttons: buttons,
            aimode: global.aiMode.get(from) || false
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Survey session created: ${session.id}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        // Detect media types
        const hasImage = !!msg.message?.imageMessage;
        const hasVideo = !!msg.message?.videoMessage;
        const hasDocument = !!msg.message?.documentMessage;
        const hasAudio = !!msg.message?.audioMessage;
        const hasSticker = !!msg.message?.stickerMessage;
        const hasMedia = hasImage || hasVideo || hasDocument || hasAudio || hasSticker;
        
        // Get text from message (could be conversation or caption)
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
        
        console.log(`📨 Survey session step ${session.step}: text="${text}", hasMedia=${hasMedia}, isButtonClick=${isButtonClick}`);
        
        // Handle button clicks
        if (isButtonClick) {
            return await handleButtonClick(sock, msg, session, context);
        }
        
        // Process based on current step
        switch (session.step) {
            case 1: // Welcome screen - waiting for Start/Cancel buttons
                // This should only be reached if button click wasn't handled
                await reply('❌ Please use the buttons above to start or cancel the survey.');
                return true;
                
            case 2: // Name input
                return await handleNameInput(sock, msg, session, context);
                
            case 3: // Age input
                return await handleAgeInput(sock, msg, session, context);
                
            case 4: // Gender selection (buttons)
                return await handleGenderSelection(sock, msg, session, context);
                
            case 5: // Favorite color (text)
                return await handleColorInput(sock, msg, session, context);
                
            case 6: // Country selection (list)
                return await handleCountrySelection(sock, msg, session, context);
                
            case 7: // Photo upload
                return await handlePhotoUpload(sock, msg, session, context);
                
            case 8: // Video upload (optional)
                return await handleVideoUpload(sock, msg, session, context);
                
            case 9: // Document upload (optional)
                return await handleDocumentUpload(sock, msg, session, context);
                
            case 10: // Audio upload (optional)
                return await handleAudioUpload(sock, msg, session, context);
                
            case 11: // Final confirmation
                return await handleFinalConfirmation(sock, msg, session, context);
                
            default:
                sessionManager.clearSession(session.id);
                await reply('❌ Session error. Please start over with `.survey`');
                return true;
        }
    }
};

// ==================== BUTTON CLICK HANDLER ====================
async function handleButtonClick(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Extract button info
    let buttonId = null;
    let buttonText = null;
    
    if (msg.message?.buttonsResponseMessage) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
    } else if (msg.message?.listResponseMessage) {
        buttonId = msg.message.listResponseMessage.singleSelectReply?.selectedRowId;
        buttonText = msg.message.listResponseMessage.title;
    } else if (msg.message?.interactiveResponseMessage) {
        const nativeFlow = msg.message.interactiveResponseMessage.nativeFlowResponseMessage;
        if (nativeFlow) {
            try {
                const params = JSON.parse(nativeFlow.paramsJson);
                buttonId = params.id;
                buttonText = params.display_text;
            } catch (e) {
                console.error('Error parsing interactive response:', e);
            }
        }
    }
    
    console.log(`🔘 Button clicked: ID=${buttonId}, Text=${buttonText}`);
    
    // Handle based on current step
    switch (session.step) {
        case 1: // Start/Cancel buttons
            if (buttonText?.includes('Start') || buttonId?.includes('start')) {
                // Move to name input
                sessionManager.updateSession(sender, from, { step: 2 });
                const sentMsg = await reply(`📋 *Step 1/10:* What's your name?`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
            } else if (buttonText?.includes('Cancel') || buttonId?.includes('cancel')) {
                sessionManager.clearSession(session.id);
                await reply('❌ Survey cancelled. You can start again with `.survey`');
            }
            break;
            
        case 4: // Gender selection
            const gender = buttonText || 'Not specified';
            sessionManager.updateSession(sender, from, {
                answers: { ...session.data.answers, gender }
            });
            
            const sentMsg = await reply(`✅ Gender recorded: *${gender}*\n\nStep 5/10: What's your favorite color?`);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
            break;
            
        case 6: // Country selection (list)
            if (buttonId) {
                const country = buttonId.replace('country_', '');
                sessionManager.updateSession(sender, from, {
                    answers: { ...session.data.answers, country }
                });
                
                const sentMsg = await reply(`✅ Country selected: *${country}*\n\nStep 7/10: Please send a photo of yourself (or type "skip")`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
            }
            break;
            
        default:
            await reply(`❌ Button not expected at this step. Please follow the instructions.`);
    }
    
    return true;
}

// ==================== STEP HANDLERS ====================

async function handleNameInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Get text
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim();
    
    if (!text) {
        await reply('❌ Please enter your name.');
        return true;
    }
    
    sessionManager.updateSession(sender, from, {
        answers: { ...session.data.answers, name: text },
        step: 3
    });
    
    const sentMsg = await reply(`👋 Nice to meet you, *${text}*!\n\nStep 3/10: How old are you?`);
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}

async function handleAgeInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Get text
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim();
    
    const age = parseInt(text);
    if (isNaN(age) || age < 1 || age > 120) {
        await reply('❌ Please enter a valid age (1-120).');
        return true;
    }
    
    sessionManager.updateSession(sender, from, {
        answers: { ...session.data.answers, age },
        step: 4
    });
    
    // Send gender selection buttons
    const buttons = [
        { id: `gender_male_${Date.now()}`, text: '👨 Male' },
        { id: `gender_female_${Date.now()}`, text: '👩 Female' },
        { id: `gender_other_${Date.now()}`, text: '⚧ Other' },
        { id: `gender_prefer_not_${Date.now()}`, text: '🔳 Prefer not to say' }
    ];
    
    const sentMsg = await sendButtons(sock, from, {
        text: `📊 Age recorded: *${age}*\n\nStep 4/10: Please select your gender:`,
        footer: 'Select one option',
        buttons: buttons,
        aimode: global.aiMode.get(from) || false
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}

async function handleColorInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Get text
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim();
    
    if (!text) {
        await reply('❌ Please enter your favorite color.');
        return true;
    }
    
    sessionManager.updateSession(sender, from, {
        answers: { ...session.data.answers, color: text },
        step: 6
    });
    
    // Send country selection list
    const countries = ['USA', 'UK', 'Canada', 'Australia', 'India', 'Pakistan', 'Other'];
    const rows = countries.map((c, i) => ({
        id: `country_${c.toLowerCase()}`,
        title: c,
        description: `Select ${c}`
    }));
    
    const sentMsg = await sendInteractiveMessage(sock, from, {
        text: `🎨 Favorite color: *${text}*\n\nStep 6/10: Select your country:`,
        interactiveButtons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: 'Choose Country',
                sections: [{ title: 'Countries', rows }]
            })
        }],
        aimode: global.aiMode.get(from) || false
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}

async function handlePhotoUpload(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    // Check for image
    const hasImage = !!msg.message?.imageMessage;
    
    // Get text (for "skip" command)
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim().toLowerCase();
    
    // Handle skip
    if (text === 'skip') {
        sessionManager.updateSession(sender, from, {
            answers: { ...session.data.answers, photo: 'skipped' },
            step: 8
        });
        
        const sentMsg = await reply(`⏩ Photo skipped.\n\nStep 8/10: Would you like to upload a video? (send video or type "skip")`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        return true;
    }
    
    if (!hasImage) {
        await reply(`❌ Please send an image photo or type "skip".`);
        return true;
    }
    
    await reply(`📸 Downloading your photo...`);
    
    try {
        // Download image
        const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const imageBuffer = Buffer.concat(buffer);
        
        // Save to temp
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const filename = `survey_photo_${sender.split('@')[0]}_${Date.now()}.jpg`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, imageBuffer);
        
        // Store in session
        const mediaFiles = session.data.mediaFiles || [];
        mediaFiles.push({
            type: 'photo',
            path: filepath,
            size: imageBuffer.length
        });
        
        sessionManager.updateSession(sender, from, {
            mediaFiles,
            step: 8
        });
        
        const sentMsg = await reply(`✅ Photo received! (${(imageBuffer.length/1024).toFixed(2)} KB)\n\nStep 8/10: Would you like to upload a video? (send video or type "skip")`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        
    } catch (error) {
        console.error('Error downloading photo:', error);
        await reply(`❌ Failed to download photo. Please try again or type "skip".`);
    }
    
    return true;
}

async function handleVideoUpload(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    const hasVideo = !!msg.message?.videoMessage;
    
    // Get text for "skip"
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim().toLowerCase();
    
    if (text === 'skip') {
        sessionManager.updateSession(sender, from, {
            answers: { ...session.data.answers, video: 'skipped' },
            step: 9
        });
        
        const sentMsg = await reply(`⏩ Video skipped.\n\nStep 9/10: Would you like to upload a document? (send document or type "skip")`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        return true;
    }
    
    if (!hasVideo) {
        await reply(`❌ Please send a video or type "skip".`);
        return true;
    }
    
    await reply(`🎥 Downloading your video...`);
    
    try {
        const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video');
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const videoBuffer = Buffer.concat(buffer);
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const filename = `survey_video_${sender.split('@')[0]}_${Date.now()}.mp4`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, videoBuffer);
        
        const mediaFiles = session.data.mediaFiles || [];
        mediaFiles.push({
            type: 'video',
            path: filepath,
            size: videoBuffer.length
        });
        
        sessionManager.updateSession(sender, from, {
            mediaFiles,
            step: 9
        });
        
        const sentMsg = await reply(`✅ Video received! (${(videoBuffer.length/1024/1024).toFixed(2)} MB)\n\nStep 9/10: Would you like to upload a document? (send document or type "skip")`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        
    } catch (error) {
        console.error('Error downloading video:', error);
        await reply(`❌ Failed to download video. Please try again or type "skip".`);
    }
    
    return true;
}

async function handleDocumentUpload(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    const hasDocument = !!msg.message?.documentMessage;
    
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim().toLowerCase();
    
    if (text === 'skip') {
        sessionManager.updateSession(sender, from, {
            answers: { ...session.data.answers, document: 'skipped' },
            step: 10
        });
        
        const sentMsg = await reply(`⏩ Document skipped.\n\nStep 10/10: Would you like to upload audio? (send audio or type "skip")`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        return true;
    }
    
    if (!hasDocument) {
        await reply(`❌ Please send a document or type "skip".`);
        return true;
    }
    
    await reply(`📄 Downloading your document...`);
    
    try {
        const stream = await downloadContentFromMessage(msg.message.documentMessage, 'document');
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const docBuffer = Buffer.concat(buffer);
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const fileName = msg.message.documentMessage.fileName || `document_${Date.now()}.bin`;
        const filepath = path.join(tempDir, `survey_doc_${sender.split('@')[0]}_${Date.now()}_${fileName}`);
        fs.writeFileSync(filepath, docBuffer);
        
        const mediaFiles = session.data.mediaFiles || [];
        mediaFiles.push({
            type: 'document',
            path: filepath,
            fileName,
            size: docBuffer.length
        });
        
        sessionManager.updateSession(sender, from, {
            mediaFiles,
            step: 10
        });
        
        const sentMsg = await reply(`✅ Document received! (${(docBuffer.length/1024).toFixed(2)} KB)\n\nStep 10/10: Would you like to upload audio? (send audio or type "skip")`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        
    } catch (error) {
        console.error('Error downloading document:', error);
        await reply(`❌ Failed to download document. Please try again or type "skip".`);
    }
    
    return true;
}

async function handleAudioUpload(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    const hasAudio = !!msg.message?.audioMessage;
    
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim().toLowerCase();
    
    if (text === 'skip') {
        // Move to final step
        sessionManager.updateSession(sender, from, {
            answers: { ...session.data.answers, audio: 'skipped' },
            step: 11
        });
        
        return await handleFinalConfirmation(sock, msg, session, context);
    }
    
    if (!hasAudio) {
        await reply(`❌ Please send audio or type "skip" to finish.`);
        return true;
    }
    
    await reply(`🎵 Downloading your audio...`);
    
    try {
        const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const audioBuffer = Buffer.concat(buffer);
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const isVoiceNote = msg.message.audioMessage.ptt;
        const ext = isVoiceNote ? 'ogg' : 'mp3';
        const filename = `survey_audio_${sender.split('@')[0]}_${Date.now()}.${ext}`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, audioBuffer);
        
        const mediaFiles = session.data.mediaFiles || [];
        mediaFiles.push({
            type: 'audio',
            path: filepath,
            isVoiceNote,
            size: audioBuffer.length
        });
        
        sessionManager.updateSession(sender, from, {
            mediaFiles,
            step: 11
        });
        
        await handleFinalConfirmation(sock, msg, session, context);
        
    } catch (error) {
        console.error('Error downloading audio:', error);
        await reply(`❌ Failed to download audio. Please try again or type "skip".`);
    }
    
    return true;
}

async function handleFinalConfirmation(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    const { answers, mediaFiles } = session.data;
    
    // Build summary
    let summary = `✅ *Survey Complete!*\n\n`;
    summary += `📋 *Your Answers:*\n`;
    summary += `• Name: *${answers.name || 'Not provided'}*\n`;
    summary += `• Age: *${answers.age || 'Not provided'}*\n`;
    summary += `• Gender: *${answers.gender || 'Not provided'}*\n`;
    summary += `• Color: *${answers.color || 'Not provided'}*\n`;
    summary += `• Country: *${answers.country || 'Not provided'}*\n\n`;
    
    summary += `📁 *Media Received:*\n`;
    if (mediaFiles && mediaFiles.length > 0) {
        mediaFiles.forEach((file, i) => {
            summary += `  ${i+1}. ${file.type}: ${(file.size/1024).toFixed(2)} KB\n`;
        });
    } else {
        summary += `  No media files received.\n`;
    }
    
    // Log to console
    console.log('📊 SURVEY RESULTS:');
    console.log(JSON.stringify({ answers, mediaFiles }, null, 2));
    
    // Clear session
    sessionManager.clearSession(session.id);
    
    // Clean up temp files
    if (mediaFiles && mediaFiles.length > 0) {
        mediaFiles.forEach(file => {
            try {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            } catch (e) {
                console.error('Error cleaning up temp file:', e);
            }
        });
    }
    
    // Send final message with completion buttons
    const buttons = [
        { id: `survey_new_${Date.now()}`, text: '🔄 New Survey' },
        { id: `survey_menu_${Date.now()}`, text: '📋 Main Menu' }
    ];
    
    await sendButtons(sock, from, {
        text: summary,
        footer: 'Thank you for participating!',
        buttons: buttons,
        aimode: global.aiMode.get(from) || false
    }, {});
    
    return true;
}
