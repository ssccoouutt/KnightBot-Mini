/**
 * Ghibli Command - Convert images to Ghibli Studio art style using API
 * Uses remote API for image conversion
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const FORCE_AI_MODE = true;

// API Configuration
const API_BASE_URL = "https://unsettled-mortality-thesis.ngrok-free.dev";
const API_GENERATE_ENDPOINT = `${API_BASE_URL}/generate`;
const API_STATUS_ENDPOINT = `${API_BASE_URL}/status`;
const API_HEALTH_ENDPOINT = `${API_BASE_URL}/health`;

// Store active conversions
const activeConversions = new Map();
const conversionQueue = new Map();

// Check API health
async function checkApiHealth() {
    try {
        const response = await axios.get(API_HEALTH_ENDPOINT, { timeout: 10000 });
        return response.data;
    } catch (error) {
        console.error('[GHIBLI] API health check failed:', error.message);
        return null;
    }
}

// Check model status
async function checkModelStatus() {
    try {
        const response = await axios.get(API_STATUS_ENDPOINT, { timeout: 10000 });
        return response.data;
    } catch (error) {
        console.error('[GHIBLI] Model status check failed:', error.message);
        return null;
    }
}

// Download image from message
async function downloadImage(sock, msg) {
    try {
        let mediaMessage = null;
        let mediaType = null;
        
        // Check for image in message
        if (msg.message?.imageMessage) {
            mediaMessage = msg.message.imageMessage;
            mediaType = 'image';
        } 
        // Check for quoted image
        else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            mediaMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
            mediaType = 'image';
        }
        // Check for view-once image
        else if (msg.message?.viewOnceMessageV2?.message?.imageMessage) {
            mediaMessage = msg.message.viewOnceMessageV2.message.imageMessage;
            mediaType = 'image';
        }
        
        if (!mediaMessage || !mediaType) {
            return null;
        }
        
        // Download image
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const buffer = [];
        for await (const chunk of stream) {
            buffer.push(chunk);
        }
        const imageBuffer = Buffer.concat(buffer);
        
        return imageBuffer;
        
    } catch (error) {
        console.error('[GHIBLI] Download error:', error.message);
        return null;
    }
}

// Convert image using API
async function convertWithApi(imageBuffer, strength = 0.6, progressCallback) {
    try {
        const formData = new FormData();
        formData.append('image', imageBuffer, {
            filename: 'image.jpg',
            contentType: 'image/jpeg'
        });
        formData.append('strength', strength.toString());
        formData.append('return_base64', 'true');
        
        if (progressCallback) {
            await progressCallback('📤 Uploading image to API...');
        }
        
        const response = await axios.post(API_GENERATE_ENDPOINT, formData, {
            headers: {
                ...formData.getHeaders(),
                'ngrok-skip-browser-warning': 'true'
            },
            timeout: 900000, // 15 minutes timeout
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        if (response.data && response.data.success) {
            return {
                success: true,
                imageBase64: response.data.image_base64,
                generationTime: response.data.parameters?.generation_time_seconds,
                totalTime: response.data.parameters?.total_time_seconds,
                size: response.data.image_info?.size,
                message: response.data.message
            };
        } else {
            throw new Error(response.data?.error || 'Unknown error from API');
        }
        
    } catch (error) {
        console.error('[GHIBLI] API error:', error.message);
        if (error.response) {
            console.error('[GHIBLI] Response data:', error.response.data);
            throw new Error(error.response.data?.error || error.message);
        }
        throw error;
    }
}

module.exports = {
    name: 'ghibli',
    aliases: ['ghiblify', 'studioghibli', 'animeify'],
    category: 'ai',
    description: 'Convert images to Ghibli Studio art style using AI',
    usage: '.ghibli\n.ghibli <reply to image>\n.ghibli <strength>',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Check API health first
        const health = await checkApiHealth();
        if (!health) {
            return reply(`❌ *API Server Unavailable*\n\nGhibli API is currently offline.\nPlease try again later.`);
        }
        
        // Check model status
        const modelStatus = await checkModelStatus();
        if (modelStatus && !modelStatus.model_ready) {
            return reply(`⏳ *Model Loading*\n\nGhibli AI model is still loading.\nThis takes 3-5 minutes on first run.\n\nStatus: ${modelStatus.message || 'Loading...'}\n\nPlease try again in a few minutes.`);
        }
        
        // Parse strength from args
        let strength = 0.6;
        if (args[0] && !isNaN(parseFloat(args[0]))) {
            strength = parseFloat(args[0]);
            strength = Math.max(0.3, Math.min(0.8, strength));
        }
        
        // Check if there's an image in the message
        let hasImage = false;
        let imageBuffer = null;
        
        // Check for direct image
        if (msg.message?.imageMessage) {
            hasImage = true;
            imageBuffer = await downloadImage(sock, msg);
        } 
        // Check for quoted image
        else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            hasImage = true;
            imageBuffer = await downloadImage(sock, msg);
        }
        // Check for view-once image
        else if (msg.message?.viewOnceMessageV2?.message?.imageMessage) {
            hasImage = true;
            imageBuffer = await downloadImage(sock, msg);
        }
        
        // If image is provided directly, process immediately
        if (hasImage && imageBuffer) {
            // Check if already processing
            if (activeConversions.has(sender)) {
                return reply(`⏳ *Conversion already in progress!*\n\nPlease wait for your previous image to finish processing.\nEstimated time: 10-15 minutes.`);
            }
            
            activeConversions.set(sender, true);
            
            await react('🎨');
            const processingMsg = await reply(`🎨 *Converting to Ghibli Style...*\n\n` +
                                              `🎭 Strength: ${strength}\n` +
                                              `⏳ This may take 10-15 minutes...\n\n` +
                                              `> *Powered by Stable Diffusion & Ghibli Diffusion*`);
            
            try {
                // Convert image
                const result = await convertWithApi(imageBuffer, strength, async (status) => {
                    await sock.sendMessage(from, {
                        text: status,
                        edit: processingMsg.key
                    });
                });
                
                if (result.success && result.imageBase64) {
                    // Convert base64 to buffer
                    const imageBuffer = Buffer.from(result.imageBase64, 'base64');
                    
                    const caption = `🎨 *Ghibli Style Converted!*\n\n` +
                                   `✨ *Strength:* ${strength}\n` +
                                   `🎭 *Style:* Studio Ghibli\n` +
                                   `🖼️ *Size:* ${result.size ? result.size[0] + 'x' + result.size[1] : '512x512'}\n` +
                                   `⏱️ *Time:* ${result.generationTime ? Math.round(result.generationTime) : '?'} seconds\n\n` +
                                   `> *Powered by Stable Diffusion & Ghibli Diffusion*`;
                    
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: caption
                    });
                    
                    await sock.sendMessage(from, {
                        text: `✅ *Conversion Complete!*\n\nYour image has been converted to Ghibli style.\nUse \`.ghibli\` to convert more images.`,
                        edit: processingMsg.key
                    });
                    
                    await react('✅');
                } else {
                    throw new Error('No image data received');
                }
                
            } catch (error) {
                console.error('[GHIBLI] Error:', error);
                await sock.sendMessage(from, {
                    text: `❌ *Conversion Failed*\n\nError: ${error.message}\n\nPossible issues:\n• API server might be overloaded\n• Image format not supported\n• Try again with a different image`,
                    edit: processingMsg.key
                });
                await react('❌');
            } finally {
                activeConversions.delete(sender);
            }
            return;
        }
        
        // If no image, create session to wait for image
        // Clear any existing sessions
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'ghibli') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        // Create session
        const session = sessionManager.createSession(sender, from, 'ghibli', {
            step: 'waiting_for_image',
            strength: strength
        });
        
        await react('🎨');
        
        const sessionId = session.id.split(':').pop();
        
        const buttons = [
            { id: `ghibli_cancel_${sessionId}`, text: '❌ Cancel' }
        ];
        
        // Get model status for display
        let modelStatusText = '';
        if (modelStatus) {
            if (modelStatus.gpu_available) {
                modelStatusText = `🖥️ GPU: ${modelStatus.gpu_name || 'Available'}\n`;
            } else {
                modelStatusText = `🖥️ CPU Mode (slower)\n`;
            }
        }
        
        const message = `🎨 *Ghibli Style Converter*\n\n` +
                       `Send me an image to convert into Studio Ghibli art style.\n\n` +
                       `${modelStatusText}` +
                       `*Settings:*\n` +
                       `🎭 Strength: ${strength} (0.3-0.8)\n\n` +
                       `*How to use:*\n` +
                       `• Send an image directly\n` +
                       `• Reply to an image with \`.ghibli\`\n` +
                       `• Use \`.ghibli 0.7\` to adjust strength\n\n` +
                       `⏳ *Processing time:* 10-15 minutes\n\n` +
                       `Type *cancel* to abort.`;
        
        const sentMsg = await sendButtons(sock, from, {
            text: message,
            footer: 'Ghibli Converter',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'ghibli');
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'ghibli') return true;
        
        // Handle button clicks
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId && buttonId.includes('ghibli_cancel_')) {
                sessionManager.clearSession(session.id);
                await reply(`❌ Operation cancelled.`);
                return true;
            }
            return true;
        }
        
        // Handle text input (cancel)
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation.trim().toLowerCase();
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.trim().toLowerCase();
        }
        
        if (text === 'cancel') {
            sessionManager.clearSession(session.id);
            await reply(`❌ Operation cancelled.`);
            return true;
        }
        
        // Check for image
        let imageBuffer = null;
        let hasImage = false;
        
        // Check for direct image
        if (msg.message?.imageMessage) {
            hasImage = true;
            imageBuffer = await downloadImage(sock, msg);
        } 
        // Check for quoted image
        else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            hasImage = true;
            imageBuffer = await downloadImage(sock, msg);
        }
        // Check for view-once image
        else if (msg.message?.viewOnceMessageV2?.message?.imageMessage) {
            hasImage = true;
            imageBuffer = await downloadImage(sock, msg);
        }
        
        if (!hasImage || !imageBuffer) {
            await reply(`❌ *Please send an image!*\n\nSend a photo or reply to a photo with \`.ghibli\``);
            return true;
        }
        
        // Check if already processing
        if (activeConversions.has(sender)) {
            await reply(`⏳ *Conversion already in progress!*\n\nPlease wait for your previous image to finish processing.\nEstimated time: 10-15 minutes.`);
            return true;
        }
        
        activeConversions.set(sender, true);
        
        await react('🎨');
        const processingMsg = await reply(`🎨 *Converting to Ghibli Style...*\n\n` +
                                          `🎭 Strength: ${session.data.strength}\n` +
                                          `⏳ This may take 10-15 minutes...\n\n` +
                                          `> *Powered by Stable Diffusion & Ghibli Diffusion*`);
        
        try {
            // Convert image
            const result = await convertWithApi(imageBuffer, session.data.strength, async (status) => {
                await sock.sendMessage(from, {
                    text: status,
                    edit: processingMsg.key
                });
            });
            
            if (result.success && result.imageBase64) {
                // Convert base64 to buffer
                const resultBuffer = Buffer.from(result.imageBase64, 'base64');
                
                const caption = `🎨 *Ghibli Style Converted!*\n\n` +
                               `✨ *Strength:* ${session.data.strength}\n` +
                               `🎭 *Style:* Studio Ghibli\n` +
                               `🖼️ *Size:* ${result.size ? result.size[0] + 'x' + result.size[1] : '512x512'}\n` +
                               `⏱️ *Time:* ${result.generationTime ? Math.round(result.generationTime) : '?'} seconds\n\n` +
                               `> *Powered by Stable Diffusion & Ghibli Diffusion*`;
                
                await sock.sendMessage(from, {
                    image: resultBuffer,
                    caption: caption
                });
                
                await sock.sendMessage(from, {
                    text: `✅ *Conversion Complete!*\n\nYour image has been converted to Ghibli style.\nUse \`.ghibli\` to convert more images.`,
                    edit: processingMsg.key
                });
                
                await react('✅');
            } else {
                throw new Error('No image data received');
            }
            
        } catch (error) {
            console.error('[GHIBLI] Error:', error);
            await sock.sendMessage(from, {
                text: `❌ *Conversion Failed*\n\nError: ${error.message}\n\nPossible issues:\n• API server might be overloaded\n• Image format not supported\n• Try again with a different image`,
                edit: processingMsg.key
            });
            await react('❌');
        } finally {
            activeConversions.delete(sender);
            sessionManager.clearSession(session.id);
        }
        
        return true;
    }
};