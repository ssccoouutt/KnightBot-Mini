/**
 * Movie Downloader - FIXED: Properly extracts quality options from Cineverse
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
const CINEVERSE_BASE = "https://cinverse.com.ng";

// Google Drive Configuration
const DRIVE_FOLDER_ID = '1vCEe1RQPN3tmBg5VZ8ojQnYrjdJ6K61v';
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;
let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        console.log('[MOVIE] Launching browser...');
        browserInstance = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
    }
    return browserInstance;
}

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) return cachedToken;
        
        console.log('[MOVIE] Fetching Google Drive token...');
        const tokenResponse = await axios({ method: 'GET', url: TOKEN_URL, responseType: 'stream', timeout: 30000 });
        
        const tempTokenFile = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenDir = path.dirname(tempTokenFile);
        if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
        
        const tokenWriter = fs.createWriteStream(tempTokenFile);
        tokenResponse.data.pipe(tokenWriter);
        await new Promise((resolve, reject) => { tokenWriter.on('finish', resolve); tokenWriter.on('error', reject); });
        
        const tokenData = JSON.parse(fs.readFileSync(tempTokenFile, 'utf8'));
        fs.unlinkSync(tempTokenFile);
        
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
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
        console.error('[MOVIE] Failed to get token:', error.message);
        return null;
    }
}

async function uploadToDrive(filePath, fileName, onProgress) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) throw new Error('Cannot upload empty file');
        const fileSizeBytes = stats.size;
        
        const metadata = { name: fileName, mimeType: 'video/mp4', parents: [DRIVE_FOLDER_ID] };
        
        const startResponse = await axios({
            method: 'POST', url: UPLOAD_URL,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': fileSizeBytes },
            data: metadata
        });
        
        const uploadUrl = startResponse.headers.location;
        if (!uploadUrl) throw new Error('Failed to get upload URL');
        
        const fileStream = fs.createReadStream(filePath);
        const uploadResponse = await axios({
            method: 'PUT', url: uploadUrl, data: fileStream,
            headers: { 'Content-Type': 'video/mp4', 'Content-Length': fileSizeBytes },
            maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 600000,
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    onProgress((progressEvent.loaded / progressEvent.total * 100).toFixed(1));
                }
            }
        });
        
        const fileId = uploadResponse.data.id;
        try {
            await axios.post(`${FILE_URL}/${fileId}/permissions`, { role: 'reader', type: 'anyone' }, { headers: { 'Authorization': `Bearer ${token}` } });
        } catch (e) {}
        
        return {
            directLink: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
            viewLink: `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
            fileId, size: (stats.size / (1024 * 1024)).toFixed(2)
        };
    } catch (error) {
        console.error('[MOVIE] Upload failed:', error.message);
        throw error;
    }
}

// ==================== FIXED: Proper Quality Extraction ====================

async function searchMovie(page, movieName) {
    const searchUrl = `${CINEVERSE_BASE}/search?q=${encodeURIComponent(movieName)}`;
    console.log(`[MOVIE] Searching: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const results = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a[href*="/movie/"]');
        for (let link of links) {
            const text = link.innerText.trim();
            const href = link.href;
            if (text && text.length > 3 && href) {
                const yearMatch = text.match(/\b(19|20)\d{2}\b/);
                const year = yearMatch ? yearMatch[0] : '';
                let title = text.replace(/\b(19|20)\d{2}\b/, '').trim();
                title = title.split('\n')[0].trim();
                if (title && title.length > 2 && title.toLowerCase() !== 'movie') {
                    results.push({ title: title, year: year, url: href });
                }
            }
        }
        const unique = [];
        const seen = new Set();
        for (let r of results) {
            if (!seen.has(r.url)) { seen.add(r.url); unique.push(r); }
        }
        return unique.slice(0, 10);
    });
    
    console.log(`[MOVIE] Found ${results.length} results`);
    return results;
}

// FIXED: This function now properly extracts quality options
async function getQualityOptions(page, movieUrl) {
    console.log(`[MOVIE] Getting quality options from: ${movieUrl}`);
    
    // Navigate to movie page
    await page.goto(movieUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // STEP 1: Find and click the main Download button
    console.log('[MOVIE] Looking for Download button...');
    
    // Try multiple selectors for Download button
    let downloadBtn = null;
    const selectors = [
        'button:has-text("Download")',
        'a:has-text("Download")',
        'button:has-text("DOWNLOAD")',
        '.download-btn',
        '[role="button"]:has-text("Download")'
    ];
    
    for (const selector of selectors) {
        downloadBtn = await page.$(selector);
        if (downloadBtn) {
            console.log(`[MOVIE] Found Download button with selector: ${selector}`);
            break;
        }
    }
    
    if (!downloadBtn) {
        // Get all buttons for debugging
        const allButtons = await page.$$eval('button, a', btns => btns.map(b => b.innerText));
        console.log('[MOVIE] Available buttons:', allButtons);
        throw new Error('Download button not found');
    }
    
    // Click the Download button
    await downloadBtn.click();
    console.log('[MOVIE] Download button clicked');
    
    // WAIT for quality options to appear (this is the key fix!)
    await page.waitForTimeout(3000);
    
    // STEP 2: Look for Video tab and click it
    console.log('[MOVIE] Looking for Video tab...');
    const videoTab = await page.$('button:has-text("Video"), div:has-text("Video")');
    if (videoTab) {
        await videoTab.click();
        console.log('[MOVIE] Video tab clicked');
        await page.waitForTimeout(2000);
    }
    
    // STEP 3: Extract quality options
    console.log('[MOVIE] Extracting quality options...');
    
    const qualities = await page.evaluate(() => {
        const qualities = [];
        
        // Find all quality buttons/links
        const qualityElements = document.querySelectorAll(
            'button, a, [role="button"], .quality-item, .quality-btn, [data-quality]'
        );
        
        for (const el of qualityElements) {
            const text = el.innerText || el.textContent || '';
            
            // Look for quality patterns
            const qualityMatch = text.match(/(\d{3,4}p|4K|HD|SD)/i);
            const sizeMatch = text.match(/([\d.]+)\s*(MB|GB)/i);
            
            if (qualityMatch) {
                qualities.push({
                    quality: qualityMatch[1],
                    size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : 'Unknown',
                    element: el,
                    clickable: true
                });
            }
        }
        
        // If no buttons found, look for download links with quality in URL or text
        if (qualities.length === 0) {
            const links = document.querySelectorAll('a[href*="download"], a[href*="api/download"]');
            for (const link of links) {
                const href = link.href;
                const text = link.innerText;
                const qualityMatch = (href + text).match(/(\d{3,4}p)/i);
                if (qualityMatch && href.includes('/api/download')) {
                    qualities.push({
                        quality: qualityMatch[1],
                        size: 'Unknown',
                        url: href,
                        isDirect: true
                    });
                }
            }
        }
        
        return qualities;
    });
    
    console.log(`[MOVIE] Found ${qualities.length} quality options:`, qualities.map(q => q.quality));
    
    // If still no qualities, try to get the API download URL directly
    if (qualities.length === 0) {
        console.log('[MOVIE] No quality buttons found, looking for API download links...');
        
        // Check for any API download links in the page
        const apiLinks = await page.$$eval('a[href*="/api/download"]', links => 
            links.map(link => ({ url: link.href, text: link.innerText }))
        );
        
        for (const link of apiLinks) {
            const qualityMatch = link.text.match(/(\d{3,4}p)/i) || link.url.match(/quality=(\d{3,4}p)/i);
            qualities.push({
                quality: qualityMatch ? qualityMatch[1] : 'Unknown',
                size: 'Unknown',
                url: link.url,
                isDirect: true
            });
        }
    }
    
    return qualities;
}

// FIXED: Captures the actual download URL when quality is selected
async function getDownloadUrl(page, qualityInfo) {
    console.log(`[MOVIE] Getting download URL for quality: ${qualityInfo.quality}`);
    
    // If we already have a direct API URL
    if (qualityInfo.isDirect && qualityInfo.url) {
        console.log(`[MOVIE] Using direct API URL: ${qualityInfo.url}`);
        return qualityInfo.url;
    }
    
    // Set up request interception to capture the API call
    let capturedUrl = null;
    
    // Listen for API download requests
    const requestHandler = (request) => {
        const url = request.url();
        if (url.includes('/api/download') && url.includes('filename=')) {
            capturedUrl = url;
            console.log(`[MOVIE] CAPTURED DOWNLOAD URL: ${url}`);
        }
    };
    
    page.on('request', requestHandler);
    
    // Click the quality element
    if (qualityInfo.element) {
        try {
            await qualityInfo.element.click();
            console.log('[MOVIE] Quality button clicked');
        } catch (err) {
            console.log('[MOVIE] Click failed, trying force click');
            await page.evaluate((el) => el.click(), qualityInfo.element);
        }
    }
    
    // Wait for the API request to be captured
    let attempts = 0;
    while (!capturedUrl && attempts < 30) {
        await page.waitForTimeout(500);
        attempts++;
    }
    
    page.off('request', requestHandler);
    
    if (capturedUrl) {
        return capturedUrl;
    }
    
    // Fallback: Look for any API download link in the page
    const fallbackUrl = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/api/download"]');
        for (const link of links) {
            const href = link.href;
            if (href.includes('filename=')) return href;
        }
        return null;
    });
    
    if (fallbackUrl) {
        console.log(`[MOVIE] Fallback URL found: ${fallbackUrl}`);
        return fallbackUrl;
    }
    
    throw new Error(`Could not get download URL for ${qualityInfo.quality}`);
}

async function downloadFile(url, filepath, onProgress, sock, from, progressMsgKey) {
    console.log(`[MOVIE] Downloading from API: ${url.substring(0, 150)}...`);
    
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 600000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    const totalLength = parseInt(response.headers['content-length'], 10);
    if (isNaN(totalLength) || totalLength <= 0) throw new Error('Invalid file size');
    
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
    description: 'Search, download and upload movies to Google Drive',
    usage: '.movie <movie name>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            await reply(`🎬 *Movie Downloader*\n\nUsage: \`${config.prefix}movie <movie name>\`\n\n*Examples:*\n• \`${config.prefix}movie 3 idiots\`\n• \`${config.prefix}movie inception\``);
            return;
        }
        
        const query = args.join(' ');
        await react('🔍');
        
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 'searching', query: query, results: [], selectedMovie: null, qualities: [], page: null, browser: null
        });
        
        await reply(`🔍 Searching for: *${query}*...`);
        
        try {
            const browser = await getBrowser();
            const page = await browser.newPage();
            sessionManager.updateSession(sender, from, { page: page, browser: browser });
            
            const results = await searchMovie(page, query);
            
            if (!results || results.length === 0) {
                await reply(`❌ No results found for "${query}".`);
                await page.close();
                sessionManager.clearSession(session.id);
                await react('❌');
                return;
            }
            
            sessionManager.updateSession(sender, from, { step: 'selecting', results: results });
            
            const sessionId = session.id.split(':').pop();
            const buttons = [];
            for (let i = 0; i < Math.min(10, results.length); i++) {
                const result = results[i];
                buttons.push({ id: `movie_${sessionId}_${i}`, text: `${result.title} ${result.year ? `(${result.year})` : ''}`.substring(0, 50) });
            }
            
            const sentMsg = await sendButtons(sock, from, {
                text: `📋 *Found ${results.length} results for "${query}"*\n\nSelect a movie:`,
                footer: 'Movie Downloader', buttons: buttons, aimode: FORCE_AI_MODE
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
            } else if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
                try {
                    buttonId = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id;
                } catch (e) {}
            }
            
            if (buttonId && buttonId.startsWith('movie_')) {
                const index = parseInt(buttonId.split('_')[2]);
                const results = session.data.results;
                const page = session.data.page;
                
                if (!page) {
                    await reply(`❌ Session expired. Please search again.`);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                if (index >= 0 && index < results.length) {
                    const selectedMovie = results[index];
                    await reply(`🎬 *${selectedMovie.title}*\n\n⏳ Getting quality options...`);
                    
                    try {
                        const qualities = await getQualityOptions(page, selectedMovie.url);
                        
                        if (!qualities || qualities.length === 0) {
                            await reply(`❌ No quality options found for *${selectedMovie.title}*.\n\nThe download button might not have revealed quality options.`);
                            await page.close();
                            sessionManager.clearSession(session.id);
                            return true;
                        }
                        
                        sessionManager.updateSession(sender, from, { step: 'selecting_quality', qualities: qualities, selectedMovie: selectedMovie });
                        
                        const sessionId = session.id.split(':').pop();
                        const qualityButtons = [];
                        for (let i = 0; i < qualities.length; i++) {
                            const q = qualities[i];
                            qualityButtons.push({ id: `quality_${sessionId}_${i}`, text: `${q.quality} - ${q.size}` });
                        }
                        
                        const sentMsg = await sendButtons(sock, from, {
                            text: `🎬 *${selectedMovie.title}*\n\n📥 Choose quality:`,
                            footer: 'Movie Downloader', buttons: qualityButtons, aimode: FORCE_AI_MODE
                        }, {});
                        
                        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
                    } catch (error) {
                        console.error('[MOVIE] Quality error:', error);
                        await reply(`❌ Failed to get quality options: ${error.message}`);
                        await page.close();
                        sessionManager.clearSession(session.id);
                    }
                }
                return true;
            }
            
            if (buttonId && buttonId.startsWith('quality_')) {
                const index = parseInt(buttonId.split('_')[2]);
                const qualities = session.data.qualities;
                const selectedMovie = session.data.selectedMovie;
                const page = session.data.page;
                
                if (!page || !selectedMovie || !qualities) {
                    await reply(`❌ Session expired.`);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                if (index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    await reply(`⏳ Getting download link for *${selectedMovie.title}* (${selectedQuality.quality})...`);
                    
                    try {
                        const downloadUrl = await getDownloadUrl(page, selectedQuality);
                        if (!downloadUrl) throw new Error('Could not get download URL');
                        
                        const fileName = `${selectedMovie.title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedQuality.quality}.mp4`;
                        const filePath = path.join(process.cwd(), 'temp', fileName);
                        const tempDir = path.dirname(filePath);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        
                        const progressMsg = await reply(`📥 Downloading: 0%`);
                        const onProgress = async (percent, sock, from, key) => {
                            try { await sock.sendMessage(from, { edit: key, text: `📥 Downloading: ${percent}%` }); } catch (e) {}
                        };
                        
                        await downloadFile(downloadUrl, filePath, onProgress, sock, from, progressMsg.key);
                        await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading to Google Drive...` });
                        
                        const onUploadProgress = async (percent) => {
                            try { await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading: ${percent}%` }); } catch (e) {}
                        };
                        
                        const uploadResult = await uploadToDrive(filePath, fileName, onUploadProgress);
                        fs.unlinkSync(filePath);
                        await page.close();
                        sessionManager.clearSession(session.id);
                        
                        await reply(`✅ *Movie Uploaded!*\n\n🎬 *${selectedMovie.title}* (${selectedQuality.quality})\n📊 *Size:* ${uploadResult.size} MB\n📥 *Download:* ${uploadResult.directLink}\n🔗 *Drive:* ${uploadResult.viewLink}`);
                        await react('✅');
                    } catch (error) {
                        console.error('[MOVIE] Error:', error);
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