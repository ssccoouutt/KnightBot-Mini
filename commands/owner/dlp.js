/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegStatic);

const FORCE_AI_MODE = true;

const COOKIES_FILE_ID = "13iX8xpx47W3PAedGyhGpF5CxZRFz4uaF";
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";

let cachedToken = null;
let tokenExpiry = null;
let cookiesPath = null;

async function getAccessToken() {
    if (cachedToken && tokenExpiry && new Date() < tokenExpiry) return cachedToken;
    
    const tokenResponse = await axios({ method: 'GET', url: TOKEN_URL, responseType: 'stream', timeout: 30000 });
    const tempTokenFile = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
    const tokenDir = path.dirname(tempTokenFile);
    if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
    
    const tokenWriter = fs.createWriteStream(tempTokenFile);
    tokenResponse.data.pipe(tokenWriter);
    await new Promise((resolve, reject) => { tokenWriter.on('finish', resolve); tokenWriter.on('error', reject); });
    
    const tokenData = JSON.parse(fs.readFileSync(tempTokenFile, 'utf8'));
    fs.unlinkSync(tempTokenFile);
    
    const expiryDate = new Date(tokenData.expiry);
    if (new Date() > expiryDate) {
        const refreshData = { client_id: tokenData.client_id, client_secret: tokenData.client_secret, refresh_token: tokenData.refresh_token, grant_type: 'refresh_token' };
        const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
        cachedToken = refreshResponse.data.access_token;
        tokenExpiry = new Date(Date.now() + 3600 * 1000);
    } else {
        cachedToken = tokenData.token;
        tokenExpiry = new Date(expiryDate);
    }
    return cachedToken;
}

async function downloadCookies() {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        cookiesPath = path.join(tempDir, 'cookies.txt');
        const response = await axios({ method: 'GET', url: `https://www.googleapis.com/drive/v3/files/${COOKIES_FILE_ID}?alt=media`, headers: { 'Authorization': `Bearer ${token}` }, responseType: 'stream', timeout: 30000 });
        const writer = fs.createWriteStream(cookiesPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
        return true;
    } catch (error) { return false; }
}

async function hasAudioStream(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) { resolve(false); return; }
            const hasAudio = metadata.streams.some(stream => stream.codec_type === 'audio');
            resolve(hasAudio);
        });
    });
}

async function downloadVideoWithAudio(url) {
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, 'video.mp4');
    
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} -f "best[ext=mp4]/best" -o "${outputPath}" "${url}"`;
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Download failed: ${error.message}`));
                return;
            }
            
            if (!fs.existsSync(outputPath)) {
                reject(new Error('No file downloaded'));
                return;
            }
            
            const stats = fs.statSync(outputPath);
            if (stats.size < 50000) {
                reject(new Error('File too small - video may be unavailable'));
                return;
            }
            
            const hasAudio = await hasAudioStream(outputPath);
            
            if (!hasAudio) {
                const altCmd = `yt-dlp ${cookieArg} -f "bestvideo+bestaudio" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
                exec(altCmd, { maxBuffer: 500 * 1024 * 1024 }, async (altError) => {
                    if (altError) {
                        reject(new Error('Video has no audio and merge failed'));
                        return;
                    }
                    const altStats = fs.statSync(outputPath);
                    resolve({ path: outputPath, filename: 'video.mp4', size: altStats.size, tempDir: tempDir });
                });
                return;
            }
            
            resolve({ path: outputPath, filename: 'video.mp4', size: stats.size, tempDir: tempDir });
        });
    });
}

async function downloadAudioOnly(url) {
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, 'audio.mp3');
    
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} -f "bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputPath}" "${url}"`;
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Audio download failed: ${error.message}`));
                return;
            }
            
            const files = fs.readdirSync(tempDir);
            if (files.length === 0) {
                reject(new Error('No audio file downloaded'));
                return;
            }
            
            const audioFile = path.join(tempDir, files[0]);
            const stats = fs.statSync(audioFile);
            resolve({ path: audioFile, filename: files[0], size: stats.size, tempDir: tempDir });
        });
    });
}

async function getAvailableQualities(url) {
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} --no-warnings --dump-json "${url}"`;
        
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
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
                        const quality = height >= 2160 ? '4K' : height >= 1440 ? '2K' : height >= 1080 ? '1080p' : height >= 720 ? '720p' : height >= 480 ? '480p' : height >= 360 ? '360p' : '240p';
                        
                        if (!qualities.has(quality) || height > (qualities.get(quality)?.height || 0)) {
                            qualities.set(quality, { height: height, filesize: format.filesize });
                        }
                    }
                }
                
                qualities.set('mp3', { height: 0, filesize: null, isAudio: true });
                
                const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', 'mp3'];
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
                    uploader: info.uploader,
                    qualities: sortedQualities
                });
            } catch (e) {
                reject(new Error('Failed to parse video info'));
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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

module.exports = {
    name: 'dlp',
    aliases: ['download', 'vd'],
    description: 'Download videos/audio from any supported website',
    usage: '.dlp <url>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *Universal Media Downloader*\n\nUsage: \`${config.prefix}dlp <url>\``);
        }
        
        const url = args[0];
        if (!url.startsWith('http')) {
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
                await sock.sendMessage(from, { text: `❌ No downloadable formats found.`, edit: processingMsg.key });
                await react('❌');
                return;
            }
            
            const existingSessions = sessionManager.getUserSessions(sender, from);
            for (const sess of existingSessions) {
                if (sess.command === 'dlp') {
                    sessionManager.clearSession(sess.id);
                }
            }
            
            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                videoInfo: videoInfo
            });
            
            const sessionId = session.id.split(':').pop();
            
            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n\n⏱️ Duration: ${formatDuration(videoInfo.duration)}\n👤 Uploader: ${videoInfo.uploader || 'Unknown'}`
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            const buttons = [];
            for (let i = 0; i < videoInfo.qualities.length; i++) {
                const q = videoInfo.qualities[i];
                let buttonText = q.name;
                if (q.filesize) {
                    buttonText += ` (${formatFileSize(q.filesize)})`;
                }
                buttons.push({
                    id: `dlp_qual_${sessionId}_${i}`,
                    text: buttonText
                });
            }
            buttons.push({ id: 'cancel', text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: `✅ *Video Information Retrieved*\n\n📹 *Title:* ${videoInfo.title || 'Unknown'}\n⏱️ *Duration:* ${formatDuration(videoInfo.duration)}\n📊 *Available:* ${videoInfo.qualities.length} options\n\nSelect quality to download:`,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `🎬 *${videoInfo.title || 'Select quality'}*`,
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
        
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
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
                const index = parseInt(parts[3]);
                const qualities = session.data.videoInfo.qualities;
                
                if (index >= 0 && index < qualities.length) {
                    const selected = qualities[index];
                    const isAudio = selected.name === 'mp3';
                    
                    await react('⬇️');
                    const processingMsg = await reply(`📥 *Downloading ${selected.name}...*\n\nPlease wait, this may take a few moments...`);
                    
                    try {
                        let result;
                        if (isAudio) {
                            result = await downloadAudioOnly(session.data.url);
                        } else {
                            result = await downloadVideoWithAudio(session.data.url);
                        }
                        
                        const fileSizeMB = (result.size / (1024 * 1024)).toFixed(2);
                        const caption = `✅ *Download Complete!*\n\n🎬 *Title:* ${session.data.videoInfo.title || 'Video'}\n📹 *Quality:* ${selected.name}\n📊 *Size:* ${fileSizeMB} MB\n\n> *Powered by ${config.botName}*`;
                        
                        if (isAudio) {
                            await sock.sendMessage(from, {
                                audio: fs.readFileSync(result.path),
                                mimetype: 'audio/mpeg',
                                caption: caption,
                                ptt: false
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, {
                                video: fs.readFileSync(result.path),
                                mimetype: 'video/mp4',
                                caption: caption
                            }, { quoted: msg });
                        }
                        
                        // Cleanup
                        try {
                            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
                            if (fs.existsSync(result.tempDir)) fs.rmSync(result.tempDir, { recursive: true, force: true });
                        } catch (e) {}
                        
                        await sock.sendMessage(from, {
                            text: `✅ *Download Complete!*`,
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
