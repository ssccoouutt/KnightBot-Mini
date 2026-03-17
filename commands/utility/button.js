const config = require('../../config');
const util = require('util');
const giftedBtns = require('gifted-btns');

const { 
    sendButtons, 
    sendInteractiveMessage 
} = giftedBtns;

if (!global.aiMode) global.aiMode = new Map();

module.exports = {
    name: 'button',
    aliases: ['btn', 'list', 'ai'],
    description: 'Interactive button handler with protocol debugging',
    usage: 'button [type] [args]',
    category: 'utility',

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) return await reply("Usage: .button list Title | Btn | Opt1,Opt2");

        const subCommand = args[0].toLowerCase();
        await react('⏳');

        console.log(`\n--- 🛠️ DEBUG: EXECUTE [${subCommand.toUpperCase()}] ---`);

        try {
            switch (subCommand) {
                case 'list':
                    await handleListButton(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'native':
                case 'quick':
                    await handleNativeButtons(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                case 'ai':
                    await handleAIMode(sock, from, args.slice(1).join(' '), msg, reply);
                    break;
                default:
                    await reply("Invalid subcommand.");
            }
            await react('✅');
        } catch (error) {
            console.error('❌ CRITICAL ERROR:', error);
            await reply(`Error: ${error.message}`);
        }
    }
};

// --- HANDLERS ---

async function handleListButton(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) return reply('❌ Format: list Title | Btn | Opt1,Opt2');

    const [title, buttonText, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());

    // Constructing the direct WhatsApp List Protocol structure
    const sections = [{
        title: "Selection Menu",
        rows: options.map((opt, i) => ({
            title: opt,
            rowId: `list_id_${Date.now()}_${i}`,
            description: `Select ${opt}`
        }))
    }];

    const listMessage = {
        text: `📋 *${title}*`,
        footer: 'Select an option below',
        buttonText: buttonText,
        sections: sections,
        headerType: 1
    };

    console.log('📡 [PROTOCOL DEBUG] Sending List via sock.sendMessage:');
    console.dir(listMessage, { depth: null });

    try {
        // Direct call to Baileys sendMessage to avoid library 'native_flow' conversion
        await sock.sendMessage(chatId, listMessage, { quoted: quotedMsg });
        console.log('✅ [SUCCESS] List message dispatched.');
    } catch (e) {
        console.error('⚠️ [PROTOCOL ERROR] List rejected:', e.message);
        console.log('🔄 [FALLBACK] Attempting Quick Reply buttons...');
        await handleNativeButtons(sock, chatId, `${title} | ${optionsText}`, quotedMsg, reply);
    }
}

async function handleNativeButtons(sock, chatId, text, quotedMsg, reply) {
    const parts = text.split('|').map(p => p.trim());
    const buttons = parts[1]?.split(',').map((opt, i) => ({
        id: `btn_${Date.now()}_${i}`,
        text: opt.trim()
    })) || [];

    const buttonPayload = {
        text: parts[0],
        footer: 'Quick Replies',
        buttons: buttons
    };

    console.log('📡 [PROTOCOL DEBUG] Sending Buttons via gifted-btns:');
    console.dir(buttonPayload, { depth: null });

    await sendButtons(sock, chatId, buttonPayload, { quoted: quotedMsg });
}

async function handleAIMode(sock, chatId, text, quotedMsg, reply) {
    const mode = text.toLowerCase().trim();
    if (mode === 'on') {
        global.aiMode.set(chatId, true);
        await reply('✨ AI Mode Active.');
    } else if (mode === 'off') {
        global.aiMode.set(chatId, false);
        await reply('🔕 AI Mode Inactive.');
    } else {
        const status = global.aiMode.get(chatId) ? 'ON' : 'OFF';
        await reply(`Status: ${status}`);
    }
}
