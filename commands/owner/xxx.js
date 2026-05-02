/**
 * XXX Command - Adult Content Search & Downloader
 * FIXED: Handler mapping and Owner Only restriction
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

// ==================== LOGIC HELPERS ====================

async function performSearch(sock, from, sender, reply, react, session, siteChoice, query) {
    const cfg = SITES_CONFIG[siteChoice];
    await react('⏳');
    const status = await reply(`🔍 Searching *${cfg.name}* for: _${query}_...`);

    try {
        const response = await axios.get(cfg.searchUrl(query), { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, 
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
            text: `Download Video ${i + 1}`
        }));

        sessionManager.updateSession(sender, from, { results: links, selectedSite: cfg.name });

        let listMsg = `🔞 *Results from ${cfg.name}*\n\n`;
        links.forEach((l, i) => listMsg += `*${i+1}.* ${l}\n\n`);

        await sock.sendMessage(from, { text: listMsg, edit: status.key });
        await sendButtons(sock, from, {
            text: "Select a video to analyze:",
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
    } catch (e) {
        await reply(`❌ Search error: ${e.message}`);
    }
}

// ==================== MAIN COMMAND OBJECT ====================

module.exports = {
    name: 'xxx',
    aliases: ['xnxx', 'ph', 'xh'],
    description: 'Search and download adult content (Owner Only)',
    category: 'owner',
    ownerOnly: true, // Restricted to owner

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react, isOwner } = context;

        // Extra layer of protection
        if (!isOwner) return reply("❌ This command is restricted to the Bot Owner.");

        if (args.length === 0) return reply(`🔞 Usage: \`${config.prefix}xxx <query>\``);

        const query = args.join(' ');
        
        // Initialize session with the query
        const session = sessionManager.createSession(sender, from, 'xxx', { query });
        const sessionId = session.id.split(':').pop();

        const buttons = [
            { id: `xxx_site_1_${sessionId}`, text: 'XNXX' },
            { id: `xxx_site_2_${sessionId}`, text: 'Pornhub' },
            { id: `xxx_site_3_${sessionId}`, text: 'xHamster' }
        ];

        await react('🔞');
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
            let buttonId = null;

            // Accurate extraction from your GiftedButtons log format
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.interactiveResponseMessage) {
                try {
                    const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    buttonId = params.id;
                } catch (e) { console.error("Button JSON Parse Error", e); }
            }

            if (!buttonId) return true;

            // Handle Cancel
            if (buttonId === 'cancel') {
                sessionManager.clearSession(session.id);
                await reply('❌ Search cancelled.');
                return true;
            }

            // STAGE 1: SITE SELECTED
            if (buttonId.startsWith('xxx_site_')) {
                const parts = buttonId.split('_');
                const siteChoice = parts[2]; // Index 2 is the digit (1, 2, or 3)
                await performSearch(sock, from, sender, reply, react, session, siteChoice, session.data.query);
                return true;
            }

            // STAGE 2: VIDEO PICKED
            if (buttonId.startsWith('xxx_pick_')) {
                const index = parseInt(buttonId.split('_')[2]);
                const url = session.data.results[index];
                
                // Leverage the analysis function from your dlp command
                // You must ensure getAvailableQualities is accessible
                try {
                    await react('🔍');
                    const videoInfo = await getAvailableQualities(url); 
                    const sessionId = session.id.split(':').pop();

                    const qualityBtns = videoInfo.qualities.map((q, i) => ({
                        id: `xxx_fin_${i}_${sessionId}`,
                        text: `${q.name}`
                    }));

                    sessionManager.updateSession(sender, from, { videoInfo, downloadUrl: url });

                    await sendButtons(sock, from, {
                        text: `✅ *Video Found*\n\n🎬 *Title:* ${videoInfo.title}\nSelect quality:`,
                        buttons: [...qualityBtns, { id: 'cancel', text: '❌ Cancel' }],
                        aimode: FORCE_AI_MODE
                    }, {});
                } catch (e) { await reply(`❌ Analysis Error: ${e.message}`); }
                return true;
            }

            // STAGE 3: QUALITY PICKED / DOWNLOAD
            if (buttonId.startsWith('xxx_fin_')) {
                const qualityIdx = parseInt(buttonId.split('_')[2]);
                const quality = session.data.videoInfo.qualities[qualityIdx];
                
                await react('⬇️');
                await reply(`📥 Downloading ${quality.name}...`);

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
                } catch (e) { await reply(`❌ Download failed: ${e.message}`); }
                return true;
            }
        }
        return true;
    }
};
