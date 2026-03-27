const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Wikipedia API Configuration
const WIKIPEDIA_BASE_URL = "https://en.wikipedia.org/";
const WIKIPEDIA_API_PDF = "api/rest_v1/page/pdf/";
const WIKIPEDIA_API_OPENSEARCH = "w/api.php?action=opensearch&search=";

module.exports = {
    name: 'wikipedia',
    aliases: ['wiki', 'article', 'pdf'],
    description: 'Download Wikipedia articles as PDF',
    usage: 'wikipedia <search term>\n' +
           'wikipedia search <term> - Search for articles\n' +
           'wikipedia download <term> - Download as PDF',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply, config);
            return;
        }

        // Parse subcommands
        const subCommand = args[0].toLowerCase();

        if (subCommand === 'search' && args.length > 1) {
            const query = args.slice(1).join(' ');
            await handleSearch(sock, from, query, reply, react);
        }
        else if (subCommand === 'download' && args.length > 1) {
            const query = args.slice(1).join(' ');
            await handleDownload(sock, from, query, reply, react);
        }
        else {
            // Default to download
            const query = args.join(' ');
            await handleDownload(sock, from, query, reply, react);
        }
    }
};

async function showHelp(sock, chatId, reply, config) {
    await reply(`📚 *Wikipedia PDF Downloader*\n\n` +
                `*Usage:*\n` +
                `• \`${config.prefix}wikipedia <search term>\` - Download article\n` +
                `• \`${config.prefix}wikipedia search <term>\` - Search for articles\n` +
                `• \`${config.prefix}wikipedia download <term>\` - Download as PDF\n\n` +
                `*Examples:*\n` +
                `• \`${config.prefix}wikipedia Artificial Intelligence\`\n` +
                `• \`${config.prefix}wiki search Python programming\`\n` +
                `• \`${config.prefix}wiki download Albert Einstein\``);
}

async function searchWikipedia(query) {
    try {
        const url = WIKIPEDIA_BASE_URL + WIKIPEDIA_API_OPENSEARCH + encodeURIComponent(query);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        // opensearch returns [search term, [titles], [descriptions], [urls]]
        if (response.data && response.data.length >= 2) {
            return response.data[1]; // List of titles
        }
        return [];
    } catch (error) {
        console.error('Wikipedia search error:', error.message);
        return [];
    }
}

async function handleSearch(sock, chatId, query, reply, react) {
    await react('⏳');
    const processingMsg = await reply(`🔍 *Searching Wikipedia for:* ${query}`);

    try {
        const titles = await searchWikipedia(query);

        if (titles.length === 0) {
            await sock.sendMessage(chatId, {
                text: `❌ No articles found matching "${query}"`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }

        let resultText = `📚 *Wikipedia Search Results*\n\n`;
        resultText += `*Query:* ${query}\n`;
        resultText += `*Found:* ${titles.length} articles\n\n`;
        
        titles.slice(0, 10).forEach((title, index) => {
            resultText += `${index + 1}. ${title}\n`;
        });

        if (titles.length > 10) {
            resultText += `\n... and ${titles.length - 10} more\n`;
        }

        resultText += `\n*To download:* \`${config.prefix}wiki download <title>\``;

        await sock.sendMessage(chatId, {
            text: resultText,
            edit: processingMsg.key
        });
        await react('✅');

    } catch (error) {
        console.error('Search error:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Search failed: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleDownload(sock, chatId, query, reply, react) {
    await react('⏳');
    const processingMsg = await reply(`📚 *Searching for:* "${query}"...`);

    try {
        // First, find the exact title
        const titles = await searchWikipedia(query);

        if (titles.length === 0) {
            await sock.sendMessage(chatId, {
                text: `❌ No articles found matching "${query}"`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }

        // Use the first (most relevant) title
        const exactTitle = titles[0];
        
        await sock.sendMessage(chatId, {
            text: `✅ Found: *${exactTitle}*\n\n📡 Downloading PDF...`,
            edit: processingMsg.key
        });

        // Format title for URL (replace spaces with underscores)
        const formattedTitle = exactTitle.replace(/ /g, '_');
        const pdfUrl = WIKIPEDIA_BASE_URL + WIKIPEDIA_API_PDF + formattedTitle;

        // Create temp directory
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Download PDF
        const filename = path.join(tempDir, `${formattedTitle}_${Date.now()}.pdf`);
        
        const response = await axios({
            method: 'GET',
            url: pdfUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/pdf'
            }
        });

        // Check if it's actually a PDF
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('pdf')) {
            throw new Error('No PDF available for this article');
        }

        // Save the file
        const writer = fs.createWriteStream(filename);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Verify file
        const stats = fs.statSync(filename);
        if (stats.size < 1000) {
            throw new Error('Downloaded file is too small');
        }

        // Read file and send
        const fileBuffer = fs.readFileSync(filename);
        const fileSizeKB = (stats.size / 1024).toFixed(1);

        const caption = `📚 *Wikipedia Article*\n\n` +
                       `*Title:* ${exactTitle}\n` +
                       `*Size:* ${fileSizeKB} KB\n` +
                       `*Source:* Wikipedia`;

        await sock.sendMessage(chatId, {
            document: fileBuffer,
            fileName: `${exactTitle}.pdf`,
            mimetype: 'application/pdf',
            caption: caption
        });

        // Clean up
        fs.unlinkSync(filename);

        // Delete processing message
        await sock.sendMessage(chatId, {
            delete: processingMsg.key
        });

        await react('✅');

    } catch (error) {
        console.error('Wikipedia download error:', error);
        
        let errorMsg = '❌ *Download failed*\n\n';
        
        if (error.response?.status === 404) {
            errorMsg += 'Article not found. Try searching first.';
        } else if (error.response?.status === 403) {
            errorMsg += 'Wikipedia is blocking requests. Try again later.';
        } else {
            errorMsg += `Error: ${error.message}`;
        }

        // Show suggestions if available
        const titles = await searchWikipedia(query);
        if (titles.length > 0) {
            errorMsg += `\n\n*Did you mean:*\n`;
            titles.slice(0, 3).forEach(title => {
                errorMsg += `• ${title}\n`;
            });
        }

        await sock.sendMessage(chatId, {
            text: errorMsg,
            edit: processingMsg.key
        });
        await react('❌');
    }
}
