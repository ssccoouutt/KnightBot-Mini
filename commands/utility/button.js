const config = require('../../config');

// Import gifted-btns
const giftedBtns = require('gifted-btns');

// Available functions
const { 
    sendButtons, 
    sendInteractiveMessage 
} = giftedBtns;

// Store AI mode state
if (!global.aiMode) global.aiMode = new Map();

// Random response collections
const randomResponses = {
    yes: [
        "✅ Great choice!",
        "👍 Awesome!",
        "🎉 Excellent decision!",
        "💯 Perfect!",
        "✨ You made a great choice!"
    ],
    no: [
        "❌ Maybe next time!",
        "👎 That's too bad!",
        "😕 Oh well!",
        "🤔 Are you sure?",
        "💔 Maybe later!"
    ],
    pizza: [
        "🍕 Pizza is always a good choice!",
        "🇮🇹 Classic Italian! Buon appetito!",
        "🧀 Extra cheese coming right up!",
        "🍅 Margherita or Pepperoni?",
        "🔥 Hot and fresh pizza on the way!"
    ],
    burger: [
        "🍔 Who doesn't love a good burger?",
        "🥩 Medium rare or well done?",
        "🍟 Don't forget the fries!",
        "🧀 Cheeseburger paradise!",
        "🇺🇸 All-American classic!"
    ],
    pasta: [
        "🍝 Mamma mia! Great choice!",
        "🇮🇹 Al dente perfection!",
        "🧀 Extra parmesan?",
        "🍅 Carbonara or Bolognese?",
        "🍷 Perfect with red wine!"
    ],
    general: [
        "Thanks for your selection!",
        "Good choice!",
        "Excellent!",
        "Perfect!",
        "Awesome!",
        "You got it!",
        "Done!",
        "✅ Confirmed!"
    ]
};

// Function to get random response
function getRandomResponse(category) {
    const responses = randomResponses[category] || randomResponses.general;
    return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = {
    name: 'button',
    aliases: ['buttons', 'interactive', 'cta', 'btn', 'ai'],
    description: 'Send interactive button messages with random responses',
    usage: 'button [type] [parameters]',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply);
            return;
        }

        const subCommand = args[0].toLowerCase();
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
                default:
                    await showHelp(sock, from, reply);
            }
            await react('✅');
        } catch (error) {
            console.error('❌ ERROR:', error);
            await reply(`❌ *Button Error*\n\n*Message:* ${error.message}`);
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply) {
    const helpText = `🔘 *Button Commands - Random Responses*\n\n` +
                    `*1. Native Buttons (Yes/No)*\n` +
                    `\`.button native Question | Yes,No\`\n` +
                    `Example: \`.button native Do you like pizza? | Yes,No\`\n\n` +
                    
                    `*2. Food Menu (List)*\n` +
                    `\`.button list Menu Title | Button Text | Pizza,Burger,Pasta\`\n` +
                    `Example: \`.button list Food Menu | Choose Food | Pizza,Burger,Pasta\`\n\n` +
                    
                    `*3. URL Button*\n` +
                    `\`.button url Title | Desc | Text | URL\`\n` +
                    `Example: \`.button url Offer | 50% off! | Shop Now | https://google.com\`\n\n` +
                    
                    `*4. AI Mode*\n` +
                    `\`.button ai on/off/status\`\n\n` +
                    
                    `*5. Combo*\n` +
                    `\`.button combo\``;
    await reply(helpText);
}

// 1. Native Buttons (Yes/No with random responses)
async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) return reply('❌ Format: `button native Question | Option1,Option2`');

    const question = parts[0];
    const options = parts[1].split(',').map(o => o.trim());
    
    // Create unique IDs for each option
    const sessionId = `native_${Date.now()}`;
    const buttons = options.map(opt => ({ 
        id: `${sessionId}_${opt.toLowerCase()}`, 
        text: opt 
    }));

    await sendButtons(sock, chatId, {
        text: question,
        footer: 'Choose an option',
        buttons: buttons,
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
    
    // Listen for responses (handled by the global message handler)
    console.log(`📋 Native buttons sent - Session: ${sessionId}`);
}

// 2. List Button (with random food responses)
async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) return reply('❌ Format: `button list Title | Button Text | Option1,Option2,Option3`');

    const title = parts[0];
    const buttonText = parts[1];
    const options = parts[2].split(',').map(o => o.trim());
    
    const sessionId = `list_${Date.now()}`;
    
    // Create rows with unique IDs
    const rows = options.map((opt, i) => {
        const optLower = opt.toLowerCase();
        return {
            id: `${sessionId}_${optLower}`,  // Unique ID for each option
            title: opt,
            description: `Select ${opt}`
        };
    });

    await sendInteractiveMessage(sock, chatId, {
        text: `📋 *${title}*\n\nWhat would you like to order?`,
        interactiveButtons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: buttonText,
                sections: [{ 
                    title: 'Menu Options', 
                    rows: rows 
                }]
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
    
    console.log(`📋 List menu sent - Session: ${sessionId}`);
}

// 3. URL Button
async function handleUrlButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button url Title | Description | Button Text | URL`');

    const [title, description, buttonText, url] = parts;

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
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 4. Call Button
async function handleCallButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button call Title | Description | Button Text | Phone`');

    const [title, description, buttonText, phone] = parts;

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_call',
            buttonParamsJson: JSON.stringify({ 
                display_text: buttonText, 
                phone_number: phone.replace(/\D/g, '') 
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 5. Copy Button
async function handleCopyButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button copy Title | Description | Button Text | Text`');

    const [title, description, buttonText, copyText] = parts;

    await sendButtons(sock, chatId, {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ 
                display_text: buttonText, 
                copy_code: copyText 
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 6. Location Button
async function handleLocationButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button location Title | Description | Button Text | lat,long`');

    const [title, description, buttonText, coordinates] = parts;
    const [lat, long] = coordinates.split(',').map(c => parseFloat(c.trim()));

    if (isNaN(lat) || isNaN(long)) {
        return reply('❌ Invalid coordinates. Use format: lat,long');
    }

    await sendInteractiveMessage(sock, chatId, {
        text: `${title}\n\n${description}`,
        interactiveButtons: [{
            name: 'send_location',
            buttonParamsJson: JSON.stringify({ 
                display_text: buttonText,
                latitude: lat,
                longitude: long
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 7. AI Mode Control
async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    const sessionId = `ai_${Date.now()}`;
    
    if (mode === 'on') {
        global.aiMode.set(chatId, true);
        await sendButtons(sock, chatId, {
            text: '✨ *AI Mode ENABLED*\n\nAll messages will now show AI tag.',
            footer: 'AI Assistant Active',
            buttons: [{ 
                id: `${sessionId}_disable`, 
                text: '🔕 Disable' 
            }],
            aimode: true
        }, { quoted: quotedMsg });
        
    } else if (mode === 'off') {
        global.aiMode.set(chatId, false);
        await sendButtons(sock, chatId, {
            text: '🔕 *AI Mode DISABLED*',
            buttons: [{ 
                id: `${sessionId}_enable`, 
                text: '✨ Enable' 
            }],
            aimode: false
        }, { quoted: quotedMsg });
        
    } else {
        const status = global.aiMode.get(chatId) ? 'ENABLED ✅' : 'DISABLED ❌';
        await reply(`🤖 *AI Mode Status*: ${status}`);
    }
}

// 8. Combo Buttons (Mix of types)
async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    const sessionId = `combo_${Date.now()}`;
    
    await sendButtons(sock, chatId, {
        text: '🔘 *Interactive Demo*\n\nTry clicking different buttons:',
        footer: 'Each button gives a random response',
        buttons: [
            { 
                id: `${sessionId}_yes`, 
                text: '✅ Yes' 
            },
            { 
                id: `${sessionId}_no`, 
                text: '❌ No' 
            },
            { 
                id: `${sessionId}_help`, 
                text: '❓ Help' 
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({ 
                    display_text: '🌐 Google', 
                    url: 'https://google.com' 
                })
            }
        ],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// This function should be called from your message handler when a button is clicked
// Add this to your handler.js message processing
async function handleButtonClick(sock, msg, buttonId, displayText) {
    const from = msg.key.remoteJid;
    
    console.log(`🔘 Button clicked: ${displayText} (${buttonId})`);
    
    // Parse the session and option from buttonId
    const parts = buttonId.split('_');
    const option = parts[parts.length - 1]; // Get last part (yes, no, pizza, etc.)
    
    // Get random response based on option
    const response = getRandomResponse(option);
    
    // Send random response
    await sock.sendMessage(from, { 
        text: response 
    });
    
    return true;
}

// Export the handler for use in main message processing
module.exports.handleButtonClick = handleButtonClick;
module.exports.getRandomResponse = getRandomResponse;
