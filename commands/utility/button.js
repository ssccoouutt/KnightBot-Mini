const config = require('../../config');
const util = require('util');

// Import gifted-btns
const giftedBtns = require('gifted-btns');

// Available functions from debug output
const { 
    sendButtons, 
    sendInteractiveMessage,
    getButtonType,
    getButtonArgs,
    validateSendButtonsPayload 
} = giftedBtns;

console.log('\n🔍 [DEBUG] Gifted-btns functions loaded:');
console.log(`   ✅ sendButtons: ${typeof sendButtons}`);
console.log(`   ✅ sendInteractiveMessage: ${typeof sendInteractiveMessage}`);
console.log(`   ✅ getButtonType: ${typeof getButtonType}`);
console.log(`   ✅ getButtonArgs: ${typeof getButtonArgs}`);

// Store AI mode state
if (!global.aiMode) global.aiMode = new Map();

module.exports = {
    name: 'button',
    aliases: ['buttons', 'interactive', 'cta', 'btn', 'ai'],
    description: 'Send interactive button messages and control AI mode',
    usage: 'button [type] [parameters]',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        console.log('\n' + '='.repeat(60));
        console.log('🔘 BUTTON COMMAND EXECUTED');
        console.log('='.repeat(60));
        console.log(`📥 Input args:`, args);
        console.log(`👤 From: ${from}`);

        if (args.length === 0) {
            await showHelp(sock, from, reply);
            return;
        }

        const subCommand = args[0].toLowerCase();
        console.log(`\n🔍 Subcommand: "${subCommand}"`);
        
        await react('⏳');

        try {
            switch (subCommand) {
                case 'native':
                case 'quick':
                    await handleNativeButtons(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'url':
                case 'cta_url':
                    await handleUrlButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'call':
                case 'cta_call':
                    await handleCallButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'copy':
                case 'cta_copy':
                    await handleCopyButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'location':
                case 'cta_location':
                    await handleLocationButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'list':
                    await handleListButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'ai':
                    await handleAIMode(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'combo':
                    await handleComboButtons(sock, from, msg, reply);
                    break;
                    
                case 'validate':
                    await validatePayload(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                default:
                    await showHelp(sock, from, reply);
            }
            
            await react('✅');
            
        } catch (error) {
            console.error('❌ ERROR:', error);
            
            let errorMsg = `❌ *Button Error*\n\n`;
            errorMsg += `*Message:* ${error.message}\n`;
            
            if (error.errors) {
                errorMsg += `\n*Validation Errors:*\n`;
                error.errors.forEach(e => errorMsg += `• ${e}\n`);
            }
            
            if (error.example) {
                errorMsg += `\n*Example Format:*\n`;
                errorMsg += '```\n' + JSON.stringify(error.example, null, 2) + '\n```';
            }
            
            await reply(errorMsg);
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply) {
    const helpText = `🔘 *Button & AI Commands*\n\n` +
                    `*1. Native Buttons (Quick Reply)*\n` +
                    `\`.button native Question | Option1,Option2,Option3\`\n` +
                    `Example: \`.button native Do you like pizza? | Yes,No,Maybe\`\n\n` +
                    
                    `*2. URL Button*\n` +
                    `\`.button url Title | Description | Button Text | URL\`\n` +
                    `Example: \`.button url Special Offer | 50% off! | Shop Now | https://google.com\`\n\n` +
                    
                    `*3. Call Button*\n` +
                    `\`.button call Title | Description | Button Text | Phone\`\n` +
                    `Example: \`.button call Support | Need help? | Call Now | +1234567890\`\n\n` +
                    
                    `*4. Copy Button*\n` +
                    `\`.button copy Title | Description | Button Text | Text to copy\`\n` +
                    `Example: \`.button copy Coupon | Save 20% | Copy Code | SAVE20\`\n\n` +
                    
                    `*5. Location Button*\n` +
                    `\`.button location Title | Description | Button Text | lat,long\`\n` +
                    `Example: \`.button location Store | Visit us | View Map | 40.7128,-74.0060\`\n\n` +
                    
                    `*6. List Button (Dropdown)*\n` +
                    `\`.button list Title | Button Text | Option1,Option2,Option3\`\n` +
                    `Example: \`.button list Food Menu | Choose Cuisine | Pizza,Burger,Pasta\`\n\n` +
                    
                    `*7. AI Mode Control*\n` +
                    `\`.button ai on\` - Enable AI mode\n` +
                    `\`.button ai off\` - Disable AI mode\n` +
                    `\`.button ai status\` - Check AI mode status\n` +
                    `Example: \`.button ai on\`\n\n` +
                    
                    `*8. Combo (Multiple Buttons)*\n` +
                    `\`.button combo\`\n\n` +
                    
                    `*9. Validate Payload*\n` +
                    `\`.button validate your payload here\``;

    await reply(helpText);
}

// 1. Native Buttons (Quick Reply)
async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 Native Buttons:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) {
        return reply('❌ Format: `button native Question | Option1,Option2,Option3`');
    }

    const question = parts[0];
    const options = parts[1].split(',').map(o => o.trim());

    const buttons = options.map(opt => ({
        id: `btn_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        text: opt
    }));

    const payload = {
        text: question,
        footer: 'Choose an option',
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ Native buttons sent');
}

// 2. URL Button
async function handleUrlButton(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 URL Button:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        return reply('❌ Format: `button url Title | Description | Button Text | URL`');
    }

    const [title, description, buttonText, url] = parts;

    try {
        new URL(url);
    } catch {
        return reply('❌ Invalid URL format');
    }

    const buttons = [{
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
            display_text: buttonText,
            url: url
        })
    }];

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ URL button sent');
}

// 3. Call Button
async function handleCallButton(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 Call Button:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        return reply('❌ Format: `button call Title | Description | Button Text | Phone`');
    }

    const [title, description, buttonText, phone] = parts;
    const cleanPhone = phone.replace(/\D/g, '');

    const buttons = [{
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({
            display_text: buttonText,
            phone_number: cleanPhone
        })
    }];

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ Call button sent');
}

// 4. Copy Button
async function handleCopyButton(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 Copy Button:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        return reply('❌ Format: `button copy Title | Description | Button Text | Text to copy`');
    }

    const [title, description, buttonText, copyText] = parts;

    const buttons = [{
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
            display_text: buttonText,
            copy_code: copyText
        })
    }];

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ Copy button sent');
}

// 5. Location Button
async function handleLocationButton(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 Location Button:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        return reply('❌ Format: `button location Title | Description | Button Text | lat,long`');
    }

    const [title, description, buttonText, coordinates] = parts;
    const [lat, long] = coordinates.split(',').map(c => parseFloat(c.trim()));

    if (isNaN(lat) || isNaN(long)) {
        return reply('❌ Invalid coordinates. Use format: lat,long');
    }

    const buttons = [{
        name: 'cta_location',
        buttonParamsJson: JSON.stringify({
            display_text: buttonText,
            latitude: lat,
            longitude: long
        })
    }];

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ Location button sent');
}

// 6. List Button (Using sendButtons with list_reply)
async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 List Button:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
        return reply('❌ Format: `button list Title | Button Text | Option1,Option2,Option3`');
    }

    const [title, buttonText, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());

    // Create a list button using the list_reply type
    const buttons = [{
        name: 'list_reply',
        buttonParamsJson: JSON.stringify({
            display_text: buttonText,
            title: title,
            sections: [{
                title: title,
                rows: options.map((opt, index) => ({
                    id: `opt_${Date.now()}_${index}`,
                    title: opt,
                    description: `Select ${opt}`
                }))
            }]
        })
    }];

    const payload = {
        text: `📋 *${title}*\n\nPlease select an option from the list below:`,
        footer: 'Choose wisely!',
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ List button sent');
}

// 7. AI Mode Control
async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 AI Mode Control:');
    
    const mode = text.toLowerCase().trim();
    console.log(`Mode: "${mode}"`);

    const userId = chatId;
    let currentStatus = global.aiMode.get(userId) || false;

    if (mode === 'on' || mode === 'enable' || mode === 'true' || mode === '1') {
        global.aiMode.set(userId, true);
        
        const buttons = [
            {
                id: 'ai_help',
                text: '❓ Help'
            },
            {
                id: 'ai_off',
                text: '🔕 Disable'
            }
        ];

        await sendButtons(sock, chatId, {
            text: '✨ *AI Mode ENABLED*\n\n' +
                  'You can now ask me questions, get translations, summaries, and more!\n\n' +
                  '*Example queries:*\n' +
                  '• "What is the capital of France?"\n' +
                  '• "Summarize this article"\n' +
                  '• "Translate hello to Spanish"\n' +
                  '• "Explain quantum physics"',
            footer: 'AI Assistant Active',
            buttons: buttons
        }, { quoted: quotedMsg });
        
        console.log('✅ AI Mode enabled');
        
    } else if (mode === 'off' || mode === 'disable' || mode === 'false' || mode === '0') {
        global.aiMode.set(userId, false);
        
        await sendButtons(sock, chatId, {
            text: '🔕 *AI Mode DISABLED*\n\nAI assistance has been turned off. You can re-enable anytime.',
            footer: 'AI Assistant Inactive',
            buttons: [{
                id: 'ai_on',
                text: '✨ Enable AI'
            }]
        }, { quoted: quotedMsg });
        
        console.log('✅ AI Mode disabled');
        
    } else if (mode === 'status' || mode === '') {
        const status = global.aiMode.get(userId) ? 'ENABLED ✅' : 'DISABLED ❌';
        const statusColor = global.aiMode.get(userId) ? '🟢' : '⚫';
        
        const buttons = global.aiMode.get(userId) ? [
            {
                id: 'ai_off',
                text: '🔕 Disable AI'
            },
            {
                id: 'ai_help',
                text: '❓ Help'
            }
        ] : [
            {
                id: 'ai_on',
                text: '✨ Enable AI'
            }
        ];

        await sendButtons(sock, chatId, {
            text: `🤖 *AI Mode Status*\n\n` +
                  `${statusColor} Current Status: *${status}*\n\n` +
                  `*What AI can do:*\n` +
                  `• Answer questions\n` +
                  `• Translate text\n` +
                  `• Summarize content\n` +
                  `• Explain concepts\n` +
                  `• Generate ideas\n\n` +
                  `Use \`.button ai on\` to enable.`,
            footer: 'AI Assistant',
            buttons: buttons
        }, { quoted: quotedMsg });
        
        console.log('✅ AI status shown');
        
    } else {
        // If in AI mode, treat as query to AI
        if (global.aiMode.get(userId)) {
            await handleAIQuery(sock, chatId, text, quotedMsg, reply);
        } else {
            await reply(`❌ Unknown AI command. Use \`.button ai on\` to enable AI mode, or \`.button ai status\` to check status.`);
        }
    }
}

// Handle AI queries when AI mode is enabled
async function handleAIQuery(sock, chatId, query, quotedMsg, reply) {
    console.log(`📝 AI Query: "${query}"`);
    
    // Simulate AI response (replace with actual AI API call)
    const response = `🤖 *AI Response*\n\n` +
                     `You asked: "${query}"\n\n` +
                     `This is a demo response. In production, this would call an actual AI API like OpenAI, Gemini, or Claude.\n\n` +
                     `To disable AI mode: \`.button ai off\``;

    await sendButtons(sock, chatId, {
        text: response,
        footer: 'AI Assistant',
        buttons: [
            {
                id: 'ai_off',
                text: '🔕 Disable AI'
            },
            {
                id: 'ai_help',
                text: '❓ Help'
            }
        ]
    }, { quoted: quotedMsg });
}

// 8. Combo Buttons (Multiple Types)
async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    console.log('\n📝 Combo Buttons:');
    
    const buttons = [
        {
            id: `yes_${Date.now()}`,
            text: '✅ Yes'
        },
        {
            id: `no_${Date.now()}`,
            text: '❌ No'
        },
        {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: '🌐 Google',
                url: 'https://google.com'
            })
        },
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: '📋 Copy',
                copy_code: 'DEMO123'
            })
        }
    ];

    const payload = {
        text: '🔘 *All Button Types Demo*\n\nTry different button types:',
        footer: 'Combo Demo',
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ Combo buttons sent');
}

// 9. Validate Payload
async function validatePayload(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 Validating payload:');
    
    try {
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = {
                text: text || 'Test message',
                buttons: [
                    { id: 'btn1', text: 'Option 1' },
                    { id: 'btn2', text: 'Option 2' }
                ]
            };
        }
        
        console.log('📦 Payload to validate:', JSON.stringify(payload, null, 2));
        
        if (validateSendButtonsPayload) {
            const isValid = validateSendButtonsPayload(payload);
            
            let resultMsg = `✅ *Payload Validation Result*\n\n`;
            resultMsg += `*Valid:* ${isValid ? '✅ Yes' : '❌ No'}\n`;
            resultMsg += `*Payload:*\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
            
            await reply(resultMsg);
        } else {
            await reply('❌ Validation function not available');
        }
        
    } catch (error) {
        await reply(`❌ Validation error: ${error.message}`);
    }
}
