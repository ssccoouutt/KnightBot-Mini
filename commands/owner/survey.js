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

// Store AI mode state - enable by default for survey
if (!global.aiMode) global.aiMode = new Map();
// Force AI mode ON for survey responses
const FORCE_AI_MODE = true;

module.exports = {
    name: 'survey',
    aliases: ['multisurvey', 'fullsurvey'],
    description: 'Complete survey with all button types and media',
    usage: 'survey',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 1,
            answers: {},
            mediaFiles: []
        });
        
        await react('📋');
        
        // Create unique button IDs that include session reference
        const sessionId = session.id.split(':').pop();
        const startId = `start_${sessionId}_${Date.now()}`;
        const cancelId = `cancel_${sessionId}_${Date.now()}`;
        
        const buttons = [
            { id: startId, text: '✅ Start Survey' },
            { id: cancelId, text: '❌ Cancel' }
        ];
        
        const sentMsg = await sendButtons(sock, from, {
            text: '📋 *Welcome to the Complete Survey*\n\nThis survey supports:\n• Text input\n• All button types\n• Images\n• Videos\n• Documents\n\nClick Start to begin!',
            footer: 'Multi-format Survey',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Survey session created: ${session.id}`);
        console.log(`📌 Button IDs: Start=${startId}, Cancel=${cancelId}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
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
                    // IMPORTANT: The title is what gets sent, NOT the description
                    buttonText = listReply.title;
                    console.log('✅ List button - selected title:', buttonText);
                }
                // If still no buttonText, try to get from the list response itself
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
            
            console.log(`🔘 Button click in survey: ID=${buttonId}, Text=${buttonText}`);
        }
        
        // Detect media types
        const hasImage = !!msg.message?.imageMessage;
        const hasVideo = !!msg.message?.videoMessage;
        const hasDocument = !!msg.message?.documentMessage;
        const hasMedia = hasImage || hasVideo || hasDocument;
        
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
        
        console.log(`📨 Survey session step ${session.step}: text="${text}", hasMedia=${hasMedia}, isButtonClick=${isButtonClick}, buttonId=${buttonId}`);
        
        // Handle button clicks based on current step
        if (isButtonClick && buttonId) {
            return await handleButtonClick(sock, msg, session, context, buttonId, buttonText);
        }
        
        // Process based on current step (non-button inputs)
        switch (session.step) {
            case 1: // Welcome screen - should only get here if button wasn't handled
                await reply('❌ Please use the Start button to begin the survey.');
                return true;
                
            case 2: // Name input
                return await handleNameInput(sock, msg, session, context);
                
            case 3: // Age input
                return await handleAgeInput(sock, msg, session, context);
                
            case 4: // Gender selection - handled by button handler
                await reply('❌ Please select a gender using the buttons above.');
                return true;
                
            case 5: // Favorite color (text)
                return await handleColorInput(sock, msg, session, context);
                
            case 6: // Country selection - handled by button handler
                await reply('❌ Please select a country from the list.');
                return true;
                
            case 7: // URL button demo - handled by button handler
            case 8: // Call button demo - handled by button handler
            case 9: // Copy button demo - handled by button handler
            case 10: // Location button demo - handled by button handler
                await reply('❌ Please use the buttons provided.');
                return true;
                
            case 11: // Photo upload
                return await handlePhotoUpload(sock, msg, session, context);
                
            case 12: // Video upload (optional)
                return await handleVideoUpload(sock, msg, session, context);
                
            case 13: // Document upload (optional)
                return await handleDocumentUpload(sock, msg, session, context);
                
            case 14: // Final confirmation - handled by button handler
                // This step just shows the summary, button clicks handled separately
                return true;
                
            default:
                sessionManager.clearSession(session.id);
                await reply('❌ Session error. Please start over with `.survey`');
                return true;
        }
    }
};

// ==================== BUTTON CLICK HANDLER ====================
async function handleButtonClick(sock, msg, session, context, buttonId, buttonText) {
    const { from, sender, reply } = context;
    
    console.log(`🔘 Handling button click in survey: step=${session.step}, id=${buttonId}, text=${buttonText}`);
    
    // Handle based on current step
    switch (session.step) {
        case 1: // Start/Cancel buttons
            if (buttonId?.includes('start')) {
                // Move to name input
                sessionManager.updateSession(sender, from, { step: 2 });
                const sentMsg = await reply(`📋 *Step 1/13:* What's your name?`);
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
                return true;
            } else if (buttonId?.includes('cancel')) {
                sessionManager.clearSession(session.id);
                await reply('❌ Survey cancelled. You can start again with `.survey`');
                return true;
            }
            break;
            
        case 4: // Gender selection
            let gender = 'Not specified';
            if (buttonId?.includes('gender_male')) {
                gender = 'Male';
            } else if (buttonId?.includes('gender_female')) {
                gender = 'Female';
            } else if (buttonId?.includes('gender_other')) {
                gender = 'Other';
            } else if (buttonId?.includes('gender_prefer_not')) {
                gender = 'Prefer not to say';
            }
            
            sessionManager.updateSession(sender, from, {
                answers: { ...session.data.answers, gender }
            });
            
            const sentMsg1 = await reply(`✅ Gender recorded: *${gender}*\n\nStep 5/13: What's your favorite color?`);
            sessionManager.addPendingMessage(sender, from, sentMsg1.key.id, 'survey');
            return true;
            
        case 6: // Country selection - FIXED: Use buttonText which is the title
            let country = buttonText || 'Unknown';
            
            // If still no country, try to extract from buttonId as fallback
            if (country === 'Unknown' && buttonId) {
                if (buttonId.startsWith('country_')) {
                    country = buttonId.replace('country_', '');
                } else {
                    country = buttonId;
                }
            }
            
            // Capitalize properly
            country = country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
            
            sessionManager.updateSession(sender, from, {
                answers: { ...session.data.answers, country }
            });
            
            const buttons = [
                { id: `url_${Date.now()}`, text: '🔗 Try URL Button' },
                { id: `skip_url_${Date.now()}`, text: '⏩ Skip' }
            ];
            
            const sentMsg2 = await sendButtons(sock, from, {
                text: `✅ Country selected: *${country}*\n\nStep 7/13: Let's try a URL button demo. Click below:`,
                footer: 'URL Button Demo',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            sessionManager.addPendingMessage(sender, from, sentMsg2.key.id, 'survey');
            return true;
            
        case 7: // URL button demo choice - FIXED: Proper skip handling
            if (buttonId?.includes('url') && !buttonId?.includes('skip')) {
                // User wants to try URL button - send demo
                const urlButtons = [{
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '🌐 Visit Google',
                        url: 'https://google.com'
                    })
                }];
                
                const sentMsg = await sendButtons(sock, from, {
                    text: '🔗 *URL Button Demo*\n\nClick the button below to open Google:',
                    buttons: urlButtons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
                
                sessionManager.updateSession(sender, from, { step: 8 });
                
                setTimeout(async () => {
                    const nextButtons = [
                        { id: `call_${Date.now()}`, text: '📞 Try Call Button' },
                        { id: `skip_call_${Date.now()}`, text: '⏩ Skip' }
                    ];
                    const nextMsg = await sendButtons(sock, from, {
                        text: 'Step 8/13: Now try a call button demo:',
                        footer: 'Call Button Demo',
                        buttons: nextButtons,
                        aimode: FORCE_AI_MODE
                    }, {});
                    sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                }, 2000);
                return true;
            } else {
                // Skip button clicked - move to next step without demo
                sessionManager.updateSession(sender, from, { step: 8 });
                const nextButtons = [
                    { id: `call_${Date.now()}`, text: '📞 Try Call Button' },
                    { id: `skip_call_${Date.now()}`, text: '⏩ Skip' }
                ];
                const nextMsg = await sendButtons(sock, from, {
                    text: 'Step 8/13: Try a call button demo:',
                    footer: 'Call Button Demo',
                    buttons: nextButtons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                return true;
            }
            
        case 8: // Call button demo choice - FIXED: Proper skip handling
            if (buttonId?.includes('call') && !buttonId?.includes('skip')) {
                // Send actual call button
                const callButtons = [{
                    name: 'cta_call',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📞 Call Support',
                        phone_number: '1234567890'
                    })
                }];
                
                const sentMsg = await sendButtons(sock, from, {
                    text: '📞 *Call Button Demo*\n\nClick the button to call (demo):',
                    buttons: callButtons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
                
                sessionManager.updateSession(sender, from, { step: 9 });
                
                setTimeout(async () => {
                    const nextButtons = [
                        { id: `copy_${Date.now()}`, text: '📋 Try Copy Button' },
                        { id: `skip_copy_${Date.now()}`, text: '⏩ Skip' }
                    ];
                    const nextMsg = await sendButtons(sock, from, {
                        text: 'Step 9/13: Now try a copy button demo:',
                        footer: 'Copy Button Demo',
                        buttons: nextButtons,
                        aimode: FORCE_AI_MODE
                    }, {});
                    sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                }, 2000);
                return true;
            } else {
                // Skip button clicked - move to next step without demo
                sessionManager.updateSession(sender, from, { step: 9 });
                const nextButtons = [
                    { id: `copy_${Date.now()}`, text: '📋 Try Copy Button' },
                    { id: `skip_copy_${Date.now()}`, text: '⏩ Skip' }
                ];
                const nextMsg = await sendButtons(sock, from, {
                    text: 'Step 9/13: Try a copy button demo:',
                    footer: 'Copy Button Demo',
                    buttons: nextButtons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                return true;
            }
            
        case 9: // Copy button demo choice - FIXED: Proper skip handling
            if (buttonId?.includes('copy') && !buttonId?.includes('skip')) {
                // Send actual copy button
                const copyButtons = [{
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📋 Copy Code',
                        copy_code: 'SURVEY2024'
                    })
                }];
                
                const sentMsg = await sendButtons(sock, from, {
                    text: '📋 *Copy Button Demo*\n\nClick the button to copy a code:',
                    buttons: copyButtons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
                
                sessionManager.updateSession(sender, from, { step: 10 });
                
                setTimeout(async () => {
                    const nextButtons = [
                        { id: `location_${Date.now()}`, text: '📍 Try Location Button' },
                        { id: `skip_location_${Date.now()}`, text: '⏩ Skip' }
                    ];
                    const nextMsg = await sendButtons(sock, from, {
                        text: 'Step 10/13: Now try a location button demo:',
                        footer: 'Location Button Demo',
                        buttons: nextButtons,
                        aimode: FORCE_AI_MODE
                    }, {});
                    sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                }, 2000);
                return true;
            } else {
                // Skip button clicked - move to next step without demo
                sessionManager.updateSession(sender, from, { step: 10 });
                const nextButtons = [
                    { id: `location_${Date.now()}`, text: '📍 Try Location Button' },
                    { id: `skip_location_${Date.now()}`, text: '⏩ Skip' }
                ];
                const nextMsg = await sendButtons(sock, from, {
                    text: 'Step 10/13: Try a location button demo:',
                    footer: 'Location Button Demo',
                    buttons: nextButtons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                return true;
            }
            
        case 10: // Location button demo choice - FIXED: Proper skip handling
            if (buttonId?.includes('location') && !buttonId?.includes('skip')) {
                // Send actual location button
                const sentMsg = await sendInteractiveMessage(sock, from, {
                    text: '📍 *Location Button Demo*\n\nClick to see New York location:',
                    interactiveButtons: [{
                        name: 'send_location',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📍 View Map',
                            latitude: 40.7128,
                            longitude: -74.0060
                        })
                    }],
                    aimode: FORCE_AI_MODE
                }, {});
                
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
                
                sessionManager.updateSession(sender, from, { step: 11 });
                
                setTimeout(async () => {
                    const nextMsg = await reply(`Step 11/13: Now please send a photo (or type "skip"):`);
                    sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                }, 2000);
                return true;
            } else {
                // Skip button clicked - move to next step without demo
                sessionManager.updateSession(sender, from, { step: 11 });
                const nextMsg = await reply(`Step 11/13: Please send a photo (or type "skip"):`);
                sessionManager.addPendingMessage(sender, from, nextMsg.key.id, 'survey');
                return true;
            }
            
        case 14: // Final confirmation buttons
            if (buttonId?.includes('new_survey')) {
                // Clear current session and start new survey
                sessionManager.clearSession(session.id);
                
                // Create new session and execute
                const newSession = sessionManager.createSession(sender, from, 'survey', {
                    step: 1,
                    answers: {},
                    mediaFiles: []
                });
                
                const sessionId = newSession.id.split(':').pop();
                const startId = `start_${sessionId}_${Date.now()}`;
                const cancelId = `cancel_${sessionId}_${Date.now()}`;
                
                const buttons = [
                    { id: startId, text: '✅ Start Survey' },
                    { id: cancelId, text: '❌ Cancel' }
                ];
                
                const sentMsg = await sendButtons(sock, from, {
                    text: '📋 *Welcome to the Complete Survey*\n\nThis survey supports:\n• Text input\n• All button types\n• Images\n• Videos\n• Documents\n\nClick Start to begin!',
                    footer: 'Multi-format Survey',
                    buttons: buttons,
                    aimode: FORCE_AI_MODE
                }, {});
                
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
                console.log(`✅ New survey session created: ${newSession.id}`);
                return true;
                
            } else if (buttonId?.includes('menu')) {
                sessionManager.clearSession(session.id);
                await reply('Returning to main menu. Use `.menu` to see all commands.');
                return true;
            }
            break;
            
        default:
            console.log(`ℹ️ Unhandled button click at step ${session.step}: ${buttonId}`);
    }
    
    // If we get here, button wasn't handled
    await reply(`❌ Unhandled button click. Please try again.`);
    return true;
}

// ==================== STEP HANDLERS ====================

async function handleNameInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
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
    
    const sentMsg = await reply(`👋 Nice to meet you, *${text}*!\n\nStep 3/13: How old are you?`);
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}

async function handleAgeInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
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
    
    // Gender selection buttons
    const sessionId = session.id.split(':').pop();
    const buttons = [
        { id: `gender_male_${sessionId}_${Date.now()}`, text: '👨 Male' },
        { id: `gender_female_${sessionId}_${Date.now()}`, text: '👩 Female' },
        { id: `gender_other_${sessionId}_${Date.now()}`, text: '⚧ Other' },
        { id: `gender_prefer_not_${sessionId}_${Date.now()}`, text: '🔳 Prefer not' }
    ];
    
    const sentMsg = await sendButtons(sock, from, {
        text: `📊 Age recorded: *${age}*\n\nStep 4/13: Select your gender:`,
        footer: 'Gender Selection',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}

async function handleColorInput(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
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
    
    // Country selection list - WITH descriptions (they look nice)
    const countries = ['USA', 'UK', 'Canada', 'Australia', 'India', 'Pakistan', 'UAE', 'Other'];
    const rows = countries.map(c => ({
        id: `country_${c.toLowerCase()}`,
        title: c,
        description: `Select ${c}` // This is just for display
    }));
    
    const sentMsg = await sendInteractiveMessage(sock, from, {
        text: `🎨 Favorite color: *${text}*\n\nStep 6/13: Select your country:`,
        interactiveButtons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: 'Choose Country',
                sections: [{ 
                    title: 'Countries', 
                    rows: rows 
                }]
            })
        }],
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}

async function handlePhotoUpload(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    const hasImage = !!msg.message?.imageMessage;
    
    let text = '';
    if (msg.message?.conversation) {
        text = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
    }
    text = text.trim().toLowerCase();
    
    if (text === 'skip') {
        sessionManager.updateSession(sender, from, {
            answers: { ...session.data.answers, photo: 'skipped' },
            step: 12
        });
        
        const sentMsg = await reply(`⏩ Photo skipped.\n\nStep 12/13: Send a video (or type "skip"):`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        return true;
    }
    
    if (!hasImage) {
        await reply(`❌ Please send an image or type "skip".`);
        return true;
    }
    
    await reply(`📸 Downloading your photo...`);
    
    try {
        const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const imageBuffer = Buffer.concat(buffer);
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const filename = `photo_${sender.split('@')[0]}_${Date.now()}.jpg`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, imageBuffer);
        
        const mediaFiles = session.data.mediaFiles || [];
        mediaFiles.push({
            type: 'photo',
            path: filepath,
            size: imageBuffer.length
        });
        
        sessionManager.updateSession(sender, from, {
            mediaFiles,
            step: 12
        });
        
        const sentMsg = await reply(`✅ Photo received! (${(imageBuffer.length/1024).toFixed(2)} KB)\n\nStep 12/13: Send a video (or type "skip"):`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        
    } catch (error) {
        console.error('Error downloading photo:', error);
        await reply(`❌ Failed to download photo. Try again or type "skip".`);
    }
    
    return true;
}

async function handleVideoUpload(sock, msg, session, context) {
    const { from, sender, reply } = context;
    
    const hasVideo = !!msg.message?.videoMessage;
    
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
            step: 13
        });
        
        const sentMsg = await reply(`⏩ Video skipped.\n\nStep 13/13: Send a document (or type "skip" to finish):`);
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
        
        const filename = `video_${sender.split('@')[0]}_${Date.now()}.mp4`;
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
            step: 13
        });
        
        const sentMsg = await reply(`✅ Video received! (${(videoBuffer.length/1024/1024).toFixed(2)} MB)\n\nStep 13/13: Send a document (or type "skip" to finish):`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
        
    } catch (error) {
        console.error('Error downloading video:', error);
        await reply(`❌ Failed to download video. Try again or type "skip".`);
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
        // Move to final confirmation
        return await handleFinalConfirmation(sock, msg, session, context);
    }
    
    if (!hasDocument) {
        await reply(`❌ Please send a document or type "skip" to finish.`);
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
        const filepath = path.join(tempDir, `doc_${sender.split('@')[0]}_${Date.now()}_${fileName}`);
        fs.writeFileSync(filepath, docBuffer);
        
        const mediaFiles = session.data.mediaFiles || [];
        mediaFiles.push({
            type: 'document',
            path: filepath,
            fileName,
            size: docBuffer.length
        });
        
        sessionManager.updateSession(sender, from, {
            mediaFiles
        });
        
        await handleFinalConfirmation(sock, msg, session, context);
        
    } catch (error) {
        console.error('Error downloading document:', error);
        await reply(`❌ Failed to download document. Type "skip" to finish.`);
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
    
    // Update session to final step (14) for button handling
    // Don't clear session yet - wait for button clicks
    sessionManager.updateSession(sender, from, { step: 14 });
    
    // Final buttons
    const buttonId = Date.now();
    const buttons = [
        { id: `new_survey_${buttonId}`, text: '🔄 New Survey' },
        { id: `menu_${buttonId}`, text: '📋 Main Menu' }
    ];
    
    const sentMsg = await sendButtons(sock, from, {
        text: summary,
        footer: 'Thank you for participating!',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    return true;
}
