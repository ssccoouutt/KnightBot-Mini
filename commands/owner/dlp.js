/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Works for YouTube, Facebook, Instagram, Twitter, TikTok, and 1000+ sites
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

let setupComplete = false;
let setupInProgress = false;

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

async function getAllFormats(url) {
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
                const seenResolutions = new Set();
                
                // Collect best format per resolution (with both video and audio)
                for (const fmt of formats) {
                    const height = fmt.height || 0;
                    if (height === 0) continue;
                    
                    const filesize = fmt.filesize || fmt.filesize_approx || 0;
                    const sizeText = formatFileSize(filesize);
                    const vcodec = fmt.vcodec || 'none';
                    const acodec = fmt.acodec || 'none';
                    
                    // Only include formats that can be converted to playable MP4
                    if (vcodec !== 'none') {
                        if (!seenResolutions.has(height)) {
                            seenResolutions.add(height);
                            
                            let qualityName = '';
                            if (height >= 2160) qualityName = '4K';
                            else if (height >= 1440) qualityName = '2K';
                            else if (height >= 1080) qualityName = '1080p';
                            else if (height >= 720) qualityName = '720p';
                            else if (height >= 480) qualityName = '480p';
                            else if (height >= 360) qualityName = '360p';
                            else if (height >= 240) qualityName = '240p';
                            else qualityName = `${height}p`;
                            
                            let label;
                            if (acodec !== 'none') {
                                label = `${qualityName}${sizeText !== 'Unknown' ? ` (${sizeText})` : ''}`;
                            } else {
                                label = `📹 ${qualityName} (video only)${sizeText !== 'Unknown' ? ` - ${sizeText}` : ''}`;
                            }
                            
                            allFormats.push({
                                id: fmt.format_id,
                                label: label,
                                height: height,
                                filesize: filesize,
                                hasAudio: acodec !== 'none',
                                format: fmt
                            });
                        }
                    }
                }
                
                // Sort by height (highest first)
                allFormats.sort((a, b) => b.height - a.height);
                
                // Add Audio-only options
                for (const fmt of formats) {
                    if (fmt.vcodec === 'none' && fmt.acodec !== 'none') {
                        const filesize = fmt.filesize || fmt.filesize_approx || 0;
                        const sizeText = formatFileSize(filesize);
                        const bitrate = fmt.abr || 0;
                        const label = `🎵 Audio ${bitrate}kbps${sizeText !== 'Unknown' ? ` (${sizeText})` : ''}`;
                        
                        allFormats.push({
                            id: fmt.format_id,
                            label: label,
                            height: 0,
                            filesize: filesize,
                            hasAudio: true,
                            isAudioOnly: true,
                            format: fmt
                        });
                    }
                }
                
                // Add Best Quality option
                allFormats.unshift({
                    id: 'best',
                    label: '🎯 Best Quality',
                    height: 9999,
                    filesize: 0,
                    hasAudio: true,
                    isBest: true
                });
                
                resolve({
                    formats: allFormats,
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

async function downloadAndConvertVideo(url, formatInfo, tempDir) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(tempDir, 'output.mp4');
        
        let cmd;
        
        if (formatInfo.isBest) {
            // Download best quality and convert to playable MP4
            cmd = `yt-dlp -f best -o "${tempDir}/video.%(ext)s" "${url}" && ffmpeg -i "${tempDir}/video.*" -c:v libx264 -c:a aac -movflags +faststart "${outputPath}" -y`;
        } else if (formatInfo.isAudioOnly) {
            // Audio only
            cmd = `yt-dlp -f "${formatInfo.id}" -x --audio-format mp3 --audio-quality 0 -o "${tempDir}/audio.%(ext)s" "${url}"`;
        } else if (!formatInfo.hasAudio) {
            // Video only - download and add audio
            cmd = `yt-dlp -f "${formatInfo.id}" -o "${tempDir}/video.%(ext)s" "${url}" && yt-dlp -f bestaudio -x --audio-format m4a -o "${tempDir}/audio.%(ext)s" "${url}" && ffmpeg -i "${tempDir}/video.*" -i "${tempDir}/audio.*" -c:v libx264 -c:a aac -movflags +faststart "${outputPath}" -y`;
        } else {
            // Format has both video and audio - convert to playable MP4
            cmd = `yt-dlp -f "${formatInfo.id}" -o "${tempDir}/input.%(ext)s" "${url}" && ffmpeg -i "${tempDir}/input.*" -c:v libx264 -c:a aac -movflags +faststart "${outputPath}" -y`;
        }
        
        console.log('[DLP] Running command:', cmd);
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Error:', stderr);
                // Fallback: try direct download without conversion
                const fallbackCmd = `yt-dlp -f best -o "${outputPath}" "${url}"`;
                exec(fallbackCmd, { maxBuffer: 500 * 1024 * 1024 }, (fallbackError) => {
                    if (fallbackError) {
                        reject(new Error(stderr || 'Download failed'));
                    } else {
                        resolve(outputPath);
                    }
                });
            } else {
                // Check if output file exists
                if (fs.existsSync(outputPath)) {
                    resolve(outputPath);
                } else {
                    // Try to find any downloaded file
                    const files = fs.readdirSync(tempDir);
                    const videoFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
                    if (videoFile) {
                        resolve(path.join(tempDir, videoFile));
                    } else {
                        reject(new Error('No output file found'));
                    }
                }
            }
        });
    });
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').substring(0, 50);
}

// ==================== COMMAND ====================

module.exports = {
    name: 'dlp',
    aliases: ['download', 'get'],
    category: 'media',
    description: 'Download videos/audio from any site (YouTube, Facebook, Instagram, Twitter, TikTok, etc.)',
    usage: '.dlp <url>',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *Universal Media Downloader*\n\n` +
                       `*Usage:* \`${config.prefix}dlp <url>\`\n\n` +
                       `*Supported:* YouTube, Facebook, Instagram, Twitter, TikTok, Reddit, Twitch, Vimeo, Dailymotion\n` +
                       `*First run auto-installs dependencies*`);
        }
        
        const url = args[0];
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        
        if (!setupComplete) {
            const setupMsg = await reply(`⚙️ *Setting up...*`);
            const setupSuccess = await runSetup();
            if (!setupSuccess) {
                await sock.sendMessage(from, { text: `❌ *Setup failed*`, edit: setupMsg.key });
                await react('❌');
                return;
            }
            await sock.sendMessage(from, { text: `✅ *Ready!*`, edit: setupMsg.key });
        }
        
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            const { formats, title, duration, thumbnail } = await getAllFormats(url);
            
            if (!formats || formats.length === 0) {
                throw new Error('No formats found');
            }
            
            // Clear old sessions
            const existingSessions = sessionManager.getUserSessions(sender, from);
            for (const sess of existingSessions) {
                if (sess.command === 'dlp') {
                    sessionManager.clearSession(sess.id);
                }
            }
            
            // Create session
            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                formats: formats,
                title: title
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Send thumbnail
            if (thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: thumbnail },
                        caption: `🎬 *${title || 'Video'}*\n⏱️ Duration: ${formatDuration(duration)}`
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            // Create format buttons
            const buttons = [];
            for (let i = 0; i < Math.min(formats.length, 12); i++) {
                const fmt = formats[i];
                let buttonText = fmt.label;
                if (buttonText.length > 35) {
                    buttonText = buttonText.substring(0, 32) + '...';
                }
                buttons.push({
                    id: `dlp_fmt_${sessionId}_${i}`,
                    text: buttonText
                });
            }
            buttons.push({ id: `dlp_cancel_${sessionId}`, text: '❌ Cancel' });
            
            const infoMsg = `📥 *Available Formats*\n\n` +
                           `🎬 *Title:* ${title || 'Unknown'}\n` +
                           `📊 *Formats:* ${formats.length}\n\n` +
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
                text: `❌ *Failed*\n\nError: ${error.message}`,
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
            
            if (!buttonId) return true;
            
            // Handle Cancel
            if (buttonId.includes('dlp_cancel_')) {
                sessionManager.clearSession(session.id);
                await reply(`❌ Cancelled.`);
                return true;
            }
            
            // Handle Format Selection
            if (buttonId.includes('dlp_fmt_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[parts.length - 1]);
                const selectedFormat = session.data.formats[index];
                
                if (!selectedFormat) return true;
                
                await react('⬇️');
                const processingMsg = await reply(`📥 *Downloading...*\n\nFormat: ${selectedFormat.label}\n\nPlease wait...`);
                
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                try {
                    const downloadedFile = await downloadAndConvertVideo(session.data.url, selectedFormat, tempDir);
                    
                    const fileBuffer = fs.readFileSync(downloadedFile);
                    const fileSizeMB = fileBuffer.length / (1024 * 1024);
                    const isMp3 = selectedFormat.isAudioOnly;
                    
                    let fileName = sanitizeFilename(session.data.title || 'video');
                    if (isMp3) {
                        fileName = `${fileName}.mp3`;
                    } else {
                        fileName = `${fileName}.mp4`;
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