/**
 * DLP Command - Download videos from YouTube and other sites
 * Uses ytdl-core for YouTube (no external runtime needed)
 */

const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Check if URL is from YouTube
function isYouTubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

// Get video info from YouTube using ytdl-core
async function getYouTubeInfo(url) {
    try {
        const info = await ytdl.getInfo(url);
        const formats = info.formats;
        const qualities = [];
        const seenHeights = new Set();
        
        // Collect video formats
        for (const format of formats) {
            if (format.hasVideo && format.height) {
                const height = format.height;
                let qualityName = height >= 2160 ? '4K' :
                               height >= 1440 ? '2K' :
                               height >= 1080 ? '1080p' :
                               height >= 720 ? '720p' :
                               height >= 480 ? '480p' :
                               height >= 360 ? '360p' :
                               height >= 240 ? '240p' : `${height}p`;
                
                if (!seenHeights.has(height)) {
                    seenHeights.add(height);
                    const sizeMB = format.contentLength ? (parseInt(format.contentLength) / (1024 * 1024)).toFixed(2) : null;
                    qualities.push({
                        name: qualityName,
                        height: height,
                        itag: format.itag,
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
            itag: 'audio',
            sizeMB: null
        });
        
        return {
            title: info.videoDetails.title,
            duration: info.videoDetails.lengthSeconds,
            thumbnail: info.videoDetails.thumbnails?.pop()?.url,
            uploader: info.videoDetails.author.name,
            qualities: qualities
        };
        
    } catch (error) {
        console.error('[DLP] YouTube error:', error.message);
        throw new Error('Failed to get YouTube video info: ' + error.message);
    }
}

// Download YouTube video/audio
async function downloadYouTube(url, quality, tempDir) {
    return new Promise(async (resolve, reject) => {
        try {
            const info = await ytdl.getInfo(url);
            let stream;
            let filename;
            
            if (quality.name === 'MP3') {
                // Download audio only
                stream = ytdl(url, { 
                    quality: 'highestaudio',
                    filter: 'audioonly'
                });
                filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.mp3`;
            } else {
                // Download video with specific quality
                const format = info.formats.find(f => f.height === quality.height && f.hasVideo);
                if (!format) {
                    throw new Error(`No format found for quality ${quality.name}`);
                }
                stream = ytdl(url, { quality: format.itag });
                filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}_${quality.name}.mp4`;
            }
            
            const filePath = path.join(tempDir, filename);
            const writeStream = fs.createWriteStream(filePath);
            
            stream.pipe(writeStream);
            
            writeStream.on('finish', () => {
                resolve({ path: filePath, filename: filename });
            });
            
            writeStream.on('error', reject);
            stream.on('error', reject);
            
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    name: 'dlp',
    aliases: ['download', 'get'],
    category: 'media',
    description: 'Download videos/audio from YouTube',
    usage: '.dlp <youtube_url>',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *YouTube Downloader*\n\n` +
                       `*Usage:* \`${config.prefix}dlp <youtube_url>\`\n\n` +
                       `*Example:* \`${config.prefix}dlp https://youtu.be/xxxxx\``);
        }
        
        const url = args[0];
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return reply(`❌ Please provide a valid URL starting with http:// or https://`);
        }
        
        if (!isYouTubeUrl(url)) {
            return reply(`❌ Currently only YouTube URLs are supported.\n\nSupported formats:\n• youtube.com/watch?v=...\n• youtu.be/...`);
        }
        
        await react('🔍');
        const processingMsg = await reply(`🔍 *Analyzing YouTube video...*\n\n${url}\n\nPlease wait...`);
        
        try {
            const videoInfo = await getYouTubeInfo(url);
            
            if (!videoInfo.qualities || videoInfo.qualities.length === 0) {
                await sock.sendMessage(from, {
                    text: `❌ No downloadable formats found.`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
            
            // Clear existing sessions
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
            
            // Send thumbnail
            if (videoInfo.thumbnail) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: videoInfo.thumbnail },
                        caption: `🎬 *${videoInfo.title || 'Video'}*\n⏱️ Duration: ${formatDuration(videoInfo.duration)}\n👤 Uploader: ${videoInfo.uploader || 'Unknown'}`
                    }, { quoted: msg });
                } catch (e) {}
            }
            
            const buttons = [];
            for (let i = 0; i < Math.min(videoInfo.qualities.length, 6); i++) {
                const q = videoInfo.qualities[i];
                let text = q.name;
                if (q.sizeMB) text += ` (${q.sizeMB} MB)`;
                buttons.push({ id: `dlp_qual_${sessionId}_${i}`, text: text });
            }
            buttons.push({ id: `dlp_cancel_${sessionId}`, text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: `✅ *Video Info Retrieved*\n\n📹 *Title:* ${videoInfo.title}\n📊 *Qualities:* ${videoInfo.qualities.length}\n\nSelect quality to download:`,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `🎬 *${videoInfo.title.substring(0, 40)}*`,
                footer: 'Select Quality',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'dlp');
            await react('✅');
            
        } catch (error) {
            console.error('[DLP] Error:', error);
            await sock.sendMessage(from, {
                text: `❌ *Failed to process video*\n\nError: ${error.message}`,
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
                    const result = await downloadYouTube(session.data.url, quality, tempDir);
                    const fileBuffer = fs.readFileSync(result.path);
                    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
                    
                    const isVideo = quality.name !== 'MP3';
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
                        fs.unlinkSync(result.path);
                        fs.rmdirSync(tempDir, { recursive: true });
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
                        text: `❌ *Download failed*\n\nError: ${downloadError.message}`,
                        edit: processingMsg.key
                    });
                    await react('❌');
                    
                    // Cleanup
                    try {
                        fs.rmdirSync(tempDir, { recursive: true });
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