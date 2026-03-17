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
            
            await reply(errorMsg);
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply) {
    const helpText = `🔘 *Button & AI Commands*\n\n` +
                    `*1. Native Buttons (Quick Reply)*\n` +
                    `\`.button native Question | Option1,Option2\`\n\n` +
                    `*2. URL Button*\n` +
                    `\`.button url Title | Desc | Btn Text | URL\`\n\n` +
                    `*3. Call Button*\n` +
                    `\`.button call Title | Desc | Btn Text | Phone\`\n\n` +
                    `*4. Copy Button*\n` +
                    `\`.button copy Title | Desc | Btn Text | Code\`\n\n` +
                    `*5. Location Button*\n` +
                    `\`.button location Title | Desc | Btn Text | lat,long\`\n\n` +
                    `*6. List Button (Dropdown)*\n` +
                    `\`.button list Title | Btn Text | Option1,Option2\`\n\n` +
                    `*7. AI Mode*\n` +
                    `\`.button ai on/off/status\`\n\n` +
                    `*8. Combo*\n` +
                    `\`.button combo\``;

    await reply(helpText);
}

// 1. Native Buttons
async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) return reply('❌ Format: `button native Question | Option1,Option2`');

    const buttons = parts[1].split(',').map(opt => ({
        id: `btn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        text: opt.trim()
    }));

    await sendButtons(sock, chatId, {
        text: parts[0],
        footer: 'Select an option',
        buttons: buttons
    }, { quoted: quotedMsg });
}

// 2. URL Button
async function handleUrlButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `Title | Desc | Btn | URL`');
    const [title, desc, btn, url] = parts;

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${desc}`,
        buttons: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: btn, url: url })
        }]
    }, { quoted: quotedMsg });
}

// 3. Call Button
async function handleCallButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `Title | Desc | Btn | Phone`');
    const [title, desc, btn, phone] = parts;

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${desc}`,
        buttons: [{
            name: 'cta_call',
            buttonParamsJson: JSON.stringify({ display_text: btn, phone_number: phone.replace(/\D/g, '') })
        }]
    }, { quoted: quotedMsg });
}

// 4. Copy Button
async function handleCopyButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `Title | Desc | Btn | Code`');
    const [title, desc, btn, code] = parts;

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${desc}`,
        buttons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: btn, copy_code: code })
        }]
    }, { quoted: quotedMsg });
}

// 5. Location Button
async function handleLocationButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `Title | Desc | Btn | lat,long`');
    const [title, desc, btn, coords] = parts;
    const [lat, long] = coords.split(',').map(c => parseFloat(c.trim()));

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${desc}`,
        buttons: [{
            name: 'cta_location',
            buttonParamsJson: JSON.stringify({ display_text: btn, latitude: lat, longitude: long })
        }]
    }, { quoted: quotedMsg });
}

// 6. List Button (FIXED: Uses sendInteractiveMessage)
async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    console.log('\n📝 List Button Processing:');
    
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
        return reply('❌ Format: `button list Title | Button Text | Option1,Option2`');
    }

    const [title, buttonText, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());

    const payload = {
        title: title,
        body: `📋 *${title}*\n\nPlease select an option from the list below:`,
        footer: 'Gifted-Btns Interactive Menu',
        buttonText: buttonText,
        sections: [{
            title: "Available Options",
            rows: options.map((opt, index) => ({
                title: opt,
                description: `Select ${opt}`,
                id: `list_opt_${Date.now()}_${index}`
            }))
        }]
    };

    console.log('📦 Interactive Payload:', JSON.stringify(payload, null, 2));
    await sendInteractiveMessage(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ List button sent successfully');
}

// 7. AI Mode Control
async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    const userId = chatId;

    if (mode === 'on') {
        global.aiMode.set(userId, true);
        await sendButtons(sock, chatId, {
            text: '✨ *AI Mode ENABLED*',
            buttons: [{ id: 'ai_off', text: '🔕 Disable' }]
        }, { quoted: quotedMsg });
    } else if (mode === 'off') {
        global.aiMode.set(userId, false);
        await reply('🔕 *AI Mode DISABLED*');
    } else {
        const status = global.aiMode.get(userId) ? 'ENABLED ✅' : 'DISABLED ❌';
        await reply(`🤖 *AI Mode Status:* ${status}`);
    }
}

// 8. Combo Buttons
async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    const buttons = [
        { id: 'c1', text: '✅ Yes' },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Google', url: 'https://google.com' }) }
    ];

    await sendButtons(sock, chatId, {
        text: '🔘 *Combo Demo*',
        footer: 'Multiple types',
        buttons: buttons
    }, { quoted: quotedMsg });
}

// 9. Validate Payload
async function validatePayload(sock, chatId, text, quotedMsg, reply) {
    try {
        const payload = JSON.parse(text);
        const isValid = validateSendButtonsPayload(payload);
        await reply(`Validation Result: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    } catch (e) {
        await reply('❌ Provide valid JSON to validate.');
    }
}
