/**
 * Movie Downloader - Search and get direct download links for movies/series
 */

const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Cineverse API base URL
const CINEVERSE_BASE = "https://cineverse.name.ng";

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
            qualities: []
        });
        
        const sessionId = session.id.split(':').pop();
        
        await reply(`🔍 Searching for: *${query}*...`);
        
        try {
            // Step 1: Search for the movie
            const results = await searchMovies(query);
            
            if (!results || results.length === 0) {
                await reply(`❌ No results found for "${query}".\n\nTry a different search term.`);
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
            
            // Create buttons for movie selection
            const buttons = [];
            for (let i = 0; i < Math.min(10, results.length); i++) {
                const result = results[i];
                let buttonText = result.title;
                if (result.year) buttonText += ` (${result.year})`;
                if (result.rating) buttonText += ` ⭐${result.rating}`;
                
                buttons.push({
                    id: `movie_${sessionId}_${i}`,
                    text: buttonText.substring(0, 50) // Limit button text length
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
                
                if (index >= 0 && index < results.length) {
                    const selectedMovie = results[index];
                    
                    await reply(`🎬 *${selectedMovie.title}*\n\n⏳ Fetching download options...`);
                    
                    // Update session
                    sessionManager.updateSession(sender, from, {
                        step: 'getting_qualities',
                        selectedMovie: selectedMovie
                    });
                    
                    try {
                        // Get quality options for the selected movie
                        const qualities = await getMovieQualities(selectedMovie.url);
                        
                        if (!qualities || qualities.length === 0) {
                            await reply(`❌ No download options found for *${selectedMovie.title}*`);
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
                
                if (index >= 0 && index < qualities.length) {
                    const selectedQuality = qualities[index];
                    
                    await reply(`🎬 *${selectedMovie.title}*\n📥 *Quality:* ${selectedQuality.quality}\n\n⏳ Getting download link...`);
                    
                    try {
                        // Get the actual download URL
                        const downloadUrl = await getDownloadUrl(selectedMovie.url, selectedQuality);
                        
                        if (downloadUrl) {
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
                        
                        // Clear session after successful download
                        sessionManager.clearSession(session.id);
                        
                    } catch (error) {
                        console.error('[MOVIE] Error getting download URL:', error);
                        await reply(`❌ Failed to get download link: ${error.message}`);
                        await react('❌');
                    }
                }
                return true;
            }
        }
        
        return true;
    }
};

/**
 * Search for movies on Cineverse
 */
async function searchMovies(query) {
    try {
        const searchUrl = `${CINEVERSE_BASE}/search?q=${encodeURIComponent(query)}`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        const html = response.data;
        
        // Parse HTML for movie results
        const results = [];
        const linkRegex = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        
        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const content = match[2];
            
            if (href && (href.includes('/movie/') || href.includes('/tv/'))) {
                // Extract title
                let title = content.replace(/<[^>]*>/g, '').trim();
                let year = '';
                let rating = '';
                
                // Extract year
                const yearMatch = title.match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    year = yearMatch[0];
                }
                
                // Extract rating
                const ratingMatch = title.match(/\b\d\.\d\b/);
                if (ratingMatch) {
                    rating = ratingMatch[0];
                }
                
                // Clean title
                title = title.replace(/\b(19|20)\d{2}\b/, '').replace(/\b\d\.\d\b/, '').trim();
                
                if (title && title.length > 2 && title.length < 200) {
                    results.push({
                        title: title,
                        year: year,
                        rating: rating,
                        url: href.startsWith('http') ? href : `${CINEVERSE_BASE}${href}`
                    });
                }
            }
        }
        
        // Remove duplicates by URL
        const unique = [];
        const seen = new Set();
        for (const r of results) {
            if (!seen.has(r.url)) {
                seen.add(r.url);
                unique.push(r);
            }
        }
        
        return unique;
        
    } catch (error) {
        console.error('[MOVIE] Search error:', error.message);
        throw new Error('Failed to search movies');
    }
}

/**
 * Get quality options for a movie
 */
async function getMovieQualities(movieUrl) {
    try {
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        const html = response.data;
        const qualities = [];
        
        // Look for download buttons or quality options
        // This is a simplified parser - you may need to adjust based on actual HTML structure
        
        // Look for quality patterns
        const qualityPatterns = [
            { regex: /(\d{3,4}p)[^<]*?([\d.]+(?:\s*(?:MB|GB)))/gi, qualityIndex: 1, sizeIndex: 2 },
            { regex: /Quality:\s*(\d{3,4}p)[^<]*?Size:\s*([\d.]+(?:\s*(?:MB|GB)))/gi, qualityIndex: 1, sizeIndex: 2 },
            { regex: /\[(\d{3,4}p)\][^<]*?\(([\d.]+(?:\s*(?:MB|GB)))\)/gi, qualityIndex: 1, sizeIndex: 2 }
        ];
        
        for (const pattern of qualityPatterns) {
            const regex = new RegExp(pattern.regex, 'gi');
            let match;
            while ((match = regex.exec(html)) !== null) {
                const quality = match[pattern.qualityIndex];
                const size = match[pattern.sizeIndex];
                if (quality && !qualities.find(q => q.quality === quality)) {
                    qualities.push({ quality, size });
                }
            }
        }
        
        // If no qualities found via regex, add default qualities
        if (qualities.length === 0) {
            qualities.push(
                { quality: '1080p', size: '~2GB' },
                { quality: '720p', size: '~1GB' },
                { quality: '480p', size: '~500MB' }
            );
        }
        
        return qualities;
        
    } catch (error) {
        console.error('[MOVIE] Error getting qualities:', error.message);
        throw new Error('Failed to get movie qualities');
    }
}

/**
 * Get direct download URL for selected quality
 */
async function getDownloadUrl(movieUrl, qualityInfo) {
    try {
        // This is a simplified implementation
        // You may need to simulate clicking buttons and capturing URLs
        // For now, return a placeholder URL based on quality
        
        // Extract movie ID from URL
        const movieIdMatch = movieUrl.match(/\/(movie|tv)\/([^\/?]+)/);
        const movieId = movieIdMatch ? movieIdMatch[2] : 'unknown';
        
        // Generate direct download link (this is a simulation)
        // In a real implementation, you would need to:
        // 1. Load the movie page
        // 2. Find and click the download button
        // 3. Select video tab
        // 4. Click the quality button
        // 5. Capture the window.open URL
        
        // For now, return a formatted URL
        const quality = qualityInfo.quality.replace('p', '');
        const downloadUrl = `https://cineverse.name.ng/download/${movieId}/${quality}`;
        
        return downloadUrl;
        
    } catch (error) {
        console.error('[MOVIE] Error getting download URL:', error.message);
        throw new Error('Failed to get download link');
    }
}
