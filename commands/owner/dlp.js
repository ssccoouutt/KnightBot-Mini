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
        // First, list all formats to see what's available
        const listCmd = `yt-dlp --cookies "${cookiesPath}" --list-formats "${url}" 2>&1`;
        
        console.log('[DLP] Listing available formats...');
        
        exec(listCmd, { maxBuffer: 50 * 1024 * 1024 }, (listError, listStdout, listStderr) => {
            const output = listStdout + listStderr;
            console.log('[DLP] Format list output:', output.substring(0, 500));
            
            // Now get JSON info without format restrictions
            const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
            const infoCmd = `yt-dlp ${cookieArg} --no-warnings --ignore-errors --dump-json "${url}"`;
            
            console.log('[DLP] Fetching video info with command:', infoCmd);
            
            exec(infoCmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('[DLP] yt-dlp error:', error.message);
                    console.error('[DLP] stderr:', stderr);
                    
                    // Try to extract info from list output if JSON fails
                    if (output.includes('ID') && output.includes('EXT')) {
                        console.log('[DLP] Falling back to format list parsing...');
                        parseFormatList(output, url, resolve, reject);
                        return;
                    }
                    
                    reject(new Error('Failed to fetch video info: ' + error.message));
                    return;
                }
                
                try {
                    const info = JSON.parse(stdout);
                    console.log('[DLP] Video title:', info.title);
                    console.log('[DLP] Duration:', info.duration);
                    console.log('[DLP] Total formats:', info.formats?.length || 0);
                    
                    const formats = info.formats || [];
                    const qualities = new Map();
                    
                    // Process video formats
                    for (const format of formats) {
                        if (format.vcodec !== 'none') {
                            const height = format.height || 0;
                            const quality = height >= 2160 ? '4K' :
                                           height >= 1440 ? '2K' :
                                           height >= 1080 ? '1080p' :
                                           height >= 720 ? '720p' :
                                           height >= 480 ? '480p' :
                                           height >= 360 ? '360p' :
                                           height >= 240 ? '240p' : 
                                           height > 0 ? `${height}p` : 'Unknown';
                            
                            const hasAudio = format.acodec !== 'none';
                            const filesize = format.filesize || format.filesize_approx || 0;
                            
                            if (!qualities.has(quality) || (height > (qualities.get(quality)?.height || 0))) {
                                qualities.set(quality, {
                                    formatId: format.format_id,
                                    height: height,
                                    ext: format.ext,
                                    filesize: filesize,
                                    vcodec: format.vcodec,
                                    acodec: format.acodec,
                                    hasAudio: hasAudio,
                                    tbr: format.tbr || 0
                                });
                            }
                        }
                    }
                    
                    // Add audio-only option if available
                    const audioFormats = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
                    if (audioFormats.length > 0) {
                        qualities.set('mp3', {
                            formatId: 'bestaudio',
                            height: 0,
                            ext: 'mp3',
                            filesize: audioFormats[0].filesize || 0,
                            vcodec: 'none',
                            acodec: 'mp4a',
                            hasAudio: true
                        });
                    }
                    
                    // Sort qualities by height
                    const qualityOrder = ['4K', '2K', '1080p', '720p', '480p', '360p', '240p', '144p', 'Unknown', 'mp3'];
                    const sortedQualities = [];
                    
                    for (const q of qualityOrder) {
                        if (qualities.has(q)) {
                            const qualInfo = qualities.get(q);
                            sortedQualities.push({
                                name: q,
                                ...qualInfo
                            });
                        }
                    }
                    
                    if (sortedQualities.length === 0) {
                        reject(new Error('No downloadable formats found'));
                        return;
                    }
                    
                    console.log('[DLP] Available qualities:', sortedQualities.map(q => `${q.name} (${q.height}p, hasAudio:${q.hasAudio})`));
                    
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
    });
}

function parseFormatList(output, url, resolve, reject) {
    try {
        const lines = output.split('\n');
        const qualities = new Map();
        let title = 'Unknown Video';
        
        // Try to extract title
        const titleMatch = output.match(/title:\s*(.+)/i);
        if (titleMatch) title = titleMatch[1].trim();
        
        // Parse format lines
        for (const line of lines) {
            // Look for format lines with resolution
            const formatMatch = line.match(/^\s*(\d+)\s+(\w+)\s+(\d+x\d+|\w+)\s+(\d+)kbps/i);
            if (formatMatch) {
                const formatId = formatMatch[1];
                const ext = formatMatch[2];
                const resolution = formatMatch[3];
                const bitrate = formatMatch[4];
                
                let height = 0;
                if (resolution.includes('x')) {
                    height = parseInt(resolution.split('x')[1]);
                }
                
                const quality = height >= 2160 ? '4K' :
                               height >= 1440 ? '2K' :
                               height >= 1080 ? '1080p' :
                               height >= 720 ? '720p' :
                               height >= 480 ? '480p' :
                               height >= 360 ? '360p' :
                               height >= 240 ? '240p' : 
                               height > 0 ? `${height}p` : resolution;
                
                if (height > 0 && !qualities.has(quality)) {
                    qualities.set(quality, {
                        formatId: formatId,
                        height: height,
                        ext: ext,
                        filesize: 0,
                        vcodec: 'h264',
                        acodec: 'aac',
                        hasAudio: true
                    });
                }
            }
        }
        
        // Add audio-only fallback
        qualities.set('mp3', {
            formatId: 'bestaudio',
            height: 0,
            ext: 'mp3',
            filesize: 0,
            vcodec: 'none',
            acodec: 'mp4a',
            hasAudio: true
        });
        
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
        
        if (sortedQualities.length === 0) {
            reject(new Error('No downloadable formats found'));
            return;
        }
        
        console.log('[DLP] Available qualities (from list):', sortedQualities.map(q => q.name));
        
        resolve({
            title: title,
            duration: 0,
            thumbnail: null,
            webpage_url: url,
            uploader: 'Unknown',
            qualities: sortedQualities
        });
        
    } catch (err) {
        reject(new Error('Failed to parse format list: ' + err.message));
    }
}

async function downloadMedia(url, qualityInfo) {
    const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');
    
    return new Promise((resolve, reject) => {
        let cmd;
        const cookieArg = (cookiesPath && fs.existsSync(cookiesPath)) ? `--cookies "${cookiesPath}"` : '';
        
        if (qualityInfo.name === 'mp3') {
            // Audio-only download
            cmd = `yt-dlp ${cookieArg} -f bestaudio -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`;
            console.log('[DLP] Downloading as MP3...');
        } else {
            // Try to download best format for this quality
            const formatSpec = qualityInfo.formatId;
            cmd = `yt-dlp ${cookieArg} -f "${formatSpec}+bestaudio[ext=m4a]/best[height<=${qualityInfo.height}]" --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;
            console.log('[DLP] Download command:', cmd);
        }
        
        exec(cmd, { maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Download error:', error.message);
                console.error('[DLP] stderr:', stderr);
                
                // Fallback: Try simple download without format specification
                console.log('[DLP] Retrying with best format...');
                const fallbackCmd = `yt-dlp ${cookieArg} -f best -o "${outputTemplate}" "${url}"`;
                
                exec(fallbackCmd, { maxBuffer: 100 * 1024 * 1024 }, (fallbackError, fallbackStdout, fallbackStderr) => {
                    if (fallbackError) {
                        try {
                            if (fs.existsSync(tempDir)) {
                                fs.rmSync(tempDir, { recursive: true, force: true });
                            }
                        } catch (e) {}
                        reject(new Error(`Download failed: ${fallbackError.message}`));
                        return;
                    }
                    
                    processDownloadedFile(tempDir, resolve, reject);
                });
                return;
            }
            
            processDownloadedFile(tempDir, resolve, reject);
        });
    });
}

function processDownloadedFile(tempDir, resolve, reject) {
    try {
        const files = fs.readdirSync(tempDir);
        console.log('[DLP] Files in temp dir:', files);
        
        if (files.length === 0) {
            reject(new Error('No file downloaded'));
            return;
        }
        
        // Find video/mp4 file or audio file
        let downloadedFile = null;
        for (const file of files) {
            if (file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.webm')) {
                downloadedFile = path.join(tempDir, file);
                break;
            } else if (file.endsWith('.mp3') && !downloadedFile) {
                downloadedFile = path.join(tempDir, file);
            }
        }
        
        if (!downloadedFile) {
            downloadedFile = path.join(tempDir, files[0]);
        }
        
        const stats = fs.statSync(downloadedFile);
        console.log('[DLP] Downloaded file:', downloadedFile);
        console.log('[DLP] File size:', stats.size, 'bytes');
        
        resolve({
            path: downloadedFile,
            filename: path.basename(downloadedFile),
            size: stats.size,
            tempDir: tempDir
        });
    } catch (err) {
        console.error('[DLP] File locate error:', err);
        reject(new Error(`Failed to locate downloaded file: ${err.message}`));
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
    aliases: ['download', 'get'],
    description: 'Download videos/audio from any supported website',
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
                       `• YouTube, Instagram, Twitter, Facebook, TikTok\n` +
                       `• Reddit, Twitch, Vimeo, Dailymotion\n` +
                       `• And 1000+ more sites\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}dlp https://youtu.be/xxxxx\`\n` +
                       `• \`${config.prefix}dlp https://www.instagram.com/reel/xxxxx\``);
        }
        
        const url = args[0];
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            if (!cookiesPath || !fs.existsSync(cookiesPath)) {
                console.log('[DLP] Downloading cookies...');
                await downloadCookies();
            }
            
            console.log('[DLP] Getting video info for:', url);
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
            
            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n\n` +
                                 `⏱️ Duration: ${formatDuration(videoInfo.duration)}\n` +
                                 `👤 Uploader: ${videoInfo.uploader || 'Unknown'}`
                    }, { quoted: msg });
                } catch (thumbErr) {
                    console.log('[DLP] Thumbnail error:', thumbErr.message);
                }
            }
            
            const buttons = [];
            for (let i = 0; i < videoInfo.qualities.length; i++) {
                const q = videoInfo.qualities[i];
                let buttonText = q.name;
                if (q.filesize && q.filesize > 0) {
                    buttonText += ` (${formatFileSize(q.filesize)})`;
                }
                buttons.push({
                    id: `dlp_qual_${sessionId}_${i}`,
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
            let buttonText = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
                console.log('[DLP] Button click:', buttonId, buttonText);
            } else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                    console.log('[DLP] List button:', buttonId, buttonText);
                }
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                        console.log('[DLP] Interactive button:', buttonId, buttonText);
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
                console.log('[DLP] Template button:', buttonId, buttonText);
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
                
                console.log('[DLP] Selected index:', index);
                console.log('[DLP] Selected quality:', qualities[index]?.name);
                
                if (!isNaN(index) && index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    
                    sessionManager.updateSession(sender, from, {
                        step: 'downloading',
                        selectedQuality: selectedQuality
                    });
                    
                    await react('⬇️');
                    const processingMsg = await reply(`📥 *Downloading ${selectedQuality.name}...*\n\nPlease wait, this may take a few moments...`);
                    
                    try {
                        const result = await downloadMedia(session.data.url, selectedQuality);
                        
                        const fileSize = formatFileSize(result.size);
                        console.log('[DLP] Download complete! File:', result.path);
                        console.log('[DLP] File size:', result.size);
                        
                        const isVideo = selectedQuality.name !== 'mp3';
                        const caption = `✅ *Download Complete!*\n\n` +
                                      `🎬 *Title:* ${session.data.videoInfo.title || 'Video'}\n` +
                                      `📹 *Quality:* ${selectedQuality.name}\n` +
                                      `📊 *Size:* ${fileSize}\n\n` +
                                      `> *Downloaded by ${config.botName}*`;
                        
                        const fileBuffer = fs.readFileSync(result.path);
                        const fileExtension = path.extname(result.filename) || (isVideo ? '.mp4' : '.mp3');
                        const fileName = `${(session.data.videoInfo.title || 'video').replace(/[^a-zA-Z0-9._-]/g, '_')}_${selectedQuality.name}${fileExtension}`;
                        
                        console.log('[DLP] Sending file:', fileName);
                        
                        await sock.sendMessage(from, {
                            document: fileBuffer,
                            mimetype: isVideo ? 'video/mp4' : 'audio/mpeg',
                            fileName: fileName,
                            caption: caption
                        }, { quoted: msg });
                        
                        // Clean up temp files
                        try {
                            if (fs.existsSync(result.path)) fs.unlinkSync(result.path);
                            if (fs.existsSync(result.tempDir)) fs.rmdirSync(result.tempDir, { recursive: true });
                        } catch (cleanErr) {}
                        
                        await sock.sendMessage(from, {
                            text: `✅ *Download Complete!*`,
                            edit: processingMsg.key
                        });
                        
                        await react('✅');
                        sessionManager.clearSession(session.id);
                        
                    } catch (downloadError) {
                        console.error('[DLP] Download error:', downloadError);
                        await sock.sendMessage(from, {
                            text: `❌ *Download failed*\n\nError: ${downloadError.message}\n\nPlease try again.`,
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