/**
 * Magics AI Image Generator - Generate high-quality AI images without watermark
 * Uses free AI image generation API
 */

const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

const FORCE_AI_MODE = true;

// API Configuration
const API_BASE_URL = "https://image-generator-40abkidz.vercel.app/generate";

// Store generation history for each user (last 5 images)
const userHistory = new Map();

module.exports = {
    name: 'magics',
    aliases: ['aiimage', 'generate', 'imagine', 'dream', 'aigen', 'genimg'],
    description: 'Generate high-quality AI images without watermark',
    usage: '.magics <prompt>\n.magics --help for more options',
    category: 'ai',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎨 *AI Image Generator - Magics*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}magics <prompt>\` - Generate image\n` +
                       `• \`${config.prefix}magics --help\` - Show help\n` +
                       `• \`${config.prefix}magics --history\` - View your history\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}magics a beautiful sunset over mountains\`\n` +
                       `• \`${config.prefix}magics cyberpunk city at night, neon lights\`\n` +
                       `• \`${config.prefix}magics --style anime a cute cat girl\`\n\n` +
                       `*Tips:*\n` +
                       `• Be specific for better results\n` +
                       `• Use descriptive words (style, colors, mood)\n` +
                       `• Add "high quality", "detailed", "4k" for better results`);
        }
        
        // Handle special commands
        if (args[0] === '--help') {
            return reply(`🎨 *Magics AI - Help Guide*\n\n` +
                       `*Commands:*\n` +
                       `• \`${config.prefix}magics <prompt>\` - Generate image\n` +
                       `• \`${config.prefix}magics --history\` - View your generation history\n` +
                       `• \`${config.prefix}magics --clear\` - Clear your history\n\n` +
                       `*Style Modifiers:*\n` +
                       `• \`--style anime\` - Anime style\n` +
                       `• \`--style realistic\` - Photorealistic\n` +
                       `• \`--style painting\` - Oil painting style\n` +
                       `• \`--style sketch\` - Pencil sketch\n` +
                       `• \`--style 3d\` - 3D render style\n\n` +
                       `*Quality Modifiers:*\n` +
                       `• \`--quality hd\` - HD quality\n` +
                       `• \`--quality 4k\` - 4K quality\n` +
                       `• \`--quality ultra\` - Ultra HD\n\n` +
                       `*Size Modifiers:*\n` +
                       `• \`--size square\` - 1024x1024\n` +
                       `• \`--size portrait\` - 768x1024\n` +
                       `• \`--size landscape\` - 1024x768\n\n` +
                       `*Example:*\n` +
                       `\`${config.prefix}magics --style anime --quality 4k a magical girl flying through space\``);
        }
        
        if (args[0] === '--history') {
            return showHistory(sock, from, sender, reply);
        }
        
        if (args[0] === '--clear') {
            userHistory.delete(sender);
            return reply(`✅ Your generation history has been cleared.`);
        }
        
        // Parse prompt and modifiers
        let prompt = args.join(' ');
        let style = null;
        let quality = null;
        let size = null;
        
        // Extract modifiers
        const styleMatch = prompt.match(/--style\s+(\w+)/i);
        if (styleMatch) {
            style = styleMatch[1];
            prompt = prompt.replace(/--style\s+\w+/i, '');
        }
        
        const qualityMatch = prompt.match(/--quality\s+(\w+)/i);
        if (qualityMatch) {
            quality = qualityMatch[1];
            prompt = prompt.replace(/--quality\s+\w+/i, '');
        }
        
        const sizeMatch = prompt.match(/--size\s+(\w+)/i);
        if (sizeMatch) {
            size = sizeMatch[1];
            prompt = prompt.replace(/--size\s+\w+/i, '');
        }
        
        // Clean up prompt
        prompt = prompt.trim().replace(/\s+/g, ' ');
        
        if (prompt.length < 3) {
            return reply(`❌ Please provide a longer prompt (minimum 3 characters).`);
        }
        
        if (prompt.length > 500) {
            return reply(`❌ Prompt is too long (maximum 500 characters).`);
        }
        
        await react('🎨');
        
        // Send processing message
        const processingMsg = await reply(`🎨 *Generating AI image...*\n\n` +
                                         `📝 *Prompt:* ${prompt}\n` +
                                         `${style ? `🎭 *Style:* ${style}\n` : ''}` +
                                         `${quality ? `✨ *Quality:* ${quality}\n` : ''}` +
                                         `${size ? `📐 *Size:* ${size}\n` : ''}` +
                                         `⏳ Please wait...`);
        
        try {
            // Build enhanced prompt with modifiers
            let enhancedPrompt = prompt;
            if (style === 'anime') enhancedPrompt += ', anime style, manga, cel shaded';
            else if (style === 'realistic') enhancedPrompt += ', photorealistic, ultra detailed, 8k';
            else if (style === 'painting') enhancedPrompt += ', oil painting, artstation, masterpiece';
            else if (style === 'sketch') enhancedPrompt += ', pencil sketch, line art, monochrome';
            else if (style === '3d') enhancedPrompt += ', 3d render, octane render, unreal engine';
            
            if (quality === 'hd') enhancedPrompt += ', high quality, detailed';
            else if (quality === '4k') enhancedPrompt += ', 4k, ultra hd, sharp focus';
            else if (quality === 'ultra') enhancedPrompt += ', ultra high quality, masterpiece, award winning';
            
            if (size === 'portrait') enhancedPrompt += ', portrait orientation';
            else if (size === 'landscape') enhancedPrompt += ', landscape orientation';
            
            // Encode prompt for URL
            const encodedPrompt = encodeURIComponent(enhancedPrompt);
            const apiUrl = `${API_BASE_URL}?prompt=${encodedPrompt}`;
            
            console.log(`[MAGICS] Generating image for: ${enhancedPrompt.substring(0, 100)}...`);
            
            // Make API request
            const response = await axios({
                method: 'GET',
                url: apiUrl,
                responseType: 'arraybuffer',
                timeout: 60000, // 60 second timeout
                maxContentLength: 10 * 1024 * 1024 // 10MB max
            });
            
            // Check if response is an image
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error('API did not return an image. Please try again with a different prompt.');
            }
            
            // Save image temporarily
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const imagePath = path.join(tempDir, `magics_${Date.now()}_${sender.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
            fs.writeFileSync(imagePath, response.data);
            
            // Get image size
            const stats = fs.statSync(imagePath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            
            // Prepare caption
            const caption = `🎨 *AI Generated Image*\n\n` +
                           `📝 *Prompt:* ${prompt}\n` +
                           `${style ? `🎭 *Style:* ${style}\n` : ''}` +
                           `${quality ? `✨ *Quality:* ${quality}\n` : ''}` +
                           `${size ? `📐 *Size:* ${size}\n` : ''}` +
                           `📊 *Size:* ${fileSizeMB} MB\n\n` +
                           `> *Generated by ${config.botName} AI*\n` +
                           `> Use \`.magics --help\` for more options`;
            
            // Send image
            await sock.sendMessage(from, {
                image: fs.readFileSync(imagePath),
                caption: caption
            }, { quoted: msg });
            
            // Clean up temp file
            fs.unlinkSync(imagePath);
            
            // Save to history
            saveToHistory(sender, prompt, style, quality, size);
            
            await react('✅');
            
        } catch (error) {
            console.error('[MAGICS] Error:', error.message);
            
            let errorMessage = `❌ *Failed to generate image*\n\n`;
            
            if (error.code === 'ECONNABORTED') {
                errorMessage += `Timeout: The API took too long to respond.\nTry again with a simpler prompt.`;
            } else if (error.response?.status === 429) {
                errorMessage += `Rate limit: Too many requests. Please wait a moment.`;
            } else if (error.response?.status === 400) {
                errorMessage += `Invalid prompt. Try a different description.`;
            } else if (error.response?.status === 500) {
                errorMessage += `Server error. Please try again later.`;
            } else {
                errorMessage += `${error.message}\n\nPlease try again with a different prompt.`;
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
function saveToHistory(sender, prompt, style, quality, size) {
    if (!userHistory.has(sender)) {
        userHistory.set(sender, []);
    }
    
    const history = userHistory.get(sender);
    history.unshift({
        prompt: prompt,
        style: style,
        quality: quality,
        size: size,
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
        return reply(`📭 *No generation history*\n\nGenerate images using \`.magics <prompt>\` first.`);
    }
    
    let historyText = `📜 *Your AI Image History*\n\n`;
    
    for (let i = 0; i < Math.min(history.length, 5); i++) {
        const item = history[i];
        const date = new Date(item.timestamp).toLocaleString();
        historyText += `${i + 1}. *${item.prompt.substring(0, 50)}${item.prompt.length > 50 ? '...' : ''}*\n`;
        historyText += `   📅 ${date}\n`;
        if (item.style) historyText += `   🎭 ${item.style}\n`;
        historyText += `\n`;
    }
    
    historyText += `\n💡 Use \`.magics --clear\` to clear history`;
    
    await reply(historyText);
}