/**
 * Movie Downloader - Search, download movie and upload to Google Drive
 * 
 * FIXED: Bypasses anti-bot protection using stealth mode and direct API calls
 */

const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Use the correct base URL from your working logs
const CINEVERSE_BASE = "https://cinverse.com.ng";

// Google Drive Configuration
const DRIVE_FOLDER_ID = '1vCEe1RQPN3tmBg5VZ8ojQnYrjdJ6K61v';
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;
let browserInstance = null;

// Stealth browser with real user agent
async function getBrowser() {
    if (!browserInstance) {
        console.log('[MOVIE] Launching stealth browser...');
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
    }
    return browserInstance;
}

// Create stealth page with realistic viewport
async function createStealthPage(browser) {
    const page = await browser.newPage();
    
    // Set realistic viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Set realistic user agent
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    });
    
    // Remove webdriver痕迹
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
    
    return page;
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

async function uploadToDrive(filePath, fileName, onProgress) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        console.log(`[MOVIE] Uploading ${fileName} to Google Drive...`);
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) throw new Error('Cannot upload an empty file (0 bytes)');

        const fileSizeBytes = stats.size;
        
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
        if (!uploadUrl) throw new Error('Failed to get upload URL');
        
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
            timeout: 600000,
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    const percent = (progressEvent.loaded / progressEvent.total * 100).toFixed(1);
                    onProgress(percent);
                }
            }
        });
        
        const fileId = uploadResponse.data.id;
        
        try {
            await axios.post(`${FILE_URL}/${fileId}/permissions`, {
                role: 'reader',
                type: 'anyone'
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.log('[MOVIE] Could not set public permission');
        }
        
        const directLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const viewLink = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
        
        return { directLink, viewLink, fileId, size: (stats.size / (1024 * 1024)).toFixed(2) };
        
    } catch (error) {
        console.error('[MOVIE] Upload to Drive failed:', error.message);
        throw error;
    }
}

// ==================== MOVIE FUNCTIONS ====================

async function searchMovie(page, movieName) {
    const searchUrl = `${CINEVERSE_BASE}/search?q=${encodeURIComponent(movieName)}`;
    console.log(`[MOVIE] Searching: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // Try to wait for results to load
    try {
        await page.waitForSelector('a[href*="/movie/"]', { timeout: 10000 });
    } catch (e) {
        console.log('[MOVIE] No movie links found');
    }
    
    const results = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a[href*="/movie/"]');
        
        for (let link of links) {
            const text = link.innerText.trim();
            const href = link.href;
            
            if (text && text.length > 3 && href) {
                // Extract year from text
                const yearMatch = text.match(/\b(19|20)\d{2}\b/);
                const year = yearMatch ? yearMatch[0] : '';
                
                // Clean title (remove year and extra spaces)
                let title = text.replace(/\b(19|20)\d{2}\b/, '').trim();
                title = title.split('\n')[0].trim();
                
                if (title && title.length > 2 && title.toLowerCase() !== 'movie') {
                    results.push({
                        title: title,
                        year: year,
                        url: href
                    });
                }
            }
        }
        
        // Remove duplicates
        const unique = [];
        const seen = new Set();
        for (let r of results) {
            if (!seen.has(r.url)) {
                seen.add(r.url);
                unique.push(r);
            }
        }
        
        return unique.slice(0, 10);
    });
    
    console.log(`[MOVIE] Found ${results.length} results`);
    return results;
}

async function getDirectVideoUrl(page, movieUrl) {
    console.log(`[MOVIE] Extracting video URL from: ${movieUrl}`);
    
    await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // Try multiple methods to get video URL
    
    // Method 1: Check for video element source
    const videoUrl = await page.evaluate(() => {
        // Check video tag
        const video = document.querySelector('video');
        if (video && video.src && video.src.startsWith('http')) {
            return video.src;
        }
        
        // Check source tags
        const source = document.querySelector('source');
        if (source && source.src && source.src.startsWith('http')) {
            return source.src;
        }
        
        // Check iframe embeds
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.src) {
            return iframe.src;
        }
        
        return null;
    });
    
    if (videoUrl && videoUrl.includes('http')) {
        console.log(`[MOVIE] Found video URL: ${videoUrl.substring(0, 100)}`);
        return videoUrl;
    }
    
    // Method 2: Look for download links in the page
    const downloadLinks = await page.evaluate(() => {
        const links = [];
        const patterns = ['download', 'drive.google', 'usercontent', 'googledrive', 'mega', 'mediafire'];
        
        document.querySelectorAll('a').forEach(link => {
            const href = link.href;
            const text = link.innerText.toLowerCase();
            
            for (const pattern of patterns) {
                if (href.includes(pattern) || text.includes(pattern)) {
                    links.push(href);
                    break;
                }
            }
        });
        
        return links;
    });
    
    if (downloadLinks.length > 0) {
        console.log(`[MOVIE] Found download links:`, downloadLinks);
        return downloadLinks[0];
    }
    
    // Method 3: Extract from script tags (for embedded JSON data)
    const scriptUrl = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script');
        const urlPattern = /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|mkv|avi)[^\s"'<>]*)/gi;
        
        for (const script of scripts) {
            const content = script.textContent;
            if (content) {
                const matches = content.match(urlPattern);
                if (matches && matches.length > 0) {
                    return matches[0];
                }
            }
        }
        return null;
    });
    
    if (scriptUrl) {
        console.log(`[MOVIE] Found video URL in script: ${scriptUrl}`);
        return scriptUrl;
    }
    
    console.log('[MOVIE] No video URL found');
    return null;
}

async function downloadFile(url, filepath, onProgress, sock, from, progressMsgKey) {
    console.log(`[MOVIE] Downloading from: ${url.substring(0, 100)}`);
    
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 600000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': CINEVERSE_BASE
        }
    });
    
    const totalLength = parseInt(response.headers['content-length'], 10);
    
    if (isNaN(totalLength) || totalLength <= 0) {
        throw new Error('Invalid file size received from server');
    }
    
    console.log(`[MOVIE] File size: ${(totalLength / 1024 / 1024).toFixed(2)} MB`);
    
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
                onProgress(percent, sock, from, progressMsgKey);
            }
        }
    });
    
    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            const stats = fs.statSync(filepath);
            if (stats.size === 0) reject(new Error('Downloaded file is empty'));
            else resolve();
        });
        writer.on('error', reject);
        response.data.on('error', reject);
    });
}

module.exports = {
    name: 'movie',
    aliases: ['cinema', 'cineverse', 'downloadmovie'],
    description: 'Search and download movies from Cineverse',
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
                       `• \`${config.prefix}movie inception\``);
            return;
        }

        const query = args.join(' ');
        
        await react('🔍');
        
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 'searching',
            query: query,
            results: [],
            selectedMovie: null,
            videoUrl: null,
            page: null,
            browser: null
        });
        
        await reply(`🔍 Searching for: *${query}*...`);
        
        try {
            const browser = await getBrowser();
            const page = await createStealthPage(browser);
            
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
                results: results
            });
            
            const sessionId = session.id.split(':').pop();
            
            const buttons = [];
            for (let i = 0; i < Math.min(10, results.length); i++) {
                const result = results[i];
                let buttonText = result.title;
                if (result.year) buttonText += ` (${result.year})`;
                
                buttons.push({
                    id: `movie_${sessionId}_${i}`,
                    text: buttonText.substring(0, 50)
                });
            }
            
            const sentMsg = await sendButtons(sock, from, {
                text: `📋 *Found ${results.length} results for "${query}"*\n\nSelect a movie to download:`,
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
                    
                    await reply(`🎬 *${selectedMovie.title}*\n\n⏳ Fetching video URL...`);
                    
                    try {
                        const videoUrl = await getDirectVideoUrl(page, selectedMovie.url);
                        
                        if (!videoUrl) {
                            await reply(`❌ Could not find download link for *${selectedMovie.title}*.\n\nThis site may have changed or requires login.`);
                            await page.close();
                            sessionManager.clearSession(session.id);
                            await react('❌');
                            return true;
                        }
                        
                        sessionManager.updateSession(sender, from, {
                            step: 'downloading',
                            selectedMovie: selectedMovie,
                            videoUrl: videoUrl
                        });
                        
                        // Start download immediately without quality selection
                        const fileName = `${selectedMovie.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
                        const filePath = path.join(process.cwd(), 'temp', fileName);
                        const tempDir = path.dirname(filePath);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        
                        const progressMsg = await reply(`📥 Downloading: 0%`);
                        
                        const onProgress = async (percent, sock, from, key) => {
                            try {
                                await sock.sendMessage(from, { edit: key, text: `📥 Downloading: ${percent}%` });
                            } catch (e) {}
                        };
                        
                        await downloadFile(videoUrl, filePath, onProgress, sock, from, progressMsg.key);
                        
                        await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading to Google Drive...` });
                        
                        const onUploadProgress = async (percent) => {
                            try {
                                await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading: ${percent}%` });
                            } catch (e) {}
                        };
                        
                        const uploadResult = await uploadToDrive(filePath, fileName, onUploadProgress);
                        
                        fs.unlinkSync(filePath);
                        await page.close();
                        sessionManager.clearSession(session.id);
                        
                        await reply(`✅ *Movie Uploaded Successfully!*\n\n` +
                                   `🎬 *Title:* ${selectedMovie.title}\n` +
                                   `📊 *Size:* ${uploadResult.size} MB\n` +
                                   `📥 *Direct Download:* ${uploadResult.directLink}\n\n` +
                                   `🔗 *Google Drive Link:* ${uploadResult.viewLink}`);
                        
                        await react('✅');
                        
                    } catch (error) {
                        console.error('[MOVIE] Error:', error);
                        await reply(`❌ Failed: ${error.message}`);
                        await page.close();
                        sessionManager.clearSession(session.id);
                        await react('❌');
                    }
                }
                return true;
            }
        }
        return false;
    }
};