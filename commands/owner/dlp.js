/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Shows all available formats with sizes, handles YouTube video-only+audio merging
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

const FORCE_AI_MODE = true;

let setupComplete = false;
let setupInProgress = false;

// Store download managers
const downloadManagers = new Map();

// ==================== AUTO SETUP ====================

async function ensureYtDlpInstalled() {
    return new Promise((resolve) => {
        exec('yt-dlp --version', (error) => {
            if (!error) { resolve(true); return; }
            exec('pip install -q yt-dlp', (installError) => {
                resolve(!installError);
            });
        });
    });
}

async function ensureFfmpegInstalled() {
    return new Promise((resolve) => {
        exec('ffmpeg -version', (error) => {
            if (!error) { resolve(true); return; }
            exec('apt-get update -qq && apt-get install -y -qq ffmpeg', { timeout: 60000 }, (installError) => {
                resolve(!installError);
            });
        });
    });
}

async function runSetup() {
    if (setupComplete || setupInProgress) return setupComplete;
    setupInProgress = true;
    try {
        await ensureYtDlpInstalled();
        await ensureFfmpegInstalled();
        setupComplete = true;
    } catch (e) {}
    setupInProgress = false;
    return setupComplete;
}

// ==================== FORMAT EXTRACTION ====================

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
}

function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

async function getAvailableFormats(url) {
    return new Promise((resolve, reject) => {
        const cmd = `yt-dlp --no-warnings --dump-json "${url}" 2>&1`;
        
        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            
            try {
                const info = JSON.parse(stdout);
                const formats = info.formats || [];
                const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
                
                const allFormats = [];
                
                // First, collect video formats
                for (const fmt of formats) {
                    const height = fmt.height || 0;
                    const filesize = fmt.filesize || fmt.filesize_approx || 0;
                    const sizeText = formatFileSize(filesize);
                    const formatId = fmt.format_id;
                    const vcodec = fmt.vcodec || 'none';
                    const acodec = fmt.acodec || 'none';
                    const hasAudio = acodec !== 'none';
                    const isVideoOnly = vcodec !== 'none' && acodec === 'none';
                    
                    if (vcodec !== 'none') {
                        let qualityName = '';
                        if (height >= 2160) qualityName = '4K';
                        else if (height >= 1440) qualityName = '2K';
                        else if (height >= 1080) qualityName = '1080p';
                        else if (height >= 720) qualityName = '720p';
                        else if (height >= 480) qualityName = '480p';
                        else if (height >= 360) qualityName = '360p';
                        else if (height >= 240) qualityName = '240p';
                        else if (height > 0) qualityName = `${height}p`;
                        else continue;
                        
                        let label;
                        if (isYoutube && isVideoOnly) {
                            label = `📹 ${qualityName} (video only) ${sizeText !== 'Unknown' ? `- ${sizeText}` : ''}`;
                        } else {
                            label = `${qualityName} ${sizeText !== 'Unknown' ? `- ${sizeText}` : ''}`;
                        }
                        
                        allFormats.push({
                            id: formatId,
                            label: label,
                            height: height,
                            filesize: filesize,
                            sizeText: sizeText,
                            isVideoOnly: isVideoOnly,
                            hasAudio: hasAudio
                        });
                    }
                }
                
                // Sort by height (highest first)
                allFormats.sort((a, b) => b.height - a.height);
                
                // Remove duplicates (keep best quality per resolution)
                const uniqueFormats = [];
                const seenHeights = new Set();
                for (const fmt of allFormats) {
                    if (!seenHeights.has(fmt.height)) {
                        seenHeights.add(fmt.height);
                        uniqueFormats.push(fmt);
                    }
                }
                
                // Add audio-only formats for YouTube
                if (isYoutube) {
                    for (const fmt of formats) {
                        if (fmt.vcodec === 'none' && fmt.acodec !== 'none') {
                            const filesize = fmt.filesize || fmt.filesize_approx || 0;
                            const sizeText = formatFileSize(filesize);
                            const bitrate = fmt.abr || 0;
                            const label = `🎵 Audio ${bitrate}kbps ${sizeText !== 'Unknown' ? `- ${sizeText}` : ''}`;
                            
                            uniqueFormats.push({
                                id: fmt.format_id,
                                label: label,
                                height: 0,
                                filesize: filesize,
                                sizeText: sizeText,
                                isVideoOnly: false,
                                hasAudio: true,
                                isAudioOnly: true
                            });
                        }
                    }
                }
                
                // Add Best Quality option
                uniqueFormats.unshift({
                    id: 'best',
                    label: '🎯 Best Quality',
                    height: 9999,
                    filesize: 0,
                    sizeText: 'Unknown',
                    isVideoOnly: false,
                    hasAudio: true
                });
                
                // Add Smallest option
                uniqueFormats.push({
                    id: 'worst',
                    label: '📦 Smallest File',
                    height: 0,
                    filesize: 0,
                    sizeText: 'Unknown',
                    isVideoOnly: false,
                    hasAudio: true
                });
                
                resolve({
                    formats: uniqueFormats,
                    title: info.title,
                    duration: info.duration,
                    thumbnail: info.thumbnail,
                    isYoutube: isYoutube
                });
                
            } catch (e) {
                reject(new Error('Failed to parse video info'));
            }
        });
    });
}

async function downloadVideo(url, formatInfo, tempDir, isYoutube) {
    return new Promise((resolve, reject) => {
        let formatSpec;
        let cmd;
        
        if (formatInfo.id === 'best') {
            formatSpec = 'best';
        } else if (formatInfo.id === 'worst') {
            formatSpec = 'worst';
        } else if (isYoutube && formatInfo.isVideoOnly) {
            // For YouTube video-only formats, merge with best audio
            formatSpec = `${formatInfo.id}+bestaudio`;
            cmd = `yt-dlp -f "${formatSpec}" --merge-output-format mp4 -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;
        } else if (formatInfo.isAudioOnly) {
            formatSpec = formatInfo.id;
            cmd = `yt-dlp -f "${formatSpec}" -x --audio-format mp3 --audio-quality 0 -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;
        } else {
            formatSpec = formatInfo.id;
            cmd = `yt-dlp -f "${formatSpec}" -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;
        }
        
        if (!cmd) {
            cmd = `yt-dlp -f "${formatSpec}" -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;
        }
        
        console.log('[DLP] Downloading with format:', formatSpec);
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                // Fallback: try with best format
                const fallbackCmd = `yt-dlp -f best -o "${tempDir}/%(title)s.%(ext)s" "${url}"`;
                exec(fallbackCmd, { maxBuffer: 500 * 1024 * 1024 }, (fallbackError) => {
                    if (fallbackError) {
                        reject(new Error(stderr || 'Download failed'));
                    } else {
                        findAndResolveFile(tempDir, resolve, reject);
                    }
                });
            } else {
                findAndResolveFile(tempDir, resolve, reject);
            }
        });
    });
}

function findAndResolveFile(tempDir, resolve, reject) {
    try {
        const files = fs.readdirSync(tempDir);
        const mediaFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.webm') || f.endsWith('.mkv'));
        
        if (!mediaFile) {
            reject(new Error('No file downloaded'));
            return;
        }
        
        const filePath = path.join(tempDir, mediaFile);
        const stats = fs.statSync(filePath);
        
        if (stats.size < 1024) {
            reject(new Error('File too small (corrupted)'));
            return;
        }
        
        resolve(filePath);
    } catch (err) {
        reject(err);
    }
}

// ==================== COMMAND ====================

module.exports = {
    name: 'dlp',
    aliases: ['download', 'get'],
    category: 'media',
    description: 'Download videos/audio from YouTube and other sites',
    usage: '.dlp <url>',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *Universal Media Downloader*\n\n` +
                       `*Usage:* \`${config.prefix}dlp <url>\``);
        }
        
        const url = args[0];
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        
        if (!setupComplete) {
            const setupMsg = await reply(`⚙️ *Setting up...*\nInstalling dependencies...`);
            const setupSuccess = await runSetup();
            if (!setupSuccess) {
                await sock.sendMessage(from, {
                    text: `❌ *Setup failed*`,
                    edit: setupMsg.key
                });
                await react('❌');
                return;
            }
            await sock.sendMessage(from, { text: `✅ *Ready!*`, edit: setupMsg.key });
        }
        
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            const { formats, title, duration, thumbnail, isYoutube } = await getAvailableFormats(url);
            
            if (!formats || formats.length === 0) {
                throw new Error('No formats found');
            }
            
            // Store in download manager
            const managerId = `${sender}_${Date.now()}`;
            downloadManagers.set(managerId, {
                url: url,
                formats: formats,
                title: title,
                isYoutube: isYoutube,
                timestamp: Date.now()
            });
            
            // Clean up old managers (older than 5 minutes)
            for (const [id, manager] of downloadManagers) {
                if (Date.now() - manager.timestamp > 300000) {
                    downloadManagers.delete(id);
                }
            }
            
            // Send thumbnail
            if (thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: thumbnail },
                        caption: `🎬 *${title || 'Video'}*\n⏱️ Duration: ${formatDuration(duration)}`
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            // Create format buttons (show up to 12 formats)
            const buttons = [];
            for (let i = 0; i < Math.min(formats.length, 12); i++) {
                const fmt = formats[i];
                buttons.push({
                    id: `dlp_fmt_${managerId}_${i}`,
                    text: fmt.label.length > 30 ? fmt.label.substring(0, 27) + '...' : fmt.label
                });
            }
            buttons.push({ id: `dlp_cancel_${managerId}`, text: '❌ Cancel' });
            
            const infoMsg = `📥 *Available Formats*\n\n` +
                           `🎬 *Title:* ${title || 'Unknown'}\n` +
                           `📊 *Total Formats:* ${formats.length}\n\n` +
                           `Select a format to download:`;
            
            await sock.sendMessage(from, {
                text: infoMsg,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `Select download format:`,
                footer: 'Universal Downloader',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
            
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
            
            if (!buttonId) return true;
            
            // Cancel button
            if (buttonId.includes('dlp_cancel_')) {
                sessionManager.clearSession(session.id);
                await reply(`❌ Cancelled.`);
                return true;
            }
            
            // Format selection
            if (buttonId.includes('dlp_fmt_')) {
                const parts = buttonId.split('_');
                const managerId = parts[3];
                const index = parseInt(parts[4]);
                
                const manager = downloadManagers.get(managerId);
                if (!manager) {
                    await reply(`❌ *Session expired*\n\nPlease start again with \`.dlp ${manager?.url || 'url'}\``);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                const selectedFormat = manager.formats[index];
                if (!selectedFormat) return true;
                
                await react('⬇️');
                const processingMsg = await reply(`📥 *Downloading...*\n\nFormat: ${selectedFormat.label}\n\nPlease wait...`);
                
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                try {
                    const downloadedFile = await downloadVideo(manager.url, selectedFormat, tempDir, manager.isYoutube);
                    
                    const fileBuffer = fs.readFileSync(downloadedFile);
                    const fileSizeMB = fileBuffer.length / (1024 * 1024);
                    const fileExt = path.extname(downloadedFile);
                    const isMp3 = fileExt === '.mp3';
                    
                    let fileName = (manager.title || 'video').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                    if (selectedFormat.isAudioOnly || isMp3) {
                        fileName = `${fileName}.mp3`;
                    } else {
                        fileName = `${fileName}_${selectedFormat.label.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
                    }
                    
                    const caption = `✅ *Download Complete!*\n\n` +
                                   `📹 *Format:* ${selectedFormat.label}\n` +
                                   `📊 *Size:* ${fileSizeMB.toFixed(2)} MB\n\n` +
                                   `> *Downloaded by ${config.botName}*`;
                    
                    const SIZE_THRESHOLD_MB = 200;
                    const useDocument = fileSizeMB > SIZE_THRESHOLD_MB;
                    
                    if (useDocument) {
                        await sock.sendMessage(from, {
                            document: fileBuffer,
                            mimetype: isMp3 ? 'audio/mpeg' : 'video/mp4',
                            fileName: fileName,
                            caption: caption
                        }, { quoted: msg });
                    } else {
                        if (isMp3) {
                            await sock.sendMessage(from, {
                                audio: fileBuffer,
                                mimetype: 'audio/mpeg',
                                ptt: false,
                                caption: caption
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, {
                                video: fileBuffer,
                                mimetype: 'video/mp4',
                                caption: caption
                            }, { quoted: msg });
                        }
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
                    downloadManagers.delete(managerId);
                    sessionManager.clearSession(session.id);
                    
                } catch (error) {
                    console.error('[DLP] Download error:', error);
                    await sock.sendMessage(from, {
                        text: `❌ *Download failed*\n\nError: ${error.message}`,
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