const config = require('../../config');
const giftedBtns = require('gifted-btns');

const { sendButtons } = giftedBtns;

module.exports = {
    name: 'direct',
    aliases: [],
    description: 'Convert Google Drive links to direct download links with copy button',
    usage: 'direct <Google Drive link or file ID>',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply);
            return;
        }

        const userInput = args.join(' ').trim();
        await react('⏳');

        try {
            const result = convertToDriveDownloadLink(userInput);

            if (result) {
                await sendResultWithButton(sock, from, userInput, result, msg, reply);
                await react('✅');
            } else {
                await showError(sock, from, userInput, reply);
                await react('❌');
            }

        } catch (error) {
            console.error('Direct command error:', error);
            await reply(`❌ *Error*\n\n${error.message}`);
            await react('❌');
        }
    }
};

async function showHelp(sock, chatId, reply) {
    const helpText = `📁 *Google Drive Direct Link Converter*\n\n` +
                    `Convert any Google Drive sharing link to a direct download link with copy button.\n\n` +
                    `*Usage:*\n` +
                    `\`direct <Google Drive link or file ID>\`\n\n` +
                    `*Supported Formats:*\n` +
                    `• https://drive.google.com/file/d/FILE_ID/view\n` +
                    `• https://drive.google.com/open?id=FILE_ID\n` +
                    `• https://drive.google.com/uc?id=FILE_ID\n` +
                    `• Direct file ID: \`1Hy1Ty1xyjI5kKBYeqEJ87avPpRWxn0rM\`\n\n` +
                    `*Examples:*\n` +
                    `• \`direct https://drive.google.com/file/d/1Hy1Ty1xyjI5kKBYeqEJ87avPpRWxn0rM/view\`\n` +
                    `• \`direct 1Hy1Ty1xyjI5kKBYeqEJ87avPpRWxn0rM\``;

    await reply(helpText);
}

async function showError(sock, chatId, input, reply) {
    const errorText = `❌ *Could not extract file ID*\n\n` +
                     `Input: \`${input.substring(0, 50)}${input.length > 50 ? '...' : ''}\`\n\n` +
                     `*Please check:*\n` +
                     `• Make sure it's a valid Google Drive link\n` +
                     `• Or provide just the file ID\n\n` +
                     `*Examples of valid formats:*\n` +
                     `• \`https://drive.google.com/file/d/1Hy1Ty1xyjI5kKBYeqEJ87avPpRWxn0rM/view\`\n` +
                     `• \`https://drive.google.com/open?id=1Hy1Ty1xyjI5kKBYeqEJ87avPpRWxn0rM\`\n` +
                     `• \`1Hy1Ty1xyjI5kKBYeqEJ87avPpRWxn0rM\``;

    await reply(errorText);
}

async function sendResultWithButton(sock, chatId, originalInput, downloadLink, quotedMsg, reply) {
    const sessionId = `drive_${Date.now()}`;

    const messageText = `✅ *Google Drive Direct Link*\n\n` +
                       `🔗 *Original:* \${originalInput.substring(0, 50)}${originalInput.length > 50 ? '...' : ''}\\n\n` +
                       `📥 *Download Link:*\n${downloadLink}\n\n` +
                       `_Click the button below to copy the link._`;

    // Create copy button
    const buttons = [{
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
            display_text: 'Copy Link',
            copy_code: downloadLink
        })
    }];

    // Send with aimode: true HARCODED - always true regardless of AI mode toggle
    await sendButtons(sock, chatId, {
        text: messageText,
        footer: 'Google Drive Downloader',
        buttons: buttons,
        aimode: true  // 👈 HARDCODED TRUE - ALWAYS ON
    }, { quoted: quotedMsg });

    console.log(`📋 Direct link sent - Session: ${sessionId} - AI Mode: true (hardcoded)`);
}

/**
 * Convert various Google Drive link formats to the direct download URL pattern
 * @param {string} input - Google Drive link or file ID
 * @returns {string|null} - Direct download link or null if invalid
 */
function convertToDriveDownloadLink(input) {
    if (!input || typeof input !== 'string') return null;

    // Regular expressions to extract file ID from various Google Drive URL formats
    const patterns = [
        /[-\w]{25,}/, // Match any 25+ character alphanumeric + underscore + hyphen string (most file IDs)
        /\/file\/d\/([a-zA-Z0-9_-]+)/,           // Format: /file/d/FILE_ID
        /id=([a-zA-Z0-9_-]+)/,                    // Format: id=FILE_ID
        /\/open\?id=([a-zA-Z0-9_-]+)/,            // Format: /open?id=FILE_ID
        /drive\.google\.com.*?\/d\/([a-zA-Z0-9_-]+)/, // Format: drive.google.com/.../d/FILE_ID
        /\/uc\?id=([a-zA-Z0-9_-]+)/,               // Format: /uc?id=FILE_ID (for direct download links)
        /\/folders\/([a-zA-Z0-9_-]+)/              // Format: /folders/FILE_ID (for folders)
    ];
    
    let fileId = null;
    
    // Try each pattern to extract file ID
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match && match[1]) {
            fileId = match[1];
            break;
        }
    }
    
    // If no pattern matched, check if the input itself might be a file ID
    if (!fileId) {
        const trimmed = input.trim();
        // File IDs are typically 25-40 characters long and contain alphanumeric, underscore, hyphen
        if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
            fileId = trimmed;
        }
    }
    
    if (!fileId) return null;
    
    // Construct the direct download link
    const downloadLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    return downloadLink;
}
