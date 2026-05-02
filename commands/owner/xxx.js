/**
 * XXX Command - Adult Content Search & Downloader
 * MIRRORED EXACTLY FROM AUDIT/COMMIT COMMAND LOGIC
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

const SITES_CONFIG = {
    "1": {
        "name": "XNXX",
        "searchUrl": (q) => `https://www.xnxx.com/search/${q.replace(/\s+/g, '+')}`,
        "regex": /href="(\/video-[a-z0-9]+\/[^"]+)"/g,
        "base": "https://www.xnxx.com"
    },
    "2": {
        "name": "Pornhub",
        "searchUrl": (q) => `https://www.pornhub.com/video/search?search=${q.replace(/\s+/g, '+')}`,
        "regex": /href="(\/view_video\.php\?viewkey=[a-zA-Z0-9]+)"/g,
        "base": "https://www.pornhub.com"
    },
    "3": {
        "name": "xHamster",
        "searchUrl": (q) => `https://xhamster.com/search/${q.replace(/\s+/g, '+')}`,
        "regex": /href="(https:\/\/xhamster\.com\/videos\/[^"]+)"/g,
        "base": ""
    }
};

// ==================== BUTTON HANDLER (STANDALONE) ====================

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react) {
    const session = sessionManager.getLatestSession(sender, from);
    
    if (!session || session.command !== 'xxx') {
        return false;
    }

    if (buttonId === 'cancel') {
        sessionManager.clearSession(session.id);
        await reply(`❌ Operation cancelled.`);
        return true;
    }

    // Step 1: Site Selection
    if (buttonId && buttonId.startsWith('xxx_site_')) {
        const parts = buttonId.split('_');
        const siteChoice = parts[2]; 
        await performSearch(sock, from, sender, reply, react, session, siteChoice);
        return true;
    }

    // Step 2: Result Selection
    if (buttonId && buttonId.startsWith('xxx_res_')) {
        const parts = buttonId.split('_');
        const index = parseInt(parts[2]);
        const results = session.data.searchResults;
        if (results && results[index]) {
            await handleAnalysis(sock, from, sender, reply, react, session, results[index]);
        }
        return true;
    }

    // Step 3: Quality Selection
    if (buttonId && buttonId.startsWith('xxx_qlty_')) {
        const parts = buttonId.split('_');
        const index = parseInt(parts[2]);
        const qualities = session.data.videoInfo.qualities;
        if (qualities && qualities[index]) {
            await handleDownload(sock, from, sender, reply, react, session, qualities[index]);
        }
        return true;
    }

    return false;
}

// ==================== LOGIC FUNCTIONS ====================

async function performSearch(sock, from, sender, reply, react, session, siteChoice) {
    const cfg = SITES_CONFIG[siteChoice];
    const query = session.data.query;
    await react('🔍');
    const processingMsg = await reply(`🔍 Searching *${cfg.name}*...`);

    try {
        const response = await axios.get(cfg.searchUrl(query), { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000 
        });
        
        const rawLinks = [...response.data.matchAll(cfg.regex)];
        const links = [...new Set(rawLinks.map(m => m[1].startsWith('http') ? m[1] : cfg.base + m[1]))].slice(0, 5);

        if (links.length === 0) {
            return await sock.sendMessage(from, { text: `❌ No results found.`, edit: processingMsg.key });
        }

        sessionManager.updateSession(sender, from, { searchResults: links });
        const sessionId = session.id.split(':').pop();

        const buttons = links.map((_, i) => ({
            id: `xxx_res_${i}_${sessionId}`,
            text: `Select Video ${i + 1}`
        }));

        let listText = `🔞 *Results from ${cfg.name}*\n\n`;
        links.forEach((url, i) => listText += `*${i+1}.* ${url}\n\n`);

        await sock.sendMessage(from, { text: listText, edit: processingMsg.key });
        const sentMsg = await sendButtons(sock, from, {
            text: `Choose a video to download:`,
            footer: cfg.name,
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'xxx');
    } catch (e) {
        await reply(`❌ Error: ${e.message}`);
    }
}

async function handleAnalysis(sock, from, sender, reply, react, session, url) {
    await react('📊');
    const processingMsg = await reply(`📊 Analyzing formats...`);
    
    try {
        // Shared logic with your dlp command
        const videoInfo = await getAvailableQualities(url); 
        const sessionId = session.id.split(':').pop();

        const buttons = videoInfo.qualities.map((q, i) => ({
            id: `xxx_qlty_${i}_${sessionId}`,
            text: q.name
        }));

        sessionManager.updateSession(sender, from, { videoInfo, targetUrl: url });

        await sock.sendMessage(from, {
            text: `✅ *Video:* ${videoInfo.title}\n⏱️ *Duration:* ${videoInfo.duration}\n\nChoose quality:`,
            edit: processingMsg.key
        });

        const sentMsg = await sendButtons(sock, from, {
            text: `Select download quality:`,
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'xxx');
    } catch (e) {
        await reply(`❌ Error: ${e.message}`);
    }
}

async function handleDownload(sock, from, sender, reply, react, session, quality) {
    await react('⬇️');
    const processingMsg = await reply(`📥 Downloading...`);

    try {
        const result = await downloadMedia(session.data.targetUrl, quality);
        
        await sock.sendMessage(from, {
            video: fs.readFileSync(result.path),
            caption: `✅ *Downloaded:* ${session.data.videoInfo.title}`,
            mimetype: 'video/mp4'
        });

        fs.unlinkSync(result.path);
        fs.rmdirSync(result.tempDir);
        sessionManager.clearSession(session.id);
    } catch (e) {
        await reply(`❌ Failed: ${e.message}`);
    }
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'xxx',
    aliases: ['xnxx', 'ph', 'xh'],
    description: 'Adult content downloader (Owner Only)',
    usage: '.xxx <query>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) return reply(`🔞 Usage: .xxx <query>`);

        const query = args.join(' ');
        const session = sessionManager.createSession(sender, from, 'xxx', { query });
        const sessionId = session.id.split(':').pop();

        const buttons = [
            { id: `xxx_site_1_${sessionId}`, text: 'XNXX' },
            { id: `xxx_site_2_${sessionId}`, text: 'Pornhub' },
            { id: `xxx_site_3_${sessionId}`, text: 'xHamster' },
            { id: 'cancel', text: '❌ Cancel' }
        ];

        await react('🔞');
        const sentMsg = await sendButtons(sock, from, {
            text: `🔞 *Adult Search*\nQuery: _${query}_\n\nChoose website:`,
            footer: 'Gifted Bot Engine',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });

        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'xxx');
    },

    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;

            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.interactiveResponseMessage) {
                try {
                    const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    buttonId = params.id;
                    buttonText = params.display_text;
                } catch (e) {}
            }

            if (buttonId) {
                return await handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react);
            }
        }
        return true;
    }
};

// CRITICAL: Export for core handler
module.exports.handleButtonClick = handleButtonClick;
    
