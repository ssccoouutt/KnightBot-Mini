/**
 * Movie Downloader - Simplified version with minimal messages
 * Shows first 5 results, selects best match, displays all quality links
 */

const { chromium } = require('playwright');
const config = require('../../config');

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
    
    return results;
}

async function getDownloadOptions(page, movieUrl) {
    await page.goto(movieUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const buttons = await page.$$('button');
    for (const btn of buttons) {
        const text = await btn.innerText();
        if (text && text.includes('Download')) {
            await btn.click();
            break;
        }
    }
    
    await page.waitForTimeout(3000);
    
    const videoTab = await page.$('button:has-text("Video")');
    if (videoTab) {
        await videoTab.click();
        await page.waitForTimeout(1000);
    }
    
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
    description: 'Search movies and get direct download links for all qualities',
    usage: '.movie <movie name>',
    category: 'media',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await reply(`🎬 *Movie Link Finder*\n\n` +
                       `Usage: \`${config.prefix}movie <movie name>\`\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}movie 3 idiots\`\n` +
                       `• \`${config.prefix}movie stranger things\``);
            return;
        }

        const query = args.join(' ');
        
        await react('🔍');
        
        let browser = null;
        let page = null;
        
        try {
            browser = await getBrowser();
            page = await browser.newPage();
            
            const results = await searchMovie(page, query);
            
            if (!results || results.length === 0) {
                await reply(`❌ No results found for "${query}".`);
                await react('❌');
                return;
            }
            
            const topResults = results.slice(0, 5);
            const selectedMovie = topResults[0];
            
            // Get all quality options
            const qualities = await getDownloadOptions(page, selectedMovie.url);
            
            if (!qualities || qualities.length === 0) {
                await reply(`❌ No download options found for *${selectedMovie.title}*`);
                await react('❌');
                return;
            }
            
            // Get download links for all qualities
            const qualityLinks = [];
            for (let i = 0; i < qualities.length; i++) {
                const quality = qualities[i];
                const downloadUrl = await getDirectDownloadUrl(page, quality);
                
                qualityLinks.push({
                    quality: quality.quality,
                    size: quality.size,
                    url: downloadUrl || "❌ Failed to capture link"
                });
                
                await page.waitForTimeout(500);
            }
            
            // Prepare final message
            let finalMessage = `✅ *${selectedMovie.title}*`;
            if (selectedMovie.year) finalMessage += ` (${selectedMovie.year})`;
            if (selectedMovie.rating) finalMessage += ` ⭐${selectedMovie.rating}`;
            finalMessage += `\n\n`;
            
            for (const link of qualityLinks) {
                if (link.url && !link.url.includes('Failed')) {
                    finalMessage += `🎬 *${link.quality}* (${link.size})\n`;
                    finalMessage += `${link.url}\n\n`;
                } else {
                    finalMessage += `❌ *${link.quality}* (${link.size}) - Link unavailable\n\n`;
                }
            }
            
            finalMessage += `⚠️ *Note:* Links may expire. Download immediately.`;
            
            await reply(finalMessage);
            await react('✅');
            
        } catch (error) {
            console.error('[MOVIE] Error:', error);
            await reply(`❌ Failed: ${error.message}`);
            await react('❌');
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (e) {}
            }
        }
    }
};
