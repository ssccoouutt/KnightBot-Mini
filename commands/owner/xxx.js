/**
 * XXX Command - Adult Content Search & Downloader
 * Follows the logic structure of the Audit Command for button reliability.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

// Reuse functions from your dlp.js if possible, otherwise define them here
// For this version, we assume these exist or are helper-based.
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

// ==================== BUTTON HANDLER (Identical to Audit) ====================

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react) {
    const session = sessionManager.getLatestSession(sender, from);
    if (!session || session.command !== 'xxx') return false;

    // Stage 1: Site Selection Result
    if (buttonId.startsWith('xxx_site_')) {
        const siteChoice = buttonId.split('_')[2];
        const query = session.data.query;
        await performSearch(sock, from, sender, reply, react, session, siteChoice, query);
        return true;
    }

    // Stage 2: Picking a Video Link
    if (buttonId.startsWith('xxx_pick_')) {
        const index = parseInt(buttonId.split('_')[2]);
        const url = session.data.results[index];
        await analyzeVideo(sock, from, sender, reply, react, session, url);
        return true;
    }

    // Stage 3: Final Download Quality
    if (buttonId.startsWith('xxx_fin_')) {
        const qualityIdx = parseInt(buttonId.split('_')[2]);
        await executeDownload(sock, from, sender, reply, react, session, qualityIdx);
        return true;
    }

    if (buttonId === 'cancel') {
        sessionManager.clearSession(session.id);
        await reply('❌ Cancelled.');
        return true;
    }

    return false;
}

// ==================== LOGIC FUNCTIONS ====================

async function performSearch(sock, from, sender, reply, react, session, siteChoice, query) {
    const cfg = SITES_CONFIG[siteChoice];
    await react('⏳');
    const status = await reply(`🔍 Searching *${cfg.name}* for: _${query}_...`);

    try {
        const response = await axios.get(cfg.searchUrl(query), { 
            headers: { 'User-Agent': 'Mozilla/5.0' }, 
            timeout: 10000 
        });
        const matches = [...response.data.matchAll(cfg.regex)];
        const links = [...new Set(matches.map(m => m[1].startsWith('http') ? m[1] : cfg.base + m[1]))].slice(0, 5);

        if (links.length === 0) {
            return sock.sendMessage(from, { text: `❌ No results found on ${cfg.name}.`, edit: status.key });
        }

        const sessionId = session.id.split(':').pop();
        const buttons = links.map((url, i) => ({
            id: `xxx_pick_${i}_${sessionId}`,
            text: `Video ${i + 1}`
        }));

        sessionManager.updateSession(sender, from, { results: links, selectedSite: cfg.name });

        let listMsg = `🔞 *Results from ${cfg.name}*\n\n`;
        links.forEach((l, i) => listMsg += `*${i+1}.* ${l}\n`);

        await sock.sendMessage(from, { text: listMsg, edit: status.key });
        await sendButtons(sock, from, {
            text: "Select a video number to download:",
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
    } catch (e) {
        await reply(`❌ Search error: ${e.message}`);
    }
}

async function analyzeVideo(sock, from, sender, reply, react, session, url) {
    await react('🔍');
    const status = await reply(`📊 Analyzing video qualities...`);
    
    // Note: You must have getAvailableQualities defined (copied from dlp.js)
    try {
        const videoInfo = await getAvailableQualities(url); 
        const sessionId = session.id.split(':').pop();

        const buttons = videoInfo.qualities.map((q, i) => ({
            id: `xxx_fin_${i}_${sessionId}`,
            text: `${q.name}`
        }));

        sessionManager.updateSession(sender, from, { videoInfo, downloadUrl: url });

        await sock.sendMessage(from, {
            text: `✅ *Video Found*\n\n🎬 *Title:* ${videoInfo.title}\n⏱️ *Duration:* ${videoInfo.duration}\n\nSelect quality:`,
            edit: status.key
        });

        await sendButtons(sock, from, {
            text: "Choose Download Quality:",
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
    } catch (e) {
        await reply(`❌ Analysis Error: ${e.message}`);
    }
}

async function executeDownload(sock, from, sender, reply, react, session, qualityIdx) {
    await react('⬇️');
    const quality = session.data.videoInfo.qualities[qualityIdx];
    const status = await reply(`📥 Downloading ${quality.name}...`);

    try {
        const result = await downloadMedia(session.data.downloadUrl, quality);
        
        await sock.sendMessage(from, {
            video: fs.readFileSync(result.path),
            caption: `✅ *Download Complete*\n\n🎬 ${session.data.videoInfo.title}`,
            mimetype: 'video/mp4'
        });

        fs.unlinkSync(result.path);
        fs.rmdirSync(result.tempDir);
        sessionManager.clearSession(session.id);
    } catch (e) {
        await reply(`❌ Download failed: ${e.message}`);
    }
}

// ==================== MAIN EXPORT ====================

module.exports = {
    name: 'xxx',
    aliases: ['xnxx', 'ph', 'xh'],
    description: 'Search and download adult content',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        if (args.length === 0) return reply(`🔞 Usage: .xxx <query>`);

        const query = args.join(' ');
        const session = sessionManager.createSession(sender, from, 'xxx', { query });
        const sessionId = session.id.split(':').pop();

        const buttons = [
            { id: `xxx_site_1_${sessionId}`, text: 'XNXX' },
            { id: `xxx_site_2_${sessionId}`, text: 'Pornhub' },
            { id: `xxx_site_3_${sessionId}`, text: 'xHamster' }
        ];

        await sendButtons(sock, from, {
            text: `🔞 *Adult Search*\n\nQuery: _${query}_\n\nSelect a website:`,
            footer: 'XXX Downloader',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
    },

    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (isButtonClick) {
            // Standardizing button ID extraction from audit command
            let buttonId = null;
            if (msg.message?.buttonsResponseMessage) buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            else if (msg.message?.interactiveResponseMessage) {
                const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                buttonId = params.id;
            }

            if (buttonId) {
                return await handleButtonClick(sock, msg, buttonId, null, from, sender, reply, react);
            }
        }
        return true;
    }
};
