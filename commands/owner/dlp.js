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
const { sendButtons, sendInteractiveMessage } = giftedBtns;

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
        
        const tempTokenFile = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenDir = path.dirname(tempTokenFile);
        if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
        
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
        const cmd = `yt-dlp --cookies "${cookiesPath}" --no-warnings --dump-json "${url}"`;
        
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
                    if (format.vcodec !== 'none') {
                        const height = format.height || 0;
                        const quality = height >= 2160 ? '4K' :
                                       height >= 1440 ? '2K' :
                                       height >= 1080 ? '1080p' :
                                       height >= 720 ? '720p' :
                                       height >= 480 ? '480p' :
                                       height >= 360 ? '360p' :
                                       height >= 240 ? '240p' : '144p';
                        
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
                
                // Sort qualities by height
                const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', '144p', 'mp3'];
                const sortedQualities = [];
                
                for (const q of qualityOrder) {
                    if (qualities.has(q)) {
                        sortedQualities.push({
                            name: q,
                            ...qualities.get(q)
                        });
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

async function downloadMedia(url, qualityInfo, onProgress) {
    return new Promise((resolve, reject) => {
        const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        let outputTemplate;
        let formatSpec;
        
        if (qualityInfo.name === 'mp3') {
            outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');
            formatSpec = 'bestaudio/best';
        } else {
            outputTemplate = path.join(tempDir, `%(title)s_${qualityInfo.name}.%(ext)s`);
            formatSpec = qualityInfo.formatId;
        }
        
        let cmd = `yt-dlp --cookies "${cookiesPath}" -f "${formatSpec}" -o "${outputTemplate}" "${url}"`;
        
        if (qualityInfo.name === 'mp3') {
            cmd += ' --extract-audio --audio-format mp3 --audio-quality 0';
        } else {
            cmd += ' --merge-output-format mp4';
        }
        
        console.log('[DLP] Executing:', cmd);
        
        const process = exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Download error:', error);
                reject(new Error(`Download failed: ${error.message}`));
                return;
            }
            
            // Find the downloaded file
            const files = fs.readdirSync(tempDir);
            if (files.length === 0) {
                reject(new Error('No file downloaded'));
                return;
            }
            
            const downloadedFile = path.join(tempDir, files[0]);
            const stats = fs.statSync(downloadedFile);
            
            resolve({
                path: downloadedFile,
                filename: files[0],
                size: stats.size,
                tempDir: tempDir
            });
        });
        
        // Track progress
        process.stderr.on('data', (data) => {
            const progressMatch = data.toString().match(/(\d+\.\d+)% of (~?[\d.]+[\w]+)/);
            if (progressMatch && onProgress) {
                onProgress(progressMatch[1], progressMatch[2]);
            }
        });
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
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
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'dlp',
    aliases: ['download', 'video', 'ytdlp', 'dl'],
    description: 'Download videos/audio from any supported website (YouTube, Instagram, Twitter, Facebook, TikTok, etc.)',
    usage: '.dlp <url>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *Universal Media Downloader*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}dlp <url>\` - Download from any site\n\n` +
                       `*Supported Sites:*\n` +
                       `• YouTube (videos, shorts, playlists)\n` +
                       `• Instagram (reels, posts, stories)\n` +
                       `• Twitter/X (videos)\n` +
                       `• Facebook (videos, reels)\n` +
                       `• TikTok\n` +
                       `• Reddit\n` +
                       `• Twitch\n` +
                       `• Vimeo\n` +
                       `• Dailymotion\n` +
                       `• And 1000+ more sites\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}dlp https://youtu.be/xxxxx\`\n` +
                       `• \`${config.prefix}dlp https://www.instagram.com/reel/xxxxx\`\n` +
                       `• \`${config.prefix}dlp https://twitter.com/xxx/status/xxxxx\``);
        }
        
        const url = args[0];
        
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            // Download cookies if not exists
            if (!cookiesPath || !fs.existsSync(cookiesPath)) {
                await downloadCookies();
            }
            
            // Get available qualities
            const videoInfo = await getAvailableQualities(url);
            
            if (!videoInfo.qualities || videoInfo.qualities.length === 0) {
                await sock.sendMessage(from, {
                    text: `❌ No downloadable formats found for this URL.\n\nMake sure the video is accessible.`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
            
            // Create session
            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                videoInfo: videoInfo,
                step: 'selecting_quality'
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Show thumbnail if available
            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n\n` +
                                 `⏱️ Duration: ${formatDuration(videoInfo.duration)}\n` +
                                 `👤 Uploader: ${videoInfo.uploader || 'Unknown'}\n\n` +
                                 `📥 Select quality below:`
                    }, { quoted: msg });
                } catch (thumbErr) {
                    // Continue without thumbnail
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
                    id: `dlp_quality_${sessionId}_${i}`,
                    text: buttonText.length > 30 ? buttonText.substring(0, 27) + '...' : buttonText
                });
            }
            
            buttons.push({ id: 'cancel', text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: `✅ *Video Information Retrieved*\n\n` +
                      `📹 *Title:* ${videoInfo.title || 'Unknown'}\n` +
                      `⏱️ *Duration:* ${formatDuration(videoInfo.duration)}\n` +
                      `👤 *Uploader:* ${videoInfo.uploader || 'Unknown'}\n` +
                      `📊 *Available Qualities:* ${videoInfo.qualities.length}\n\n` +
                      `Select quality to download:`,
                edit: processingMsg.key
            });
            
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
                text: `❌ *Failed to process URL*\n\nError: ${error.message}\n\nPossible reasons:\n• URL is invalid\n• Video is private/age-restricted\n• Site may be blocked\n• Try using cookies file`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
            } else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                }
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
            }
            
            if (buttonId === 'cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Download cancelled.`);
                return true;
            }
            
            if (buttonId && buttonId.startsWith('dlp_quality_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[3]);
                const qualities = session.data.videoInfo.qualities;
                
                if (!isNaN(index) && index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    
                    // Update session
                    sessionManager.updateSession(sender, from, {
                        step: 'downloading',
                        selectedQuality: selectedQuality
                    });
                    
                    await react('⬇️');
                    const processingMsg = await reply(`📥 *Downloading ${selectedQuality.name}...*\n\nPlease wait, this may take a few moments...`);
                    
                    try {
                        let lastProgress = '';
                        const result = await downloadMedia(session.data.url, selectedQuality, (percent, size) => {
                            const progressMsg = `📥 Downloading: ${percent}% of ${size}`;
                            if (progressMsg !== lastProgress) {
                                lastProgress = progressMsg;
                                // Optional: update progress (can be spammy, so commented)
                                // sock.sendMessage(from, { text: progressMsg, edit: processingMsg.key }).catch(() => {});
                            }
                        });
                        
                        const fileSize = formatFileSize(result.size);
                        const caption = `✅ *Download Complete!*\n\n` +
                                      `🎬 *Title:* ${session.data.videoInfo.title || 'Video'}\n` +
                                      `📹 *Quality:* ${selectedQuality.name}\n` +
                                      `📊 *Size:* ${fileSize}\n\n` +
                                      `> *Downloaded by ${config.botName}*`;
                        
                        // Send the file
                        const isVideo = selectedQuality.name !== 'mp3';
                        const mimetype = isVideo ? 'video/mp4' : 'audio/mpeg';
                        
                        await sock.sendMessage(from, {
                            [isVideo ? 'video' : 'audio']: fs.readFileSync(result.path),
                            mimetype: mimetype,
                            caption: caption,
                            ptt: !isVideo
                        }, { quoted: msg });
                        
                        // Clean up temp files
                        fs.unlinkSync(result.path);
                        fs.rmdirSync(result.tempDir);
                        
                        await sock.sendMessage(from, {
                            text: `✅ *Download Complete!*\n\nFile saved successfully.`,
                            edit: processingMsg.key
                        });
                        
                        await react('✅');
                        sessionManager.clearSession(session.id);
                        
                    } catch (downloadError) {
                        console.error('[DLP] Download error:', downloadError);
                        await sock.sendMessage(from, {
                            text: `❌ *Download failed*\n\nError: ${downloadError.message}\n\nPlease try again or select a different quality.`,
                            edit: processingMsg.key
                        });
                        await react('❌');
                    }
                }
                return true;
            }
        }
        
        return true;
    }
};

// Clean up cookies on exit
process.on('exit', () => {
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        try {
            fs.unlinkSync(cookiesPath);
        } catch (e) {}
    }
});

process.on('SIGINT', () => {
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        try {
            fs.unlinkSync(cookiesPath);
        } catch (e) {}
    }
    process.exit();
});

process.on('SIGTERM', () => {
    if (cookiesPath && fs.existsSync(cookiesPath)) {
        try {
            fs.unlinkSync(cookiesPath);
        } catch (e) {}
    }
    process.exit();
});