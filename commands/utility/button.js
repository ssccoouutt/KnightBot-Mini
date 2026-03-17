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

module.exports = {
    name: 'button',
    aliases: ['buttons', 'interactive', 'cta', 'btn'],
    description: 'Send interactive button messages',
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
            let result;
            
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
                    await handleListButtons(sock, from, args.slice(1).join(' '), msg, reply);
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
    const helpText = `🔘 *Button Commands*\n\n` +
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
                    
                    `*6. List Buttons*\n` +
                    `\`.button list Title | Description | Option1,Option2,Option3\`\n` +
                    `Example: \`.button list Menu | Choose food | Pizza,Burger,Pasta\`\n\n` +
                    
                    `*7. Combo (Multiple Buttons)*\n` +
                    `\`.button combo\`\n\n` +
                    
                    `*8. Validate Payload*\n` +
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

    // Create buttons array - using format from example
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

    // Validate URL
    try {
        new URL(url);
    } catch {
        return reply('❌ Invalid URL format');
    }

    // Create URL button using cta_url format
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

    // Create call button
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

    // Create copy button
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

    // Create location button
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

// 6. List Buttons
async function handleListButtons(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 List Buttons:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
        return reply('❌ Format: `button list Title | Description | Option1,Option2,Option3`');
    }

    const [title, description, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());

    // Create multiple quick reply buttons
    const buttons = options.map(opt => ({
        id: `opt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        text: opt
    }));

    const payload = {
        text: `${title}\n\n${description}`,
        footer: 'Select an option',
        buttons: buttons
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ List buttons sent');
}

// 7. Combo Buttons (Multiple Types)
async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    console.log('\n📝 Combo Buttons:');
    
    // Mix of quick reply and CTA buttons
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

// 8. Validate Payload
async function validatePayload(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 Validating payload:');
    
    try {
        // Try to parse as JSON
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            // If not JSON, create a test payload
            payload = {
                text: text || 'Test message',
                buttons: [
                    { id: 'btn1', text: 'Option 1' },
                    { id: 'btn2', text: 'Option 2' }
                ]
            };
        }
        
        console.log('📦 Payload to validate:', JSON.stringify(payload, null, 2));
        
        // Validate using the library's validation function
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
