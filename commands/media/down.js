const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Store active downloads with their details
const activeDownloads = new Map();

// Track user cooldowns
const userCooldowns = new Map();
const COOLDOWN_TIME = 30000; // 30 seconds

// Track download stats
const downloadStats = {
    total: 0,
    completed: 0,
    failed: 0,
    totalBytes: 0,
    startTime: Date.now()
};

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

async function updateProgress(sock, chatId, messageKey, percent, downloaded, total, fileName, speed = null, eta = null, status = 'downloading') {
    const barLength = 20;
    const filled = Math.round((percent * barLength) / 100);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    
    let text = '';
    if (status === 'downloading') {
        let speedText = speed ? `⚡ Speed: ${speed}/s` : '';
        let etaText = eta ? `⏱️ ETA: ${eta}` : '';
        text = `📥 *Downloading...*\n\n` +
               `${bar} ${percent}%\n` +
               `📦 Downloaded: ${downloaded} / ${total}\n` +
               `📁 File: ${fileName}\n` +
               `${speedText} ${etaText}`.trim();
    } else if (status === 'complete') {
        text = `✅ *Download complete!*\n\n` +
               `📁 File: ${fileName}\n` +
               `📦 Size: ${total}\n` +
               `📤 Preparing to send...`;
    } else if (status === 'sending') {
        text = `📤 *Sending to WhatsApp...*\n\n` +
               `📁 File: ${fileName}\n` +
               `📦 Size: ${total}`;
    } else if (status === 'error') {
        text = `❌ *Download failed*\n\n` +
               `📁 File: ${fileName}\n` +
               `Error: ${downloaded}`;
    }
    
    await sock.sendMessage(chatId, {
        text: text,
        edit: messageKey
    });
}

async function downloadFile(sock, chatId, messageKey, url, fileName, contentLength, contentType, context) {
    // FIXED: Get sender from context
    const { sender, reply, react } = context;
    const senderNumber = sender ? sender.split('@')[0] : 'Unknown';
    
    const downloadId = `${chatId}_${Date.now()}`;
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempFile = path.join(TEMP_DIR, `download_${Date.now()}_${safeFileName}`);
    
    // Register this download
    activeDownloads.set(downloadId, { 
        chatId, 
        fileName, 
        progress: 0, 
        status: 'starting',
        url: url.substring(0, 50) + '...',
        startTime: Date.now(),
        requestedBy: senderNumber
    });
    
    downloadStats.total++;
    
    try {
        const startTime = Date.now();
        let lastUpdate = 0;
        
        const downloadResponse = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 7200000, // 2 hours
            maxContentLength: Infinity,
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.lengthComputable) {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    const downloaded = formatFileSize(progressEvent.loaded);
                    const total = formatFileSize(progressEvent.total);
                    
                    // Calculate speed and ETA
                    const elapsed = (Date.now() - startTime) / 1000; // seconds
                    const speed = progressEvent.loaded / elapsed; // bytes per second
                    const speedFormatted = formatFileSize(speed);
                    
                    let eta = null;
                    if (speed > 0) {
                        const remainingBytes = progressEvent.total - progressEvent.loaded;
                        const etaSeconds = remainingBytes / speed;
                        eta = formatTime(etaSeconds * 1000);
                    }
                    
                    // Update progress in map
                    const download = activeDownloads.get(downloadId);
                    if (download) {
                        download.progress = percent;
                        download.status = 'downloading';
                        download.speed = speedFormatted;
                        download.eta = eta;
                        activeDownloads.set(downloadId, download);
                    }
                    
                    // Update WhatsApp message (throttle to avoid rate limits)
                    if (percent % 5 === 0 || percent === 100 || Date.now() - lastUpdate > 5000) {
                        lastUpdate = Date.now();
                        updateProgress(sock, chatId, messageKey, percent, downloaded, total, fileName, speedFormatted, eta);
                    }
                }
            }
        });

        const writer = fs.createWriteStream(tempFile);
        downloadResponse.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const stats = fs.statSync(tempFile);
        if (stats.size === 0) throw new Error('File is empty');

        // Check file size limit (WhatsApp limit is ~2GB for documents)
        const WA_FILE_LIMIT = 1900 * 1024 * 1024; // 1.9GB (safe limit)
        if (stats.size > WA_FILE_LIMIT) {
            throw new Error(`File too large (${formatFileSize(stats.size)}). WhatsApp limit is ~1.9GB`);
        }

        // Update status
        const download = activeDownloads.get(downloadId);
        if (download) {
            download.progress = 100;
            download.status = 'complete';
            download.completedAt = Date.now();
            activeDownloads.set(downloadId, download);
        }

        await updateProgress(sock, chatId, messageKey, 100, formatFileSize(stats.size), formatFileSize(stats.size), fileName, null, null, 'complete');
        await updateProgress(sock, chatId, messageKey, 100, formatFileSize(stats.size), formatFileSize(stats.size), fileName, null, null, 'sending');
        
        // Update status
        if (download) {
            download.status = 'sending';
            activeDownloads.set(downloadId, download);
        }
        
        // Read file and send
        const fileBuffer = fs.readFileSync(tempFile);
        
        // Send with caption based on context
        const caption = `✅ *Download complete!*\n\n` +
                       `📁 *File:* ${fileName}\n` +
                       `📦 *Size:* ${formatFileSize(stats.size)}\n` +
                       `⚡ *Speed:* ${download?.speed || 'N/A'}\n` +
                       `⏱️ *Time:* ${formatTime(Date.now() - startTime)}\n` +
                       `👤 *Requested by:* @${senderNumber}`;
        
        await sock.sendMessage(chatId, {
            document: fileBuffer,
            fileName: fileName,
            mimetype: contentType || 'application/octet-stream',
            caption: caption,
            mentions: [sender] // Mention who requested it
        });

        // Update stats
        downloadStats.completed++;
        downloadStats.totalBytes += stats.size;

        // Remove from active downloads
        activeDownloads.delete(downloadId);

    } catch (error) {
        console.error('Download error:', error);
        
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        
        let errorMsg = 'Download failed';
        if (error.response?.status === 404) errorMsg = 'File not found (404)';
        else if (error.response?.status === 403) errorMsg = 'Access denied (403)';
        else if (error.code === 'ECONNABORTED') errorMsg = 'Download timeout';
        else if (error.message.includes('large')) errorMsg = error.message;
        else errorMsg = error.message;
        
        await updateProgress(sock, chatId, messageKey, 0, errorMsg, '', fileName, null, null, 'error');
        
        downloadStats.failed++;
        
        // Remove from active downloads
        activeDownloads.delete(downloadId);
    }
}

module.exports = {
    name: 'download',
    aliases: ['down', 'dl'],
    ownerOnly: false,
    description: 'Download files from direct links with real-time progress',
    usage: 'download <url>',
    category: 'media',
    
    async execute(sock, msg, args, context) {
        const { 
            from,           // Chat ID
            sender,         // Sender's JID
            isGroup,        // Is this a group?
            isOwner,        // Is sender owner?
            isAdmin,        // Is sender admin?
            isBotAdmin,     // Is bot admin?
            reply,          // Quick reply function
            react,          // Reaction function
            groupMetadata   // Group metadata if in group
        } = context;
        
        const url = args[0];
        const senderNumber = sender ? sender.split('@')[0] : 'Unknown';
        
        // 1. Show help if no URL
        if (!url) {
            let helpText = `📥 *Download Command Help*\n\n`;
            helpText += `Usage: \`${config.prefix}download <url>\`\n`;
            helpText += `Aliases: \`${config.prefix}down\`, \`${config.prefix}dl\`, \`${config.prefix}getfile\`\n\n`;
            helpText += `*Examples:*\n`;
            helpText += `• \`${config.prefix}down https://example.com/file.pdf\`\n`;
            helpText += `• \`${config.prefix}dl https://sample.com/video.mp4\`\n\n`;
            
            if (isGroup) {
                helpText += `📍 *Group: ${groupMetadata?.subject || 'Unknown'}*\n`;
                helpText += `👥 *Members:* ${groupMetadata?.participants?.length || '?'}\n`;
            }
            
            helpText += `\n📊 *Active Downloads:* ${activeDownloads.size}`;
            
            return reply(helpText);
        }

        // 2. Validate URL
        try {
            new URL(url);
        } catch (e) {
            return reply('❌ Invalid URL format! Please provide a valid URL including http:// or https://');
        }

        // 3. Check cooldown (except for owner)
        if (!isOwner) {
            if (userCooldowns.has(sender)) {
                const cooldownExpiry = userCooldowns.get(sender);
                if (Date.now() < cooldownExpiry) {
                    const remaining = Math.ceil((cooldownExpiry - Date.now()) / 1000);
                    return reply(`⏳ Please wait ${remaining} seconds before downloading again.`);
                }
            }
        }

        // 4. Group-specific checks
        if (isGroup) {
            // Check if bot is admin (recommended)
            if (!isBotAdmin) {
                await reply('⚠️ *Note:* I am not an admin. Some features may be limited.');
            }
            
            // Log group download
            console.log(`📥 Group download in ${groupMetadata?.subject || from} by @${senderNumber}`);
        }

        await react('⏳');

        try {
            // Send initial progress message (we'll keep this throughout)
            const progressMsg = await sock.sendMessage(from, { 
                text: `🔍 Checking file information for:\n${url.substring(0, 50)}...` 
            });

            // Get file info with HEAD request
            const headResponse = await axios({
                method: 'HEAD',
                url: url,
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: (status) => status < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }).catch(() => ({ headers: {} }));

            const contentLength = headResponse.headers['content-length'];
            const contentType = headResponse.headers['content-type'] || 'application/octet-stream';
            
            // Extract filename
            let fileName = url.split('/').pop().split('?')[0] || 'file';
            const contentDisposition = headResponse.headers['content-disposition'];
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) fileName = match[1].replace(/['"]/g, '');
            }

            // Check file size
            if (contentLength) {
                const sizeMB = parseInt(contentLength) / (1024 * 1024);
                if (sizeMB > 1900 && !isOwner) {
                    return reply(`❌ File too large (${sizeMB.toFixed(2)} MB). Max allowed: 1900 MB`);
                }
            }

            // Check if URL points to a webpage
            if (contentType && contentType.includes('text/html')) {
                await sock.sendMessage(from, {
                    text: '⚠️ *Warning:* This appears to be a webpage, not a direct download.\nThe download may fail or download an HTML file.',
                    edit: progressMsg.key
                });
            }

            // Start download in background - PASS THE FULL CONTEXT
            downloadFile(sock, from, progressMsg.key, url, fileName, contentLength, contentType, context)
                .catch(err => {
                    console.error('Background download error:', err);
                    sock.sendMessage(from, { 
                        text: '❌ Download failed in background. Check logs.',
                        edit: progressMsg.key 
                    });
                });

            // Send confirmation with file info
            const confirmationMsg = `✅ *Download started!*\n\n` +
                `📁 *File:* ${fileName}\n` +
                `📦 *Size:* ${contentLength ? formatFileSize(parseInt(contentLength)) : 'Unknown'}\n` +
                `📊 *Type:* ${contentType || 'Unknown'}\n` +
                `👤 *Requested by:* @${senderNumber}\n\n` +
                `📊 *Active downloads:* ${activeDownloads.size + 1}\n` +
                `📌 *Status:* Check with \`${config.prefix}dlstatus\`\n` +
                `⏱️ *ETA:* Calculating...`;

            await sock.sendMessage(from, { 
                text: confirmationMsg,
                mentions: [sender]
            });

            // Set cooldown
            if (!isOwner) {
                userCooldowns.set(sender, Date.now() + COOLDOWN_TIME);
                setTimeout(() => userCooldowns.delete(sender), COOLDOWN_TIME);
            }

            await react('✅');

        } catch (error) {
            console.error('Download command error:', error);
            await reply(`❌ Failed to start download: ${error.message}`);
            await react('❌');
        }
    }
};

// Status command to check active downloads
module.exports.dlstatus = {
    name: 'dlstatus',
    aliases: ['downloads', 'activedl', 'dlstats'],
    description: 'Check status of active downloads and statistics',
    usage: 'dlstatus',
    category: 'general',
    
    async execute(sock, msg, args, context) {
        const { from, reply, isOwner } = context;
        
        let status = '';
        
        // Show active downloads
        if (activeDownloads.size === 0) {
            status += '📊 *No active downloads.*\n\n';
        } else {
            status += `📊 *Active Downloads: ${activeDownloads.size}*\n\n`;
            let i = 1;
            for (const [id, download] of activeDownloads.entries()) {
                const elapsed = formatTime(Date.now() - download.startTime);
                status += `${i}. 📁 *${download.fileName}*\n`;
                status += `   📊 Progress: ${download.progress}%\n`;
                status += `   📍 Status: ${download.status}\n`;
                status += `   ⏱️ Elapsed: ${elapsed}\n`;
                status += `   👤 Requested by: @${download.requestedBy}\n`;
                if (download.speed) status += `   ⚡ Speed: ${download.speed}\n`;
                if (download.eta) status += `   ⏳ ETA: ${download.eta}\n`;
                if (i < activeDownloads.size) status += '\n';
                i++;
            }
        }
        
        // Show statistics
        const uptime = formatTime(Date.now() - downloadStats.startTime);
        status += `\n📈 *Download Statistics*\n`;
        status += `• Total downloads: ${downloadStats.total}\n`;
        status += `• Completed: ${downloadStats.completed}\n`;
        status += `• Failed: ${downloadStats.failed}\n`;
        status += `• Total data: ${formatFileSize(downloadStats.totalBytes)}\n`;
        status += `• Bot uptime: ${uptime}\n`;
        
        // Owner-only detailed stats
        if (isOwner && activeDownloads.size > 0) {
            status += `\n🔧 *Debug Info (Owner Only)*\n`;
            for (const [id, download] of activeDownloads.entries()) {
                status += `• ID: ${id.substring(0, 10)}...\n`;
            }
        }
        
        await reply(status);
    }
};

// Clean up old downloads periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - 3600000;
    for (const [id, download] of activeDownloads.entries()) {
        if (download.status === 'complete' && download.completedAt < oneHourAgo) {
            activeDownloads.delete(id);
        }
    }
}, 3600000);
