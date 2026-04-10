/**
 * Pair Command - Generate WhatsApp pairing code for a number
 * Uses external API to get pairing code
 */

const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON
const FORCE_AI_MODE = true;

// Helper function for sleep/delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    name: 'pair',
    aliases: ['paircode', 'getcode', 'pairing'],
    description: 'Generate WhatsApp pairing code for a number',
    usage: '.pair <phone_number>\n.pair 91702395XXXX',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🔐 *Pair Code Generator*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}pair <phone_number>\` - Generate pairing code\n` +
                       `• \`${config.prefix}pair 91702395XXXX\`\n\n` +
                       `*Example:*\n` +
                       `\`${config.prefix}pair 919876543210\`\n\n` +
                       `*Note:*\n` +
                       `• Enter number without '+' or spaces\n` +
                       `• Include country code\n` +
                       `• Code expires in 5 minutes\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        // Extract numbers from input (support comma separated)
        const numbers = args.join(' ')
            .split(',')
            .map(v => v.replace(/[^0-9]/g, ''))
            .filter(v => v.length > 5 && v.length < 20);
        
        if (numbers.length === 0) {
            return reply(`❌ *Invalid number!*\n\nPlease use the correct format:\n\`${config.prefix}pair 919876543210\``);
        }
        
        await react('🔐');
        
        for (const number of numbers) {
            const whatsappID = number + '@s.whatsapp.net';
            
            // Send initial message
            const processingMsg = await reply(`🔐 *Generating Pair Code*\n\n` +
                                            `📱 Number: +${number}\n` +
                                            `⏳ Checking WhatsApp registration...`);
            
            try {
                // Check if number is registered on WhatsApp
                const whatsappCheck = await sock.onWhatsApp(whatsappID);
                
                if (!whatsappCheck[0]?.exists) {
                    await sock.sendMessage(from, {
                        text: `❌ *Number not registered on WhatsApp!*\n\n📱 +${number}\n\nPlease make sure the number has an active WhatsApp account.`,
                        edit: processingMsg.key
                    });
                    await react('❌');
                    continue;
                }
                
                // Update status
                await sock.sendMessage(from, {
                    text: `✅ *WhatsApp account found!*\n\n📱 +${number}\n⏳ Requesting pairing code...`,
                    edit: processingMsg.key
                });
                
                // Call API to get pairing code (using /pair endpoint)
                const apiUrl = `https://knight-bot-paircode.onrender.com/pair?number=${number}`;
                const response = await axios.get(apiUrl, {
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (response.data && response.data.code) {
                    const code = response.data.code;
                    
                    if (code === "Service Unavailable") {
                        throw new Error('Service Unavailable');
                    }
                    
                    // Wait 5 seconds before sending code (as in original)
                    await sleep(5000);
                    
                    // Create unique session ID
                    const sessionId = `${Date.now()}_${number}`;
                    
                    // Create copy button using native cta_copy (just like survey command)
                    const copyButtons = [{
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📋 Copy Code',
                            copy_code: code
                        })
                    }];
                    
                    // Send the pairing code with native copy button
                    const codeMessage = `🔐 *Your Pairing Code*\n\n` +
                                       `📱 Number: +${number}\n` +
                                       `🔑 Code: \`${code}\`\n\n` +
                                       `⚠️ *Instructions:*\n` +
                                       `1. Open WhatsApp on your phone\n` +
                                       `2. Go to Settings → Linked Devices\n` +
                                       `3. Tap "Link a Device"\n` +
                                       `4. Enter this code\n\n` +
                                       `⏰ *Code expires in 5 minutes*\n\n` +
                                       `> *Powered by ${config.botName}*`;
                    
                    // Send message with native copy button
                    const sentMsg = await sendButtons(sock, from, {
                        text: codeMessage,
                        footer: 'Pair Code',
                        buttons: copyButtons,
                        aimode: FORCE_AI_MODE
                    }, { edit: processingMsg.key });
                    
                    await react('✅');
                    
                } else {
                    throw new Error('Invalid response from server');
                }
                
            } catch (error) {
                console.error('[PAIR] Error:', error.message);
                
                let errorMessage = `❌ *Failed to generate pairing code*\n\n📱 +${number}\n\n`;
                
                if (error.message === 'Service Unavailable') {
                    errorMessage += `Service is currently unavailable.\nPlease try again later.`;
                } else if (error.code === 'ECONNABORTED') {
                    errorMessage += `Request timed out.\nThe server might be busy.\nPlease try again.`;
                } else if (error.response?.status === 404) {
                    errorMessage += `API endpoint not found.\nPlease check the service status.`;
                } else if (error.response?.status === 429) {
                    errorMessage += `Rate limit exceeded.\nPlease wait a few minutes before trying again.`;
                } else {
                    errorMessage += `Failed to generate pairing code.\nPlease try again later.\n\nError: ${error.message}`;
                }
                
                await sock.sendMessage(from, {
                    text: errorMessage,
                    edit: processingMsg.key
                });
                await react('❌');
            }
        }
    }
};