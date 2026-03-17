const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// API configuration
const BASE_URL = "https://variative-osculatory-lakenya.ngrok-free.dev";
const TIMEOUT = 300000; // 5 minutes in milliseconds

module.exports = {
    name: 'utube',
    aliases: ['yt', 'youtube', 'ytdl', 'video', 'audio'],
    description: 'Download YouTube videos or audio',
    usage: 'utube <YouTube URL> [options]\n' +
           'utube video <URL> - Download best video\n' +
           'utube audio <URL> - Download best audio\n' +
           'utube info <URL> - Show video information\n' +
           'utube formats <URL> - List all available formats',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply, config);
            return;
        }

        // Parse command
        const subCommand = args[0].toLowerCase();
        
        // Check if first argument is a URL (no subcommand)
        if (subCommand.startsWith('http://') || subCommand.startsWith('https://') || subCommand.includes('youtu.be') || subCommand.includes('youtube.com')) {
            // Default to video download
            await handleDownload(sock, from, args[0], 'video', reply, react);
        }
        // Handle subcommands
        else if (subCommand === 'video' && args[1]) {
            await handleDownload(sock, from, args[1], 'video', reply, react);
        }
        else if (subCommand === 'audio' && args[1]) {
            await handleDownload(sock, from, args[1], 'audio', reply, react);
        }
        else if (subCommand === 'info' && args[1]) {
            await handleInfo(sock, from, args[1], reply, react);
        }
        else if (subCommand === 'formats' && args[1]) {
            await handleFormats(sock, from, args[1], reply, react);
        }
        else {
            await showHelp(sock, from, reply, config);
        }
    }
};

async function showHelp(sock, chatId, reply, config) {
    await reply(`🎬 *YouTube Downloader Commands*\n\n` +
                `*Usage:*\n` +
                `• \`${config.prefix}utube <URL>\` - Download best video\n` +
                `• \`${config.prefix}utube video <URL>\` - Download best video\n` +
                `• \`${config.prefix}utube audio <URL>\` - Download best audio\n` +
                `• \`${config.prefix}utube info <URL>\` - Show video information\n` +
                `• \`${config.prefix}utube formats <URL>\` - List all formats\n\n` +
                `*Examples:*\n` +
                `• \`${config.prefix}utube https://youtu.be/dQw4w9WgXcQ\`\n` +
                `• \`${config.prefix}utube audio https://youtu.be/dQw4w9WgXcQ\``);
}

async function handleDownload(sock, chatId, url, mediaType, reply, react) {
    await react('⏳');
    const processingMsg = await reply(`📡 *Fetching ${mediaType} information...*\n\nURL: ${url.substring(0, 50)}...`);

    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Get video data from API
        const data = await getVideoData(url, mediaType);

        if (!data.success) {
            throw new Error('Failed to fetch video data');
        }

        const videoTitle = data.video_info.title;
        const videoUploader = data.video_info.uploader || 'Unknown';
        const videoDuration = data.video_info.duration_formatted || 'Unknown';

        // Get the best format to download
        let downloadItem = null;

        if (mediaType === 'video') {
            downloadItem = getBestVideo(data);
        } else {
            downloadItem = getBestAudio(data);
        }

        if (!downloadItem) {
            throw new Error(`No ${mediaType} formats found`);
        }

        // Update progress
        await sock.sendMessage(chatId, {
            text: `📥 *Downloading ${mediaType}...*\n\n` +
                  `🎬 *Title:* ${videoTitle}\n` +
                  `👤 *Uploader:* ${videoUploader}\n` +
                  `⏱️ *Duration:* ${videoDuration}\n` +
                  `📦 *Size:* ${downloadItem.size_mb ? downloadItem.size_mb.toFixed(2) + ' MB' : 'Unknown'}\n` +
                  `📊 *Quality:* ${downloadItem.quality || 'Best Available'}`,
            edit: processingMsg.key
        });

        // Download the file
        const filePath = await downloadFile(downloadItem, videoTitle, mediaType, tempDir);

        if (!filePath) {
            throw new Error('Download failed');
        }

        // Read the file
        const fileBuffer = fs.readFileSync(filePath);
        const fileStats = fs.statSync(filePath);
        const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

        // Determine file type for sending
        const isVideo = mediaType === 'video';
        const extension = path.extname(filePath).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension);

        // Prepare caption
        const caption = `✅ *Download Complete!*\n\n` +
                        `🎬 *Title:* ${videoTitle}\n` +
                        `👤 *Uploader:* ${videoUploader}\n` +
                        `⏱️ *Duration:* ${videoDuration}\n` +
                        `📦 *Size:* ${fileSizeMB} MB\n` +
                        `📊 *Quality:* ${downloadItem.quality || 'Best Available'}\n\n` +
                        `🔗 ${url}`;

        // Send the file based on type
        if (mediaType === 'audio') {
            // Send as audio
            await sock.sendMessage(chatId, {
                audio: fileBuffer,
                mimetype: 'audio/mpeg',
                fileName: path.basename(filePath),
                caption: caption
            });
        } else if (isImage) {
            // Send as image
            await sock.sendMessage(chatId, {
                image: fileBuffer,
                caption: caption
            });
        } else {
            // Send as document/video
            const messageOptions = {
                caption: caption
            };

            if (isVideo) {
                messageOptions.video = fileBuffer;
                messageOptions.mimetype = 'video/mp4';
            } else {
                messageOptions.document = fileBuffer;
                messageOptions.fileName = path.basename(filePath);
                messageOptions.mimetype = 'application/octet-stream';
            }

            await sock.sendMessage(chatId, messageOptions);
        }

        // Clean up temp file
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.log('Failed to delete temp file:', e.message);
        }

        // Delete processing message
        await sock.sendMessage(chatId, {
            delete: processingMsg.key
        });

        await react('✅');

    } catch (error) {
        console.error('YouTube download error:', error);
        
        let errorMsg = '❌ *Download failed*\n\n';
        
        if (error.message.includes('404')) {
            errorMsg += 'Video not found or URL is invalid.';
        } else if (error.message.includes('timeout')) {
            errorMsg += 'Request timeout. The video may be too long.';
        } else if (error.message.includes('No video formats')) {
            errorMsg += 'No downloadable formats found for this video.';
        } else {
            errorMsg += `Error: ${error.message}`;
        }

        await sock.sendMessage(chatId, {
            text: errorMsg,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleInfo(sock, chatId, url, reply, react) {
    await react('⏳');
    const processingMsg = await reply(`📡 *Fetching video information...*`);

    try {
        const data = await getVideoData(url, 'video');

        if (!data.success) {
            throw new Error('Failed to fetch video data');
        }

        const info = data.video_info;
        const formats = data.available_formats || [];

        const audioCount = formats.filter(f => f.type === 'Audio Only').length;
        const videoCount = formats.filter(f => f.type === 'Video Only').length;

        const infoText = `📹 *Video Information*\n\n` +
                        `🎬 *Title:* ${info.title || 'N/A'}\n` +
                        `👤 *Uploader:* ${info.uploader || 'N/A'}\n` +
                        `⏱️ *Duration:* ${info.duration_formatted || 'N/A'}\n` +
                        `👁️ *Views:* ${info.view_count?.toLocaleString() || 'N/A'}\n` +
                        `❤️ *Likes:* ${info.like_count?.toLocaleString() || 'N/A'}\n` +
                        `📅 *Uploaded:* ${info.upload_date || 'N/A'}\n\n` +
                        `📊 *Available Formats:*\n` +
                        `• Video Only: ${videoCount}\n` +
                        `• Audio Only: ${audioCount}\n\n` +
                        `🔗 ${url}`;

        await sock.sendMessage(chatId, {
            text: infoText,
            edit: processingMsg.key
        });
        await react('✅');

    } catch (error) {
        console.error('Info fetch error:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to fetch info: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleFormats(sock, chatId, url, reply, react) {
    await react('⏳');
    const processingMsg = await reply(`📡 *Fetching available formats...*`);

    try {
        const data = await getVideoData(url, 'video');

        if (!data.success) {
            throw new Error('Failed to fetch video data');
        }

        const info = data.video_info;
        const formats = data.available_formats || [];

        let formatsText = `📹 *Available Formats*\n\n` +
                         `🎬 *Title:* ${info.title || 'N/A'}\n\n`;

        // Video formats
        const videoFormats = formats.filter(f => f.type === 'Video Only' && f.quality !== 'N/A');
        if (videoFormats.length > 0) {
            formatsText += `🎬 *Video Only:*\n`;
            videoFormats.forEach(f => {
                const size = f.size_mb ? `${f.size_mb.toFixed(2)}MB` : 'Unknown';
                formatsText += `• ${f.quality || 'N/A'} | ${size} | .${f.extension || 'mp4'}\n`;
            });
            formatsText += '\n';
        }

        // Audio formats
        const audioFormats = formats.filter(f => f.type === 'Audio Only' && f.size_mb);
        if (audioFormats.length > 0) {
            formatsText += `🎵 *Audio Only:*\n`;
            audioFormats.forEach(f => {
                const size = f.size_mb ? `${f.size_mb.toFixed(2)}MB` : 'Unknown';
                formatsText += `• ${size} | .${f.extension || 'mp3'} | ${f.codec_info || 'N/A'}\n`;
            });
        }

        if (formatsText.length > 4000) {
            // Send as file if too long
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const formatsFile = path.join(tempDir, `formats_${Date.now()}.txt`);
            fs.writeFileSync(formatsFile, formatsText);

            await sock.sendMessage(chatId, {
                document: fs.readFileSync(formatsFile),
                fileName: `formats_${info.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'video'}.txt`,
                mimetype: 'text/plain',
                caption: `📋 *Format list for:* ${info.title || 'Video'}`
            });

            fs.unlinkSync(formatsFile);
            await sock.sendMessage(chatId, { delete: processingMsg.key });
        } else {
            await sock.sendMessage(chatId, {
                text: formatsText,
                edit: processingMsg.key
            });
        }

        await react('✅');

    } catch (error) {
        console.error('Formats fetch error:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to fetch formats: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

/**
 * Get video data from API
 */
async function getVideoData(url, mediaType = 'video') {
    const params = {
        url: url,
        type: mediaType,
        quality: 'best'
    };

    const response = await axios.get(`${BASE_URL}/download`, {
        params,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'ngrok-skip-browser-warning': 'true',
            'Accept': 'application/json'
        },
        timeout: TIMEOUT
    });

    return response.data;
}

/**
 * Get the best video format
 */
function getBestVideo(data) {
    // First try combined format
    if (data.download && data.download.url) {
        return data.download;
    }

    // Otherwise get best video-only format
    const videoFormats = (data.available_formats || []).filter(f => 
        f.type === 'Video Only' && f.quality !== 'N/A'
    );

    if (videoFormats.length === 0) return null;

    // Sort by resolution (highest first)
    return videoFormats.sort((a, b) => {
        const getRes = (q) => {
            try {
                return parseInt(q.split('x')[1]) || 0;
            } catch {
                return 0;
            }
        };
        return getRes(b.quality) - getRes(a.quality);
    })[0];
}

/**
 * Get the best audio format
 */
function getBestAudio(data) {
    const audioFormats = (data.available_formats || []).filter(f => 
        f.type === 'Audio Only' && f.size_mb
    );

    if (audioFormats.length === 0) return null;

    // Sort by file size (largest first - better quality)
    return audioFormats.sort((a, b) => (b.size_mb || 0) - (a.size_mb || 0))[0];
}

/**
 * Download file from URL
 */
async function downloadFile(item, title, mediaType, tempDir) {
    const downloadUrl = item.url || item.download_url;
    if (!downloadUrl) {
        throw new Error('No download URL found');
    }

    // Create safe filename
    const ext = item.extension || (mediaType === 'video' ? 'mp4' : 'mp3');
    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const filename = `${safeTitle}_${Date.now()}.${ext}`;
    const filePath = path.join(tempDir, filename);

    console.log(`Downloading to: ${filePath}`);

    // Download with progress
    const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    // Verify file was downloaded
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
        throw new Error('Downloaded file is empty');
    }

    return filePath;
}
