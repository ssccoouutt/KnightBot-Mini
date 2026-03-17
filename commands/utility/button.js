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
            await reply(`❌ *Command Error*\n${error.message}`);
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply) {
    const helpText = `🔘 *Button & AI Commands*\n\n` +
                    `*1. Native (Quick Reply)*\n\`.button native Question | Opt1,Opt2\`\n\n` +
                    `*2. URL Button*\n\`.button url Title | Desc | Btn | URL\`\n\n` +
                    `*3. Call Button*\n\`.button call Title | Desc | Btn | Phone\`\n\n` +
                    `*4. Copy Button*\n\`.button copy Title | Desc | Btn | Code\`\n\n` +
                    `*5. List Button*\n\`.button list Title | Btn | Opt1,Opt2\`\n\n` +
                    `*6. AI Mode*\n\`.button ai on/off/status\``;
    await reply(helpText);
}

// 1. Native Buttons
async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) return reply('❌ Format: `native Question | Opt1,Opt2`');

    const buttons = parts[1].split(',').map((opt, i) => ({
        id: `btn_${Date.now()}_${i}`,
        text: opt.trim()
    }));

    await sendButtons(sock, chatId, {
        text: parts[0],
        footer: 'Gifted-btns',
        buttons: buttons
    }, { quoted: quotedMsg });
}

// 2. URL Button
async function handleUrlButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `Title | Desc | Btn | URL`');
    const [title, desc, btn, url] = parts;

    await sendButtons(sock, chatId, {
        text: `*${title}*\n\n${desc}`,
        buttons: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: btn, url })
        }]
    }, { quoted: quotedMsg });
}

// 3. Call Button
async function handleCallButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `Title | Desc | Btn | Phone`');
    const [title, desc, btn, phone] = parts;

    await sendButtons(sock, chatId, {
        text: `*${title}*\n\n${desc}`,
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
        text: `*${title}*\n\n${desc}`,
        buttons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: btn, copy_code: code })
        }]
    }, { quoted: quotedMsg });
}

// 5. Location Button
async function handleLocationButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    const [title, desc, btn, coords] = parts;
    const [lat, lon] = coords.split(',').map(c => parseFloat(c.trim()));

    await sendButtons(sock, chatId, {
        text: `*${title}*\n\n${desc}`,
        buttons: [{
            name: 'cta_location',
            buttonParamsJson: JSON.stringify({ display_text: btn, latitude: lat, longitude: lon })
        }]
    }, { quoted: quotedMsg });
}

// 6. List Button (Optimized Structure & Fallback)
async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) return reply('❌ Format: `list Title | Btn Text | Opt1,Opt2`');

    const [title, buttonText, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());

    // Payload structure adjusted for common Baileys/Gifted compatibility
    const payload = {
        title: title,
        body: `📋 *${title}*\n\nSelect an option:`,
        footer: 'Interactive Menu',
        buttonText: buttonText,
        sections: [{
            title: "Options",
            rows: options.map((opt, i) => ({
                title: opt,
                id: `list_id_${Date.now()}_${i}`
            }))
        }]
    };

    try {
        await sendInteractiveMessage(sock, chatId, payload, { quoted: quotedMsg });
    } catch (e) {
        console.log('List failed, using native fallback...');
        await handleNativeButtons(sock, chatId, `${title} | ${optionsText}`, quotedMsg, reply);
    }
}

// 7. AI Mode Control
async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    if (mode === 'on') {
        global.aiMode.set(chatId, true);
        await reply('✨ *AI Mode Enabled.* I will now respond to your messages!');
    } else if (mode === 'off') {
        global.aiMode.set(chatId, false);
        await reply('🔕 *AI Mode Disabled.*');
    } else {
        const isEnabled = global.aiMode.get(chatId) ? 'ON ✅' : 'OFF ❌';
        await reply(`🤖 AI Mode is currently: ${isEnabled}`);
    }
}

// 8. Combo Buttons
async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    const buttons = [
        { id: '1', text: 'Option A' },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Open Link', url: 'https://google.com' }) }
    ];
    await sendButtons(sock, chatId, { text: 'Combo!', buttons }, { quoted: quotedMsg });
}
