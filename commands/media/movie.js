/**
 * Movie Downloader - Search, download movie and upload to Google Drive
 * 
 * FIXED ISSUES:
 * 1. Search Results: Now correctly extracts movie titles instead of just showing 'Movie'.
 * 2. 0 MB Download: Improved download URL capture and added validation for content-length.
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
const CINEVERSE_BASE = "https://cinverse.com.ng";

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
        
        console.log(`[MOVIE] Uploading ${fileName} to Google Drive...`);
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error('Cannot upload an empty file (0 bytes)');
        }

        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        const fileSizeBytes = stats.size;
        
        // Step 1: Start resumable upload session to specific folder
        const metadata = {
            name: fileName,
            mimeType: 'video/mp4',
            parents: [DRIVE_FOLDER_ID] // Upload to Moviebox folder
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
                    onProgress(percent, progressEvent.loaded, progressEvent.total, progressMsgKey);
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
            if (text && text.length > 3 && href && (href.includes('/movie/') || href.includes('/tv/'))) {
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                let year = '', rating = '', title = '';
                
                // FIXED: Robust title extraction
                for (let line of lines) {
                    if (line.match(/^\d{4}$/)) year = line;
                    else if (line.match(/^\d\.\d$/)) rating = line;
                    else if (line.toLowerCase() !== 'movie' && line.length > title.length) {
                        title = line;
                    }
                }
                
                // Fallback to last line if title extraction fails
                if (!title) title = lines[lines.length - 1] || text;

                results.push({
                    title: title,
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
    
    // Click Download button - Use evaluate to bypass "enabled" check if it's stuck
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.innerText.includes('Download'));
        if (btn) btn.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Click Video tab - Use evaluate to bypass "enabled" check
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.innerText.includes('Video'));
        if (btn) btn.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Find quality buttons
    const downloadButtons = await page.$$('button:has-text("Download")');
    
    const qualities = [];
    for (const btn of downloadButtons) {
        const info = await btn.evaluate(el => {
            let curr = el;
            let text = "";
            for(let i=0; i<5; i++) {
                if (!curr) break;
                text += " " + curr.innerText;
                if (text.includes('p')) break;
                curr = curr.parentElement;
            }
            return text;
        });
        
        const qualityMatch = info.match(/(\d{3,4}p)/i);
        const sizeMatch = info.match(/([\d.]+\s*(?:MB|GB))/i);
        
        if (qualityMatch) {
            qualities.push({
                quality: qualityMatch[1],
                size: sizeMatch ? sizeMatch[1] : "Unknown",
                button: btn
            });
        }
    }
    
    // Fallback: If no quality matched but we have download buttons, take the last one
    if (qualities.length === 0 && downloadButtons.length > 0) {
        qualities.push({
            quality: "Original",
            size: "Unknown",
            button: downloadButtons[downloadButtons.length - 1]
        });
    }
    
    return qualities;
}

async function getDownloadUrl(page, qualityInfo) {
    const button = qualityInfo.button;
    
    // Listen for requests and responses to capture the correct URL
    let capturedUrl = null;
    const requestHandler = (request) => {
        const url = request.url();
        if (url.startsWith('data:')) return;
        
        const isDownload = url.includes('download') || 
                           url.match(/\.(mp4|mkv|mov|avi|m3u8)(\?|$)/i) || 
                           url.includes('get_download_url') || 
                           url.includes('storage') ||
                           url.includes('stream') ||
                           url.includes('file');
        
        if (isDownload && !url.includes('google-analytics') && !url.includes('facebook')) {
            capturedUrl = url;
        }
    };

    const responseHandler = (response) => {
        const headers = response.headers();
        if (headers['content-disposition']?.includes('attachment') || headers['content-type']?.includes('video/')) {
            capturedUrl = response.url();
        }
    };
    
    page.on('request', requestHandler);
    page.on('response', responseHandler);
    
    await page.evaluate((btn) => {
        btn.click();
    }, button);
    
    // Wait for the request to be captured (up to 30 seconds)
    let count = 0;
    while (!capturedUrl && count < 300) {
        await page.waitForTimeout(100);
        count++;
    }
    
    page.off('request', requestHandler);
    page.off('response', responseHandler);
    
    return capturedUrl;
}

async function downloadFile(url, filepath, onProgress, progressMsgKey, sock, from) {
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 600000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': CINEVERSE_BASE
        }
    });
    
    const totalLength = parseInt(response.headers['content-length'], 10);
    
    // FIXED: Prevent 0 MB issue
    if (isNaN(totalLength) || totalLength <= 0) {
        throw new Error('Invalid file size received from server (0 MB)');
    }

    let downloadedLength = 0;
    let lastPercent = 0;
    
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);
    
    response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        if (onProgress && totalLength) {
            const percent = (downloadedLength / totalLength * 100).toFixed(1);
            const percentInt = Math.floor(parseFloat(percent));
            if (percentInt > lastPercent && percentInt % 10 === 0) {
                lastPercent = percentInt;
                onProgress(percent, downloadedLength, totalLength, progressMsgKey, sock, from);
            }
        }
    });
    
    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            const stats = fs.statSync(filepath);
            if (stats.size === 0) reject(new Error('Downloaded file is empty (0 bytes)'));
            else resolve();
        });
        writer.on('error', reject);
        response.data.on('error', reject);
    });
}

module.exports = {
    name: 'movie',
    aliases: ['cinema', 'cineverse', 'downloadmovie'],
    description: 'Search, download and upload movies to Google Drive',
    usage: '.movie <movie name>',
    category: 'media',
    ownerOnly: false,

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
            browser: null
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
                    
                    await reply(`🎬 *${selectedMovie.title}*\n\n⏳ Getting download options...`);
                    
                    sessionManager.updateSession(sender, from, {
                        step: 'getting_qualities',
                        selectedMovie: selectedMovie
                    });
                    
                    try {
                        const qualities = await getDownloadOptions(page, selectedMovie.url);
                        
                        if (!qualities || qualities.length === 0) {
                            await reply(`❌ No download options found for *${selectedMovie.title}*`);
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
                        
                        const sentMsg = await sendButtons(sock, from, {
                            text: `🎬 *${selectedMovie.title}*\n\n📥 Choose quality:`,
                            footer: 'Movie Downloader',
                            buttons: qualityButtons,
                            aimode: FORCE_AI_MODE
                        }, {});
                        
                        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
                        
                    } catch (error) {
                        console.error('[MOVIE] Error getting qualities:', error);
                        await reply(`❌ Failed to get download options: ${error.message}`);
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
                
                if (!page || !selectedMovie || !qualities) {
                    await reply(`❌ Session expired. Please search again.`);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                if (index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    
                    await reply(`⏳ Preparing download for *${selectedMovie.title}* (${selectedQuality.quality})...`);
                    
                    try {
                        const downloadUrl = await getDownloadUrl(page, selectedQuality);
                        
                        if (!downloadUrl) {
                            await reply(`❌ Failed to get direct download link.`);
                            return true;
                        }
                        
                        const fileName = `${selectedMovie.title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedQuality.quality}.mp4`;
                        const filePath = path.join(process.cwd(), 'temp', fileName);
                        const tempDir = path.dirname(filePath);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        
                        const progressMsg = await reply(`📥 Downloading: 0%`);
                        
                        const onDownloadProgress = async (percent) => {
                            await sock.sendMessage(from, { edit: progressMsg.key, text: `📥 Downloading: ${percent}%` });
                        };
                        
                        await downloadFile(downloadUrl, filePath, onDownloadProgress);
                        
                        await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading to Google Drive...` });
                        
                        const onUploadProgress = async (percent) => {
                            await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading: ${percent}%` });
                        };
                        
                        const uploadResult = await uploadToDrive(filePath, fileName, onUploadProgress);
                        
                        fs.unlinkSync(filePath);
                        await page.close();
                        sessionManager.clearSession(session.id);
                        
                        await reply(`✅ *Movie Uploaded Successfully!*\n\n` +
                                   `🎬 *Title:* ${selectedMovie.title}\n` +
                                   `📊 *Size:* ${uploadResult.size} MB\n` +
                                   `📥 *Download Link:* ${uploadResult.directLink}\n\n` +
                                   `🔗 *View Link:* ${uploadResult.viewLink}`);
                        
                        await react('✅');
                        
                    } catch (error) {
                        console.error('[MOVIE] Download/Upload error:', error);
                        await reply(`❌ Failed: ${error.message}`);
                        await react('❌');
                    }
                }
                return true;
            }
        }
        return false;
    }
};