/**
 * Movie Downloader - Search and get direct download links for movies/series
 * Uses Playwright to exactly replicate the Python script
 */

const { chromium } = require('playwright');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Cineverse base URL
const CINEVERSE_BASE = "https://cineverse.name.ng";

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

async function closeBrowser() {
    if (browserInstance) {
        console.log('[MOVIE] Closing browser...');
        await browserInstance.close();
        browserInstance = null;
    }
}

// ==================== EXACT FUNCTIONS FROM PYTHON SCRIPT ====================

async function searchMovie(page, movieName) {
    /** EXACT from working Python script */
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
    /** EXACT from working Python script - Phase 1 */
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
    /** EXACT URL capture method from working Python script */
    const button = qualityInfo.button;
    
    // Capture URL using the working method
    const downloadUrl = await page.evaluate(async (buttonElement) => {
        return new Promise((resolve) => {
            // Store original window.open
            const originalOpen = window.open;
            let capturedUrl = null;
            
            // Override window.open
            window.open = function(url) {
                capturedUrl = url;
                // Call original but don't wait for it
                if (originalOpen) originalOpen.call(this, url);
                return null;
            };
            
            // Click the button
            buttonElement.click();
            
            // Wait a bit for the URL to be captured
            setTimeout(() => {
                // Restore original
                window.open = originalOpen;
                resolve(capturedUrl);
            }, 2000);
        });
    }, button);
    
    return downloadUrl;
}

module.exports = {
    name: 'movie',
    aliases: ['cinema', 'cineverse', 'downloadmovie'],
    description: 'Search and get direct download links for movies/series',
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
        
        // Create session for this movie search
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
            // Launch browser for this session
            const browser = await getBrowser();
            const page = await browser.newPage();
            
            // Store page in session for later use
            sessionManager.updateSession(sender, from, {
                page: page,
                browser: browser
            });
            
            // Step 1: Search for the movie
            const results = await searchMovie(page, query);
            
            if (!results || results.length === 0) {
                await reply(`❌ No results found for "${query}".\n\nTry a different search term.`);
                await page.close();
                sessionManager.clearSession(session.id);
                await react('❌');
                return;
            }
            
            // Update session with results
            sessionManager.updateSession(sender, from, {
                step: 'selecting',
                results: results,
                query: query
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Create buttons for movie selection
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
            
            // Send as interactive buttons
            const sentMsg = await sendButtons(sock, from, {
                text: `📋 *Found ${results.length} results for "${query}"*\n\nSelect a movie to continue:`,
                footer: 'Cineverse Downloader',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, { quoted: msg });
            
            // Add pending message for session
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
        
        // Handle button clicks
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
            } else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                }
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
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
                    
                    // Update session
                    sessionManager.updateSession(sender, from, {
                        step: 'getting_qualities',
                        selectedMovie: selectedMovie
                    });
                    
                    try {
                        // Get quality options for the selected movie
                        const qualities = await getDownloadOptions(page, selectedMovie.url);
                        
                        if (!qualities || qualities.length === 0) {
                            await reply(`❌ No download options found for *${selectedMovie.title}*`);
                            await page.close();
                            sessionManager.clearSession(session.id);
                            await react('❌');
                            return true;
                        }
                        
                        // Update session with qualities
                        sessionManager.updateSession(sender, from, {
                            step: 'selecting_quality',
                            qualities: qualities,
                            selectedMovie: selectedMovie
                        });
                        
                        const sessionId = session.id.split(':').pop();
                        
                        // Create buttons for quality selection
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
                            footer: 'Cineverse Downloader',
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
                
                if (!page) {
                    await reply(`❌ Session expired. Please search again.`);
                    sessionManager.clearSession(session.id);
                    return true;
                }
                
                if (index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    
                    await reply(`🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n⏳ Getting download link...`);
                    
                    try {
                        // Get the actual download URL using the exact method from Python script
                        const downloadUrl = await getDownloadUrl(page, selectedQuality);
                        
                        if (downloadUrl && downloadUrl !== 'null') {
                            const message = `🎬 *${selectedMovie.title}*\n` +
                                          `📥 *Quality:* ${selectedQuality.quality}\n` +
                                          `📊 *Size:* ${selectedQuality.size}\n\n` +
                                          `🔗 *Direct Download Link:*\n` +
                                          `\`${downloadUrl}\`\n\n` +
                                          `💡 Click or copy the link to download.`;
                            
                            await reply(message);
                            await react('✅');
                        } else {
                            await reply(`❌ Failed to get download link for ${selectedQuality.quality}`);
                            await react('❌');
                        }
                        
                        // Clean up page
                        await page.close();
                        
                        // Clear session after successful download
                        sessionManager.clearSession(session.id);
                        
                    } catch (error) {
                        console.error('[MOVIE] Error getting download URL:', error);
                        await reply(`❌ Failed to get download link: ${error.message}`);
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
    await closeBrowser();
});

process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit();
});

process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit();
});
