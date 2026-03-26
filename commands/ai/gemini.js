const axios = require('axios');
const config = require('../../config');

// API configuration
const BASE_URL = "https://phrenogastric-antonomastically-jaelynn.ngrok-free.dev";
const TIMEOUT = 120000; // 2 minutes in milliseconds

// Set this to true to include screenshot in response
const INCLUDE_SCREENSHOT = false;

module.exports = {
    name: 'gemini',
    aliases: [],
    description: 'Ask Gemini AI a question with optional file support',
    usage: 'gemini <question>\n.gemini <question> --file <url>\nReply to a message with .gemini to analyze it',
    category: 'ai',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        // Check if replying to a message with media
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const hasMedia = quotedMessage && (
            quotedMessage.imageMessage ||
            quotedMessage.videoMessage ||
            quotedMessage.documentMessage ||
            quotedMessage.audioMessage
        );

        // Parse arguments for --file flag
        const fileFlagIndex = args.indexOf('--file');
        let fileUrl = null;
        let question = '';

        if (fileFlagIndex !== -1 && args[fileFlagIndex + 1]) {
            fileUrl = args[fileFlagIndex + 1];
            // Remove the --file flag and its value from args
            question = args.filter((_, i) => i !== fileFlagIndex && i !== fileFlagIndex + 1).join(' ');
        } else {
            question = args.join(' ');
        }

        // If replying to a media message without question, use default
        if (hasMedia && !question) {
            question = "What's in this media?";
        }

        // Show help if no question and not replying to media
        if (!question && !hasMedia) {
            await reply(`🤖 *Gemini AI Assistant*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}gemini <question>\` - Ask a question\n` +
                       `• \`${config.prefix}gemini <question> --file <url>\` - Ask with a file URL\n` +
                       `• Reply to any image/video/document with \`${config.prefix}gemini\` - Analyze media\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}gemini What is artificial intelligence?\`\n` +
                       `• \`${config.prefix}gemini What's in this PDF? --file https://example.com/doc.pdf\``);
            return;
        }

        await react('⏳');
        const processingMsg = await reply(`🤔 *Thinking...*\n\nQuery: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`);

        try {
            let result;

            // Handle different scenarios
            if (hasMedia) {
                // Reply with media - upload and get URL first
                await sock.sendMessage(from, {
                    text: "📎 *Media detected!* Uploading to Gemini...",
                    edit: processingMsg.key
                });

                // Upload media to temporary hosting (you'll need to implement this)
                const mediaUrl = await uploadMediaToTemp(sock, quotedMessage);
                
                // Query Gemini with the media URL
                result = await queryGemini(question, mediaUrl);
                
            } else if (fileUrl) {
                // File URL provided directly
                result = await queryGemini(question, fileUrl);
            } else {
                // Simple text query
                result = await queryGemini(question);
            }

            // Format the response
            const responseText = formatResponse(result, question);

            // Send response based on screenshot setting
            if (INCLUDE_SCREENSHOT && result.screenshot_filename) {
                // Download the screenshot
                const screenshotBuffer = await downloadScreenshot(result.screenshot_filename);
                
                // Send the screenshot as image with caption
                await sock.sendMessage(from, {
                    image: screenshotBuffer,
                    caption: responseText,
                    mimetype: 'image/png'
                });
            } else {
                // Send as plain text
                await sock.sendMessage(from, {
                    text: responseText
                });
            }

            // Delete the processing message
            await sock.sendMessage(from, {
                delete: processingMsg.key
            });

            await react('✅');

        } catch (error) {
            console.error('Gemini API error:', error);
            
            let errorMsg = '❌ *Failed to get response from Gemini*\n\n';
            
            if (error.code === 'ECONNREFUSED') {
                errorMsg += 'Cannot connect to Gemini API. The service may be down.';
            } else if (error.response?.status === 404) {
                errorMsg += 'API endpoint not found. Check the BASE_URL.';
            } else if (error.response?.status === 413) {
                errorMsg += 'File too large. Please use a smaller file.';
            } else if (error.response?.status === 415) {
                errorMsg += 'Unsupported file type.';
            } else if (error.code === 'ETIMEDOUT') {
                errorMsg += 'Request timeout. The file may be too large or the service is busy.';
            } else {
                errorMsg += `Error: ${error.message}`;
            }

            await sock.sendMessage(from, {
                text: errorMsg,
                edit: processingMsg.key
            });
            await react('❌');
        }
    }
};

/**
 * Query the Gemini API
 */
async function queryGemini(query, fileUrl = null) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'ngrok-skip-browser-warning': 'true',
        'Accept': 'application/json'
    };

    let response;

    if (fileUrl) {
        // Use POST endpoint with file
        const url = `${BASE_URL}/gemini`;
        headers['Content-Type'] = 'application/json';

        const data = {
            query: query,
            file_url: fileUrl
        };

        response = await axios.post(url, data, { 
            headers, 
            timeout: TIMEOUT 
        });
    } else {
        // Use GET endpoint for simple query
        const url = `${BASE_URL}/gemini/simple`;
        const params = { query };

        response = await axios.get(url, { 
            params, 
            headers, 
            timeout: TIMEOUT 
        });
    }

    return response.data;
}

/**
 * Download screenshot from the API
 */
async function downloadScreenshot(filename) {
    const url = `${BASE_URL}/screenshot/${filename}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'ngrok-skip-browser-warning': 'true'
    };

    const response = await axios.get(url, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000 // 30 seconds for download
    });

    return Buffer.from(response.data);
}

/**
 * Upload media from quoted message to temporary hosting
 * This is a simplified version - you may want to use a service like tmp.ninja or your own upload endpoint
 */
async function uploadMediaToTemp(sock, quotedMessage) {
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    
    let stream;
    let mediaType;

    if (quotedMessage.imageMessage) {
        stream = await downloadContentFromMessage(quotedMessage.imageMessage, 'image');
        mediaType = 'image';
    } else if (quotedMessage.videoMessage) {
        stream = await downloadContentFromMessage(quotedMessage.videoMessage, 'video');
        mediaType = 'video';
    } else if (quotedMessage.documentMessage) {
        stream = await downloadContentFromMessage(quotedMessage.documentMessage, 'document');
        mediaType = 'document';
    } else if (quotedMessage.audioMessage) {
        stream = await downloadContentFromMessage(quotedMessage.audioMessage, 'audio');
        mediaType = 'audio';
    } else {
        throw new Error('Unsupported media type');
    }

    // Download the media
    const buffer = [];
    for await (const chunk of stream) {
        buffer.push(chunk);
    }
    const mediaBuffer = Buffer.concat(buffer);

    // Here you need to upload to a temporary file hosting service
    // Options:
    // 1. Use a free service like tmp.ninja (no API key needed)
    // 2. Use your own upload endpoint
    // 3. Use a cloud storage like AWS S3
    
    // Example using tmp.ninja (free, no auth)
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', mediaBuffer, {
        filename: `file.${getExtension(mediaType)}`,
        contentType: 'application/octet-stream'
    });

    const uploadResponse = await axios.post('https://tmp.ninja/upload.php', formData, {
        headers: {
            ...formData.getHeaders()
        }
    });

    // tmp.ninja returns the URL directly
    return uploadResponse.data.trim();
}

/**
 * Get file extension based on media type
 */
function getExtension(mediaType) {
    const extensions = {
        'image': 'jpg',
        'video': 'mp4',
        'document': 'pdf',
        'audio': 'mp3'
    };
    return extensions[mediaType] || 'bin';
}

/**
 * Format the API response for display
 */
function formatResponse(result, originalQuery) {
    let formatted = `🤖 *Gemini AI Response*\n\n`;
    
    formatted += `💭 *Query:* ${originalQuery}\n\n`;
    formatted += `📝 *Response:*\n${result.response}\n\n`;
    
    // Add metadata
    formatted += `━━━━━━━━━━━━━━━━━━━━━\n`;
    formatted += `⚡ Time: ${result.elapsed_seconds} seconds\n`;
    if (result.file_processed) {
        formatted += `📎 File processed: Yes\n`;
    }
    
    return formatted;
}
