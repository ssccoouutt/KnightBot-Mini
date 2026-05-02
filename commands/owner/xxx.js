/**
 * XXX Command - Adult Content Search & Downloader
 * MIRRORED LOGIC FROM AUDIT COMMAND FOR BUTTON RELIABILITY
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

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

// ==================== BUTTON HANDLER (Mirrored from Audit) ====================

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

    // STAGE 1: SITE SELECTION
    if (buttonId && buttonId.startsWith('xxx_site_')) {
        const parts = buttonId.split('_');
        const siteChoice = parts[2]; 
        await performSearch(sock, from, sender, reply, react, session, siteChoice, session.data.query);
        return true;
    }

    // STAGE 2: VIDEO PICK
    if (buttonId && buttonId.startsWith('xxx_pick_')) {
        const parts = buttonId.split('_');
        const index = parseInt(parts[2]);
        const results = session.data.searchResults;
        if (results && results[index]) {
            await analyzeVideo(sock, from, sender, reply, react, session, results[index]);
        }
        return true;
    }

    // STAGE 3: QUALITY PICK
    if (buttonId && buttonId.startsWith('xxx_fin_')) {
        const parts = buttonId.split('_');
        const index = parseInt(parts[2]);
        const qualities = session.data.videoInfo.qualities;
        if (qualities && qualities[index]) {
            await executeDownload(sock, from, sender, reply, react, session, qualities[index]);
        }
        return true;
    }

    return false;
}

// ==================== LOGIC FUNCTIONS ====================

async function performSearch(sock, from, sender, reply, react, session, siteChoice, query) {
    const cfg = SITES_CONFIG[siteChoice];
    await react('🔍');
    const processingMsg = await reply(`🔍 Searching *${cfg.name}* for "${query}"...`);

    try {
        const response = await axios.get(cfg.searchUrl(query), { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000 
        });
        
        const matches = [...response.data.matchAll(cfg.regex)];
        const links = [...new Set(matches.map(m => m[1].startsWith('http') ? m[1] : cfg.base + m[1]))].slice(0, 5);

        if (links.length === 0) {
            return await sock.sendMessage(from, { text: `❌ No results found on ${cfg.name}.`, edit: processingMsg.key });
        }

        const sessionId = session.id.split(':').pop();
        const buttons = links.map((_, i) => ({
            id: `xxx_pick_${i}_${sessionId}`,
            text: `Download Result ${i + 1}`
        }));

        sessionManager.updateSession(sender, from, { searchResults: links });

        let text = `🔞 *Results from ${cfg.name}*\n\n`;
        links.forEach((url, i) => text += `*${i + 1}.* ${url}\n\n`);

        await sock.sendMessage(from, { text: text, edit: processingMsg.key });
        await sendButtons(sock, from, {
            text: "Choose a video to download:",
            footer: cfg.name,
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
    } catch (e) {
        await reply(`❌ Error: ${e.message}`);
    }
}

async function analyzeVideo(sock, from, sender, reply, react, session, url) {
    await react('📊');
    const processingMsg = await reply(`📊 Analyzing video content...`);
    
    try {
        // Uses getAvailableQualities from your dlp command logic
        const videoInfo = await getAvailableQualities(url); 
        const sessionId = session.id.split(':').pop();

        const buttons = videoInfo.qualities.map((q, i) => ({
            id: `xxx_fin_${i}_${sessionId}`,
            text: q.name
        }));

        sessionManager.updateSession(sender, from, { videoInfo, selectedUrl: url });

        await sock.sendMessage(from, {
            text: `✅ *Metadata Found*\n\n🎬 *Title:* ${videoInfo.title}\n⏱️ *Duration:* ${videoInfo.duration}\n\nSelect quality:`,
            edit: processingMsg.key
        });

        await sendButtons(sock, from, {
            text: `Select download quality for:\n${videoInfo.title}`,
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
    } catch (e) {
        await reply(`❌ Analysis failed: ${e.message}`);
    }
}

async function executeDownload(sock, from, sender, reply, react, session, quality) {
    await react('⬇️');
    const processingMsg = await reply(`📥 Downloading *${quality.name}*... Please wait.`);

    try {
        // Uses downloadMedia from your dlp command logic
        const result = await downloadMedia(session.data.selectedUrl, quality);
        
        await sock.sendMessage(from, {
            video: fs.readFileSync(result.path),
            caption: `✅ *Download Complete*\n\n🎬 ${session.data.videoInfo.title}\n📊 Size: ${quality.filesize || 'Unknown'}`,
            mimetype: 'video/mp4'
        });

        // Cleanup
        fs.unlinkSync(result.path);
        fs.rmdirSync(result.tempDir);
        sessionManager.clearSession(session.id);
    } catch (e) {
        await reply(`❌ Download failed: ${e.message}`);
    }
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'xxx',
    aliases: ['xnxx', 'ph', 'xh'],
    description: 'Search and download adult content (Owner Only)',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;

        if (args.length === 0) {
            return reply(`🔞 *Adult Content Search*\n\nUsage: \`${config.prefix}xxx <query>\``);
        }

        const query = args.join(' ');
        const session = sessionManager.createSession(sender, from, 'xxx', {
            query: query,
            searchResults: null,
            videoInfo: null,
            selectedUrl: null
        });
        
        const sessionId = session.id.split(':').pop();

        const buttons = [
            { id: `xxx_site_1_${sessionId}`, text: 'XNXX' },
            { id: `xxx_site_2_${sessionId}`, text: 'Pornhub' },
            { id: `xxx_site_3_${sessionId}`, text: 'xHamster' }
        ];

        await react('🔞');
        const sentMsg = await sendButtons(sock, from, {
            text: `🔞 *Adult Search*\n\nQuery: _${query}_\n\nSelect a website to search:`,
            footer: 'XXX Engine',
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
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                    } catch (e) {}
                }
            }

            if (buttonId) {
                const handled = await handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react);
                if (handled) return true;
            }
        }
        return true;
    }
};

// Crucial: Exporting the button handler for the core bot to recognize
module.exports.handleButtonClick = handleButtonClick;
