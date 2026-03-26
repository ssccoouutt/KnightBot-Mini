const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

// Import gifted-btns
const giftedBtns = require('gifted-btns');

// Available functions
const { 
    sendButtons, 
    sendInteractiveMessage
} = giftedBtns;

// Store AI mode state
if (!global.aiMode) global.aiMode = new Map();

// Random response collections for button clicks
const buttonResponses = {
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
    help: [
        "❓ How can I help you?",
        "🆘 What do you need assistance with?",
        "📋 Type `.menu` to see all commands",
        "💬 Just ask me anything!",
        "🤖 I'm here to help!"
    ],
    default: [
        "✅ Got it!",
        "👍 Thanks!",
        "😊 Great!",
        "✨ Excellent!",
        "🎉 Perfect!"
    ]
};

// Get random response based on button ID
function getRandomResponse(buttonId, displayText) {
    const parts = buttonId.split('_');
    const key = parts[parts.length - 1]?.toLowerCase() || '';
    const text = displayText?.toLowerCase() || '';
    
    let category = 'default';
    if (key === 'yes' || text.includes('yes')) category = 'yes';
    else if (key === 'no' || text.includes('no')) category = 'no';
    else if (key === 'help' || text.includes('help')) category = 'help';
    else if (key === 'pizza' || text.includes('pizza')) category = 'pizza';
    else if (key === 'burger' || text.includes('burger')) category = 'burger';
    else if (key === 'pasta' || text.includes('pasta')) category = 'pasta';
    
    const responses = buttonResponses[category];
    return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = {
    name: 'button',
    aliases: [],
    description: 'Send interactive button messages',
    usage: 'button [type] [parameters]',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply);
            return;
        }

        const subCommand = args[0].toLowerCase();
        await react('⏳');

        try {
            let sentMsg;
            
            // Create a session for this button command
            const session = sessionManager.createSession(sender, from, this.name, {
                type: subCommand,
                args: args.slice(1).join(' '),
                step: 1
            });
            
            switch (subCommand) {
                case 'native':
                case 'quick':
                    sentMsg = await handleNativeButtons(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'url':
                case 'cta_url':
                    sentMsg = await handleUrlButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'call':
                case 'cta_call':
                    sentMsg = await handleCallButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'copy':
                case 'cta_copy':
                    sentMsg = await handleCopyButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'location':
                case 'cta_location':
                    sentMsg = await handleLocationButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'list':
                    sentMsg = await handleListButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'ai':
                    sentMsg = await handleAIMode(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'combo':
                    sentMsg = await handleComboButtons(sock, from, msg, reply);
                    break;
                default:
                    await showHelp(sock, from, reply);
            }
            
            // Store the message ID in session for reply tracking
            if (sentMsg && sentMsg.key) {
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
                console.log(`✅ Session created for ${sender} with message ID: ${sentMsg.key.id}`);
            }
            
            await react('✅');
        } catch (error) {
            console.error('❌ ERROR:', error);
            await reply(`❌ *Button Error*\n\n${error.message}`);
            await react('❌');
        }
    },
    
    // Handle ALL session messages (distinguish between button clicks and manual replies)
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        // Get message info
        const text = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    '';
        const quotedMessageId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        
        console.log(`📨 Button session handling: text="${text}", isButtonClick=${isButtonClick}, quotedId=${quotedMessageId}`);
        console.log(`📊 Session pending messages:`, session.pendingMessages);
        
        // Check if this is a BUTTON CLICK (actual button press, not manual reply)
        if (isButtonClick) {
            // This is a real button click - respond with random message
            console.log(`🔘 REAL BUTTON CLICK detected: ${text}`);
            
            const response = getRandomResponse(quotedMessageId || 'unknown', text);
            const sentMsg = await reply(response);
            
            // Store this response in session for potential follow-up
            if (sentMsg && sentMsg.key) {
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
            }
            
            return true;
        }
        
        // Check if this is a reply to one of our messages (manual reply)
        const isReplyToOurMessage = quotedMessageId && session.pendingMessages?.some(p => p && p.messageId === quotedMessageId);
        
        if (isReplyToOurMessage) {
            // This is a MANUAL REPLY to a button message - NOT a button click
            console.log(`💬 MANUAL REPLY to button message: ${text}`);
            
            // For manual replies, give a helpful message
            const response = `ℹ️ You replied manually. Please click the buttons above to interact with the button command.`;
            const sentMsg = await reply(response);
            
            if (sentMsg && sentMsg.key) {
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
            }
            
            return true;
        }
        
        // This is a direct message during button session
        console.log(`💬 Direct message during button session: ${text}`);
        
        if (!text || text.trim() === '') {
            return true;
        }
        
        const sentMsg = await reply(`ℹ️ Please click one of the buttons above to interact with me. If you want to start over, use \`.button\` again.`);
        
        if (sentMsg && sentMsg.key) {
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        }
        
        return true;
    }
};

async function showHelp(sock, chatId, reply) {
    const helpText = `🔘 *Button Commands*\n\n` +
                    `*1. Native Buttons*\n` +
                    `\`.button native Question | Option1,Option2\`\n` +
                    `Example: \`.button native Do you like pizza? | Yes,No\`\n\n` +
                    
                    `*2. URL Button*\n` +
                    `\`.button url Title | Description | Button Text | URL\`\n` +
                    `Example: \`.button url Special Offer | 50% off! | Shop Now | https://google.com\`\n\n` +
                    
                    `*3. Call Button*\n` +
                    `\`.button call Title | Description | Button Text | Phone\`\n` +
                    `Example: \`.button call Support | Need help? | Call Now | +1234567890\`\n\n` +
                    
                    `*4. Copy Button*\n` +
                    `\`.button copy Title | Description | Button Text | Text\`\n` +
                    `Example: \`.button copy Coupon | Save 20% | Copy Code | SAVE20\`\n\n` +
                    
                    `*5. Location Button*\n` +
                    `\`.button location Title | Description | Button Text\`\n` +
                    `Example: \`.button location Store | Visit us | Get Directions\`\n\n` +
                    
                    `*6. List Button*\n` +
                    `\`.button list Title | Button Text | Option1,Option2\`\n` +
                    `Example: \`.button list Food Menu | Choose Food | Pizza,Burger,Pasta\`\n\n` +
                    
                    `*7. AI Mode*\n` +
                    `\`.button ai on/off/status\`\n\n` +
                    
                    `*8. Combo Buttons*\n` +
                    `\`.button combo\``;
    await reply(helpText);
}

async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) {
        await reply('❌ Format: `button native Question | Option1,Option2`');
        return null;
    }

    const question = parts[0];
    const options = parts[1].split(',').map(o => o.trim());
    const sessionId = `native_${Date.now()}`;
    
    const buttons = options.map(opt => ({ 
        id: `${sessionId}_${opt.toLowerCase()}`, 
        text: opt 
    }));

    return await sendButtons(sock, chatId, {
        text: question,
        footer: 'Choose an option',
        buttons: buttons,
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

async function handleUrlButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        await reply('❌ Format: `button url Title | Description | Button Text | URL`');
        return null;
    }

    const [title, description, buttonText, url] = parts;

    return await sendButtons(sock, chatId, {
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

async function handleCallButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        await reply('❌ Format: `button call Title | Description | Button Text | Phone`');
        return null;
    }

    const [title, description, buttonText, phone] = parts;

    return await sendButtons(sock, chatId, {
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

async function handleCopyButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) {
        await reply('❌ Format: `button copy Title | Description | Button Text | Text`');
        return null;
    }

    const [title, description, buttonText, copyText] = parts;

    return await sendButtons(sock, chatId, {
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

async function handleLocationButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
        await reply('❌ Format: `button location Title | Description | Button Text`');
        return null;
    }

    const [title, description, buttonText] = parts;

    return await sendInteractiveMessage(sock, chatId, {
        text: `${title}\n\n${description}`,
        interactiveButtons: [{
            name: 'send_location',
            buttonParamsJson: JSON.stringify({ 
                display_text: buttonText 
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
        await reply('❌ Format: `button list Title | Button Text | Option1,Option2`');
        return null;
    }

    const title = parts[0];
    const buttonText = parts[1];
    const options = parts[2].split(',').map(o => o.trim());
    const sessionId = `list_${Date.now()}`;
    
    const rows = options.map((opt, i) => ({ 
        id: `${sessionId}_${opt.toLowerCase()}`, 
        title: opt,
        description: `Select ${opt}`
    }));

    return await sendInteractiveMessage(sock, chatId, {
        text: title,
        interactiveButtons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: buttonText,
                sections: [{ 
                    title: 'Options', 
                    rows: rows 
                }]
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    const sessionId = `ai_${Date.now()}`;
    
    if (mode === 'on') {
        global.aiMode.set(chatId, true);
        return await sendButtons(sock, chatId, {
            text: '✨ *AI Mode ENABLED*',
            footer: 'AI Assistant Active',
            buttons: [{ 
                id: `${sessionId}_disable`, 
                text: '🔕 Disable' 
            }],
            aimode: true
        }, { quoted: quotedMsg });
    } else if (mode === 'off') {
        global.aiMode.set(chatId, false);
        return await sendButtons(sock, chatId, {
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
        return null;
    }
}

async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    const sessionId = `combo_${Date.now()}`;
    
    return await sendButtons(sock, chatId, {
        text: '🔘 *Interactive Demo*\n\nClick any button to see a random response:',
        footer: 'Each click gives a different reply',
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
