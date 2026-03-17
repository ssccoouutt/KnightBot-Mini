const config = require('../../config');
const { sendButtons, sendList, sendAIMode } = require('gifted-btns');

module.exports = {
    name: 'button',
    aliases: ['buttons', 'interactive', 'quickreply', 'cta'],
    description: 'Send interactive button messages',
    usage: 'button [type] [parameters]',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply, config);
            return;
        }

        const subCommand = args[0].toLowerCase();
        await react('⏳');

        try {
            switch (subCommand) {
                case 'native':
                case 'flow':
                    await handleNativeFlow(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'url':
                case 'cta_url':
                    await handleCTAUrl(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'call':
                case 'cta_call':
                    await handleCTACall(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'copy':
                case 'cta_copy':
                    await handleCTACopy(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'location':
                case 'cta_location':
                    await handleCTALocation(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'list':
                    await handleList(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'ai':
                case 'aimode':
                    await handleAIMode(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                    
                case 'combo':
                case 'all':
                    await handleCombo(sock, from, msg, reply);
                    break;
                    
                default:
                    await showHelp(sock, from, reply, config);
            }
            
            await react('✅');
            
        } catch (error) {
            console.error('Button error:', error);
            await reply(`❌ Error: ${error.message}`);
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply, config) {
    const helpText = `🔘 *Button Commands*\n\n` +
                    `*Types:*\n` +
                    `1️⃣ *Native Flow* - Quick reply buttons\n` +
                    `└ \`${config.prefix}button native Question | Button1,Button2,Button3\`\n` +
                    `└ Example: \`${config.prefix}button native Do you like pizza? | Yes,No,Maybe\`\n\n` +
                    
                    `2️⃣ *CTA URL* - Website links\n` +
                    `└ \`${config.prefix}button url Title | Description | Button Text | URL\`\n` +
                    `└ Example: \`${config.prefix}button url Special Offer | 50% off! | Shop Now | https://example.com\`\n\n` +
                    
                    `3️⃣ *CTA Call* - Phone calls\n` +
                    `└ \`${config.prefix}button call Title | Description | Button Text | Phone\`\n` +
                    `└ Example: \`${config.prefix}button call Support | Need help? | Call Now | +1234567890\`\n\n` +
                    
                    `4️⃣ *CTA Copy* - Copy to clipboard\n` +
                    `└ \`${config.prefix}button copy Title | Description | Button Text | Text to copy\`\n` +
                    `└ Example: \`${config.prefix}button copy Coupon | Save 20% | Copy Code | SAVE20\`\n\n` +
                    
                    `5️⃣ *Location* - Share location\n` +
                    `└ \`${config.prefix}button location Title | Description | Button Text | lat,long\`\n` +
                    `└ Example: \`${config.prefix}button location Store | Visit us | View Map | 40.7128,-74.0060\`\n\n` +
                    
                    `6️⃣ *List* - Dropdown menu\n` +
                    `└ \`${config.prefix}button list Title | Description | Option1,Option2,Option3\`\n` +
                    `└ Example: \`${config.prefix}button list Menu | Choose food | Pizza,Burger,Pasta\`\n\n` +
                    
                    `7️⃣ *AI Mode* - Enable AI assistant\n` +
                    `└ \`${config.prefix}button ai [on/off]\`\n` +
                    `└ Example: \`${config.prefix}button ai on\`\n\n` +
                    
                    `8️⃣ *Combo* - Multiple button types\n` +
                    `└ \`${config.prefix}button combo\``;

    await reply(helpText);
}

// 1️⃣ Native Flow Buttons (Quick Reply)
async function handleNativeFlow(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    
    if (parts.length < 2) {
        return reply('❌ Format: `button native Question | Button1,Button2,Button3`');
    }

    const question = parts[0];
    const buttonsText = parts[1].split(',').map(b => b.trim());

    const buttons = buttonsText.map((btn, index) => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: btn,
            id: `btn_${Date.now()}_${index}`
        })
    }));

    await sendButtons(sock, chatId, {
        text: question,
        footer: 'Choose an option',
        buttons: buttons
    }, { quoted: quotedMsg });
}

// 2️⃣ CTA URL Buttons
async function handleCTAUrl(sock, chatId, text, quotedMsg, reply) {
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

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                url: url
            })
        }]
    }, { quoted: quotedMsg });
}

// 3️⃣ CTA Call Buttons
async function handleCTACall(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    
    if (parts.length < 4) {
        return reply('❌ Format: `button call Title | Description | Button Text | Phone`');
    }

    const [title, description, buttonText, phone] = parts;
    const cleanPhone = phone.replace(/\D/g, '');

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_call',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                phone_number: cleanPhone
            })
        }]
    }, { quoted: quotedMsg });
}

// 4️⃣ CTA Copy Buttons
async function handleCTACopy(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    
    if (parts.length < 4) {
        return reply('❌ Format: `button copy Title | Description | Button Text | Text to copy`');
    }

    const [title, description, buttonText, copyText] = parts;

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                copy_code: copyText
            })
        }]
    }, { quoted: quotedMsg });
}

// 5️⃣ CTA Location Buttons
async function handleCTALocation(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    
    if (parts.length < 4) {
        return reply('❌ Format: `button location Title | Description | Button Text | lat,long`');
    }

    const [title, description, buttonText, coordinates] = parts;
    const [lat, long] = coordinates.split(',').map(c => parseFloat(c.trim()));

    if (isNaN(lat) || isNaN(long)) {
        return reply('❌ Invalid coordinates. Use format: lat,long (e.g., 40.7128,-74.0060)');
    }

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_location',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                latitude: lat,
                longitude: long
            })
        }]
    }, { quoted: quotedMsg });
}

// 6️⃣ List Message
async function handleList(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    
    if (parts.length < 3) {
        return reply('❌ Format: `button list Title | Description | Option1,Option2,Option3`');
    }

    const [title, description, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());

    const sections = [{
        title: title,
        rows: options.map((opt, index) => ({
            title: opt,
            description: `Select ${opt}`,
            rowId: `opt_${Date.now()}_${index}`
        }))
    }];

    await sendList(sock, chatId, {
        text: description,
        footer: title,
        title: title,
        buttonText: 'Choose Option',
        sections: sections
    }, { quoted: quotedMsg });
}

// 7️⃣ AI Mode
async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    
    if (mode === 'on' || mode === 'true' || mode === '1') {
        await sendAIMode(sock, chatId, {
            status: 'on',
            text: '✨ *AI Mode Enabled*\n\nI can now help you with questions, translations, and more!'
        }, { quoted: quotedMsg });
    } 
    else if (mode === 'off' || mode === 'false' || mode === '0') {
        await sendAIMode(sock, chatId, {
            status: 'off',
            text: '🔕 *AI Mode Disabled*'
        }, { quoted: quotedMsg });
    }
    else {
        // Show AI mode status
        await sendAIMode(sock, chatId, {
            status: 'toggle',
            text: '🤖 *AI Assistant*\n\nWould you like to enable AI mode?',
            buttons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '✅ Enable',
                        id: 'ai_on'
                    })
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '❌ Disable',
                        id: 'ai_off'
                    })
                }
            ]
        }, { quoted: quotedMsg });
    }
}

// 8️⃣ Combo - Multiple button types
async function handleCombo(sock, chatId, quotedMsg, reply) {
    await sendButtons(sock, chatId, {
        text: '🔘 *All Button Types Demo*\n\nTry each button type below:',
        footer: 'gifted-btns demo',
        buttons: [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '✅ Yes/No',
                    id: 'quick_yes'
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🌐 Visit Google',
                    url: 'https://google.com'
                })
            },
            {
                name: 'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: '📞 Call Support',
                    phone_number: '1234567890'
                })
            },
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: '📋 Copy Code',
                    copy_code: 'SAVE20'
                })
            },
            {
                name: 'cta_location',
                buttonParamsJson: JSON.stringify({
                    display_text: '📍 View Map',
                    latitude: 40.7128,
                    longitude: -74.0060
                })
            }
        ]
    }, { quoted: quotedMsg });
}
