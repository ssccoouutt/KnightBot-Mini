/**
 * Sora AI Video Generator - Generate AI videos from text prompts
 * Uses Text-to-Video API
 */

const axios = require('axios');
const config = require('../../config');
const fs = require('fs');
const path = require('path');

// API Configuration
const API_BASE_URL = "https://text-to-video-api-wine.vercel.app/generate";

// Store generation history for each user
const userHistory = new Map();

module.exports = {
    name: 'sora',
    aliases: ['aivideo', 'genvideo', 'videogen', 'text2video', 't2v'],
    description: 'Generate AI videos from text prompts',
    usage: '.sora <prompt>\n.sora --help for more options',
    category: 'ai',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🎬 *AI Video Generator - Sora*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}sora <prompt>\` - Generate video\n` +
                       `• \`${config.prefix}sora --help\` - Show help\n` +
                       `• \`${config.prefix}sora --history\` - View your history\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}sora a cat playing with yarn\`\n` +
                       `• \`${config.prefix}sora beautiful sunset over mountains\`\n` +
                       `• \`${config.prefix}sora talking parrot in urdu\`\n` +
                       `• \`${config.prefix}sora robot dancing in cyberpunk city\`\n\n` +
                       `*Tips:*\n` +
                       `• Be descriptive for better results\n` +
                       `• Include actions, movements, and scenery\n` +
                       `• Videos are typically 3-5 seconds long\n` +
                       `• Generation may take 1-2 minutes`);
        }
        
        // Handle special commands
        if (args[0] === '--help') {
            return reply(`🎬 *Sora AI Video Generator - Help Guide*\n\n` +
                       `*Commands:*\n` +
                       `• \`${config.prefix}sora <prompt>\` - Generate video\n` +
                       `• \`${config.prefix}sora --history\` - View generation history\n` +
                       `• \`${config.prefix}sora --clear\` - Clear your history\n\n` +
                       `*Prompt Tips:*\n` +
                       `• Describe movement (running, flying, dancing)\n` +
                       `• Specify style (realistic, anime, cinematic)\n` +
                       `• Include environment (forest, city, space)\n` +
                       `• Add mood (happy, dramatic, peaceful)\n\n` +
                       `*Example Prompts:*\n` +
                       `• \`${config.prefix}sora a golden retriever running on beach at sunset\`\n` +
                       `• \`${config.prefix}sora anime girl waving in cherry blossom garden\`\n` +
                       `• \`${config.prefix}sora futuristic car driving through neon city\`\n` +
                       `• \`${config.prefix}sora talking parrot in urdu language\`\n\n` +
                       `*Note:*\n` +
                       `• Videos take 30-90 seconds to generate\n` +
                       `• Generated videos are MP4 format\n` +
                       `• Safe mode filters inappropriate content`);
        }
        
        if (args[0] === '--history') {
            return showHistory(sock, from, sender, reply);
        }
        
        if (args[0] === '--clear') {
            userHistory.delete(sender);
            return reply(`✅ Your video generation history has been cleared.`);
        }
        
        // Get the prompt
        let prompt = args.join(' ').trim();
        
        if (prompt.length < 5) {
            return reply(`❌ Please provide a longer prompt (minimum 5 characters).\n\nExample: \`${config.prefix}sora a cat playing with yarn\``);
        }
        
        if (prompt.length > 500) {
            return reply(`❌ Prompt is too long (maximum 500 characters).`);
        }
        
        await react('🎬');
        
        // Send processing message
        const processingMsg = await reply(`🎬 *Generating AI Video...*\n\n` +
                                         `📝 *Prompt:* ${prompt}\n` +
                                         `⏳ This may take 30-90 seconds...\n\n` +
                                         `> The AI is creating your video frame by frame`);
        
        try {
            // Encode prompt for URL
            const encodedPrompt = encodeURIComponent(prompt);
            const apiUrl = `${API_BASE_URL}?prompt=${encodedPrompt}`;
            
            console.log(`[SORA] Generating video for: ${prompt}`);
            
            // Make API request
            const response = await axios({
                method: 'GET',
                url: apiUrl,
                timeout: 120000, // 120 second timeout
                maxContentLength: 100 * 1024 * 1024 // 100MB max for video
            });
            
            // Check if response is successful
            if (!response.data || response.data.status !== 'success') {
                throw new Error(response.data?.message || 'API returned an error');
            }
            
            const videoUrl = response.data.url;
            const filename = response.data.filename;
            const isSafe = response.data.safe === 'true';
            
            if (!videoUrl) {
                throw new Error('No video URL received from API');
            }
            
            console.log(`[SORA] Video generated: ${filename}`);
            
            // Update processing message
            await sock.sendMessage(from, {
                text: `📥 *Downloading video...*\n\nPlease wait while I download the video file.`,
                edit: processingMsg.key
            });
            
            // Download the video
            const videoResponse = await axios({
                method: 'GET',
                url: videoUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 100 * 1024 * 1024
            });
            
            // Save to temp file
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const videoPath = path.join(tempDir, `sora_${Date.now()}_${sender.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);
            fs.writeFileSync(videoPath, videoResponse.data);
            
            // Get file size
            const stats = fs.statSync(videoPath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            
            // Prepare caption
            const caption = `🎬 *AI Generated Video*\n\n` +
                           `📝 *Prompt:* ${prompt}\n` +
                           `📊 *Size:* ${fileSizeMB} MB\n` +
                           `🎥 *Format:* MP4\n` +
                           `${!isSafe ? `⚠️ *Note:* This video may contain mature content\n` : ''}` +
                           `\n> *Generated by ${config.botName} AI*\n` +
                           `> Use \`.sora --help\` for more options`;
            
            // Send video
            await sock.sendMessage(from, {
                video: fs.readFileSync(videoPath),
                caption: caption,
                mimetype: 'video/mp4'
            }, { quoted: msg });
            
            // Clean up temp file
            fs.unlinkSync(videoPath);
            
            // Save to history
            saveToHistory(sender, prompt, fileSizeMB);
            
            // Update processing message to show completion
            await sock.sendMessage(from, {
                text: `✅ *Video Generation Complete!*\n\n` +
                      `📝 *Prompt:* ${prompt}\n` +
                      `📊 *Size:* ${fileSizeMB} MB\n\n` +
                      `💡 Use \`.sora --history\` to see your past generations`,
                edit: processingMsg.key
            });
            
            await react('✅');
            
        } catch (error) {
            console.error('[SORA] Error:', error.message);
            
            let errorMessage = `❌ *Failed to generate video*\n\n`;
            
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
                               `• Avoid inappropriate content\n` +
                               `• Example: "a cat playing with a ball"`;
            } else if (error.response?.status === 500) {
                errorMessage += `🔧 Server error.\n` +
                               `• The API server is having issues\n` +
                               `• Please try again later`;
            } else if (error.message.includes('safe') || error.message.includes('inappropriate')) {
                errorMessage += `🚫 Content filter triggered.\n` +
                               `• Your prompt may contain inappropriate content\n` +
                               `• Please try a different prompt`;
            } else {
                errorMessage += `${error.message}\n\n` +
                               `💡 *Tips for better results:*\n` +
                               `• Be descriptive about actions and movement\n` +
                               `• Keep prompts under 200 characters\n` +
                               `• Avoid complex scenes with many elements\n\n` +
                               `Try: \`${config.prefix}sora a dog running in a park\``;
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
function saveToHistory(sender, prompt, fileSize) {
    if (!userHistory.has(sender)) {
        userHistory.set(sender, []);
    }
    
    const history = userHistory.get(sender);
    history.unshift({
        prompt: prompt,
        fileSize: fileSize,
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
        return reply(`📭 *No video generation history*\n\nGenerate videos using \`${config.prefix}sora <prompt>\` first.`);
    }
    
    let historyText = `🎬 *Your Video Generation History*\n\n`;
    
    for (let i = 0; i < Math.min(history.length, 10); i++) {
        const item = history[i];
        const date = new Date(item.timestamp).toLocaleString();
        historyText += `${i + 1}. *${item.prompt.substring(0, 60)}${item.prompt.length > 60 ? '...' : ''}*\n`;
        historyText += `   📅 ${date}\n`;
        historyText += `   📊 ${item.fileSize} MB\n`;
        historyText += `\n`;
    }
    
    historyText += `\n💡 Use \`.sora --clear\` to clear history\n`;
    historyText += `💡 Use \`.sora <prompt>\` to generate new videos`;
    
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