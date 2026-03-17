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

// Store AI mode state
if (!global.aiMode) global.aiMode = new Map();

module.exports = {
    name: 'button',
    aliases: [],
    description: 'Send interactive button messages and control AI mode',
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
    const helpText = `🔘 *Button & AI Commands (FINAL FIX)*\n\n` +
                    `*1. Native Buttons*\n` +
                    `\`.button native Question | Option1,Option2\`\n\n` +
                    `*2. URL Button*\n` +
                    `\`.button url Title | Description | Button Text | URL\`\n\n` +
                    `*3. Call Button*\n` +
                    `\`.button call Title | Description | Button Text | Phone\`\n\n` +
                    `*4. Copy Button*\n` +
                    `\`.button copy Title | Description | Button Text | Text\`\n\n` +
                    `*5. Location Button (FIXED)*\n` +
                    `\`.button location Title | Description | Button Text\`\n\n` +
                    `*6. List Button (FIXED)*\n` +
                    `\`.button list Title | Button Text | Option1,Option2\`\n\n` +
                    `*7. AI Mode (FIXED)*\n` +
                    `\`.button ai on/off/status\``;
    await reply(helpText);
}

// 1. Native Buttons
async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) return reply('❌ Format: `button native Question | Option1,Option2`');

    const options = parts[1].split(',').map(o => o.trim());
    const buttons = options.map(opt => ({ id: `btn_${Date.now()}`, text: opt }));

    await sendButtons(sock, chatId, {
        text: parts[0],
        footer: 'Choose an option',
        buttons: buttons,
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 2. URL Button
async function handleUrlButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button url Title | Description | Button Text | URL`');

    await sendButtons(sock, chatId, {
        text: `${parts[0]}\n\n${parts[1]}`,
        buttons: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: parts[2], url: parts[3] })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 3. Call Button
async function handleCallButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button call Title | Description | Button Text | Phone`');

    await sendButtons(sock, chatId, {
        text: `${parts[0]}\n\n${parts[1]}`,
        buttons: [{
            name: 'cta_call',
            buttonParamsJson: JSON.stringify({ display_text: parts[2], phone_number: parts[3].replace(/\D/g, '') })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 4. Copy Button
async function handleCopyButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 4) return reply('❌ Format: `button copy Title | Description | Button Text | Text`');

    await sendButtons(sock, chatId, {
        text: `${parts[0]}\n\n${parts[1]}`,
        buttons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: parts[2], copy_code: parts[3] })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 5. Location Button (FIXED: Using sendInteractiveMessage)
async function handleLocationButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) return reply('❌ Format: `button location Title | Description | Button Text`');

    // FIXED: Using sendInteractiveMessage for advanced native flow buttons
    await sendInteractiveMessage(sock, chatId, {
        text: `${parts[0]}\n\n${parts[1]}`,
        interactiveButtons: [{
            name: 'send_location',
            buttonParamsJson: JSON.stringify({ display_text: parts[2] })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 6. List Button (FIXED: Using sendInteractiveMessage)
async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) return reply('❌ Format: `button list Title | Button Text | Option1,Option2`');

    const options = parts[2].split(',').map(o => o.trim());
    const rows = options.map((opt, i) => ({ id: `opt_${i}`, title: opt }));

    // FIXED: Using sendInteractiveMessage for advanced native flow buttons
    await sendInteractiveMessage(sock, chatId, {
        text: parts[0],
        interactiveButtons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: parts[1],
                sections: [{ title: 'Options', rows: rows }]
            })
        }],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}

// 7. AI Mode Control
async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    if (mode === 'on') {
        global.aiMode.set(chatId, true);
        await sendButtons(sock, chatId, {
            text: '✨ *AI Mode ENABLED*',
            footer: 'AI Assistant Active',
            buttons: [{ id: 'ai_off', text: '🔕 Disable' }],
            aimode: true
        }, { quoted: quotedMsg });
    } else if (mode === 'off') {
        global.aiMode.set(chatId, false);
        await sendButtons(sock, chatId, {
            text: '🔕 *AI Mode DISABLED*',
            buttons: [{ id: 'ai_on', text: '✨ Enable' }],
            aimode: false
        }, { quoted: quotedMsg });
    } else {
        const status = global.aiMode.get(chatId) ? 'ENABLED ✅' : 'DISABLED ❌';
        await reply(`🤖 *AI Mode Status*: ${status}`);
    }
}

// 8. Combo Buttons
async function handleComboButtons(sock, chatId, quotedMsg, reply) {
    await sendButtons(sock, chatId, {
        text: '🔘 *Combo Demo*',
        buttons: [
            { id: 'yes', text: '✅ Yes' },
            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Google', url: 'https://google.com' }) }
        ],
        aimode: global.aiMode.get(chatId) || false
    }, { quoted: quotedMsg });
}
