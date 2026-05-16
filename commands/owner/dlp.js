/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * - Displays file size with each quality option
 * - Audio-only option (MP3)
 * - Files > 200MB sent as document, otherwise as media
 * - FIXED: Actually downloads the selected quality
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
    console.log('[DLP] Running setup...');
    try {
        await ensureYtDlpInstalled();
        await ensureDenoInstalled();
        await ensureFfmpegInstalled();
        setupComplete = true;
        setupInProgress = false;
        return true;
    } catch (error) {
        console.error('[DLP] Setup failed:', error);
        setupInProgress = false;
        return false;
    }
}

// ==================== HELPER FUNCTIONS ====================

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

function sanitizeFilename(filename) {
    let sanitized = filename.replace(/[^\w\s\u0600-\u06FF\u4e00-\u9fff]/g, '_');
    sanitized = sanitized.replace(/\s+/g, '_');
    sanitized = sanitized.replace(/_+/g, '_');
    if (sanitized.length > 80) sanitized = sanitized.substring(0, 80);
    return sanitized;
}

async function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const cmd = `yt-dlp --no-warnings --dump-json "${url}" 2>&1`;
        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error('Failed to parse video info'));
                }
            }
        });
    });
}

async function downloadMedia(url, quality, tempDir) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(tempDir, 'output.mp4');
        
        let cmd;
        if (quality.name === 'MP3') {
            cmd = `yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 0 -o "${outputPath}" "${url}"`;
        } else {
            // Extract the numeric height from quality name (e.g., "1080p" -> 1080)
            let height = quality.height;
            if (!height) {
                const match = quality.name.match(/(\d+)p/);
                if (match) height = parseInt(match[1]);
                else height = 720;
            }
            
            // Download specific quality
            cmd = `yt-dlp -f "bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
        }
        
        console.log('[DLP] Downloading with command:', cmd);
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Download error:', stderr);
                
                // Fallback: use format selector by format id if available
                if (quality.formatId) {
                    const fallbackCmd = `yt-dlp -f "${quality.formatId}+bestaudio" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
                    exec(fallbackCmd, { maxBuffer: 500 * 1024 * 1024 }, (fallbackError) => {
                        if (fallbackError) {
                            reject(new Error(stderr || 'Download failed'));
                        } else {
                            resolve(outputPath);
                        }
                    });
                } else {
                    reject(new Error(stderr || 'Download failed'));
                }
            } else {
                resolve(outputPath);
            }
        });
    });
}

async function validateFile(filePath) {
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) {
            resolve({ valid: false, reason: 'File not found' });
            return;
        }
        const stats = fs.statSync(filePath);
        if (stats.size < 1024) {
            resolve({ valid: false, reason: 'File too small (corrupted)' });
            return;
        }
        resolve({ valid: true, size: stats.size });
    });
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
            const setupMsg = await reply(`⚙️ *First time setup...*\nInstalling dependencies...`);
            const setupSuccess = await runSetup();
            if (!setupSuccess) {
                await sock.sendMessage(from, {
                    text: `❌ *Setup failed*\nPlease install manually: pip install -U yt-dlp && apt-get install ffmpeg`,
                    edit: setupMsg.key
                });
                await react('❌');
                return;
            }
            await sock.sendMessage(from, { text: `✅ *Setup complete!*`, edit: setupMsg.key });
        }
        
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            const videoInfo = await getVideoInfo(url);
            
            const formats = videoInfo.formats || [];
            const qualities = [];
            const seenHeights = new Set();
            
            // Collect unique qualities with their format IDs
            for (const format of formats) {
                if (format.vcodec !== 'none' && format.height && format.acodec !== 'none') {
                    const height = format.height;
                    let qualityName = '';
                    if (height >= 2160) qualityName = '4K';
                    else if (height >= 1440) qualityName = '2K';
                    else if (height >= 1080) qualityName = '1080p';
                    else if (height >= 720) qualityName = '720p';
                    else if (height >= 480) qualityName = '480p';
                    else if (height >= 360) qualityName = '360p';
                    else if (height >= 240) qualityName = '240p';
                    else qualityName = `${height}p`;
                    
                    if (!seenHeights.has(height)) {
                        seenHeights.add(height);
                        const fileSize = format.filesize || format.filesize_approx || 0;
                        qualities.push({ 
                            name: qualityName, 
                            height: height,
                            formatId: format.format_id,
                            size: fileSize,
                            sizeText: formatFileSize(fileSize)
                        });
                    }
                }
            }
            
            qualities.sort((a, b) => b.height - a.height);
            
            // Add Audio-only option
            qualities.push({ 
                name: 'MP3', 
                height: 0,
                formatId: null,
                size: 0,
                sizeText: 'Unknown'
            });
            
            if (qualities.length === 0) {
                throw new Error('No downloadable formats found');
            }
            
            const existingSessions = sessionManager.getUserSessions(sender, from);
            for (const sess of existingSessions) {
                if (sess.command === 'dlp') sessionManager.clearSession(sess.id);
            }
            
            const session = sessionManager.createSession(sender, from, 'dlp', {
                url: url,
                videoInfo: {
                    title: videoInfo.title,
                    duration: videoInfo.duration,
                    qualities: qualities
                }
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Send thumbnail
            if (videoInfo.thumbnail) {
                try {
                    const caption = `🎬 *${videoInfo.title || 'Video'}*\n` +
                                   `⏱️ Duration: ${formatDuration(videoInfo.duration)}\n` +
                                   `📥 Select quality to download:\n\n` +
                                   `> *Powered by ${config.botName}*`;
                    
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: caption
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            // Create buttons with sizes
            const buttons = [];
            for (let i = 0; i < Math.min(qualities.length, 6); i++) {
                const q = qualities[i];
                let buttonText = q.name;
                if (q.sizeText && q.sizeText !== 'Unknown') {
                    buttonText = `${q.name} (${q.sizeText})`;
                }
                buttons.push({ id: `dlp_qual_${sessionId}_${i}`, text: buttonText });
            }
            buttons.push({ id: `dlp_cancel_${sessionId}`, text: '❌ Cancel' });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `Select quality to download:`,
                footer: 'Universal Downloader',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            await sock.sendMessage(from, { delete: processingMsg.key });
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
                    // Download the file with the selected quality
                    await downloadMedia(session.data.url, quality, tempDir);
                    
                    // Find the downloaded file
                    const files = fs.readdirSync(tempDir);
                    const downloadedFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.mp3'));
                    
                    if (!downloadedFile) {
                        throw new Error('No file downloaded');
                    }
                    
                    const filePath = path.join(tempDir, downloadedFile);
                    
                    // Validate the file
                    const validation = await validateFile(filePath);
                    
                    if (!validation.valid) {
                        throw new Error(`File validation failed: ${validation.reason}`);
                    }
                    
                    const fileBuffer = fs.readFileSync(filePath);
                    const fileSizeMB = fileBuffer.length / (1024 * 1024);
                    const fileSizeText = formatFileSize(fileBuffer.length);
                    
                    console.log(`[DLP] Downloaded file size: ${fileSizeText} for quality ${quality.name}`);
                    
                    // Create proper filename
                    let baseFilename = session.data.videoInfo.title || 'video';
                    baseFilename = sanitizeFilename(baseFilename);
                    
                    const isMp3 = quality.name === 'MP3';
                    const finalFileName = isMp3 ? `${baseFilename}.mp3` : `${baseFilename}_${quality.name}.mp4`;
                    
                    const caption = `✅ *Download Complete!*\n\n` +
                                   `📹 *Quality:* ${quality.name}\n` +
                                   `📊 *Size:* ${fileSizeText}\n` +
                                   `📁 *File:* ${finalFileName}\n\n` +
                                   `> *Downloaded by ${config.botName}*`;
                    
                    // Decide send method based on file size (200MB threshold)
                    const SIZE_THRESHOLD_MB = 200;
                    const useDocument = fileSizeMB > SIZE_THRESHOLD_MB;
                    
                    console.log(`[DLP] Sending as ${useDocument ? 'DOCUMENT' : 'MEDIA'}`);
                    
                    if (useDocument) {
                        await sock.sendMessage(from, {
                            document: fileBuffer,
                            mimetype: isMp3 ? 'audio/mpeg' : 'video/mp4',
                            fileName: finalFileName,
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