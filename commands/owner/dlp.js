/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Supports YouTube, Instagram, Twitter, Facebook, TikTok, and 1000+ sites
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

const COOKIES_FILE_ID = "13iX8xpx47W3PAedGyhGpF5CxZRFz4uaF";
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";

let cachedToken = null;
let tokenExpiry = null;
let cookiesPath = null;

// ==================== COOKIE FUNCTIONS ====================

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        console.log('[DLP] Fetching Google Drive token...');
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempTokenFile = path.join(tempDir, `token_${Date.now()}.json`);
        const tokenWriter = fs.createWriteStream(tempTokenFile);
        tokenResponse.data.pipe(tokenWriter);
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        const tokenData = JSON.parse(fs.readFileSync(tempTokenFile, 'utf8'));
        fs.unlinkSync(tempTokenFile);
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('[DLP] Token expired, refreshing...');
            const refreshData = {
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
            cachedToken = refreshResponse.data.access_token;
            tokenExpiry = new Date(Date.now() + 3600 * 1000);
        } else {
            cachedToken = tokenData.token;
            tokenExpiry = new Date(expiryDate);
        }
        return cachedToken;
    } catch (error) {
        console.error('[DLP] Failed to get token:', error.message);
        return null;
    }
}

async function downloadCookies() {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        cookiesPath = path.join(tempDir, 'cookies.txt');
        const response = await axios({
            method: 'GET',
            url: `https://www.googleapis.com/drive/v3/files/${COOKIES_FILE_ID}?alt=media`,
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'stream',
            timeout: 30000
        });
        const writer = fs.createWriteStream(cookiesPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log('[DLP] Cookies downloaded successfully');
        return true;
    } catch (error) {
        console.error('[DLP] Failed to download cookies:', error.message);
        return false;
    }
}

// ==================== YT-DLP FUNCTIONS ====================

// Try dump-json with a specific player client, returns parsed info or null
function tryDumpJson(url, cookieArg, playerClient) {
    return new Promise((resolve) => {
        const extraArgs = playerClient
            ? `--extractor-args "youtube:player_client=${playerClient}"`
            : '';
        const cmd = [
            'yt-dlp',
            cookieArg,
            '--no-warnings',
            '--no-check-formats',
            extraArgs,
            '--dump-json',
            `"${url}"`
        ].filter(Boolean).join(' ');

        console.log(`[DLP] Trying player_client=${playerClient || 'default'}...`);

        exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.warn(`[DLP] player_client=${playerClient} failed:`, (stderr || error.message).split('\n')[0]);
                return resolve(null);
            }
            const jsonLine = stdout.split('\n').find(l => l.trim().startsWith('{'));
            if (!jsonLine) return resolve(null);
            try {
                resolve(JSON.parse(jsonLine));
            } catch (e) {
                resolve(null);
            }
        });
    });
}

async function getAvailableQualities(url) {
    const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';

    // Try multiple player clients in order — Colab IPs get blocked by some clients
    // tv_embedded and mweb tend to work on server/cloud IPs when web/android fail
    const clientsToTry = ['tv_embedded', 'mweb', 'web', 'android', null];
    let info = null;

    for (const client of clientsToTry) {
        info = await tryDumpJson(url, cookieArg, client);
        if (info) {
            console.log(`[DLP] Got info using player_client=${client || 'default'}`);
            break;
        }
    }

    // If ALL clients failed, return preset quality list so user can still attempt download
    // yt-dlp will resolve the best available at download time using format selectors
    if (!info) {
        console.warn('[DLP] All player clients failed. Using preset quality fallback.');
        return {
            title: 'Unknown (info fetch failed)',
            duration: null,
            thumbnail: null,
            webpage_url: url,
            uploader: 'Unknown',
            qualities: [
                { name: '1080p', formatId: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', height: 1080, ext: 'mp4', filesize: null, preset: true },
                { name: '720p',  formatId: 'bestvideo[height<=720]+bestaudio/best[height<=720]',   height: 720,  ext: 'mp4', filesize: null, preset: true },
                { name: '480p',  formatId: 'bestvideo[height<=480]+bestaudio/best[height<=480]',   height: 480,  ext: 'mp4', filesize: null, preset: true },
                { name: '360p',  formatId: 'bestvideo[height<=360]+bestaudio/best[height<=360]',   height: 360,  ext: 'mp4', filesize: null, preset: true },
                { name: 'mp3',   formatId: 'bestaudio',                                            height: 0,    ext: 'mp3', filesize: null, preset: true },
            ]
        };
    }

    // Parse formats from info
    const formats = info.formats || [];
    const qualities = new Map();

    for (const format of formats) {
        if (format.vcodec && format.vcodec !== 'none') {
            const height = format.height || 0;
            const quality =
                height >= 2160 ? '4K' :
                height >= 1440 ? '2K' :
                height >= 1080 ? '1080p' :
                height >= 720  ? '720p' :
                height >= 480  ? '480p' :
                height >= 360  ? '360p' :
                height >= 240  ? '240p' : '144p';

            if (!qualities.has(quality) || height > (qualities.get(quality)?.height || 0)) {
                qualities.set(quality, {
                    formatId: format.format_id,
                    height: height,
                    ext: format.ext,
                    filesize: format.filesize || format.filesize_approx || null,
                    vcodec: format.vcodec,
                    acodec: format.acodec
                });
            }
        }
    }

    qualities.set('mp3', {
        formatId: 'bestaudio',
        height: 0,
        ext: 'mp3',
        filesize: null,
        vcodec: 'none',
        acodec: 'mp4a'
    });

    const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', '144p', 'mp3'];
    const sortedQualities = [];
    for (const q of qualityOrder) {
        if (qualities.has(q)) {
            sortedQualities.push({ name: q, ...qualities.get(q) });
        }
    }

    return {
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        webpage_url: info.webpage_url,
        uploader: info.uploader,
        qualities: sortedQualities
    };
}

async function downloadMedia(url, qualityInfo) {
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';

        // Use tv_embedded as default download client — most reliable on cloud IPs
        const clientArg = '--extractor-args "youtube:player_client=tv_embedded,web"';

        const commonFlags = [cookieArg, '--no-warnings', '--no-check-formats', clientArg]
            .filter(Boolean).join(' ');

        let outputTemplate;
        let cmd;

        if (qualityInfo.name === 'mp3') {
            outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');
            cmd = `yt-dlp ${commonFlags} -f "bestaudio/best" -o "${outputTemplate}" --extract-audio --audio-format mp3 --audio-quality 0 "${url}"`;
        } else {
            outputTemplate = path.join(tempDir, `%(title)s_${qualityInfo.name}.%(ext)s`);
            // If it's a preset selector (fallback mode), use it directly; otherwise append +bestaudio
            const formatSpec = qualityInfo.preset
                ? qualityInfo.formatId
                : `${qualityInfo.formatId}+bestaudio/bestvideo[height<=${qualityInfo.height}]+bestaudio/best`;
            cmd = `yt-dlp ${commonFlags} -f "${formatSpec}" -o "${outputTemplate}" --merge-output-format mp4 "${url}"`;
        }

        console.log('[DLP] Download command:', cmd);

        exec(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
                const detail = (stderr || error.message || '').trim();
                console.error('[DLP] Download error:', detail);
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
                reject(new Error(`Download failed: ${detail.split('\n')[0]}`));
                return;
            }

            try {
                const files = fs.readdirSync(tempDir);
                if (files.length === 0) {
                    reject(new Error('No file was downloaded'));
                    return;
                }
                const downloadedFile = path.join(tempDir, files[0]);
                const stats = fs.statSync(downloadedFile);
                if (stats.size < 10 * 1024) {
                    reject(new Error('Downloaded file is too small or corrupted'));
                    return;
                }
                resolve({ path: downloadedFile, filename: files[0], size: stats.size, tempDir });
            } catch (err) {
                reject(new Error(`Failed to locate downloaded file: ${err.message}`));
            }
        });
    });
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function cleanupFiles(filePath, tempDir) {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'dlp',
    aliases: [],
    description: 'Download videos/audio from any supported website',
    usage: '.dlp <url>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;

        if (args.length === 0) {
            return reply(
                `🎬 *Universal Media Downloader*\n\n` +
                `*Usage:* \`${config.prefix}dlp <url>\`\n\n` +
                `*Supported:* YouTube, Instagram, Twitter, TikTok, Facebook, Reddit, Twitch, Vimeo & 1000+ more\n\n` +
                `*Example:*\n\`${config.prefix}dlp https://youtu.be/xxxxx\``
            );
        }

        const url = args[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }

        await react('🔍');
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);

        try {
            if (!cookiesPath || !fs.existsSync(cookiesPath)) {
                await downloadCookies();
            }

            const videoInfo = await getAvailableQualities(url);

            if (!videoInfo.qualities || videoInfo.qualities.length === 0) {
                await sock.sendMessage(from, { text: `❌ No downloadable formats found for this URL.`, edit: processingMsg.key });
                await react('❌');
                return;
            }

            const session = sessionManager.createSession(sender, from, 'dlp', {
                url, videoInfo, step: 'selecting_quality'
            });
            const sessionId = session.id.split(':').pop();

            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title}*\n\n⏱️ ${formatDuration(videoInfo.duration)}\n👤 ${videoInfo.uploader || 'Unknown'}`
                    }, { quoted: msg });
                } catch (e) {}
            }

            const buttons = videoInfo.qualities.map((q, i) => ({
                id: `dlp_qual_${sessionId}_${i}`,
                text: q.filesize ? `${q.name} (${formatFileSize(q.filesize)})` : q.name
            }));
            buttons.push({ id: 'cancel', text: '❌ Cancel' });

            await sock.sendMessage(from, {
                text:
                    `✅ *Video Found*\n\n` +
                    `📹 *Title:* ${videoInfo.title}\n` +
                    `⏱️ *Duration:* ${formatDuration(videoInfo.duration)}\n` +
                    `👤 *Uploader:* ${videoInfo.uploader || 'Unknown'}\n` +
                    `📊 *Qualities:* ${videoInfo.qualities.length}\n\n` +
                    `Select quality to download:`,
                edit: processingMsg.key
            });

            const sentMsg = await sendButtons(sock, from, {
                text: `🎬 *${videoInfo.title}*\n\nSelect download quality:`,
                footer: 'Universal Downloader',
                buttons,
                aimode: FORCE_AI_MODE
            }, {});

            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
            await react('✅');

        } catch (error) {
            console.error('[DLP] Execute error:', error);
            await sock.sendMessage(from, {
                text: `❌ *Failed to process URL*\n\nError: ${error.message}`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    },

    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        if (!isButtonClick) return true;

        let buttonId = null;
        if (msg.message?.buttonsResponseMessage) {
            buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        } else if (msg.message?.listResponseMessage) {
            buttonId = msg.message.listResponseMessage.singleSelectReply?.selectedRowId;
        } else if (msg.message?.interactiveResponseMessage) {
            try {
                const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || '{}');
                buttonId = params.id;
            } catch (e) {}
        } else if (msg.message?.templateButtonReplyMessage) {
            buttonId = msg.message.templateButtonReplyMessage.selectedId;
        }

        if (buttonId === 'cancel') {
            sessionManager.clearSession(session.id);
            await reply(`❌ Download cancelled.`);
            return true;
        }

        if (buttonId && buttonId.startsWith('dlp_qual_')) {
            const parts = buttonId.split('_');
            const index = parseInt(parts[parts.length - 1]);
            const qualities = session.data.videoInfo.qualities;

            if (isNaN(index) || index < 0 || index >= qualities.length) {
                await reply(`❌ Invalid selection. Please try again.`);
                return true;
            }

            const selectedQuality = qualities[index];
            sessionManager.updateSession(sender, from, { step: 'downloading', selectedQuality });

            await react('⬇️');
            const processingMsg = await reply(`📥 *Downloading ${selectedQuality.name}...*\n\nPlease wait...`);

            try {
                const result = await downloadMedia(session.data.url, selectedQuality);
                const isVideo = selectedQuality.name !== 'mp3';
                const fileBuffer = fs.readFileSync(result.path);

                const caption =
                    `✅ *Download Complete!*\n\n` +
                    `🎬 *Title:* ${session.data.videoInfo.title}\n` +
                    `📹 *Quality:* ${selectedQuality.name}\n` +
                    `📊 *Size:* ${formatFileSize(result.size)}\n\n` +
                    `> *Downloaded by ${config.botName}*`;

                if (isVideo) {
                    await sock.sendMessage(from, {
                        video: fileBuffer,
                        mimetype: 'video/mp4',
                        caption
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, {
                        audio: fileBuffer,
                        mimetype: 'audio/mpeg',
                        ptt: false
                    }, { quoted: msg });
                    await sock.sendMessage(from, { text: caption }, { quoted: msg });
                }

                cleanupFiles(result.path, result.tempDir);

                await sock.sendMessage(from, { text: `✅ *Sent successfully!*`, edit: processingMsg.key });
                await react('✅');
                sessionManager.clearSession(session.id);

            } catch (downloadError) {
                console.error('[DLP] Download error:', downloadError);
                await sock.sendMessage(from, {
                    text: `❌ *Download failed*\n\nError: ${downloadError.message}\n\nTry a different quality.`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
        }

        return true;
    }
};
