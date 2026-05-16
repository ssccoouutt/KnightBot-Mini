/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Auto-installs dependencies and JavaScript runtime
 */

const { exec, execSync } = require('child_process');
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
        // Check if yt-dlp is installed
        exec('yt-dlp --version', (error) => {
            if (!error) {
                console.log('[DLP] yt-dlp already installed');
                resolve(true);
                return;
            }
            
            console.log('[DLP] Installing yt-dlp...');
            exec('pip install -q yt-dlp', (installError) => {
                if (installError) {
                    console.error('[DLP] Failed to install yt-dlp:', installError.message);
                    resolve(false);
                } else {
                    console.log('[DLP] yt-dlp installed successfully');
                    resolve(true);
                }
            });
        });
    });
}

async function ensureDenoInstalled() {
    return new Promise((resolve) => {
        // Check if deno is installed
        exec('deno --version', (error) => {
            if (!error) {
                console.log('[DLP] Deno already installed');
                resolve(true);
                return;
            }
            
            console.log('[DLP] Installing Deno (JavaScript runtime for YouTube)...');
            
            // Install deno using curl
            const installCmd = 'curl -fsSL https://deno.land/install.sh | sh && export PATH="$HOME/.deno/bin:$PATH"';
            
            exec(installCmd, { shell: '/bin/bash', timeout: 60000 }, (installError) => {
                if (installError) {
                    console.error('[DLP] Failed to install Deno:', installError.message);
                    
                    // Try alternative: install nodejs as fallback
                    console.log('[DLP] Trying Node.js as fallback...');
                    exec('curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs', { timeout: 120000 }, (nodeError) => {
                        if (nodeError) {
                            console.error('[DLP] Failed to install Node.js');
                            resolve(false);
                        } else {
                            console.log('[DLP] Node.js installed successfully');
                            resolve(true);
                        }
                    });
                } else {
                    // Update PATH for this session
                    process.env.PATH = `${process.env.HOME}/.deno/bin:${process.env.PATH}`;
                    console.log('[DLP] Deno installed successfully');
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
                    console.error('[DLP] Failed to install ffmpeg:', installError.message);
                    resolve(false);
                } else {
                    console.log('[DLP] ffmpeg installed successfully');
                    resolve(true);
                }
            });
        });
    });
}

async function ensurePythonPipInstalled() {
    return new Promise((resolve) => {
        exec('pip --version', (error) => {
            if (!error) {
                resolve(true);
                return;
            }
            
            console.log('[DLP] Installing pip...');
            exec('apt-get update -qq && apt-get install -y -qq python3-pip', { timeout: 60000 }, (installError) => {
                if (installError) {
                    console.error('[DLP] Failed to install pip');
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    });
}

async function runSetup() {
    if (setupComplete || setupInProgress) return setupComplete;
    
    setupInProgress = true;
    console.log('[DLP] Running automatic setup for dependencies...');
    
    try {
        // Install Python pip first
        await ensurePythonPipInstalled();
        
        // Install yt-dlp
        await ensureYtDlpInstalled();
        
        // Install JavaScript runtime (deno or node)
        await ensureDenoInstalled();
        
        // Install ffmpeg for merging
        await ensureFfmpegInstalled();
        
        setupComplete = true;
        setupInProgress = false;
        console.log('[DLP] All dependencies installed successfully');
        return true;
        
    } catch (error) {
        console.error('[DLP] Setup failed:', error);
        setupInProgress = false;
        return false;
    }
}

// ==================== YT-DLP FUNCTIONS ====================

async function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        // Use python -m yt_dlp for better compatibility
        const cmd = `python3 -m yt_dlp --no-warnings --dump-json "${url}" 2>&1`;
        
        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                // Try without python -m
                const fallbackCmd = `yt-dlp --no-warnings --dump-json "${url}" 2>&1`;
                exec(fallbackCmd, { maxBuffer: 50 * 1024 * 1024 }, (fallbackError, fallbackStdout) => {
                    if (fallbackError) {
                        reject(new Error(stderr || fallbackError.message));
                    } else {
                        try {
                            resolve(JSON.parse(fallbackStdout));
                        } catch (e) {
                            reject(new Error('Failed to parse video info'));
                        }
                    }
                });
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
        const outputTemplate = `"${tempDir}/%(title)s.%(ext)s"`;
        const escapedUrl = `"${url}"`;
        
        let cmd;
        if (quality.name === 'MP3' || quality.name === 'mp3') {
            cmd = `yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 0 -o ${outputTemplate} ${escapedUrl}`;
        } else {
            cmd = `yt-dlp -f "bestvideo[height<=${quality.height}]+bestaudio/best[height<=${quality.height}]" --merge-output-format mp4 -o ${outputTemplate} ${escapedUrl}`;
        }
        
        console.log('[DLP] Running download command');
        
        exec(cmd, { maxBuffer: 200 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (error) {
                // Fallback: download best available format
                const fallbackCmd = `yt-dlp -o ${outputTemplate} ${escapedUrl}`;
                console.log('[DLP] Trying fallback command');
                
                exec(fallbackCmd, { maxBuffer: 200 * 1024 * 1024 }, (fallbackError, fallbackStdout, fallbackStderr) => {
                    if (fallbackError) {
                        reject(new Error(stderr || fallbackStderr));
                    } else {
                        resolve(true);
                    }
                });
            } else {
                resolve(true);
            }
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
            const setupMsg = await reply(`⚙️ *First time setup in progress...*\n\nInstalling required dependencies...\nThis may take 1-2 minutes.\n\nPlease wait...`);
            
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
                text: `✅ *Setup complete!*\n\nProcessing your request...`,
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
                        const sizeMB = format.filesize ? (format.filesize / (1024 * 1024)).toFixed(2) : null;
                        qualities.push({ name: qualityName, height: height, sizeMB: sizeMB });
                    }
                }
            }
            
            qualities.sort((a, b) => b.height - a.height);
            qualities.push({ name: 'MP3', height: 0, sizeMB: null });
            
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
                let text = q.name;
                if (q.sizeMB) text += ` (${q.sizeMB} MB)`;
                buttons.push({ id: `dlp_qual_${sessionId}_${i}`, text: text });
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
                const processingMsg = await reply(`📥 *Downloading ${quality.name}...*\n\nPlease wait...`);
                
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                try {
                    await downloadMedia(session.data.url, quality, tempDir);
                    
                    const files = fs.readdirSync(tempDir);
                    const videoFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.webm') || f.endsWith('.m4a'));
                    
                    if (!videoFile) throw new Error('No file found');
                    
                    const filePath = path.join(tempDir, videoFile);
                    const fileBuffer = fs.readFileSync(filePath);
                    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
                    
                    const isVideo = videoFile.endsWith('.mp4') || videoFile.endsWith('.webm');
                    const caption = `✅ *Download Complete!*\n\n📹 *Quality:* ${quality.name}\n📊 *Size:* ${fileSizeMB} MB\n\n> *Powered by ${config.botName}*`;
                    
                    if (isVideo) {
                        await sock.sendMessage(from, {
                            video: fileBuffer,
                            caption: caption,
                            mimetype: 'video/mp4'
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, {
                            audio: fileBuffer,
                            caption: caption,
                            mimetype: 'audio/mpeg',
                            ptt: false
                        }, { quoted: msg });
                    }
                    
                    // Cleanup
                    try {
                        fs.unlinkSync(filePath);
                        fs.rmdirSync(tempDir, { recursive: true });
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