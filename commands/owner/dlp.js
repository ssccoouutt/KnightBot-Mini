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

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Google Drive Configuration for cookies
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
        console.error('[DLP] Failed to get Google Drive token:', error.message);
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

async function getAvailableQualities(url) {
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} --no-warnings --dump-json "${url}"`;

        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] yt-dlp error:', error.message);
                reject(new Error('Failed to fetch video info'));
                return;
            }

            try {
                const info = JSON.parse(stdout);
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
                                filesize: format.filesize,
                                vcodec: format.vcodec,
                                acodec: format.acodec
                            });
                        }
                    }
                }

                // Add audio-only option
                qualities.set('mp3', {
                    formatId: 'bestaudio',
                    height: 0,
                    ext: 'mp3',
                    filesize: null,
                    vcodec: 'none',
                    acodec: 'mp4a'
                });

                // Sort qualities by height (highest first)
                const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', '144p', 'mp3'];
                const sortedQualities = [];

                for (const q of qualityOrder) {
                    if (qualities.has(q)) {
                        sortedQualities.push({ name: q, ...qualities.get(q) });
                    }
                }

                resolve({
                    title: info.title,
                    duration: info.duration,
                    thumbnail: info.thumbnail,
                    webpage_url: info.webpage_url,
                    uploader: info.uploader,
                    qualities: sortedQualities
                });

            } catch (parseError) {
                console.error('[DLP] Parse error:', parseError);
                reject(new Error('Failed to parse video info'));
            }
        });
    });
}

async function downloadMedia(url, qualityInfo) {
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        let outputTemplate;
        let cmd;

        if (qualityInfo.name === 'mp3') {
            // Audio-only download
            outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');
            cmd = `yt-dlp ${cookieArg} -f "bestaudio/best" -o "${outputTemplate}" --extract-audio --audio-format mp3 --audio-quality 0 "${url}"`;
        } else {
            // FIX: Use formatId+bestaudio to ensure audio is merged into the video.
            // Many yt-dlp format IDs (e.g. 137) are video-only streams.
            // Without "+bestaudio", the output file has no audio track.
            outputTemplate = path.join(tempDir, `%(title)s_${qualityInfo.name}.%(ext)s`);
            const formatSpec = `${qualityInfo.formatId}+bestaudio/bestvideo+bestaudio/best`;
            cmd = `yt-dlp ${cookieArg} -f "${formatSpec}" -o "${outputTemplate}" --merge-output-format mp4 "${url}"`;
        }

        console.log('[DLP] Executing download command:', cmd);

        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Download error:', error.message);
                // Clean up temp dir on error
                try {
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                } catch (e) {}
                reject(new Error(`Download failed: ${error.message}`));
                return;
            }

            // Find the downloaded file
            try {
                const files = fs.readdirSync(tempDir);
                if (files.length === 0) {
                    reject(new Error('No file was downloaded'));
                    return;
                }

                const downloadedFile = path.join(tempDir, files[0]);
                const stats = fs.statSync(downloadedFile);

                // Sanity check: file must be at least 10 KB
                if (stats.size < 10 * 1024) {
                    reject(new Error('Downloaded file is too small or corrupted'));
                    return;
                }

                resolve({
                    path: downloadedFile,
                    filename: files[0],
                    size: stats.size,
                    tempDir: tempDir
                });
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
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function cleanupFiles(filePath, tempDir) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
        console.error('[DLP] Failed to delete file:', e.message);
    }
    try {
        if (tempDir && fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (e) {
        // Directory might not be empty; use rmSync as fallback
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e2) {}
    }
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
                `*Usage:*\n` +
                `• \`${config.prefix}dlp <url>\` - Download from any site\n\n` +
                `*Supported Sites:*\n` +
                `• YouTube, Instagram, Twitter, Facebook, TikTok\n` +
                `• Reddit, Twitch, Vimeo, Dailymotion\n` +
                `• And 1000+ more sites\n\n` +
                `*Examples:*\n` +
                `• \`${config.prefix}dlp https://youtu.be/xxxxx\`\n` +
                `• \`${config.prefix}dlp https://www.instagram.com/reel/xxxxx\``
            );
        }

        const url = args[0];

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }

        await react('🔍');
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);

        try {
            // Download cookies if not already cached
            if (!cookiesPath || !fs.existsSync(cookiesPath)) {
                await downloadCookies();
            }

            const videoInfo = await getAvailableQualities(url);

            if (!videoInfo.qualities || videoInfo.qualities.length === 0) {
                await sock.sendMessage(from, {
                    text: `❌ No downloadable formats found for this URL.`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }

            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                videoInfo: videoInfo,
                step: 'selecting_quality'
            });

            const sessionId = session.id.split(':').pop();

            // Send thumbnail with info if available
            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption:
                            `🎬 *${videoInfo.title || 'Video'}*\n\n` +
                            `⏱️ Duration: ${formatDuration(videoInfo.duration)}\n` +
                            `👤 Uploader: ${videoInfo.uploader || 'Unknown'}`
                    }, { quoted: msg });
                } catch (thumbErr) {
                    console.error('[DLP] Failed to send thumbnail:', thumbErr.message);
                }
            }

            // Build quality buttons
            const buttons = [];
            for (let i = 0; i < videoInfo.qualities.length; i++) {
                const q = videoInfo.qualities[i];
                let buttonText = q.name;
                if (q.filesize) {
                    buttonText += ` (${formatFileSize(q.filesize)})`;
                }
                buttons.push({
                    id: `dlp_qual_${sessionId}_${i}`,
                    text: buttonText.length > 30 ? buttonText.substring(0, 27) + '...' : buttonText
                });
            }
            buttons.push({ id: 'cancel', text: '❌ Cancel' });

            // Update the processing message with info
            await sock.sendMessage(from, {
                text:
                    `✅ *Video Information Retrieved*\n\n` +
                    `📹 *Title:* ${videoInfo.title || 'Unknown'}\n` +
                    `⏱️ *Duration:* ${formatDuration(videoInfo.duration)}\n` +
                    `👤 *Uploader:* ${videoInfo.uploader || 'Unknown'}\n` +
                    `📊 *Available Qualities:* ${videoInfo.qualities.length}\n\n` +
                    `Select quality to download:`,
                edit: processingMsg.key
            });

            // Send interactive quality buttons
            const sentMsg = await sendButtons(sock, from, {
                text: `🎬 *${videoInfo.title || 'Video'}*\n\nSelect download quality:`,
                footer: 'Universal Downloader',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});

            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
            await react('✅');

        } catch (error) {
            console.error('[DLP] Error:', error);
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

        // ── Parse the button ID from whichever message type was used ──
        let buttonId = null;

        if (msg.message?.buttonsResponseMessage) {
            buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        } else if (msg.message?.listResponseMessage) {
            buttonId = msg.message.listResponseMessage.singleSelectReply?.selectedRowId;
        } else if (msg.message?.interactiveResponseMessage) {
            try {
                const params = JSON.parse(
                    msg.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || '{}'
                );
                buttonId = params.id;
            } catch (e) {}
        } else if (msg.message?.templateButtonReplyMessage) {
            buttonId = msg.message.templateButtonReplyMessage.selectedId;
        }

        // ── Cancel ──
        if (buttonId === 'cancel') {
            sessionManager.clearSession(session.id);
            await reply(`❌ Download cancelled.`);
            return true;
        }

        // ── Quality selection ──
        if (buttonId && buttonId.startsWith('dlp_qual_')) {
            const parts = buttonId.split('_');
            // Format: dlp_qual_{sessionId}_{index}
            const index = parseInt(parts[parts.length - 1]);
            const qualities = session.data.videoInfo.qualities;

            if (isNaN(index) || index < 0 || index >= qualities.length) {
                await reply(`❌ Invalid quality selection. Please try again.`);
                return true;
            }

            const selectedQuality = qualities[index];

            sessionManager.updateSession(sender, from, {
                step: 'downloading',
                selectedQuality: selectedQuality
            });

            await react('⬇️');
            const processingMsg = await reply(
                `📥 *Downloading ${selectedQuality.name}...*\n\nPlease wait, this may take a few moments...`
            );

            try {
                const result = await downloadMedia(session.data.url, selectedQuality);

                const isVideo = selectedQuality.name !== 'mp3';
                const fileBuffer = fs.readFileSync(result.path);

                const caption =
                    `✅ *Download Complete!*\n\n` +
                    `🎬 *Title:* ${session.data.videoInfo.title || 'Video'}\n` +
                    `📹 *Quality:* ${selectedQuality.name}\n` +
                    `📊 *Size:* ${formatFileSize(result.size)}\n\n` +
                    `> *Downloaded by ${config.botName}*`;

                if (isVideo) {
                    // FIX: Send as video document to avoid WhatsApp re-encoding issues
                    // that can corrupt playback. Using 'video' key with mp4 mimetype.
                    await sock.sendMessage(from, {
                        video: fileBuffer,
                        mimetype: 'video/mp4',
                        caption: caption
                    }, { quoted: msg });
                } else {
                    // Audio: send as audio file (not ptt/voice note)
                    await sock.sendMessage(from, {
                        audio: fileBuffer,
                        mimetype: 'audio/mpeg',
                        ptt: false
                    }, { quoted: msg });

                    // Send caption separately since audio doesn't support captions
                    await sock.sendMessage(from, { text: caption }, { quoted: msg });
                }

                // Clean up temp files
                cleanupFiles(result.path, result.tempDir);

                // Update the processing message
                await sock.sendMessage(from, {
                    text: `✅ *Download sent successfully!*`,
                    edit: processingMsg.key
                });

                await react('✅');
                sessionManager.clearSession(session.id);

            } catch (downloadError) {
                console.error('[DLP] Download error:', downloadError);
                await sock.sendMessage(from, {
                    text:
                        `❌ *Download failed*\n\n` +
                        `Error: ${downloadError.message}\n\n` +
                        `Please try again or select a different quality.`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
        }

        return true;
    }
};
