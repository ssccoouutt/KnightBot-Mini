/**
 * DLP Command - Adult Content Downloader
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

// ==================== CONFIGURATION - CHANGE THIS VARIABLE ====================
const TARGET_SITE = "XNXX.com";  // Change this to your preferred site
// Available options: "site1", "site2", "site3"

const SITES_CONFIG = {
    "site1": {
        "name": "XNXX",
        "searchUrl": (q) => `https://www.xnxx.com/search/${q.replace(/\s+/g, '+')}`,
        "regex": /href="(\/video-[a-z0-9]+\/[^"]+)"/g,
        "base": "https://www.example1.com"
    },
    "site2": {
        "name": "Site 2",
        "searchUrl": (q) => `https://www.example2.com/video/search?search=${q.replace(/\s+/g, '+')}`,
        "regex": /href="(\/view_video\.php\?viewkey=[a-zA-Z0-9]+)"/g,
        "base": "https://www.example2.com"
    },
    "site3": {
        "name": "Site 3",
        "searchUrl": (q) => `https://www.example3.com/search/${q.replace(/\s+/g, '+')}`,
        "regex": /href="(https:\/\/www\.example3\.com\/videos\/[^"]+)"/g,
        "base": ""
    }
};

// ==================== BUTTON HANDLER ====================

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react) {
    // Get all user sessions and find the active one
    const userSessions = sessionManager.getUserSessions(sender, from);
    const session = userSessions.find(s => s.command === 'dlp');
    
    if (!session) {
        console.log('[DLP] No active session found');
        return false;
    }

    console.log(`[DLP] Button clicked: ${buttonId}`);

    if (buttonId === 'cancel' || buttonId?.includes('cancel')) {
        sessionManager.clearSession(session.id);
        await reply(`❌ Operation cancelled.`);
        return true;
    }

    // Step 1: Site Selection (but we're using single site now)
    if (buttonId && buttonId.includes('dlp_start_')) {
        await performSearch(sock, from, sender, reply, react, session);
        return true;
    }

    // Step 2: Result Selection
    if (buttonId && buttonId.includes('dlp_res_')) {
        const parts = buttonId.split('_');
        const index = parseInt(parts[2]);
        const results = session.data.searchResults;
        if (results && results[index]) {
            await handleAnalysis(sock, from, sender, reply, react, session, results[index]);
        }
        return true;
    }

    // Step 3: Quality Selection
    if (buttonId && buttonId.includes('dlp_qlty_')) {
        const parts = buttonId.split('_');
        const index = parseInt(parts[2]);
        const qualities = session.data.videoInfo?.qualities;
        if (qualities && qualities[index]) {
            await handleDownload(sock, from, sender, reply, react, session, qualities[index]);
        }
        return true;
    }

    return false;
}

// ==================== LOGIC FUNCTIONS ====================

async function performSearch(sock, from, sender, reply, react, session) {
    const cfg = SITES_CONFIG[TARGET_SITE];
    const query = session.data.query;
    await react('🔍');
    const processingMsg = await reply(`🔍 Searching...`);

    try {
        const response = await axios.get(cfg.searchUrl(query), { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            },
            timeout: 15000 
        });
        
        const rawLinks = [...response.data.matchAll(cfg.regex)];
        const links = [...new Set(rawLinks.map(m => m[1].startsWith('http') ? m[1] : cfg.base + m[1]))].slice(0, 8);

        if (links.length === 0) {
            return await sock.sendMessage(from, { text: `❌ No results found.`, edit: processingMsg.key });
        }

        sessionManager.updateSession(sender, from, { searchResults: links });
        const sessionId = session.id.split(':').pop();

        const buttons = links.map((_, i) => ({
            id: `dlp_res_${i}_${sessionId}`,
            text: `📹 Result ${i + 1}`
        }));

        let listText = `🔞 *Search Results*\n\n`;
        for (let i = 0; i < links.length; i++) {
            listText += `*${i+1}.* ${links[i]}\n\n`;
        }

        await sock.sendMessage(from, { text: listText, edit: processingMsg.key });
        
        const sentMsg = await sendButtons(sock, from, {
            text: `Select a result to continue:`,
            footer: `Page 1`,
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
        
    } catch (e) {
        console.error('[DLP] Search error:', e);
        await sock.sendMessage(from, { 
            text: `❌ Error: ${e.message}`, 
            edit: processingMsg.key 
        });
    }
}

async function handleAnalysis(sock, from, sender, reply, react, session, url) {
    await react('📊');
    const processingMsg = await reply(`📊 Analyzing formats...`);
    
    try {
        const videoInfo = await getAvailableQualities(url);
        
        if (!videoInfo || !videoInfo.qualities || videoInfo.qualities.length === 0) {
            throw new Error('No downloadable qualities found');
        }
        
        const sessionId = session.id.split(':').pop();

        const buttons = videoInfo.qualities.map((q, i) => ({
            id: `dlp_qlty_${i}_${sessionId}`,
            text: q.name
        }));

        sessionManager.updateSession(sender, from, { 
            videoInfo: videoInfo, 
            targetUrl: url 
        });

        await sock.sendMessage(from, {
            text: `✅ *Title:* ${videoInfo.title}\n⏱️ *Duration:* ${videoInfo.duration}\n\nChoose quality:`,
            edit: processingMsg.key
        });

        const sentMsg = await sendButtons(sock, from, {
            text: `Select download quality:`,
            buttons: [...buttons, { id: 'cancel', text: '❌ Cancel' }],
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
        
    } catch (e) {
        console.error('[DLP] Analysis error:', e);
        await sock.sendMessage(from, { 
            text: `❌ Error: ${e.message}`, 
            edit: processingMsg.key 
        });
    }
}

async function handleDownload(sock, from, sender, reply, react, session, quality) {
    await react('⬇️');
    const processingMsg = await reply(`📥 Downloading...\n\nThis may take a few moments.`);
    
    // Create temp directory
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
        const result = await downloadMedia(session.data.targetUrl, quality, tempDir);
        
        if (!result || !fs.existsSync(result.path)) {
            throw new Error('Download failed - file not found');
        }
        
        const fileSize = fs.statSync(result.path).size;
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        
        await sock.sendMessage(from, {
            video: fs.readFileSync(result.path),
            caption: `✅ *Download Complete!*\n\n📹 *Title:* ${session.data.videoInfo.title}\n📊 *Quality:* ${quality.name}\n💾 *Size:* ${fileSizeMB} MB\n\n> *Powered by ${config.botName}*`,
            mimetype: 'video/mp4'
        });
        
        // Cleanup
        try {
            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir, { recursive: true });
        } catch (e) {}
        
        await sock.sendMessage(from, {
            text: `✅ *Download complete!*`,
            edit: processingMsg.key
        });
        
        sessionManager.clearSession(session.id);
        await react('✅');
        
    } catch (e) {
        console.error('[DLP] Download error:', e);
        
        // Cleanup
        try {
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir, { recursive: true });
        } catch (cleanErr) {}
        
        await sock.sendMessage(from, { 
            text: `❌ Download failed: ${e.message}`, 
            edit: processingMsg.key 
        });
        await react('❌');
    }
}

// ==================== PLACEHOLDER FUNCTIONS ====================
// You need to implement these based on your actual download logic

async function getAvailableQualities(url) {
    // TODO: Implement actual quality extraction
    // This is a placeholder - replace with your actual logic
    return {
        title: "Sample Video Title",
        duration: "10:30",
        qualities: [
            { name: "1080p HD", url: url + "&quality=1080" },
            { name: "720p", url: url + "&quality=720" },
            { name: "480p", url: url + "&quality=480" }
        ]
    };
}

async function downloadMedia(url, quality, tempDir) {
    // TODO: Implement actual media download
    // This is a placeholder - replace with your actual logic
    const outputPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    
    // Here you would implement actual download using axios, ytdl-core, or similar
    // For now, throw error as this needs to be implemented
    throw new Error('Download function needs to be implemented with actual video downloader');
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'xxx',
    aliases: ['download', 'getvideo'],
    description: 'Download content from supported sites',
    usage: '.dlp <query>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`📥 *Download Command*\n\nUsage: \`.dlp <search term>\``);
        }

        const query = args.join(' ');
        
        // Clear any existing sessions
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'dlp') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        // Create new session
        const session = sessionManager.createSession(sender, from, 'dlp', { 
            query: query,
            step: 'searching'
        });
        
        const sessionId = session.id.split(':').pop();

        const buttons = [
            { id: `dlp_start_${sessionId}`, text: '🔍 Start Search' },
            { id: 'cancel', text: '❌ Cancel' }
        ];

        await react('📥');
        const sentMsg = await sendButtons(sock, from, {
            text: `📥 *Download Search*\n\nQuery: _${query}_\n\nClick Start to search:`,
            footer: 'Download Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });

        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
    },

    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        console.log(`[DLP] handleSession called, isButtonClick: ${isButtonClick}`);
        
        if (session.command !== 'dlp') return true;
        
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;

            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
                console.log(`[DLP] Button detected - ID: ${buttonId}, Text: ${buttonText}`);
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                        console.log(`[DLP] Interactive button - ID: ${buttonId}, Text: ${buttonText}`);
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
                console.log(`[DLP] Template button - ID: ${buttonId}, Text: ${buttonText}`);
            }

            if (buttonId) {
                const handled = await handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react);
                if (handled) return true;
            }
        }
        
        return true;
    }
};

// Export for core handler
module.exports.handleButtonClick = handleButtonClick;
