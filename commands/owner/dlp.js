/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Supports YouTube, Instagram, Twitter, Facebook, TikTok, and 1000+ sites
 * Auto-installs dependencies, merges audio+video, smart file size handling
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

// Track setup
let setupComplete = false;
let setupInProgress = false;
let cookiesPath = null;

// File size threshold (200MB)
const DOCUMENT_THRESHOLD_MB = 200;
const DOCUMENT_THRESHOLD_BYTES = DOCUMENT_THRESHOLD_MB * 1024 * 1024;

// Google Drive Configuration for cookies
const COOKIES_FILE_ID = "13iX8xpx47W3PAedGyhGpF5CxZRFz4uaF";
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";

let cachedToken = null;
let tokenExpiry = null;

// ==================== AUTO SETUP FUNCTIONS ====================

async function ensureYtDlpInstalled() {
    return new Promise((resolve) => {
        exec('yt-dlp --version', (error) => {
            if (!error) {
                console.log('[DLP] yt-dlp already installed');
                resolve(true);
                return;
            }
            console.log('[DLP] Installing yt-dlp...');
            exec('pip install -q yt-dlp', (installError) => {
                if (installError) {
                    console.error('[DLP] Failed to install yt-dlp');
                    resolve(false);
                } else {
                    console.log('[DLP] yt-dlp installed');
                    resolve(true);
                }
            });
        });
    });
}

async function ensureDenoInstalled() {
    return new Promise((resolve) => {
        exec('deno --version', (error) => {
            if (!error) {
                console.log('[DLP] Deno already installed');
                resolve(true);
                return;
            }
            console.log('[DLP] Installing Deno...');
            const installCmd = 'curl -fsSL https://deno.land/install.sh | sh && export PATH="$HOME/.deno/bin:$PATH"';
            exec(installCmd, { shell: '/bin/bash', timeout: 60000 }, (installError) => {
                if (installError) {
                    resolve(false);
                } else {
                    process.env.PATH = `${process.env.HOME}/.deno/bin:${process.env.PATH}`;
                    console.log('[DLP] Deno installed');
                    resolve(true);
                }
            });
        });
    });
}

async function ensureFfmpegInstalled() {
    return new Promise((resolve) => {
        exec('ffmpeg -version', (error) => {
            if (!error) {
                console.log('[DLP] ffmpeg already installed');
                resolve(true);
                return;
            }
            console.log('[DLP] Installing ffmpeg...');
            exec('apt-get update -qq && apt-get install -y -qq ffmpeg', { timeout: 60000 }, (installError) => {
                if (installError) {
                    console.error('[DLP] Failed to install ffmpeg');
                    resolve(false);
                } else {
                    console.log('[DLP] ffmpeg installed');
                    resolve(true);
                }
            });
        });
    });
}

async function runSetup() {
    if (setupComplete || setupInProgress) return setupComplete;
    setupInProgress = true;
    console.log('[DLP] Running auto setup...');
    try {
        await ensureYtDlpInstalled();
        await ensureDenoInstalled();
        await ensureFfmpegInstalled();
        setupComplete = true;
        setupInProgress = false;
        console.log('[DLP] Setup complete');
        return true;
    } catch (error) {
        console.error('[DLP] Setup failed:', error);
        setupInProgress = false;
        return false;
    }
}

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
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} --no-warnings --dump-json "${url}" 2>&1`;
        
        console.log('[DLP] Getting video info...');
        
        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] yt-dlp error:', stderr);
                reject(new Error(stderr || 'Failed to fetch video info'));
                return;
            }
            
            try {
                const info = JSON.parse(stdout);
                const formats = info.formats || [];
                const qualities = new Map();
                
                for (const format of formats) {
                    if (format.vcodec !== 'none' && format.height) {
                        const height = format.height;
                        const quality = height >= 2160 ? '4K' :
                                       height >= 1440 ? '2K' :
                                       height >= 1080 ? '1080p' :
                                       height >= 720 ? '720p' :
                                       height >= 480 ? '480p' :
                                       height >= 360 ? '360p' :
                                       height >= 240 ? '240p' : `${height}p`;
                        
                        if (!qualities.has(quality) || height > (qualities.get(quality)?.height || 0)) {
                            qualities.set(quality, {
                                formatId: format.format_id,
                                height: height,
                                ext: format.ext,
                                filesize: format.filesize || format.filesize_approx || 0,
                                vcodec: format.vcodec,
                                acodec: format.acodec
                            });
                        }
                    }
                }
                
                // Add audio-only option
                qualities.set('MP3', {
                    formatId: 'bestaudio',
                    height: 0,
                    ext: 'mp3',
                    filesize: 0,
                    vcodec: 'none',
                    acodec: 'mp4a'
                });
                
                const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', '144p', 'MP3'];
                const sortedQualities = [];
                
                for (const q of qualityOrder) {
                    if (qualities.has(q)) {
                        sortedQualities.push({
                            name: q,
                            ...qualities.get(q)
                        });
                    }
                }
                
                console.log('[DLP] Available qualities:', sortedQualities.map(q => q.name));
                
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

async function downloadAndMergeMedia(url, qualityInfo, tempDir) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(tempDir, 'output.mp4');
        const tempVideo = path.join(tempDir, 'video.mp4');
        const tempAudio = path.join(tempDir, 'audio.mp3');
        
        let cmd;
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        
        if (qualityInfo.name === 'MP3') {
            cmd = `yt-dlp ${cookieArg} -f bestaudio -x --audio-format mp3 --audio-quality 0 -o "${tempDir}/audio.%(ext)s" "${url}"`;
        } else {
            cmd = `yt-dlp ${cookieArg} -f "bestvideo[height<=${qualityInfo.height}]" -o "${tempVideo}" "${url}" && ` +
                  `yt-dlp ${cookieArg} -f bestaudio -x --audio-format mp3 -o "${tempAudio}" "${url}" && ` +
                  `ffmpeg -i "${tempVideo}" -i "${tempAudio}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y`;
        }
        
        console.log('[DLP] Running download/merge command');
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Download error:', stderr);
                
                // Fallback: try best format directly
                const fallbackCmd = `yt-dlp ${cookieArg} -f "best[height<=${qualityInfo.height}]" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
                
                exec(fallbackCmd, { maxBuffer: 500 * 1024 * 1024 }, (fallbackError) => {
                    if (fallbackError) {
                        reject(new Error(stderr || 'Download failed'));
                    } else {
                        resolve(outputPath);
                    }
                });
                return;
            }
            
            if (qualityInfo.name === 'MP3') {
                const files = fs.readdirSync(tempDir);
                const audioFile = files.find(f => f.endsWith('.mp3'));
                if (audioFile) {
                    resolve(path.join(tempDir, audioFile));
                } else {
                    reject(new Error('No audio file found'));
                }
                return;
            }
            
            resolve(outputPath);
        });
    });
}

function sanitizeFilename(filename) {
    let sanitized = filename.replace(/[^\w\s\u0600-\u06FF\u4e00-\u9fff]/g, '_');
    sanitized = sanitized.replace(/\s+/g, '_');
    sanitized = sanitized.replace(/_+/g, '_');
    if (sanitized.length > 80) sanitized = sanitized.substring(0, 80);
    return sanitized;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
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

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'dlp',
    aliases: ['download', 'get'],
    description: 'Download videos/audio from any supported website',
    usage: '.dlp <url>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *Universal Media Downloader*\n\n` +
                       `*Usage:* \`${config.prefix}dlp <url>\`\n\n` +
                       `*First run auto-installs dependencies*`);
        }
        
        const url = args[0];
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        
        // Auto setup if needed
        if (!setupComplete) {
            const setupMsg = await reply(`⚙️ *First time setup...*\nInstalling dependencies...`);
            const setupSuccess = await runSetup();
            if (!setupSuccess) {
                await sock.sendMessage(from, {
                    text: `❌ *Setup failed*\nPlease install manually:\n\`pip install -U yt-dlp\`\n\`apt-get install ffmpeg\``,
                    edit: setupMsg.key
                });
                await react('❌');
                return;
            }
            await sock.sendMessage(from, { text: `✅ *Setup complete!*`, edit: setupMsg.key });
        }
        
        // Download cookies if needed
        if (!cookiesPath || !fs.existsSync(cookiesPath)) {
            await downloadCookies();
        }
        
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            const videoInfo = await getAvailableQualities(url);
            
            if (!videoInfo.qualities || videoInfo.qualities.length === 0) {
                await sock.sendMessage(from, {
                    text: `❌ No downloadable formats found.`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
            
            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                videoInfo: videoInfo
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Send thumbnail
            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n⏱️ ${formatDuration(videoInfo.duration)}`
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            const buttons = [];
            for (let i = 0; i < Math.min(videoInfo.qualities.length, 6); i++) {
                const q = videoInfo.qualities[i];
                let text = q.name;
                if (q.filesize > 0) text += ` (${formatFileSize(q.filesize)})`;
                buttons.push({ id: `dlp_qual_${sessionId}_${i}`, text: text });
            }
            buttons.push({ id: `dlp_cancel_${sessionId}`, text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: `✅ *${videoInfo.title || 'Video'}*\n📊 ${videoInfo.qualities.length} qualities available\n\nSelect quality:`,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `Select download quality:`,
                footer: 'Universal Downloader',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
            await react('✅');
            
        } catch (error) {
            console.error('[DLP] Error:', error);
            await sock.sendMessage(from, {
                text: `❌ *Failed*\n\n${error.message}`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'dlp') return true;
        
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId && buttonId.includes('dlp_cancel_')) {
                sessionManager.clearSession(session.id);
                await reply(`❌ Cancelled.`);
                return true;
            }
            
            if (buttonId && buttonId.includes('dlp_qual_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[3]);
                const quality = session.data.videoInfo.qualities[index];
                
                if (!quality) return true;
                
                await react('⬇️');
                const processingMsg = await reply(`📥 *Downloading ${quality.name}...*\n\nPlease wait...`);
                
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                try {
                    const downloadedFile = await downloadAndMergeMedia(session.data.url, quality, tempDir);
                    
                    const fileBuffer = fs.readFileSync(downloadedFile);
                    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
                    const isLargeFile = fileBuffer.length > DOCUMENT_THRESHOLD_BYTES;
                    const isMp3 = quality.name === 'MP3';
                    
                    // Create proper filename
                    let baseFilename = session.data.videoInfo.title || 'video';
                    baseFilename = sanitizeFilename(baseFilename);
                    const finalFileName = isMp3 ? `${baseFilename}.mp3` : `${baseFilename}_${quality.name}.mp4`;
                    
                    const caption = `✅ *Download Complete!*\n\n` +
                                   `📹 *Quality:* ${quality.name}\n` +
                                   `📊 *Size:* ${fileSizeMB} MB\n` +
                                   `📁 *File:* ${finalFileName}\n` +
                                   `${isLargeFile ? `📦 *Sent as document* (file > ${DOCUMENT_THRESHOLD_MB}MB)` : `🎬 *Sent as media*`}\n\n` +
                                   `> *Downloaded by ${config.botName}*`;
                    
                    // Smart sending: document for large files, media for smaller
                    if (isLargeFile || isMp3) {
                        // Send as document for large files or MP3
                        await sock.sendMessage(from, {
                            document: fileBuffer,
                            mimetype: isMp3 ? 'audio/mpeg' : 'video/mp4',
                            fileName: finalFileName,
                            caption: caption
                        }, { quoted: msg });
                    } else {
                        // Send as media for smaller video files
                        await sock.sendMessage(from, {
                            video: fileBuffer,
                            mimetype: 'video/mp4',
                            caption: caption
                        }, { quoted: msg });
                    }
                    
                    // Cleanup
                    try {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    } catch (e) {}
                    
                    await sock.sendMessage(from, {
                        text: `✅ *Download Complete!*`,
                        edit: processingMsg.key
                    });
                    
                    await react('✅');
                    sessionManager.clearSession(session.id);
                    
                } catch (error) {
                    console.error('[DLP] Download error:', error);
                    await sock.sendMessage(from, {
                        text: `❌ *Download failed*\n\n${error.message}`,
                        edit: processingMsg.key
                    });
                    await react('❌');
                    
                    try {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    } catch (e) {}
                }
                return true;
            }
        }
        return true;
    }
};