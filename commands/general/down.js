// commands/general/download.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Store active downloads with their update functions
const activeDownloads = new Map();

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function updateProgress(sock, chatId, messageKey, percent, downloaded, total, fileName, status = 'downloading') {
    const barLength = 20;
    const filled = Math.round((percent * barLength) / 100);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    
    let text = '';
    if (status === 'downloading') {
        text = `📥 *Downloading...*\n\n${bar} ${percent}%\n📦 Downloaded: ${downloaded} / ${total}\n📁 File: ${fileName}`;
    } else if (status === 'complete') {
        text = `✅ *Download complete!*\n\n📁 File: ${fileName}\n📦 Size: ${total}\n⏳ Preparing to send...`;
    } else if (status === 'sending') {
        text = `📤 *Sending to WhatsApp...*\n\n📁 File: ${fileName}\n📦 Size: ${total}`;
    } else if (status === 'error') {
        text = `❌ *Download failed*\n\n📁 File: ${fileName}\nError: ${downloaded}`;
    }
    
    await sock.sendMessage(chatId, {
        text: text,
        edit: messageKey
    });
}

async function downloadFile(sock, chatId, messageKey, url, fileName, contentLength, contentType) {
    const downloadId = `${chatId}_${Date.now()}`;
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempFile = path.join(TEMP_DIR, `download_${Date.now()}_${safeFileName}`);
    
    // Register this download
    activeDownloads.set(downloadId, { 
        chatId, 
        fileName, 
        progress: 0, 
        status: 'starting',
        url: url.substring(0, 50) + '...' // Store truncated URL for reference
    });
    
    try {
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
                    
                    // Update progress in map
                    const download = activeDownloads.get(downloadId);
                    if (download) {
                        download.progress = percent;
                        download.status = 'downloading';
                        activeDownloads.set(downloadId, download);
                    }
                    
                    // Update WhatsApp message (throttle to avoid rate limits)
                    if (percent % 5 === 0 || percent === 100) {
                        updateProgress(sock, chatId, messageKey, percent, downloaded, total, fileName);
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
            activeDownloads.set(downloadId, download);
        }

        await updateProgress(sock, chatId, messageKey, 100, formatFileSize(stats.size), formatFileSize(stats.size), fileName, 'complete');
        await updateProgress(sock, chatId, messageKey, 100, formatFileSize(stats.size), formatFileSize(stats.size), fileName, 'sending');
        
        // Update status
        if (download) {
            download.status = 'sending';
            activeDownloads.set(downloadId, download);
        }
        
        // Read file and send
        const fileBuffer = fs.readFileSync(tempFile);
        await sock.sendMessage(chatId, {
            document: fileBuffer,
            fileName: fileName,
            mimetype: contentType || 'application/octet-stream',
            caption: `✅ *Download complete!*\n\n📁 *File:* ${fileName}\n📦 *Size:* ${formatFileSize(stats.size)}`
        });

        // Delete progress message
        await sock.sendMessage(chatId, {
            delete: messageKey
        });

        // Clean up
        fs.unlinkSync(tempFile);
        
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
        
        await updateProgress(sock, chatId, messageKey, 0, errorMsg, '', fileName, 'error');
        
        // Remove from active downloads
        activeDownloads.delete(downloadId);
    }
}

module.exports = {
    name: 'download',
    aliases: ['down', 'dl', 'get'],
    description: 'Download files from direct links',
    usage: 'download <url>',
    category: 'general',
    
    async execute(sock, message, args, context) {
        const { from, reply, react } = context;
        const url = args[0];
        
        if (!url) {
            return reply('❌ Please provide a direct download link!\n\nExample: `.download https://example.com/file.pdf`');
        }

        // Validate URL
        try {
            new URL(url);
        } catch (e) {
            return reply('❌ Invalid URL format!');
        }

        await react('⏳');

        try {
            // Send initial progress message
            const progressMsg = await sock.sendMessage(from, { 
                text: '🔍 Checking file information...' 
            });

            // Get file info with HEAD request
            const headResponse = await axios({
                method: 'HEAD',
                url: url,
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: (status) => status < 400 // Accept redirects
            }).catch(() => ({ headers: {} }));

            const contentLength = headResponse.headers['content-length'];
            const contentType = headResponse.headers['content-type'] || 'application/octet-stream';
            
            // Extract filename from URL or Content-Disposition
            let fileName = url.split('/').pop().split('?')[0] || 'file';
            const contentDisposition = headResponse.headers['content-disposition'];
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) fileName = match[1].replace(/['"]/g, '');
            }

            // Check if URL points to a webpage (likely not a direct download)
            if (contentType && contentType.includes('text/html')) {
                await sock.sendMessage(from, {
                    text: '⚠️ *Warning:* This appears to be a webpage, not a direct download link.\nThe download may fail or download an HTML file instead.',
                    edit: progressMsg.key
                });
            }

            // Start download in background (don't await)
            downloadFile(sock, from, progressMsg.key, url, fileName, contentLength, contentType)
                .catch(err => {
                    console.error('Background download error:', err);
                    sock.sendMessage(from, { 
                        text: '❌ Download failed in background. Check logs.',
                        edit: progressMsg.key 
                    });
                });

            // Send confirmation with file info
            await sock.sendMessage(from, { 
                text: `✅ *Download started in background!*\n\n` +
                      `📁 *File:* ${fileName}\n` +
                      `📦 *Size:* ${contentLength ? formatFileSize(parseInt(contentLength)) : 'Unknown'}\n` +
                      `📊 *Type:* ${contentType || 'Unknown'}\n\n` +
                      `🔄 Check status with \`${config.prefix}dlstatus\`\n` +
                      `📊 Active downloads: ${activeDownloads.size + 1}`
            });

            await react('✅');

        } catch (error) {
            console.error('Download command error:', error);
            await reply('❌ Failed to start download. Check URL and try again.');
            await react('❌');
        }
    }
};

// Also export status command separately (can be used as a subcommand)
module.exports.dlstatus = {
    name: 'dlstatus',
    aliases: ['downloads', 'active'],
    description: 'Check status of active downloads',
    usage: 'dlstatus',
    category: 'general',
    
    async execute(sock, message, args, context) {
        const { from, reply } = context;
        
        if (activeDownloads.size === 0) {
            return reply('📊 No active downloads.');
        }
        
        let status = `📊 *Active Downloads: ${activeDownloads.size}*\n\n`;
        let i = 1;
        for (const [id, download] of activeDownloads.entries()) {
            status += `${i}. 📁 *${download.fileName}*\n`;
            status += `   📊 Progress: ${download.progress}%\n`;
            status += `   📍 Status: ${download.status}\n`;
            if (i < activeDownloads.size) status += '\n';
            i++;
        }
        
        await reply(status);
    }
};
