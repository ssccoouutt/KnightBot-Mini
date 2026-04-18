/**
 * Movie Downloader - Search, download movie and upload to Google Drive
 * 
 * FIXED ISSUES:
 * 1. Search Results: Now correctly extracts movie titles instead of just showing 'Movie'.
 * 2. 0 MB Download: Improved download URL capture and added validation for content-length.
 * 3. Fixed "element is not enabled" error with full debugging.
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

// Cineverse base URL (updated to the working domain)
const CINEVERSE_BASE = "https://cinverse.com.ng";

// Google Drive Configuration
const DRIVE_FOLDER_ID = '1vCEe1RQPN3tmBg5VZ8ojQnYrjdJ6K61v';
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;
let browserInstance = null;

// Debug logger
function debugLog(step, data = '') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.log(`[DEBUG ${timestamp}] [MOVIE] ${step}: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`);
}

async function getBrowser() {
    if (!browserInstance) {
        debugLog('Launching browser');
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
        
        debugLog('Fetching Google Drive token');
        
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
            debugLog('Token expired, refreshing');
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
        
        debugLog(`Uploading ${fileName} to Google Drive`);
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error('Cannot upload an empty file (0 bytes)');
        }

        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
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
        if (!uploadUrl) {
            throw new Error('Failed to get upload URL');
        }
        
        debugLog('Resumable upload URL obtained');
        
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
                    onProgress(percent, progressEvent.loaded, progressEvent.total, progressMsgKey);
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
            debugLog('Could not set public permission');
        }
        
        const directLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const viewLink = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
        
        debugLog(`Upload complete: ${fileSizeMB} MB`);
        
        return { directLink, viewLink, fileId, size: fileSizeMB };
        
    } catch (error) {
        console.error('[MOVIE] Upload to Drive failed:', error.message);
        throw error;
    }
}

// ==================== MOVIE FUNCTIONS WITH FULL DEBUGGING ====================

async function searchMovie(page, movieName) {
    const searchUrl = `${CINEVERSE_BASE}/search?q=${encodeURIComponent(movieName)}`;
    debugLog('Searching URL', searchUrl);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Take screenshot for debugging
    await page.screenshot({ path: `/tmp/search_${Date.now()}.png` }).catch(() => {});
    
    const results = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a');
        for (let link of links) {
            const text = link.innerText.trim();
            const href = link.href;
            if (text && text.length > 3 && href && (href.includes('/movie/') || href.includes('/tv/'))) {
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                let year = '', rating = '', title = '';
                
                for (let line of lines) {
                    if (line.match(/^\d{4}$/)) year = line;
                    else if (line.match(/^\d\.\d$/)) rating = line;
                    else if (line.toLowerCase() !== 'movie' && line.length > title.length) {
                        title = line;
                    }
                }
                
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
    
    debugLog(`Found ${results.length} results`);
    return results;
}

async function getDownloadOptions(page, movieUrl) {
    debugLog('Getting download options for:', movieUrl);
    
    // Navigate to movie page
    await page.goto(movieUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // Take screenshot after page load
    const screenshotPath = `/tmp/movie_page_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    debugLog('Screenshot saved to', screenshotPath);
    
    // Get page HTML for debugging
    const pageTitle = await page.title();
    debugLog('Page title', pageTitle);
    
    // Try multiple strategies to get download links
    
    // STRATEGY 1: Look for direct download links first
    debugLog('Strategy 1: Looking for direct download links');
    const directLinks = await page.evaluate(() => {
        const links = [];
        // Look for any link containing download, drive, or stream
        const allLinks = document.querySelectorAll('a[href*="download"], a[href*="drive.google"], a[href*="usercontent"], a[href*="googledrive"]');
        allLinks.forEach(link => {
            const href = link.href;
            const text = link.innerText;
            links.push({ href, text });
        });
        return links;
    });
    
    if (directLinks.length > 0) {
        debugLog(`Found ${directLinks.length} direct links`, directLinks);
        const qualities = [];
        for (const link of directLinks) {
            let quality = 'Unknown';
            let size = 'Unknown';
            
            // Try to extract quality from link text or surrounding elements
            if (link.text.match(/\d{3,4}p/i)) {
                quality = link.text.match(/\d{3,4}p/i)[0];
            }
            if (link.text.match(/[\d.]+\s*(?:MB|GB)/i)) {
                size = link.text.match(/[\d.]+\s*(?:MB|GB)/i)[0];
            }
            
            qualities.push({
                quality: quality,
                size: size,
                url: link.href,
                isDirect: true
            });
        }
        if (qualities.length > 0) {
            debugLog('Returning direct links as quality options');
            return qualities;
        }
    }
    
    // STRATEGY 2: Look for and click Download button (without waiting for Video tab)
    debugLog('Strategy 2: Looking for Download button');
    
    // Find all buttons
    const allButtons = await page.$$eval('button, a[role="button"], div[role="button"]', btns => {
        return btns.map(btn => ({
            text: btn.innerText?.trim() || '',
            className: btn.className,
            id: btn.id,
            disabled: btn.disabled,
            tagName: btn.tagName
        }));
    });
    
    debugLog(`Found ${allButtons.length} buttons/clickable elements`);
    debugLog('First 10 buttons', allButtons.slice(0, 10));
    
    // Try to find any button with Download text (case insensitive)
    let downloadBtn = null;
    for (const btn of allButtons) {
        if (btn.text.toLowerCase().includes('download')) {
            debugLog(`Found potential download button:`, btn);
            downloadBtn = await page.$(`button:has-text("${btn.text}")`);
            if (downloadBtn) break;
        }
    }
    
    if (!downloadBtn) {
        // Try alternative selector
        downloadBtn = await page.$('button:has-text("Download"), a:has-text("Download")');
    }
    
    if (downloadBtn) {
        debugLog('Clicking download button');
        try {
            // Remove disabled attribute if present
            await page.evaluate((btn) => {
                btn.removeAttribute('disabled');
                btn.style.pointerEvents = 'auto';
            }, downloadBtn);
            await downloadBtn.click({ force: true });
            debugLog('Download button clicked');
            await page.waitForTimeout(3000);
        } catch (err) {
            debugLog('Failed to click download button', err.message);
        }
    }
    
    // STRATEGY 3: Look for quality buttons/links in the entire page
    debugLog('Strategy 3: Looking for quality options');
    
    // Wait a bit for any dynamic content
    await page.waitForTimeout(2000);
    
    const qualityOptions = await page.evaluate(() => {
        const qualities = [];
        
        // Look for elements containing quality indicators
        const qualityPatterns = ['1080p', '720p', '480p', '360p', '4K', '2160p', '1440p'];
        const sizePattern = /[\d.]+(?:\.\d+)?\s*(?:MB|GB)/i;
        
        // Check all elements
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const text = el.innerText || '';
            if (!text) continue;
            
            let foundQuality = null;
            for (const q of qualityPatterns) {
                if (text.toLowerCase().includes(q.toLowerCase())) {
                    foundQuality = q;
                    break;
                }
            }
            
            if (foundQuality) {
                const sizeMatch = text.match(sizePattern);
                const size = sizeMatch ? sizeMatch[0] : 'Unknown';
                
                // Check if this element or its children contain a link/button
                let clickable = el.querySelector('a, button');
                if (!clickable && (el.tagName === 'A' || el.tagName === 'BUTTON')) {
                    clickable = el;
                }
                
                if (clickable) {
                    qualities.push({
                        quality: foundQuality,
                        size: size,
                        element: clickable,
                        text: text.substring(0, 100)
                    });
                }
            }
        }
        
        return qualities;
    });
    
    debugLog(`Found ${qualityOptions.length} quality options via text search`);
    
    if (qualityOptions.length > 0) {
        // Convert to our format
        const qualities = [];
        for (let i = 0; i < qualityOptions.length; i++) {
            const q = qualityOptions[i];
            qualities.push({
                quality: q.quality,
                size: q.size,
                selector: q.element,
                text: q.text
            });
        }
        return qualities;
    }
    
    // STRATEGY 4: Look for server/storage links
    debugLog('Strategy 4: Looking for server/storage links');
    
    const serverLinks = await page.evaluate(() => {
        const links = [];
        const allLinks = document.querySelectorAll('a[href*="upstream"], a[href*="storage"], a[href*="cdn"], a[href*="video"]');
        allLinks.forEach(link => {
            links.push({
                href: link.href,
                text: link.innerText
            });
        });
        return links;
    });
    
    if (serverLinks.length > 0) {
        debugLog(`Found ${serverLinks.length} server links`);
        const qualities = serverLinks.map((link, idx) => ({
            quality: `Option ${idx + 1}`,
            size: 'Unknown',
            url: link.href,
            isDirect: true
        }));
        return qualities;
    }
    
    // If all strategies fail, return empty array
    debugLog('No quality options found with any strategy');
    return [];
}

async function getDownloadUrl(page, qualityInfo) {
    debugLog('Getting download URL for quality:', qualityInfo.quality);
    
    // If we have a direct URL
    if (qualityInfo.isDirect && qualityInfo.url) {
        debugLog('Using direct URL:', qualityInfo.url);
        return qualityInfo.url;
    }
    
    // If we have a selector/element
    if (qualityInfo.selector) {
        debugLog('Clicking on element with text:', qualityInfo.text);
        
        try {
            // Try to find and click the element
            const elementHandle = await page.evaluateHandle((selector) => {
                // Find element by text content
                const elements = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
                for (const el of elements) {
                    if (el.innerText?.includes(selector.quality)) {
                        return el;
                    }
                }
                return null;
            }, qualityInfo);
            
            if (elementHandle) {
                // Setup request capture
                const requestPromise = page.waitForRequest(
                    req => req.url().includes('download') || req.url().includes('drive') || req.url().includes('usercontent'),
                    { timeout: 15000 }
                ).catch(() => null);
                
                await elementHandle.click({ force: true });
                const request = await requestPromise;
                if (request) {
                    debugLog('Captured download URL from click:', request.url());
                    return request.url();
                }
            }
        } catch (err) {
            debugLog('Error clicking element:', err.message);
        }
    }
    
    // Try to extract from page source
    debugLog('Trying to extract download URL from page source');
    const extractedUrl = await page.evaluate(() => {
        // Check for video sources
        const video = document.querySelector('video');
        if (video && video.src) return video.src;
        
        // Check for iframes
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.src && (iframe.src.includes('drive') || iframe.src.includes('download'))) {
            return iframe.src;
        }
        
        // Check all scripts for URL patterns
        const scripts = document.querySelectorAll('script');
        const urlPattern = /(https?:\/\/[^\s"'<>]+(?:drive|download|usercontent|googledrive)[^\s"'<>]+)/gi;
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
    
    if (extractedUrl) {
        debugLog('Extracted URL from page:', extractedUrl);
        return extractedUrl;
    }
    
    throw new Error('Could not find download URL for ' + qualityInfo.quality);
}

async function downloadFile(url, filepath, onProgress, progressMsgKey, sock, from) {
    debugLog('Downloading from URL:', url.substring(0, 100));
    
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
    
    if (isNaN(totalLength) || totalLength <= 0) {
        throw new Error('Invalid file size received from server (0 MB)');
    }

    debugLog(`File size: ${(totalLength / 1024 / 1024).toFixed(2)} MB`);
    
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
            else {
                debugLog(`Download complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                resolve();
            }
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
                       `• \`${config.prefix}movie stranger things\``);
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
            
            // Enable console logging from the browser
            page.on('console', msg => debugLog('Browser console:', msg.text()));
            page.on('pageerror', err => debugLog('Browser error:', err));
            
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
                        
                        debugLog(`Found ${qualities.length} quality options`);
                        
                        if (!qualities || qualities.length === 0) {
                            await reply(`❌ No download options found for *${selectedMovie.title}*\n\nThis could be because:\n• The movie page structure changed\n• Download links require login\n• The site is blocking automation\n\nTry a different movie or check back later.`);
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
                        for (let i = 0; i < Math.min(10, qualities.length); i++) {
                            const q = qualities[i];
                            let displayText = `${q.quality} - ${q.size}`;
                            if (displayText.length > 50) displayText = displayText.substring(0, 47) + '...';
                            qualityButtons.push({
                                id: `quality_${sessionId}_${i}`,
                                text: displayText
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
                        await reply(`❌ Failed to get download options: ${error.message}\n\nFull error: ${error.stack || 'No stack trace'}`);
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
                            await reply(`❌ Failed to get direct download link for ${selectedQuality.quality}.`);
                            return true;
                        }
                        
                        const fileName = `${selectedMovie.title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedQuality.quality}.mp4`;
                        const filePath = path.join(process.cwd(), 'temp', fileName);
                        const tempDir = path.dirname(filePath);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        
                        const progressMsg = await reply(`📥 Downloading: 0%`);
                        
                        const onDownloadProgress = async (percent) => {
                            await sock.sendMessage(from, { edit: progressMsg.key, text: `📥 Downloading: ${percent}%` }).catch(() => {});
                        };
                        
                        await downloadFile(downloadUrl, filePath, onDownloadProgress);
                        
                        await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading to Google Drive...` }).catch(() => {});
                        
                        const onUploadProgress = async (percent) => {
                            await sock.sendMessage(from, { edit: progressMsg.key, text: `📤 Uploading: ${percent}%` }).catch(() => {});
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
                        await reply(`❌ Failed: ${error.message}\n\nFull error: ${error.stack || 'No stack trace'}`);
                        await react('❌');
                    }
                }
                return true;
            }
        }
        return false;
    }
};