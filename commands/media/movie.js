/**
 * Movie Downloader - Simplified version
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
    description: 'Search movies and get direct download links for all qualities',
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
                       `*Features:*\n` +
                       `• Shows top 5 search results\n` +
                       `• Auto-selects best match (first result)\n` +
                       `• Returns direct links for all available qualities`);
            return;
        }

        const query = args.join(' ');
        
        await react('🔍');
        await reply(`🔍 Searching for: *${query}*...`);
        
        let browser = null;
        let page = null;
        
        try {
            browser = await getBrowser();
            page = await browser.newPage();
            
            // Search for movies
            const results = await searchMovie(page, query);
            
            if (!results || results.length === 0) {
                await reply(`❌ No results found for "${query}".\n\nTry a different search term.`);
                await react('❌');
                return;
            }
            
            // Show top 5 results
            const topResults = results.slice(0, 5);
            let resultsMessage = `📋 *Search Results for "${query}"*\n\n`;
            for (let i = 0; i < topResults.length; i++) {
                const result = topResults[i];
                resultsMessage += `${i + 1}. *${result.title}*`;
                if (result.year) resultsMessage += ` (${result.year})`;
                if (result.rating) resultsMessage += ` ⭐${result.rating}`;
                resultsMessage += `\n`;
            }
            resultsMessage += `\n✅ *Auto-selecting best match:* ${topResults[0].title}`;
            await reply(resultsMessage);
            
            // Select best match (first result)
            const selectedMovie = topResults[0];
            
            await reply(`🎬 *${selectedMovie.title}*\n\n⏳ Fetching download links for all qualities...`);
            
            // Get all quality options
            const qualities = await getDownloadOptions(page, selectedMovie.url);
            
            if (!qualities || qualities.length === 0) {
                await reply(`❌ No download options found for *${selectedMovie.title}*`);
                await react('❌');
                return;
            }
            
            // Get download links for all qualities
            await reply(`📥 Capturing direct links for ${qualities.length} quality option(s)...`);
            
            const qualityLinks = [];
            for (let i = 0; i < qualities.length; i++) {
                const quality = qualities[i];
                await reply(`🔗 Fetching ${quality.quality} link...`);
                
                try {
                    const downloadUrl = await getDirectDownloadUrl(page, quality);
                    if (downloadUrl) {
                        qualityLinks.push({
                            quality: quality.quality,
                            size: quality.size,
                            url: downloadUrl
                        });
                    } else {
                        qualityLinks.push({
                            quality: quality.quality,
                            size: quality.size,
                            url: "❌ Failed to capture link"
                        });
                    }
                } catch (error) {
                    qualityLinks.push({
                        quality: quality.quality,
                        size: quality.size,
                        url: `❌ Error: ${error.message}`
                    });
                }
                
                // Small delay between requests to avoid overwhelming the site
                await page.waitForTimeout(1000);
            }
            
            // Prepare final message with all links
            let finalMessage = `✅ *Movie Links Found!*\n\n`;
            finalMessage += `🎬 *Title:* ${selectedMovie.title}\n`;
            if (selectedMovie.year) finalMessage += `📅 *Year:* ${selectedMovie.year}\n`;
            if (selectedMovie.rating) finalMessage += `⭐ *Rating:* ${selectedMovie.rating}\n`;
            finalMessage += `\n📥 *Download Links:*\n\n`;
            
            for (const link of qualityLinks) {
                finalMessage += `*${link.quality}* (${link.size})\n`;
                finalMessage += `${link.url}\n\n`;
            }
            
            finalMessage += `⚠️ *Note:* Links may expire. Download or stream immediately.\n`;
            finalMessage += `💡 Use a download manager for better speed.`;
            
            await reply(finalMessage);
            await react('✅');
            
        } catch (error) {
            console.error('[MOVIE] Error:', error);
            await reply(`❌ Failed to process request: ${error.message}`);
            await react('❌');
        } finally {
            // Clean up
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    console.error('[MOVIE] Error closing page:', e.message);
                }
            }
            // Don't close browser instance as it might be reused
        }
    }
};
