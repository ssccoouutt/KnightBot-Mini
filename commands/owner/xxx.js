/**
 * XXX Command - Adult Content Search & Downloader
 * Search and download from XNXX, Pornhub, and xHamster
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

// Configuration Mapping for Sites
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

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

module.exports = {
    name: 'xxx',
    aliases: ['xnxx', 'ph', 'xh'],
    description: 'Search and download videos from XNXX, Pornhub, or xHamster',
    usage: '.xxx <query>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;

        if (args.length === 0) {
            return reply(`🔞 *Adult Video Search*\n\nUsage: \`${config.prefix}xxx <search query>\``);
        }

        const query = args.join(' ');
        await react('🔍');

        // Step 1: Selection Site
        const buttons = [
            { id: `xxx_site_1_${query}`, text: 'XNXX' },
            { id: `xxx_site_2_${query}`, text: 'Pornhub' },
            { id: `xxx_site_3_${query}`, text: 'xHamster' }
        ];

        await sendButtons(sock, from, {
            text: `🔞 *Search Query:* ${query}\n\nSelect a website to search:`,
            footer: 'Adult Search Engine',
            buttons: buttons
        }, { quoted: msg });
    },

    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        if (!isButtonClick) return;

        const buttonId = context.buttonId; // Assuming your context extracts this

        // ---------------------------------------------------------
        // STAGE 2: SEARCHING THE SITE
        // ---------------------------------------------------------
        if (buttonId.startsWith('xxx_site_')) {
            const parts = buttonId.split('_');
            const siteChoice = parts[2];
            const query = parts.slice(3).join('_');
            const cfg = SITES_CONFIG[siteChoice];

            await react('⏳');
            const status = await reply(`🔍 Searching *${cfg.name}* for: _${query}_...`);

            try {
                const response = await axios.get(cfg.searchUrl(query), { headers: HEADERS, timeout: 10000 });
                const matches = [...response.data.matchAll(cfg.regex)];
                
                const links = [];
                for (const match of matches) {
                    let fullUrl = match[1].startsWith('http') ? match[1] : cfg.base + match[1];
                    if (!links.includes(fullUrl)) links.push(fullUrl);
                }

                const results = links.slice(0, 5);
                if (results.length === 0) {
                    return sock.sendMessage(from, { text: `❌ No results found on ${cfg.name}.`, edit: status.key });
                }

                // Metadata extraction using yt-dlp (dry run)
                const resultButtons = [];
                let listText = `🔞 *Results from ${cfg.name}*\n\n`;

                for (let i = 0; i < results.length; i++) {
                    const url = results[i];
                    // Create a session to store the URL and metadata
                    const searchSession = sessionManager.createSession(sender, from, 'xxx_dl', { url: url });
                    const sid = searchSession.id.split(':').pop();

                    resultButtons.push({
                        id: `xxx_pick_${sid}`,
                        text: `Download Video ${i + 1}`
                    });
                    listText += `*${i + 1}.* ${url}\n\n`;
                }

                await sock.sendMessage(from, { text: listText, edit: status.key });
                await sendButtons(sock, from, {
                    text: `Select a video to analyze and download:`,
                    footer: cfg.name,
                    buttons: resultButtons
                }, {});

            } catch (err) {
                await reply(`❌ Error searching ${cfg.name}: ${err.message}`);
            }
            return true;
        }

        // ---------------------------------------------------------
        // STAGE 3: SELECTING QUALITY (Reusing DLP Logic)
        // ---------------------------------------------------------
        if (buttonId.startsWith('xxx_pick_')) {
            const sid = buttonId.split('_')[2];
            const activeSession = sessionManager.getSessionByShortId(sid); // Helper needed in sessionManager
            if (!activeSession) return reply("❌ Session expired.");

            const videoUrl = activeSession.data.url;
            await react('📊');
            const status = await reply(`📊 Analyzing video formats...`);

            try {
                // This utilizes the existing helper function from your dlp command
                // You should export 'getAvailableQualities' and 'downloadMedia' to a utility file
                const videoInfo = await getAvailableQualities(videoUrl); 
                
                const qualityButtons = videoInfo.qualities.map((q, i) => ({
                    id: `xxx_fin_${sid}_${i}`,
                    text: `${q.name} ${q.filesize ? `(${formatFileSize(q.filesize)})` : ''}`
                }));

                await sock.sendMessage(from, {
                    text: `✅ *Video Found*\n\n📹 *Title:* ${videoInfo.title}\n⏱️ *Duration:* ${formatDuration(videoInfo.duration)}\n\nChoose quality:`,
                    edit: status.key
                });

                await sendButtons(sock, from, {
                    text: `Choose Download Quality:`,
                    buttons: qualityButtons
                }, {});

                // Update session with full video info
                sessionManager.updateSession(sender, from, { 
                    ...activeSession.data, 
                    videoInfo 
                });

            } catch (err) {
                await reply(`❌ Analysis failed: ${err.message}`);
            }
            return true;
        }

        // ---------------------------------------------------------
        // STAGE 4: FINAL DOWNLOAD (Reusing DLP Logic)
        // ---------------------------------------------------------
        if (buttonId.startsWith('xxx_fin_')) {
            const parts = buttonId.split('_');
            const sid = parts[2];
            const qIdx = parseInt(parts[3]);
            const activeSession = sessionManager.getSessionByShortId(sid);

            const selectedQuality = activeSession.data.videoInfo.qualities[qIdx];
            await react('⬇️');
            const status = await reply(`📥 Downloading... please wait.`);

            try {
                const result = await downloadMedia(activeSession.data.url, selectedQuality);
                
                await sock.sendMessage(from, {
                    video: fs.readFileSync(result.path),
                    caption: `✅ *Download Complete*\n\n🎬 ${activeSession.data.videoInfo.title}`,
                    mimetype: 'video/mp4'
                }, { quoted: msg });

                // Clean up
                fs.unlinkSync(result.path);
                fs.rmdirSync(result.tempDir);
                sessionManager.clearSession(activeSession.id);
            } catch (err) {
                await reply(`❌ Download failed: ${err.message}`);
            }
            return true;
        }
    }
};
