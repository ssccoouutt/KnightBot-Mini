/**
 * DLP Command - Universal Video/Audio Downloader using yt-dlp
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
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
            // Get video info
            const infoCmd = `yt-dlp --no-warnings --dump-json "${url}" 2>&1`;
            
            console.log('[DLP] Getting video info...');
            
            exec(infoCmd, { maxBuffer: 50 * 1024 * 1024 }, async (error, stdout, stderr) => {
                if (error) {
                    console.error('[DLP] Error:', stderr);
                    await sock.sendMessage(from, {
                        text: `❌ *Failed to get video info*\n\nError: ${stderr.substring(0, 200)}`,
                        edit: processingMsg.key
                    });
                    return;
                }
                
                try {
                    const info = JSON.parse(stdout);
                    console.log('[DLP] Video title:', info.title);
                    
                    const formats = info.formats || [];
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
                                qualities.push({
                                    name: qualityName,
                                    height: height,
                                    formatId: format.format_id,
                                    sizeMB: sizeMB
                                });
                            }
                        }
                    }
                    
                    qualities.sort((a, b) => b.height - a.height);
                    
                    // Add audio option
                    qualities.push({
                        name: 'MP3',
                        height: 0,
                        formatId: 'bestaudio',
                        sizeMB: null
                    });
                    
                    if (qualities.length === 0) {
                        throw new Error('No downloadable formats found');
                    }
                    
                    // Clear any existing sessions
                    const existingSessions = sessionManager.getUserSessions(sender, from);
                    for (const sess of existingSessions) {
                        if (sess.command === 'dlp') {
                            sessionManager.clearSession(sess.id);
                        }
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
                    
                    // Send thumbnail
                    if (info.thumbnail) {
                        try {
                            await sock.sendMessage(from, {
                                image: { url: info.thumbnail },
                                caption: `🎬 *${info.title || 'Video'}*\n⏱️ Duration: ${formatDuration(info.duration)}`
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
                        text: `✅ *Video Info Retrieved*\n\n📹 *Title:* ${info.title}\n📊 *Qualities:* ${qualities.length}\n\nSelect quality to download:`,
                        edit: processingMsg.key
                    });
                    
                    const sentMsg = await sendButtons(sock, from, {
                        text: `🎬 *${info.title.substring(0, 40)}*`,
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
            
            console.log('[DLP] Button clicked:', buttonId);
            
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
                
                console.log('[DLP] Downloading quality:', quality.name);
                
                await react('⬇️');
                const processingMsg = await reply(`📥 *Downloading ${quality.name}...*\n\nPlease wait...`);
                
                const tempDir = path.join(process.cwd(), 'temp', `dlp_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });
                
                // Build command properly - avoid shell interpretation issues
                let cmd;
                const escapedUrl = `"${session.data.url}"`;
                const outputTemplate = `"${tempDir}/%(title)s.%(ext)s"`;
                
                if (quality.name === 'MP3') {
                    cmd = `yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 0 -o ${outputTemplate} ${escapedUrl}`;
                } else {
                    // Use simple format selection without complex brackets
                    cmd = `yt-dlp -f "bestvideo[height<=${quality.height}]+bestaudio/best[height<=${quality.height}]" --merge-output-format mp4 -o ${outputTemplate} ${escapedUrl}`;
                }
                
                console.log('[DLP] Running:', cmd);
                
                const child = exec(cmd, { maxBuffer: 200 * 1024 * 1024, shell: '/bin/bash' });
                
                let errorOutput = '';
                child.stderr.on('data', (data) => {
                    errorOutput += data;
                    console.log('[DLP] stderr:', data);
                });
                
                child.on('close', async (code) => {
                    if (code !== 0) {
                        console.error('[DLP] Download error:', errorOutput);
                        await sock.sendMessage(from, {
                            text: `❌ *Download failed*\n\nError: ${errorOutput.substring(0, 200)}`,
                            edit: processingMsg.key
                        });
                        return;
                    }
                    
                    try {
                        const files = fs.readdirSync(tempDir);
                        const videoFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.webm'));
                        
                        if (!videoFile) {
                            throw new Error('No file found');
                        }
                        
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