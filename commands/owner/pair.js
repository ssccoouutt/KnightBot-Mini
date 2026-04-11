/**
 * Pair Command - Generate WhatsApp pairing code for a number
 * Uses external API to get pairing code
 */

const axios = require('axios');
const config = require('../../config');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Store active sessions
const activeSessions = new Map();

module.exports = {
    name: 'pair',
    aliases: ['paircode', 'getcode', 'pairing'],
    description: 'Generate WhatsApp pairing code for a number',
    usage: '.pair <phone_number>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🔐 *Pair Code Generator*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}pair <phone_number>\` - Generate pairing code\n` +
                       `• \`${config.prefix}pair 919876543210\`\n\n` +
                       `*How it works:*\n` +
                       `1. You request a code for your number\n` +
                       `2. API generates a pairing code\n` +
                       `3. You enter the code in WhatsApp → Linked Devices\n` +
                       `4. API sends the session file to YOUR WhatsApp number\n` +
                       `5. Check your phone for the session file!\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        // Extract number
        let number = args[0].replace(/[^0-9]/g, '');
        
        if (number.length < 10 || number.length > 15) {
            return reply(`❌ *Invalid number!*\n\nPlease provide a valid phone number with country code.\nExample: \`${config.prefix}pair 919876543210\``);
        }
        
        // Check for existing session
        if (activeSessions.has(sender)) {
            const sessionData = activeSessions.get(sender);
            const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);
            
            if (elapsed < 120) {
                return reply(`⏳ *Pairing already in progress!*\n\n` +
                           `Number: +${sessionData.number}\n` +
                           `Code: \`${sessionData.code}\`\n\n` +
                           `Please enter this code in WhatsApp:\n` +
                           `Settings → Linked Devices → Link a Device\n\n` +
                           `Then check your phone (+${sessionData.number}) for the session file!`);
            } else {
                activeSessions.delete(sender);
            }
        }
        
        await react('🔐');
        
        // Send initial message
        const processingMsg = await reply(`🔐 *Generating Pair Code*\n\n` +
                                        `📱 Number: +${number}\n` +
                                        `⏳ Requesting code from API...\n\n` +
                                        `This may take 10-15 seconds...`);
        
        try {
            // Call API to get pairing code
            const apiUrl = `https://wa-session-api-production.up.railway.app/pair?number=${number}`;
            
            console.log(`[PAIR] Requesting code for +${number}`);
            
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.data && response.data.code) {
                let code = response.data.code;
                
                // Store session
                activeSessions.set(sender, {
                    number: number,
                    code: code,
                    startTime: Date.now()
                });
                
                // Auto-cleanup after 5 minutes
                setTimeout(() => {
                    if (activeSessions.has(sender)) {
                        activeSessions.delete(sender);
                    }
                }, 300000);
                
                // Create copy button for the code
                const copyButtons = [{
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: '📋 Copy Code',
                        copy_code: code.replace(/-/g, '')
                    })
                }];
                
                const successMessage = `🔐 *Pairing Code Generated!*\n\n` +
                                     `📱 Number: +${number}\n` +
                                     `🔑 Code: \`${code}\`\n\n` +
                                     `*Instructions:*\n` +
                                     `1. Open WhatsApp on your phone\n` +
                                     `2. Go to Settings → Linked Devices\n` +
                                     `3. Tap "Link a Device"\n` +
                                     `4. Enter this code: \`${code}\`\n` +
                                     `5. Wait 10-15 seconds for connection\n\n` +
                                     `⚠️ *IMPORTANT:*\n` +
                                     `• After entering the code, the API will send the session file\n` +
                                     `• **CHECK YOUR PHONE (+${number})** for the session file!\n` +
                                     `• The file will be sent as a WhatsApp message\n` +
                                     `• Save the creds.json file and session string\n\n` +
                                     `⏰ *Code expires in 5 minutes*\n\n` +
                                     `> *Powered by ${config.botName}*`;
                
                await sendButtons(sock, from, {
                    text: successMessage,
                    footer: 'Pair Code',
                    buttons: copyButtons,
                    aimode: FORCE_AI_MODE
                }, { edit: processingMsg.key });
                
                await react('✅');
                
                // Send a reminder after 30 seconds
                setTimeout(async () => {
                    if (activeSessions.has(sender)) {
                        await sock.sendMessage(from, {
                            text: `🔔 *Reminder:*\n\n` +
                                 `Check your phone (+${number}) for the WhatsApp session file!\n\n` +
                                 `The API should have sent:\n` +
                                 `• creds.json file\n` +
                                 `• session.txt file with session string\n` +
                                 `• Setup guide video\n\n` +
                                 `If you didn't receive anything within 1 minute, try again with \`.pair ${number}\``
                        });
                    }
                }, 30000);
                
            } else {
                throw new Error('Invalid response from server');
            }
            
        } catch (error) {
            console.error('[PAIR] Error:', error.message);
            
            let errorMessage = `❌ *Failed to generate pairing code*\n\n📱 +${number}\n\n`;
            
            if (error.response?.status === 400) {
                errorMessage += `Invalid phone number format.\n` +
                               `Please use international format without '+' or spaces.\n` +
                               `Example: 919876543210 (India) or 447911123456 (UK)`;
            } else if (error.response?.status === 503 || error.message === 'Service Unavailable') {
                errorMessage += `Service is currently unavailable.\n` +
                               `The API server might be busy or down.\n` +
                               `Please try again later.`;
            } else if (error.code === 'ECONNABORTED') {
                errorMessage += `Request timed out.\n` +
                               `The server is taking too long to respond.\n` +
                               `Please try again.`;
            } else if (error.message.includes('Invalid phone number')) {
                errorMessage += `Invalid phone number.\n` +
                               `Make sure you include the country code.\n` +
                               `Example: 1 for USA, 91 for India, 44 for UK`;
            } else {
                errorMessage += `Failed to get pairing code.\n` +
                               `Error: ${error.message}\n\n` +
                               `Make sure your phone number is correct and has WhatsApp installed.`;
            }
            
            await sock.sendMessage(from, {
                text: errorMessage,
                edit: processingMsg.key
            });
            await react('❌');
        }
    }
};
