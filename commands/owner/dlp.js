/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp (DEBUG VERSION)
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
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);
console.log(`[DLP DEBUG] FFmpeg path: ${ffmpegStatic}`);

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
            console.log('[DLP DEBUG] Using cached token');
            return cachedToken;
        }
        
        console.log('[DLP DEBUG] Fetching Google Drive token...');
        
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
            console.log('[DLP DEBUG] Token expired, refreshing...');
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
        
        console.log('[DLP DEBUG] Token obtained successfully');
        return cachedToken;
        
    } catch (error) {
        console.error('[DLP DEBUG] Failed to get Google Drive token:', error.message);
        return null;
    }
}

async function downloadCookies() {
    try {
        console.log('[DLP DEBUG] Downloading cookies from Google Drive...');
        const token = await getAccessToken();
        if (!token) return false;
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        cookiesPath = path.join(tempDir, 'cookies.txt');
        console.log(`[DLP DEBUG] Cookies will be saved to: ${cookiesPath}`);
        
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
        
        const stats = fs.statSync(cookiesPath);
        console.log(`[DLP DEBUG] Cookies downloaded successfully, size: ${stats.size} bytes`);
        return true;
        
    } catch (error) {
        console.error('[DLP DEBUG] Failed to download cookies:', error.message);
        return false;
    }
}

// ==================== YT-DLP FUNCTIONS ====================

async function getAvailableQualities(url) {
    console.log(`[DLP DEBUG] Getting available qualities for URL: ${url}`);
    
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} --no-warnings --dump-json "${url}"`;
        console.log(`[DLP DEBUG] Executing: ${cmd.substring(0, 200)}...`);
        
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP DEBUG] yt-dlp error:', error.message);
                console.error('[DLP DEBUG] stderr:', stderr);
                reject(new Error('Failed to fetch video info'));
                return;
            }
            
            if (stderr) {
                console.log('[DLP DEBUG] yt-dlp stderr:', stderr);
            }
            
            try {
                console.log('[DLP DEBUG] Parsing JSON response...');
                const info = JSON.parse(stdout);
                console.log(`[DLP DEBUG] Video title: ${info.title}`);
                console.log(`[DLP DEBUG] Video duration: ${info.duration}`);
                console.log(`[DLP DEBUG] Available formats: ${info.formats?.length || 0}`);
                
                const formats = info.formats || [];
                const qualities = new Map();
                
                for (const format of formats) {
                    if (format.vcodec !== 'none' && format.acodec !== 'none') {
                        const height = format.height || 0;
                        const quality = height >= 2160 ? '4K' :
                                       height >= 1440 ? '2K' :
                                       height >= 1080 ? '1080p' :
                                       height >= 720 ? '720p' :
                                       height >= 480 ? '480p' :
                                       height >= 360 ? '360p' : '240p';
                        
                        console.log(`[DLP DEBUG] Found quality: ${quality}, format_id: ${format.format_id}, height: ${height}, ext: ${format.ext}`);
                        
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
                    formatId: 'bestaudio/best',
                    height: 0,
                    ext: 'mp3',
                    filesize: null,
                    vcodec: 'none',
                    acodec: 'mp4a',
                    isAudio: true
                });
                
                // Sort qualities by height
                const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', 'mp3'];
                const sortedQualities = [];
                
                for (const q of qualityOrder) {
                    if (qualities.has(q)) {
                        sortedQualities.push({
                            name: q,
                            ...qualities.get(q)
                        });
                    }
                }
                
                console.log(`[DLP DEBUG] Total qualities found: ${sortedQualities.length}`);
                
                resolve({
                    title: info.title,
                    duration: info.duration,
                    thumbnail: info.thumbnail,
                    webpage_url: info.webpage_url,
                    uploader: info.uploader,
                    qualities: sortedQualities
                });
                
            } catch (parseError) {
                console.error('[DLP DEBUG] Parse error:', parseError);
                console.error('[DLP DEBUG] stdout preview:', stdout.substring(0, 500));
                reject(new Error('Failed to parse video info'));
            }
        });
    });
}

async function downloadAndMergeVideo(url, qualityInfo) {
    console.log(`[DLP DEBUG] Starting download for quality: ${qualityInfo.name}`);
    console.log(`[DLP DEBUG] URL: ${url}`);
    
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[DLP DEBUG] Temp directory: ${tempDir}`);
    
    const videoOutput = path.join(tempDir, 'video.mp4');
    const audioOutput = path.join(tempDir, 'audio.mp4');
    const finalOutput = path.join(tempDir, 'final.mp4');
    
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        
        // Try direct download first
        const directCmd = `yt-dlp ${cookieArg} -f "bestvideo[height<=${qualityInfo.height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${qualityInfo.height}]" -o "${finalOutput}" --merge-output-format mp4 "${url}"`;
        console.log(`[DLP DEBUG] Direct download command: ${directCmd.substring(0, 300)}...`);
        
        exec(directCmd, { maxBuffer: 200 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (error) {
                console.log('[DLP DEBUG] Direct download failed, trying fallback method...');
                console.log('[DLP DEBUG] Error:', error.message);
                
                // Fallback: Download video and audio separately
                await fallbackDownloadAndMerge(url, qualityInfo, tempDir, videoOutput, audioOutput, finalOutput, resolve, reject);
                return;
            }
            
            if (stderr) {
                console.log('[DLP DEBUG] yt-dlp stderr:', stderr);
            }
            
            console.log('[DLP DEBUG] Direct download stdout:', stdout);
            
            // Check if file exists and is valid
            if (fs.existsSync(finalOutput) && fs.statSync(finalOutput).size > 0) {
                const stats = fs.statSync(finalOutput);
                console.log(`[DLP DEBUG] Direct download successful! File size: ${stats.size} bytes`);
                console.log(`[DLP DEBUG] File path: ${finalOutput}`);
                
                // Verify file is a valid MP4
                const buffer = fs.readFileSync(finalOutput);
                const isMp4 = buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
                console.log(`[DLP DEBUG] MP4 signature check: ${isMp4 ? 'VALID' : 'INVALID'}`);
                
                resolve({
                    path: finalOutput,
                    filename: path.basename(finalOutput),
                    size: stats.size,
                    tempDir: tempDir,
                    isValid: isMp4
                });
            } else {
                console.error('[DLP DEBUG] Direct download failed - no file created');
                reject(new Error('Download failed - no file created'));
            }
        });
    });
}

async function fallbackDownloadAndMerge(url, qualityInfo, tempDir, videoOutput, audioOutput, finalOutput, resolve, reject) {
    console.log('[DLP DEBUG] Starting fallback download method...');
    const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
    
    // Download video only
    const videoCmd = `yt-dlp ${cookieArg} -f "bestvideo[height<=${qualityInfo.height}][ext=mp4]" -o "${videoOutput}" "${url}"`;
    console.log(`[DLP DEBUG] Video download command: ${videoCmd.substring(0, 200)}...`);
    
    exec(videoCmd, { maxBuffer: 200 * 1024 * 1024 }, (videoError, videoStdout, videoStderr) => {
        if (videoError) {
            console.error('[DLP DEBUG] Video download failed:', videoError.message);
            reject(new Error('Failed to download video stream'));
            return;
        }
        
        console.log('[DLP DEBUG] Video downloaded successfully');
        
        // Download audio only
        const audioCmd = `yt-dlp ${cookieArg} -f "bestaudio[ext=m4a]/bestaudio" -o "${audioOutput}" "${url}"`;
        console.log(`[DLP DEBUG] Audio download command: ${audioCmd.substring(0, 200)}...`);
        
        exec(audioCmd, { maxBuffer: 200 * 1024 * 1024 }, (audioError, audioStdout, audioStderr) => {
            if (audioError) {
                console.error('[DLP DEBUG] Audio download failed:', audioError.message);
                reject(new Error('Failed to download audio stream'));
                return;
            }
            
            console.log('[DLP DEBUG] Audio downloaded successfully');
            console.log('[DLP DEBUG] Merging video and audio with ffmpeg...');
            
            // Merge video and audio with ffmpeg
            ffmpeg()
                .input(videoOutput)
                .input(audioOutput)
                .outputOptions(['-c:v copy', '-c:a aac', '-strict experimental'])
                .save(finalOutput)
                .on('start', (cmd) => {
                    console.log(`[DLP DEBUG] FFmpeg command: ${cmd}`);
                })
                .on('progress', (progress) => {
                    console.log(`[DLP DEBUG] FFmpeg progress: ${progress.percent}%`);
                })
                .on('end', () => {
                    console.log('[DLP DEBUG] FFmpeg merge completed');
                    
                    if (fs.existsSync(finalOutput) && fs.statSync(finalOutput).size > 0) {
                        const stats = fs.statSync(finalOutput);
                        console.log(`[DLP DEBUG] Final file size: ${stats.size} bytes`);
                        
                        // Verify file is a valid MP4
                        const buffer = fs.readFileSync(finalOutput);
                        const isMp4 = buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
                        console.log(`[DLP DEBUG] MP4 signature check: ${isMp4 ? 'VALID' : 'INVALID'}`);
                        
                        resolve({
                            path: finalOutput,
                            filename: path.basename(finalOutput),
                            size: stats.size,
                            tempDir: tempDir,
                            isValid: isMp4
                        });
                    } else {
                        reject(new Error('Merge failed - no file created'));
                    }
                })
                .on('error', (err) => {
                    console.error('[DLP DEBUG] FFmpeg error:', err);
                    reject(new Error(`Merge failed: ${err.message}`));
                });
        });
    });
}

async function downloadAudioOnly(url) {
    console.log(`[DLP DEBUG] Downloading audio only from: ${url}`);
    
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[DLP DEBUG] Temp directory: ${tempDir}`);
    
    const outputPath = path.join(tempDir, 'audio.mp3');
    
    return new Promise((resolve, reject) => {
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        const cmd = `yt-dlp ${cookieArg} -f "bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputPath}" "${url}"`;
        console.log(`[DLP DEBUG] Audio command: ${cmd.substring(0, 300)}...`);
        
        exec(cmd, { maxBuffer: 200 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP DEBUG] Audio download error:', error.message);
                reject(new Error('Failed to download audio'));
                return;
            }
            
            if (stderr) {
                console.log('[DLP DEBUG] yt-dlp stderr:', stderr);
            }
            
            // Find the downloaded file
            const files = fs.readdirSync(tempDir);
            console.log(`[DLP DEBUG] Files in temp dir: ${files.join(', ')}`);
            
            if (files.length === 0) {
                reject(new Error('No audio file downloaded'));
                return;
            }
            
            const audioFile = path.join(tempDir, files[0]);
            const stats = fs.statSync(audioFile);
            console.log(`[DLP DEBUG] Audio file size: ${stats.size} bytes`);
            
            resolve({
                path: audioFile,
                filename: files[0],
                size: stats.size,
                tempDir: tempDir
            });
        });
    });
}

async function downloadMedia(url, qualityInfo) {
    console.log(`[DLP DEBUG] downloadMedia called with quality: ${qualityInfo.name}`);
    
    if (qualityInfo.name === 'mp3') {
        return await downloadAudioOnly(url);
    } else {
        return await downloadAndMergeVideo(url, qualityInfo);
    }
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
    aliases: ['download', 'vd'],
    description: 'Download videos/audio from any supported website',
    usage: '.dlp <url>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        console.log('[DLP DEBUG] ========== COMMAND EXECUTION START ==========');
        console.log(`[DLP DEBUG] Command executed by: ${sender}`);
        console.log(`[DLP DEBUG] Args: ${JSON.stringify(args)}`);
        
        if (args.length === 0) {
            return reply(`🎬 *Universal Media Downloader*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}dlp <url>\` - Download from any site\n\n` +
                       `*Supported Sites:*\n` +
                       `• YouTube, Instagram, Twitter, Facebook, TikTok\n` +
                       `• Reddit, Twitch, Vimeo, Dailymotion\n` +
                       `• And 1000+ more sites`);
        }
        
        const url = args[0];
        console.log(`[DLP DEBUG] URL: ${url}`);
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            console.log('[DLP DEBUG] Invalid URL format');
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        console.log('[DLP DEBUG] Processing message sent');
        
        try {
            if (!cookiesPath || !fs.existsSync(cookiesPath)) {
                console.log('[DLP DEBUG] Cookies not found, downloading...');
                await downloadCookies();
            } else {
                console.log(`[DLP DEBUG] Cookies found at: ${cookiesPath}`);
            }
            
            console.log('[DLP DEBUG] Fetching video info...');
            const videoInfo = await getAvailableQualities(url);
            console.log('[DLP DEBUG] Video info fetched successfully');
            
            if (!videoInfo.qualities || videoInfo.qualities.length === 0) {
                console.log('[DLP DEBUG] No qualities found');
                await sock.sendMessage(from, {
                    text: `❌ No downloadable formats found for this URL.`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
            
            console.log(`[DLP DEBUG] Qualities available: ${videoInfo.qualities.map(q => q.name).join(', ')}`);
            
            // Clear any existing sessions
            const existingSessions = sessionManager.getUserSessions(sender, from);
            for (const sess of existingSessions) {
                if (sess.command === 'dlp') {
                    console.log(`[DLP DEBUG] Clearing existing session: ${sess.id}`);
                    sessionManager.clearSession(sess.id);
                }
            }
            
            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                videoInfo: videoInfo,
                step: 'selecting_quality'
            });
            
            console.log(`[DLP DEBUG] Session created: ${session.id}`);
            
            const sessionId = session.id.split(':').pop();
            console.log(`[DLP DEBUG] Session ID: ${sessionId}`);
            
            if (videoInfo.thumbnail) {
                try {
                    console.log('[DLP DEBUG] Sending thumbnail...');
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n\n` +
                                 `⏱️ Duration: ${formatDuration(videoInfo.duration)}\n` +
                                 `👤 Uploader: ${videoInfo.uploader || 'Unknown'}`
                    }, { quoted: msg });
                } catch (thumbErr) {
                    console.log('[DLP DEBUG] Thumbnail send failed:', thumbErr.message);
                }
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
                    text: buttonText.length > 30 ? buttonText.substring(0, 27) + '...' : buttonText
                });
            }
            
            buttons.push({ id: 'cancel', text: '❌ Cancel' });
            
            console.log('[DLP DEBUG] Sending quality selection menu...');
            
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
            
            console.log(`[DLP DEBUG] Buttons sent, message ID: ${sentMsg.key.id}`);
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
            await react('✅');
            console.log('[DLP DEBUG] ========== COMMAND EXECUTION END ==========');
            
        } catch (error) {
            console.error('[DLP DEBUG] Error in execute:', error);
            await sock.sendMessage(from, {
                text: `❌ *Failed to process URL*\n\nError: ${error.message}`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        console.log('[DLP DEBUG] ========== HANDLE SESSION START ==========');
        console.log(`[DLP DEBUG] Session ID: ${session.id}`);
        console.log(`[DLP DEBUG] Is button click: ${isButtonClick}`);
        console.log(`[DLP DEBUG] Session data:`, JSON.stringify(session.data, null, 2));
        
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
                console.log(`[DLP DEBUG] Button from buttonsResponseMessage: ID=${buttonId}, Text=${buttonText}`);
            } else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                    console.log(`[DLP DEBUG] Button from listResponseMessage: ID=${buttonId}, Text=${buttonText}`);
                }
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                        console.log(`[DLP DEBUG] Button from interactiveResponseMessage: ID=${buttonId}, Text=${buttonText}`);
                    } catch (e) {
                        console.log(`[DLP DEBUG] Failed to parse interactive response:`, e);
                    }
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
                console.log(`[DLP DEBUG] Button from templateButtonReplyMessage: ID=${buttonId}, Text=${buttonText}`);
            }
            
            if (buttonId === 'cancel' || buttonId?.includes('cancel')) {
                console.log('[DLP DEBUG] Cancel button clicked');
                sessionManager.clearSession(session.id);
                await reply(`❌ Download cancelled.`);
                return true;
            }
            
            if (buttonId && buttonId.startsWith('dlp_qual_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[3]);
                console.log(`[DLP DEBUG] Quality button clicked, index: ${index}`);
                
                const qualities = session.data.videoInfo.qualities;
                console.log(`[DLP DEBUG] Available qualities: ${qualities.length}`);
                
                if (!isNaN(index) && index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    console.log(`[DLP DEBUG] Selected quality: ${JSON.stringify(selectedQuality)}`);
                    
                    sessionManager.updateSession(sender, from, {
                        step: 'downloading',
                        selectedQuality: selectedQuality
                    });
                    
                    await react('⬇️');
                    const processingMsg = await reply(`📥 *Downloading ${selectedQuality.name}...*\n\nPlease wait, this may take a few moments...`);
                    console.log('[DLP DEBUG] Download started...');
                    
                    try {
                        const result = await downloadMedia(session.data.url, selectedQuality);
                        console.log(`[DLP DEBUG] Download completed! File size: ${result.size} bytes`);
                        console.log(`[DLP DEBUG] File path: ${result.path}`);
                        console.log(`[DLP DEBUG] File valid: ${result.isValid !== undefined ? result.isValid : 'N/A'}`);
                        
                        const fileSize = formatFileSize(result.size);
                        const caption = `✅ *Download Complete!*\n\n` +
                                      `🎬 *Title:* ${session.data.videoInfo.title || 'Video'}\n` +
                                      `📹 *Quality:* ${selectedQuality.name}\n` +
                                      `📊 *Size:* ${fileSize}\n\n` +
                                      `> *Downloaded by ${config.botName}*`;
                        
                        const isVideo = selectedQuality.name !== 'mp3';
                        const mimetype = isVideo ? 'video/mp4' : 'audio/mpeg';
                        
                        console.log(`[DLP DEBUG] Sending ${isVideo ? 'video' : 'audio'} to chat...`);
                        console.log(`[DLP DEBUG] Mimetype: ${mimetype}`);
                        
                        // Read file and log first few bytes for debugging
                        const fileBuffer = fs.readFileSync(result.path);
                        console.log(`[DLP DEBUG] File buffer size: ${fileBuffer.length} bytes`);
                        console.log(`[DLP DEBUG] First 20 bytes: ${fileBuffer.slice(0, 20).toString('hex')}`);
                        
                        if (isVideo) {
                            await sock.sendMessage(from, {
                                video: fileBuffer,
                                mimetype: mimetype,
                                caption: caption
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, {
                                audio: fileBuffer,
                                mimetype: mimetype,
                                caption: caption,
                                ptt: false
                            }, { quoted: msg });
                        }
                        
                        console.log('[DLP DEBUG] File sent successfully');
                        
                        // Clean up temp files
                        try {
                            if (fs.existsSync(result.path)) {
                                fs.unlinkSync(result.path);
                                console.log(`[DLP DEBUG] Deleted: ${result.path}`);
                            }
                            if (fs.existsSync(result.tempDir)) {
                                fs.rmSync(result.tempDir, { recursive: true, force: true });
                                console.log(`[DLP DEBUG] Deleted temp dir: ${result.tempDir}`);
                            }
                        } catch (cleanErr) {
                            console.error('[DLP DEBUG] Cleanup error:', cleanErr);
                        }
                        
                        await sock.sendMessage(from, {
                            text: `✅ *Download Complete!*`,
                            edit: processingMsg.key
                        });
                        
                        await react('✅');
                        sessionManager.clearSession(session.id);
                        console.log('[DLP DEBUG] Session cleared');
                        
                    } catch (downloadError) {
                        console.error('[DLP DEBUG] Download error:', downloadError);
                        console.error('[DLP DEBUG] Error stack:', downloadError.stack);
                        await sock.sendMessage(from, {
                            text: `❌ *Download failed*\n\nError: ${downloadError.message}\n\nPlease try again or select a different quality.`,
                            edit: processingMsg.key
                        });
                        await react('❌');
                    }
                } else {
                    console.log(`[DLP DEBUG] Invalid index: ${index}, qualities length: ${qualities.length}`);
                }
                return true;
            }
        }
        
        console.log('[DLP DEBUG] ========== HANDLE SESSION END ==========');
        return true;
    }
};
