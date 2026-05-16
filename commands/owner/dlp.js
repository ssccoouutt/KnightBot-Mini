/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 * Fixed for YouTube signature issues
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
        const processingMsg = await reply(`🔍 *Analyzing URL...*\n\n${url}\n\nPlease wait...`);
        
        try {
            // First, try to get video info with a simpler command
            const infoCmd = `yt-dlp --no-warnings --dump-json "${url}" 2>&1`;
            
            console.log('[DLP] Getting video info...');
            
            exec(infoCmd, { maxBuffer: 50 * 1024 * 1024 }, async (error, stdout, stderr) => {
                if (error) {
                    console.error('[DLP] Error:', stderr);
                    
                    // Check if yt-dlp needs update
                    if (stderr.includes('Signature solving failed') || stderr.includes('Requested format is not available')) {
                        await sock.sendMessage(from, {
                            text: `⚠️ *YouTube Updated!*\n\n` +
                                  `YouTube has changed its API. Please run these commands to fix:\n\n` +
                                  `\`pip install -U yt-dlp\`\n` +
                                  `\`npm install -g jsdom\`\n\n` +
                                  `Then restart the bot.`,
                            edit: processingMsg.key
                        });
                        return;
                    }
                    
                    await sock.sendMessage(from, {
                        text: `❌ *Failed to get video info*\n\nError: ${stderr.substring(0, 200)}`,
                        edit: processingMsg.key
                    });
                    return;
                }
                
                try {
                    const info = JSON.parse(stdout);
                    console.log('[DLP] Video title:', info.title);
                    
                    // Get available formats
                    const formats = info.formats || [];
                    const qualities = [];
                    
                    // Collect unique video qualities
                    const seenHeights = new Set();
                    for (const format of formats) {
                        if (format.vcodec !== 'none' && format.height) {
                            const height = format.height;
                            const quality = height >= 2160 ? '4K' :
                                           height >= 1440 ? '2K' :
                                           height >= 1080 ? '1080p' :
                                           height >= 720 ? '720p' :
                                           height >= 480 ? '480p' :
                                           height >= 360 ? '360p' : `${height}p`;
                            
                            if (!seenHeights.has(height)) {
                                seenHeights.add(height);
                                qualities.push({
                                    name: quality,
                                    height: height,
                                    formatId: format.format_id,
                                    ext: format.ext,
                                    filesize: format.filesize
                                });
                            }
                        }
                    }
                    
                    // Sort by height (highest first)
                    qualities.sort((a, b) => b.height - a.height);
                    
                    // Add audio-only option
                    qualities.push({
                        name: 'mp3',
                        height: 0,
                        formatId: 'bestaudio',
                        ext: 'mp3',
                        filesize: null
                    });
                    
                    if (qualities.length === 0) {
                        throw new Error('No downloadable formats found');
                    }
                    
                    const session = sessionManager.createSession(sender, from, 'dlp', {
                        url: url,
                        videoInfo: {
                            title: info.title,
                            duration: info.duration,
                            qualities: qualities
                        }
                    });
                    
                    const sessionId = session.id.split(':').pop();
                    
                    // Send thumbnail if available
                    if (info.thumbnail) {
                        try {
                            await sock.sendMessage(from, {
                                image: { url: info.thumbnail },
                                caption: `🎬 *${info.title || 'Video'}*\n⏱️ Duration: ${formatDuration(info.duration)}`
                            }, { quoted: msg });
                        } catch (e) {}
                    }
                    
                    const buttons = [];
                    for (let i = 0; i < Math.min(qualities.length, 8); i++) {
                        const q = qualities[i];
                        let text = q.name;
                        if (q.filesize) text += ` (${formatFileSize(q.filesize)})`;
                        buttons.push({ id: `dlp_qual_${sessionId}_${i}`, text: text });
                    }
                    buttons.push({ id: 'cancel', text: '❌ Cancel' });
                    
                    await sock.sendMessage(from, {
                        text: `✅ *Video Info Retrieved*\n\n📹 *Title:* ${info.title}\n📊 *Qualities:* ${qualities.length}\n\nSelect quality to download:`,
                        edit: processingMsg.key
                    });
                    
                    const sentMsg = await sendButtons(sock, from, {
                        text: `🎬 *${info.title.substring(0, 50)}*`,
                        footer: 'Select Quality',
                        buttons: buttons,
                        aimode: FORCE_AI_MODE
                    }, {});
                    
                    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
                    
                } catch (parseError) {
                    console.error('[DLP] Parse error:', parseError);
                    await sock.sendMessage(from, {
                        text: `❌ *Failed to parse video info*`,
                        edit: processingMsg.key
                    });
                }
            });
            
        } catch (error) {
            console.error('[DLP] Error:', error);
            await sock.sendMessage(from, {
                text: `❌ *Error:* ${error.message}`,
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
            
            if (buttonId === 'cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Cancelled.`);
                return true;
            }
            
            if (buttonId && buttonId.startsWith('dlp_qual_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[3]);
                const quality = session.data.videoInfo.qualities[index];
                
                if (!quality) return true;
                
                await react('⬇️');
                const processingMsg = await reply(`📥 *Downloading ${quality.name}...*\n\nPlease wait...`);
                
                // Use yt-dlp with simplified command
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                let cmd;
                if (quality.name === 'mp3') {
                    cmd = `yt-dlp -f bestaudio -x --audio-format mp3 -o "${tempDir}/%(title)s.%(ext)s" "${session.data.url}"`;
                } else {
                    cmd = `yt-dlp -f bestvideo[height<=${quality.height}]+bestaudio/best[height<=${quality.height}] --merge-output-format mp4 -o "${tempDir}/%(title)s.%(ext)s" "${session.data.url}"`;
                }
                
                console.log('[DLP] Running:', cmd);
                
                exec(cmd, { maxBuffer: 100 * 1024 * 1024 }, async (error, stdout, stderr) => {
                    if (error) {
                        console.error('[DLP] Download error:', stderr);
                        await sock.sendMessage(from, {
                            text: `❌ *Download failed*\n\nError: ${stderr.substring(0, 200)}`,
                            edit: processingMsg.key
                        });
                        return;
                    }
                    
                    try {
                        const files = fs.readdirSync(tempDir);
                        const videoFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.mp3'));
                        
                        if (!videoFile) {
                            throw new Error('No file found');
                        }
                        
                        const filePath = path.join(tempDir, videoFile);
                        const fileBuffer = fs.readFileSync(filePath);
                        const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
                        
                        const isVideo = videoFile.endsWith('.mp4');
                        const caption = `✅ *Download Complete!*\n\n📹 *Quality:* ${quality.name}\n📊 *Size:* ${fileSizeMB} MB`;
                        
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
                            fs.rmdirSync(tempDir);
                        } catch (e) {}
                        
                        await sock.sendMessage(from, {
                            text: `✅ *Download Complete!*`,
                            edit: processingMsg.key
                        });
                        
                        await react('✅');
                        sessionManager.clearSession(session.id);
                        
                    } catch (err) {
                        console.error('[DLP] File error:', err);
                        await sock.sendMessage(from, {
                            text: `❌ *Error:* ${err.message}`,
                            edit: processingMsg.key
                        });
                    }
                });
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

function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}