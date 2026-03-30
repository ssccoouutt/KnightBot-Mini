/**
 * Movie Downloader - Search and get direct download/stream link
 * 
 * MODIFIED: Only returns direct download/stream link without downloading or uploading
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
                
                // Robust title extraction
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
    const downloadButtons = await page.$$('button:has-text("Download")');
    
    const qualities = [];
    for (const btn of downloadButtons) {
        const parent = await btn.evaluateHandle(el => {
            let curr = el;
            while (curr && curr.parentElement && !curr.innerText.includes('p')) {
                curr = curr.parentElement;
            }
            return curr;
        });
        
        const parentText = await parent.innerText();
        const qualityMatch = parentText.match(/(\d{3,4}p)/i);
        const sizeMatch = parentText.match(/([\d.]+\s*(?:MB|GB))/i);
        
        if (qualityMatch) {
            qualities.push({
                quality: qualityMatch[1],
                size: sizeMatch ? sizeMatch[1] : "Unknown",
                button: btn
            });
        }
    }
    
    return qualities;
}

async function getDirectDownloadUrl(page, qualityInfo) {
    const button = qualityInfo.button;
    
    // Listen for requests that contain 'download' to capture the correct URL
    let capturedUrl = null;
    const requestHandler = (request) => {
        const url = request.url();
        if (url.includes('download') && (url.includes('id=') || url.includes('url='))) {
            capturedUrl = url;
        }
    };
    
    page.on('request', requestHandler);
    
    await page.evaluate(async (buttonElement) => {
        buttonElement.click();
    }, button);
    
    // Wait for the request to be captured
    let count = 0;
    while (!capturedUrl && count < 50) {
        await page.waitForTimeout(100);
        count++;
    }
    
    page.off('request', requestHandler);
    
    return capturedUrl;
}

module.exports = {
    name: 'movie',
    aliases: ['cinema', 'cineverse', 'movielink'],
    description: 'Search and get direct download/stream link for movies',
    usage: '.movie <movie name>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;

        if (args.length === 0) {
            await reply(`🎬 *Movie Link Finder*\n\n` +
                       `Usage: \`${config.prefix}movie <movie name>\`\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}movie 3 idiots\`\n` +
                       `• \`${config.prefix}movie stranger things\`\n\n` +
                       `*Note:* Returns direct download/stream links without downloading.`);
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
                text: `📋 *Found ${results.length} results for "${query}"*\n\nSelect a movie to get download link:`,
                footer: 'Movie Link Finder',
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
                            text: `🎬 *${selectedMovie.title}*\n\n📥 Choose quality to get download link:`,
                            footer: 'Movie Link Finder',
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
                    
                    await reply(`⏳ Getting direct link for *${selectedMovie.title}* (${selectedQuality.quality})...`);
                    
                    try {
                        const downloadUrl = await getDirectDownloadUrl(page, selectedQuality);
                        
                        if (!downloadUrl) {
                            await reply(`❌ Failed to get direct download link.`);
                            return true;
                        }
                        
                        await page.close();
                        sessionManager.clearSession(session.id);
                        
                        await reply(`✅ *Direct Link Found!*\n\n` +
                                   `🎬 *Title:* ${selectedMovie.title}\n` +
                                   `📺 *Quality:* ${selectedQuality.quality}\n` +
                                   `📊 *Size:* ${selectedQuality.size}\n\n` +
                                   `🔗 *Direct Download/Stream Link:*\n${downloadUrl}\n\n` +
                                   `⚠️ *Note:* This link may expire. Download or stream immediately.`);
                        
                        await react('✅');
                        
                    } catch (error) {
                        console.error('[MOVIE] Error getting direct link:', error);
                        await reply(`❌ Failed to get direct link: ${error.message}`);
                        await react('❌');
                    }
                }
                return true;
            }
        }
        return false;
    }
};
