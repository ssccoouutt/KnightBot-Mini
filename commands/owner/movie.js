/**
 * Movie Downloader - Search, download movie and upload to Google Drive
 */

const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Cineverse base URL
const CINEVERSE_BASE = "https://cineverse.name.ng";

// Google Drive Configuration
const DRIVE_FOLDER_ID = '1vCEe1RQPN3tmBg5VZ8ojQnYrjdJ6K61v'; // Moviebox folder
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;

// Store browser instance (reuse across searches)
let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        console.log('[MOVIE] Launching browser...');
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
    }
    return browserInstance;
}

// ==================== GOOGLE DRIVE FUNCTIONS ====================

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        
        console.log('[MOVIE] Fetching Google Drive token...');
        
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        const tempTokenFile = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenDir = path.dirname(tempTokenFile);
        if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
        
        const tokenWriter = fs.createWriteStream(tempTokenFile);
        tokenResponse.data.pipe(tokenWriter);
        
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        
        const tokenData = JSON.parse(fs.readFileSync(tempTokenFile, 'utf8'));
        fs.unlinkSync(tempTokenFile);
        
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('[MOVIE] Token expired, refreshing...');
            const refreshData = {
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
            cachedToken = refreshResponse.data.access_token;
            tokenExpiry = new Date(Date.now() + 3600 * 1000);
        } else {
            cachedToken = tokenData.token;
            tokenExpiry = new Date(expiryDate);
        }
        
        return cachedToken;
        
    } catch (error) {
        console.error('[MOVIE] Failed to get Google Drive token:', error.message);
        return null;
    }
}

async function uploadToDrive(filePath, fileName, onProgress, progressMsgKey) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        console.log(`[MOVIE] Uploading ${fileName} to Google Drive folder...`);
        
        const stats = fs.statSync(filePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        const fileSizeBytes = stats.size;
        
        // Step 1: Start resumable upload session with folder parent
        const metadata = {
            name: fileName,
            mimeType: 'video/mp4',
            parents: [DRIVE_FOLDER_ID]
        };
        
        const startResponse = await axios({
            method: 'POST',
            url: UPLOAD_URL,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': 'video/mp4',
                'X-Upload-Content-Length': fileSizeBytes
            },
            data: metadata
        });
        
        const uploadUrl = startResponse.headers.location;
        if (!uploadUrl) {
            throw new Error('Failed to get upload URL');
        }
        
        console.log(`[MOVIE] Resumable upload URL obtained, starting upload...`);
        
        // Step 2: Upload the file in chunks
        const fileStream = fs.createReadStream(filePath);
        let uploadedBytes = 0;
        let lastPercent = 0;
        
        const uploadResponse = await axios({
            method: 'PUT',
            url: uploadUrl,
            data: fileStream,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': fileSizeBytes
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000, // 10 minutes timeout for large files
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    const percent = (progressEvent.loaded / progressEvent.total * 100).toFixed(1);
                    const percentInt = Math.floor(percent);
                    if (percentInt > lastPercent && percentInt % 10 === 0) {
                        lastPercent = percentInt;
                        onProgress(percent, progressEvent.loaded, progressEvent.total, progressMsgKey);
                    }
                }
            }
        });
        
        const fileId = uploadResponse.data.id;
        
        // Step 3: Make file public
        try {
            await axios.post(`${FILE_URL}/${fileId}/permissions`, {
                role: 'reader',
                type: 'anyone'
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.log('[MOVIE] Could not set public permission, but file still accessible');
        }
        
        const directLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const viewLink = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
        
        console.log(`[MOVIE] Upload complete: ${fileSizeMB} MB`);
        
        return { directLink, viewLink, fileId, size: fileSizeMB };
        
    } catch (error) {
        console.error('[MOVIE] Upload to Drive failed:', error.message);
        throw error;
    }
}

// ==================== MOVIE FUNCTIONS ====================

async function searchMovie(page, movieName) {
    const searchUrl = `${CINEVERSE_BASE}/search?q=${encodeURIComponent(movieName)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const results = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a');
        for (let link of links) {
            const text = link.innerText.trim();
            const href = link.href;
            if (text && text.length > 3 && text.length < 200 && href && 
                (href.includes('/movie/') || href.includes('/tv/'))) {
                const lines = text.split('\n');
                let year = '', rating = '', title = '';
                for (let line of lines) {
                    if (line.match(/\d{4}/)) year = line.trim();
                    else if (line.match(/\d\.\d/)) rating = line.trim();
                    else if (line.length > 2 && !line.match(/\d/)) title = line.trim();
                }
                results.push({
                    title: title || text.split('\n')[2] || text,
                    year: year,
                    rating: rating,
                    url: href
                });
            }
        }
        const unique = [];
        const seen = new Set();
        for (let r of results) {
            if (!seen.has(r.url)) {
                seen.add(r.url);
                unique.push(r);
            }
        }
        return unique;
    });
    
    return results;
}

async function getDownloadOptions(page, movieUrl) {
    await page.goto(movieUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Click Download button
    const buttons = await page.$$('button');
    for (const btn of buttons) {
        const text = await btn.innerText();
        if (text && text.includes('Download')) {
            await btn.click();
            break;
        }
    }
    
    await page.waitForTimeout(3000);
    
    // Click Video tab
    const videoTab = await page.$('button:has-text("Video")');
    if (videoTab) {
        await videoTab.click();
        await page.waitForTimeout(1000);
    }
    
    // Find quality buttons
    const videoPanel = await page.$('[role="tabpanel"][aria-labelledby*="video"]');
    if (!videoPanel) return [];
    
    const downloadButtons = await videoPanel.$$('button');
    const qualityButtons = [];
    for (const btn of downloadButtons) {
        const text = await btn.innerText();
        if (text && text.includes('Download')) {
            qualityButtons.push(btn);
        }
    }
    
    const qualities = [];
    for (let i = 0; i < qualityButtons.length; i++) {
        const btn = qualityButtons[i];
        const parent = await btn.evaluateHandle(el => el.parentElement.parentElement);
        const parentText = await parent.innerText();
        
        const qualityMatch = parentText.match(/(\d{3,4}p)/i);
        const sizeMatch = parentText.match(/([\d.]+\s*(?:MB|GB))/i);
        
        if (qualityMatch) {
            const quality = qualityMatch[1];
            const size = sizeMatch ? sizeMatch[1] : "Unknown";
            
            qualities.push({
                quality: quality,
                size: size,
                button: btn
            });
        }
    }
    
    return qualities;
}

async function getDownloadUrl(page, qualityInfo) {
    const button = qualityInfo.button;
    
    const downloadUrl = await page.evaluate(async (buttonElement) => {
        return new Promise((resolve) => {
            const originalOpen = window.open;
            let capturedUrl = null;
            
            window.open = function(url) {
                capturedUrl = url;
                if (originalOpen) originalOpen.call(this, url);
                return null;
            };
            
            buttonElement.click();
            
            setTimeout(() => {
                window.open = originalOpen;
                resolve(capturedUrl);
            }, 2000);
        });
    }, button);
    
    return downloadUrl;
}

async function downloadFile(url, filepath, onProgress, progressMsgKey, sock, from, msg) {
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 600000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    
    const totalLength = parseInt(response.headers['content-length'], 10);
    let downloadedLength = 0;
    let lastPercent = 0;
    
    const writer = fs.createWriteStream(filepath);
    
    response.data.on('data', async (chunk) => {
        downloadedLength += chunk.length;
        if (totalLength) {
            const percent = (downloadedLength / totalLength * 100).toFixed(1);
            const percentInt = Math.floor(percent);
            if (percentInt > lastPercent && percentInt % 10 === 0) {
                lastPercent = percentInt;
                if (onProgress) {
                    await onProgress(percent, downloadedLength, totalLength, progressMsgKey, sock, from);
                }
            }
        }
    });
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

module.exports = {
    name: 'movie',
    aliases: ['cinema', 'cineverse', 'downloadmovie'],
    description: 'Search, download and upload movies to Google Drive',
    usage: '.movie <movie name>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;

        if (args.length === 0) {
            await reply(`🎬 *Movie Downloader*\n\n` +
                       `Usage: \`${config.prefix}movie <movie name>\`\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}movie 3 idiots\`\n` +
                       `• \`${config.prefix}movie stranger things\`\n\n` +
                       `*Note:* Only bot owners can use this command.`);
            return;
        }

        const query = args.join(' ');
        
        await react('🔍');
        
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 'searching',
            query: query,
            results: [],
            selectedMovie: null,
            qualities: [],
            page: null,
            browser: null,
            progressMsgKey: null
        });
        
        await reply(`🔍 Searching for: *${query}*...`);
        
        try {
            const browser = await getBrowser();
            const page = await browser.newPage();
            
            sessionManager.updateSession(sender, from, {
                page: page,
                browser: browser
            });
            
            const results = await searchMovie(page, query);
            
            if (!results || results.length === 0) {
                await reply(`❌ No results found for "${query}".\n\nTry a different search term.`);
                await page.close();
                sessionManager.clearSession(session.id);
                await react('❌');
                return;
            }
            
            sessionManager.updateSession(sender, from, {
                step: 'selecting',
                results: results,
                query: query
            });
            
            const sessionId = session.id.split(':').pop();
            
            const buttons = [];
            for (let i = 0; i < Math.min(10, results.length); i++) {
                const result = results[i];
                let buttonText = result.title;
                if (result.year) buttonText += ` (${result.year})`;
                if (result.rating) buttonText += ` ⭐${result.rating}`;
                
                buttons.push({
                    id: `movie_${sessionId}_${i}`,
                    text: buttonText.substring(0, 50)
                });
            }
            
            const sentMsg = await sendButtons(sock, from, {
                text: `📋 *Found ${results.length} results for "${query}"*\n\nSelect a movie to continue:`,
                footer: 'Movie Downloader',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, { quoted: msg });
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
            await react('✅');
            
        } catch (error) {
            console.error('[MOVIE] Search error:', error);
            await reply(`❌ Search failed: ${error.message}`);
            sessionManager.clearSession(session.id);
            await react('❌');
        }
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) buttonId = listReply.selectedRowId;
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId && buttonId.startsWith('movie_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[2]);
                const results = session.data.results;
                const page = session.data.page;
                
                if (!page) {
                    await reply(`❌ Session expired. Please search again.`);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                if (index >= 0 && index < results.length) {
                    const selectedMovie = results[index];
                    
                    // Send initial progress message that will be edited
                    const progressMsg = await reply(`🎬 *${selectedMovie.title}*\n\n⏳ Getting download options...`);
                    sessionManager.updateSession(sender, from, {
                        step: 'getting_qualities',
                        selectedMovie: selectedMovie,
                        progressMsgKey: progressMsg.key
                    });
                    
                    try {
                        const qualities = await getDownloadOptions(page, selectedMovie.url);
                        
                        if (!qualities || qualities.length === 0) {
                            await sock.sendMessage(from, {
                                text: `❌ No download options found for *${selectedMovie.title}*`,
                                edit: progressMsg.key
                            });
                            await page.close();
                            sessionManager.clearSession(session.id);
                            await react('❌');
                            return true;
                        }
                        
                        sessionManager.updateSession(sender, from, {
                            step: 'selecting_quality',
                            qualities: qualities,
                            selectedMovie: selectedMovie
                        });
                        
                        const sessionId = session.id.split(':').pop();
                        
                        const qualityButtons = [];
                        for (let i = 0; i < qualities.length; i++) {
                            const q = qualities[i];
                            qualityButtons.push({
                                id: `quality_${sessionId}_${i}`,
                                text: `${q.quality} - ${q.size}`
                            });
                        }
                        
                        // Edit the progress message to show quality options
                        await sock.sendMessage(from, {
                            text: `🎬 *${selectedMovie.title}*\n\n📥 Choose quality:`,
                            edit: progressMsg.key
                        });
                        
                        const sentMsg = await sendButtons(sock, from, {
                            text: `🎬 *${selectedMovie.title}*\n\n📥 Choose quality:`,
                            footer: 'Movie Downloader',
                            buttons: qualityButtons,
                            aimode: FORCE_AI_MODE
                        }, {});
                        
                        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
                        
                    } catch (error) {
                        console.error('[MOVIE] Error getting qualities:', error);
                        await sock.sendMessage(from, {
                            text: `❌ Failed to get download options: ${error.message}`,
                            edit: progressMsg.key
                        });
                        await page.close();
                        sessionManager.clearSession(session.id);
                        await react('❌');
                    }
                }
                return true;
            }
            
            if (buttonId && buttonId.startsWith('quality_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[2]);
                const qualities = session.data.qualities;
                const selectedMovie = session.data.selectedMovie;
                const page = session.data.page;
                const progressMsgKey = session.data.progressMsgKey;
                
                if (!page) {
                    await reply(`❌ Session expired. Please search again.`);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                if (index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    
                    // Get the progress message to edit
                    let progressMsg;
                    if (progressMsgKey) {
                        // Get the message to edit
                        progressMsg = { key: { id: progressMsgKey, remoteJid: from } };
                    } else {
                        progressMsg = await reply(`🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n⏳ Getting download link...`);
                        sessionManager.updateSession(sender, from, {
                            progressMsgKey: progressMsg.key
                        });
                    }
                    
                    try {
                        const downloadUrl = await getDownloadUrl(page, selectedQuality);
                        
                        if (downloadUrl && downloadUrl !== 'null') {
                            // Update progress message
                            await sock.sendMessage(from, {
                                text: `🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n📥 *Downloading video...*\n0%`,
                                edit: progressMsg.key
                            });
                            
                            // Create temp directory
                            const tempDir = path.join(process.cwd(), 'temp');
                            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                            
                            const filename = `${selectedMovie.title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedQuality.quality}.mp4`;
                            const filepath = path.join(tempDir, filename);
                            
                            // Download the video with progress updates
                            await downloadFile(downloadUrl, filepath, async (percent, downloaded, total, msgKey, sockClient, chatId) => {
                                await sockClient.sendMessage(chatId, {
                                    text: `🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n📥 *Downloading video...*\n${percent}% (${(downloaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`,
                                    edit: msgKey
                                });
                            }, progressMsg.key, sock, from);
                            
                            const stats = fs.statSync(filepath);
                            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                            
                            // Update progress message for upload
                            await sock.sendMessage(from, {
                                text: `🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n✅ *Download complete!* (${fileSizeMB} MB)\n\n📤 *Uploading to Google Drive...*\n0%`,
                                edit: progressMsg.key
                            });
                            
                            // Upload to Google Drive with progress
                            let lastUploadPercent = 0;
                            const uploadResult = await uploadToDrive(filepath, filename, async (percent, loaded, total, msgKey, sockClient, chatId) => {
                                await sockClient.sendMessage(chatId, {
                                    text: `🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n✅ *Download complete!* (${fileSizeMB} MB)\n\n📤 *Uploading to Google Drive...*\n${percent}% (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`,
                                    edit: msgKey
                                });
                            }, progressMsg.key, sock, from);
                            
                            // Clean up temp file
                            fs.unlinkSync(filepath);
                            
                            // Final message with links
                            const finalMessage = `🎬 *${selectedMovie.title}*\n` +
                                                `📥 *Quality:* ${selectedQuality.quality}\n` +
                                                `📊 *Size:* ${selectedQuality.size} (Actual: ${uploadResult.size} MB)\n\n` +
                                                `🔗 *Direct Download Link:*\n` +
                                                `\`${uploadResult.directLink}\`\n\n` +
                                                `👁️ *View Link:*\n${uploadResult.viewLink}\n\n` +
                                                `💡 Click or copy the link to download.`;
                            
                            await sock.sendMessage(from, {
                                text: finalMessage,
                                edit: progressMsg.key
                            });
                            await react('✅');
                            
                            // Clean up page
                            await page.close();
                            sessionManager.clearSession(session.id);
                            
                        } else {
                            await sock.sendMessage(from, {
                                text: `❌ Failed to get download link for ${selectedQuality.quality}`,
                                edit: progressMsg.key
                            });
                            await react('❌');
                        }
                        
                    } catch (error) {
                        console.error('[MOVIE] Error:', error);
                        await sock.sendMessage(from, {
                            text: `❌ Failed: ${error.message}`,
                            edit: progressMsg.key
                        });
                        await page.close();
                        await react('❌');
                    }
                }
                return true;
            }
        }
        
        return true;
    }
};

// Clean up browser on process exit
process.on('exit', async () => {
    if (browserInstance) await browserInstance.close();
});

process.on('SIGINT', async () => {
    if (browserInstance) await browserInstance.close();
    process.exit();
});

process.on('SIGTERM', async () => {
    if (browserInstance) await browserInstance.close();
    process.exit();
});
