/**
 * Logo Generator - AI-powered logo generation
 * Uses 3D Logo Generator API
 */

const axios = require('axios');
const config = require('../../config');
const fs = require('fs');
const path = require('path');

// API Configuration
const API_BASE_URL = "https://logo-20-generator-20-api.vercel.app/logo";

// Store generation history for each user
const userHistory = new Map();

module.exports = {
    name: 'logo',
    aliases: ['genlogo', 'makelogo', 'logomaker', '3dlogo', 'logogen'],
    description: 'Generate AI-powered 3D logos from text prompts',
    usage: '.logo <prompt>\n.logo --help for more options',
    category: 'ai',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎨 *AI Logo Generator*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}logo <prompt>\` - Generate logos\n` +
                       `• \`${config.prefix}logo --help\` - Show help\n` +
                       `• \`${config.prefix}logo --history\` - View your history\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}logo Zeeshan name logo in red\`\n` +
                       `• \`${config.prefix}logo gaming logo with dragon\`\n` +
                       `• \`${config.prefix}logo tech company logo blue neon\`\n` +
                       `• \`${config.prefix}logo minimalist coffee shop logo\`\n\n` +
                       `*Tips:*\n` +
                       `• Include colors (red, blue, gold, etc.)\n` +
                       `• Specify style (3d, modern, vintage, minimal)\n` +
                       `• Add elements (crown, shield, wings, etc.)\n` +
                       `• The API generates 4 different logo variations`);
        }
        
        // Handle special commands
        if (args[0] === '--help') {
            return reply(`🎨 *Logo Generator - Help Guide*\n\n` +
                       `*Commands:*\n` +
                       `• \`${config.prefix}logo <prompt>\` - Generate logos\n` +
                       `• \`${config.prefix}logo --history\` - View generation history\n` +
                       `• \`${config.prefix}logo --clear\` - Clear your history\n\n` +
                       `*Prompt Examples:*\n` +
                       `• \`${config.prefix}logo "TechZone" name logo in blue gradient\`\n` +
                       `• \`${config.prefix}logo gaming clan logo with wolf\`\n` +
                       `• \`${config.prefix}logo luxury brand logo gold and black\`\n` +
                       `• \`${config.prefix}logo esports logo with lightning bolt\`\n` +
                       `• \`${config.prefix}logo music producer logo with headphones\`\n\n` +
                       `*Style Keywords:*\n` +
                       `• 3D, modern, vintage, retro, minimal, abstract\n` +
                       `• cartoon, futuristic, elegant, professional, bold\n\n` +
                       `*Color Keywords:*\n` +
                       `• red, blue, green, gold, silver, black, white\n` +
                       `• gradient, neon, pastel, metallic, rainbow\n\n` +
                       `*Elements:*\n` +
                       `• crown, shield, wings, star, lightning, fire\n` +
                       `• dragon, wolf, eagle, lion, skull, sword\n\n` +
                       `*Example:*\n` +
                       `\`${config.prefix}logo 3D gaming logo with phoenix and fire, red and gold\``);
        }
        
        if (args[0] === '--history') {
            return showHistory(sock, from, sender, reply);
        }
        
        if (args[0] === '--clear') {
            userHistory.delete(sender);
            return reply(`✅ Your logo generation history has been cleared.`);
        }
        
        // Get the prompt
        let prompt = args.join(' ').trim();
        
        if (prompt.length < 3) {
            return reply(`❌ Please provide a longer prompt (minimum 3 characters).\n\nExample: \`${config.prefix}logo gaming logo with dragon\``);
        }
        
        if (prompt.length > 300) {
            return reply(`❌ Prompt is too long (maximum 300 characters).`);
        }
        
        await react('🎨');
        
        // Send processing message
        const processingMsg = await reply(`🎨 *Generating AI Logos...*\n\n` +
                                         `📝 *Prompt:* ${prompt}\n` +
                                         `⏳ Generating 4 logo variations...\n\n` +
                                         `> This may take 30-60 seconds`);
        
        try {
            // Encode prompt for URL
            const encodedPrompt = encodeURIComponent(prompt);
            const apiUrl = `${API_BASE_URL}?prompt=${encodedPrompt}`;
            
            console.log(`[LOGO] Generating logos for: ${prompt}`);
            
            // Make API request
            const response = await axios({
                method: 'GET',
                url: apiUrl,
                timeout: 120000,
                maxContentLength: 50 * 1024 * 1024
            });
            
            // Check if response is successful
            if (!response.data || !response.data.success) {
                throw new Error(response.data?.message || 'API returned an error');
            }
            
            const images = response.data.images;
            
            if (!images || images.length === 0) {
                throw new Error('No images were generated. Please try a different prompt.');
            }
            
            console.log(`[LOGO] Received ${images.length} logo variations`);
            
            // Update processing message
            await sock.sendMessage(from, {
                text: `🎨 *Downloading ${images.length} logos...*\n\nPlease wait while I download the images.`,
                edit: processingMsg.key
            });
            
            // Download all images
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const downloadedImages = [];
            
            for (let i = 0; i < images.length; i++) {
                const imageUrl = images[i];
                
                try {
                    // Download image
                    const imageResponse = await axios({
                        method: 'GET',
                        url: imageUrl,
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        maxContentLength: 10 * 1024 * 1024
                    });
                    
                    // Save to temp file
                    const imagePath = path.join(tempDir, `logo_${Date.now()}_${sender.replace(/[^a-zA-Z0-9]/g, '_')}_${i}.jpg`);
                    fs.writeFileSync(imagePath, imageResponse.data);
                    
                    downloadedImages.push({
                        path: imagePath,
                        data: imageResponse.data
                    });
                    
                } catch (downloadError) {
                    console.error(`[LOGO] Failed to download image ${i + 1}:`, downloadError.message);
                }
            }
            
            if (downloadedImages.length === 0) {
                throw new Error('Failed to download any logos. Please try again.');
            }
            
            // Send each image individually first (without captions)
            for (let i = 0; i < downloadedImages.length; i++) {
                const img = downloadedImages[i];
                
                await sock.sendMessage(from, {
                    image: img.data,
                    mimetype: 'image/jpeg',
                    caption: '' // Empty caption for individual images
                });
                
                // Small delay between sends to avoid rate limiting
                if (i < downloadedImages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            // Send caption as separate message AFTER all images
            const caption = `🎨 *AI Generated Logos*\n\n` +
                           `📝 *Prompt:* ${prompt}\n` +
                           `🎯 *Generated:* ${downloadedImages.length}/${images.length} logos\n` +
                           `📊 *Quality:* HD\n\n` +
                           `> *Powered by ${config.botName} AI*`;
            
            await sock.sendMessage(from, { text: caption });
            
            // Clean up temp files
            for (const img of downloadedImages) {
                if (fs.existsSync(img.path)) {
                    fs.unlinkSync(img.path);
                }
            }
            
            // Save to history
            saveToHistory(sender, prompt, downloadedImages.length);
            
            // Update processing message to show completion
            await sock.sendMessage(from, {
                text: `✅ *Logo Generation Complete!*\n\n` +
                      `📝 *Prompt:* ${prompt}\n` +
                      `🎨 *Generated:* ${downloadedImages.length} logos\n\n` +
                      `💡 Use \`.logo --history\` to see your past generations`,
                edit: processingMsg.key
            });
            
            await react('✅');
            
        } catch (error) {
            console.error('[LOGO] Error:', error.message);
            
            let errorMessage = `❌ *Failed to generate logos*\n\n`;
            
            if (error.code === 'ECONNABORTED') {
                errorMessage += `⏰ Timeout: The API took too long to respond.\n` +
                               `• Try a simpler prompt\n` +
                               `• Try again in a few moments`;
            } else if (error.response?.status === 429) {
                errorMessage += `📊 Rate limit: Too many requests.\n` +
                               `• Please wait a minute before trying again`;
            } else if (error.response?.status === 400) {
                errorMessage += `❓ Invalid prompt.\n` +
                               `• Make sure your prompt is descriptive\n` +
                               `• Example: "gaming logo with dragon and fire"`;
            } else if (error.response?.status === 500) {
                errorMessage += `🔧 Server error.\n` +
                               `• The API server is having issues\n` +
                               `• Please try again later`;
            } else {
                errorMessage += `${error.message}\n\n` +
                               `💡 *Tips for better results:*\n` +
                               `• Use specific colors (red, blue, gold)\n` +
                               `• Include style (3d, modern, vintage)\n` +
                               `• Add elements (crown, shield, wings)\n\n` +
                               `Try: \`${config.prefix}logo gaming logo with dragon\``;
            }
            
            await sock.sendMessage(from, {
                text: errorMessage,
                edit: processingMsg.key
            });
            await react('❌');
        }
    }
};

// Helper function to save generation history
function saveToHistory(sender, prompt, imageCount) {
    if (!userHistory.has(sender)) {
        userHistory.set(sender, []);
    }
    
    const history = userHistory.get(sender);
    history.unshift({
        prompt: prompt,
        imageCount: imageCount,
        timestamp: Date.now()
    });
    
    // Keep only last 10
    while (history.length > 10) {
        history.pop();
    }
    
    userHistory.set(sender, history);
}

// Helper function to show history
async function showHistory(sock, from, sender, reply) {
    const history = userHistory.get(sender);
    
    if (!history || history.length === 0) {
        return reply(`📭 *No logo generation history*\n\nGenerate logos using \`${config.prefix}logo <prompt>\` first.`);
    }
    
    let historyText = `🎨 *Your Logo Generation History*\n\n`;
    
    for (let i = 0; i < Math.min(history.length, 10); i++) {
        const item = history[i];
        const date = new Date(item.timestamp).toLocaleString();
        historyText += `${i + 1}. *${item.prompt.substring(0, 60)}${item.prompt.length > 60 ? '...' : ''}*\n`;
        historyText += `   📅 ${date}\n`;
        historyText += `   🎨 ${item.imageCount} logos generated\n`;
        historyText += `\n`;
    }
    
    historyText += `\n💡 Use \`.logo --clear\` to clear history\n`;
    historyText += `💡 Use \`.logo <prompt>\` to generate new logos`;
    
    // Split if too long
    if (historyText.length > 4000) {
        const parts = historyText.match(/[\s\S]{1,4000}/g) || [];
        for (const part of parts) {
            await reply(part);
        }
    } else {
        await reply(historyText);
    }
}