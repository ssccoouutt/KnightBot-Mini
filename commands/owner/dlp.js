/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Auto-installs dependencies, ensures proper audio-video merging, sends as document
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Track if setup is complete
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
        console.log('[DLP] Setup complete');
        return true;
    } catch (error) {
        console.error('[DLP] Setup failed:', error);
        setupInProgress = false;
        return false;
    }
}

// ==================== VALIDATE VIDEO FILE ====================

async function validateVideoFile(filePath) {
    return new Promise((resolve) => {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            resolve({ valid: false, reason: 'File not found' });
            return;
        }
        
        // Check file size
        const stats = fs.statSync(filePath);
        if (stats.size < 1024) { // Less than 1KB
            resolve({ valid: false, reason: 'File too small (corrupted)' });
            return;
        }
        
        // Use ffprobe to check if file has both video and audio streams
        const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        
        exec(probeCmd, (error, stdout) => {
            const hasVideo = !error && stdout.trim() === 'video';
            
            const audioProbeCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
            
            exec(audioProbeCmd, (audioError, audioStdout) => {
                const hasAudio = !audioError && audioStdout.trim() === 'audio';
                
                resolve({ 
                    valid: true, 
                    hasVideo, 
                    hasAudio, 
                    size: stats.size 
                });
            });
        });
    });
}

// ==================== YT-DLP FUNCTIONS ====================

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

async function downloadAndMergeMedia(url, quality, tempDir) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(tempDir, 'output.mp4');
        const tempVideo = path.join(tempDir, 'video.mp4');
        const tempAudio = path.join(tempDir, 'audio.mp3');
        
        let cmd;
        
        if (quality.name === 'MP3' || quality.name === 'mp3') {
            // Audio only
            cmd = `yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 0 -o "${tempDir}/audio.%(ext)s" "${url}"`;
        } else {
            // Download best video and best audio separately, then merge with ffmpeg
            cmd = `yt-dlp -f "bestvideo[height<=${quality.height}]" -o "${tempVideo}" "${url}" && ` +
                  `yt-dlp -f bestaudio -x --audio-format mp3 -o "${tempAudio}" "${url}" && ` +
                  `ffmpeg -i "${tempVideo}" -i "${tempAudio}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y`;
        }
        
        console.log('[DLP] Running download/merge command');
        
        exec(cmd, { maxBuffer: 500 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (error) {
                console.error('[DLP] Download error:', stderr);
                
                // Fallback: try best format directly
                const fallbackCmd = `yt-dlp -f "best[height<=${quality.height}]" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
                
                exec(fallbackCmd, { maxBuffer: 500 * 1024 * 1024 }, async (fallbackError) => {
                    if (fallbackError) {
                        reject(new Error(stderr || 'Download failed'));
                    } else {
                        // Validate the file
                        const validation = await validateVideoFile(outputPath);
                        if (validation.valid && validation.hasVideo) {
                            resolve(outputPath);
                        } else {
                            reject(new Error('Downloaded file has no video stream'));
                        }
                    }
                });
                return;
            }
            
            // For MP3 downloads
            if (quality.name === 'MP3' || quality.name === 'mp3') {
                const files = fs.readdirSync(tempDir);
                const audioFile = files.find(f => f.endsWith('.mp3'));
                if (audioFile) {
                    resolve(path.join(tempDir, audioFile));
                } else {
                    reject(new Error('No audio file found'));
                }
                return;
            }
            
            // Validate merged file
            const validation = await validateVideoFile(outputPath);
            
            if (!validation.valid) {
                reject(new Error(`File validation failed: ${validation.reason}`));
                return;
            }
            
            if (!validation.hasVideo) {
                reject(new Error('Merged file has no video stream'));
                return;
            }
            
            console.log(`[DLP] File validated - Video: ${validation.hasVideo}, Audio: ${validation.hasAudio}, Size: ${(validation.size / 1024 / 1024).toFixed(2)} MB`);
            
            resolve(outputPath);
        });
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
                       `*Usage:* \`${config.prefix}dlp <url>\`\n\n` +
                       `*Supports:* YouTube, Instagram, Twitter, Facebook, TikTok\n` +
                       `*First run will auto-install dependencies*`);
        }
        
        const url = args[0];
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        await react('🔍');
        
        // Run setup if needed
        if (!setupComplete) {
            const setupMsg = await reply(`⚙️ *First time setup...*\n\nInstalling dependencies...\nPlease wait...`);
            
            const setupSuccess = await runSetup();
            
            if (!setupSuccess) {
                await sock.sendMessage(from, {
                    text: `❌ *Setup failed*\n\nPlease install manually:\n\`pip install -U yt-dlp\`\n\`apt-get install ffmpeg\``,
                    edit: setupMsg.key
                });
                await react('❌');
                return;
            }
            
            await sock.sendMessage(from, {
                text: `✅ *Setup complete!*`,
                edit: setupMsg.key
            });
        }
        
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            const videoInfo = await getVideoInfo(url);
            
            const formats = videoInfo.formats || [];
            const qualities = [];
            const seenHeights = new Set();
            
            for (const format of formats) {
                if (format.vcodec !== 'none' && format.height) {
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
                        qualities.push({ name: qualityName, height: height });
                    }
                }
            }
            
            qualities.sort((a, b) => b.height - a.height);
            qualities.push({ name: 'MP3', height: 0 });
            
            if (qualities.length === 0) {
                throw new Error('No downloadable formats found');
            }
            
            // Clear existing sessions
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
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n⏱️ Duration: ${formatDuration(videoInfo.duration)}`
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            const buttons = [];
            for (let i = 0; i < Math.min(qualities.length, 6); i++) {
                const q = qualities[i];
                buttons.push({ id: `dlp_qual_${sessionId}_${i}`, text: q.name });
            }
            buttons.push({ id: `dlp_cancel_${sessionId}`, text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: `✅ *Video Info Retrieved*\n\n📹 *Title:* ${videoInfo.title}\n📊 *Qualities:* ${qualities.length}\n\nSelect quality to download:`,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `🎬 *${videoInfo.title.substring(0, 40)}*`,
                footer: 'Select Quality',
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
                const processingMsg = await reply(`📥 *Downloading ${quality.name}...*\n\nThis may take a few minutes...`);
                
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                try {
                    const downloadedFile = await downloadAndMergeMedia(session.data.url, quality, tempDir);
                    
                    const fileBuffer = fs.readFileSync(downloadedFile);
                    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
                    const fileExt = path.extname(downloadedFile);
                    const fileName = `${(session.data.videoInfo.title || 'video').replace(/[^a-zA-Z0-9]/g, '_')}_${quality.name}${fileExt}`;
                    
                    const isMp3 = quality.name === 'MP3' || quality.name === 'mp3';
                    const caption = `✅ *Download Complete!*\n\n📹 *Quality:* ${quality.name}\n📊 *Size:* ${fileSizeMB} MB\n\n> *Powered by ${config.botName}*`;
                    
                    // Send as DOCUMENT (not media) to avoid playback issues
                    await sock.sendMessage(from, {
                        document: fileBuffer,
                        mimetype: isMp3 ? 'audio/mpeg' : 'video/mp4',
                        fileName: fileName,
                        caption: caption
                    }, { quoted: msg });
                    
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
                    
                    // Cleanup
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

function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}