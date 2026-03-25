/**
 * APK Downloader - Download Android apps from Aptoide
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

// Format file size
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Search for apps on Aptoide
async function searchApps(query, limit = 10) {
    try {
        const url = `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=${limit}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        if (response.data && response.data.datalist && response.data.datalist.list) {
            return response.data.datalist.list;
        }
        return [];
    } catch (error) {
        console.error('[APK] Search error:', error.message);
        return [];
    }
}

// Get app by package name
async function getAppByPackage(packageName) {
    try {
        const url = `https://ws75.aptoide.com/api/7/apps/get_app/package=${packageName}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        if (response.data) {
            // Check different response structures
            if (response.data.datalist && response.data.datalist.list && response.data.datalist.list[0]) {
                return response.data.datalist.list[0];
            }
            if (response.data.data && response.data.data.list && response.data.data.list[0]) {
                return response.data.data.list[0];
            }
            if (response.data.nodes) {
                return response.data;
            }
        }
        return null;
    } catch (error) {
        console.error('[APK] Package lookup error:', error.message);
        return null;
    }
}

// Extract package name from Play Store URL
function extractPackageName(url) {
    const patterns = [
        /play\.google\.com\/store\/apps\/details\?id=([^&]+)/,
        /play\.google\.com\/apps\/details\?id=([^&]+)/,
        /market\.android\.com\/details\?id=([^&]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// Check if input is a Play Store link
function isPlayStoreLink(input) {
    return /play\.google\.com|market\.android\.com/i.test(input);
}

// Download APK file
async function downloadApk(appDetails, savePath) {
    try {
        const downloadUrl = appDetails.file.path;
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 120000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}

module.exports = {
    name: 'apk',
    aliases: ['app', 'downloadapk', 'getapk'],
    category: 'media',
    description: 'Search and download APK files',
    usage: '.apk <app name or Play Store URL>',
    
    async execute(sock, msg, args, extra) {
        console.log('\n📱 [APK-DEBUG] ========== START ==========');
        console.log(`[APK-DEBUG] Message ID: ${msg.key.id}`);
        console.log(`[APK-DEBUG] Args:`, args);
        
        try {
            // Check if message has already been processed
            if (processedMessages.has(msg.key.id)) {
                console.log('[APK-DEBUG] Message already processed, skipping');
                return;
            }
            
            processedMessages.add(msg.key.id);
            setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);
            
            const query = args.join(' ').trim();
            if (!query) {
                return extra.reply('📱 *APK Downloader*\n\n' +
                    'Search and download Android apps\n\n' +
                    'Usage: .apk <app name or Play Store URL>\n\n' +
                    'Examples:\n' +
                    '• .apk Instagram\n' +
                    '• .apk com.instagram.android\n' +
                    '• .apk https://play.google.com/store/apps/details?id=com.instagram.android');
            }
            
            await extra.reply('🔍 Searching for app... Please wait.');
            
            let appDetails = null;
            let searchResults = [];
            
            // Check if input is a Play Store link or package name
            if (isPlayStoreLink(query)) {
                const packageName = extractPackageName(query);
                if (!packageName) {
                    return extra.reply('❌ Could not extract package name from the URL.');
                }
                
                console.log(`[APK-DEBUG] Fetching app by package: ${packageName}`);
                appDetails = await getAppByPackage(packageName);
                
                if (!appDetails) {
                    return extra.reply(`❌ App with package '${packageName}' not found on Aptoide.\n\n` +
                        `This could mean:\n` +
                        `• The app is not available\n` +
                        `• The app might be paid\n` +
                        `• Try searching by name instead`);
                }
            } else {
                // Search by name
                console.log(`[APK-DEBUG] Searching for: ${query}`);
                searchResults = await searchApps(query);
                
                if (!searchResults || searchResults.length === 0) {
                    return extra.reply(`❌ No apps found for "${query}".\n\nTry:\n• Different spelling\n• Shorter name\n• Package name\n• Play Store URL`);
                }
                
                // If only one result, show it directly
                if (searchResults.length === 1) {
                    appDetails = searchResults[0];
                } else {
                    // Show search results
                    let resultText = `📱 *Search Results for "${query}"*\n\n`;
                    
                    for (let i = 0; i < Math.min(10, searchResults.length); i++) {
                        const app = searchResults[i];
                        resultText += `${i + 1}. *${app.name}*\n`;
                        resultText += `   📦 ${app.package}\n`;
                        resultText += `   📀 ${app.file.vername}\n`;
                        resultText += `   💾 ${formatSize(app.file.filesize)}\n\n`;
                    }
                    
                    resultText += `Reply with the number to download (1-${Math.min(10, searchResults.length)}) or cancel.`;
                    
                    // Store search results in session for later selection
                    const sessionKey = `apk_search_${msg.key.id}`;
                    global.apkSearchSessions = global.apkSearchSessions || {};
                    global.apkSearchSessions[msg.key.id] = {
                        results: searchResults,
                        timestamp: Date.now(),
                        from: extra.from
                    };
                    
                    // Clean up old sessions
                    for (const key in global.apkSearchSessions) {
                        if (Date.now() - global.apkSearchSessions[key].timestamp > 300000) {
                            delete global.apkSearchSessions[key];
                        }
                    }
                    
                    return extra.reply(resultText);
                }
            }
            
            // Download the app
            if (appDetails) {
                const filename = `${appDetails.name}_${appDetails.file.vername}.apk`.replace(/[^a-zA-Z0-9._-]/g, '_');
                const tempDir = path.join(process.cwd(), 'temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                
                const filepath = path.join(tempDir, filename);
                
                await extra.reply(`📥 *Downloading*\n\n` +
                    `📱 Name: ${appDetails.name}\n` +
                    `📀 Version: ${appDetails.file.vername}\n` +
                    `💾 Size: ${formatSize(appDetails.file.filesize)}\n` +
                    `📦 Package: ${appDetails.package}\n\n` +
                    `Please wait...`);
                
                console.log(`[APK-DEBUG] Downloading: ${filename}`);
                await downloadApk(appDetails, filepath);
                
                const fileSize = fs.statSync(filepath).size;
                console.log(`[APK-DEBUG] Downloaded ${formatSize(fileSize)}`);
                
                // Send the APK file
                await sock.sendMessage(extra.from, {
                    document: fs.readFileSync(filepath),
                    mimetype: 'application/vnd.android.package-archive',
                    fileName: filename,
                    caption: `✅ *Download Complete*\n\n📱 ${appDetails.name}\n📀 ${appDetails.file.vername}\n💾 ${formatSize(fileSize)}\n\n> *Downloaded by ${config.botName}*`
                }, { quoted: msg });
                
                // Clean up temp file
                fs.unlinkSync(filepath);
                console.log(`[APK-DEBUG] ✅ APK sent successfully`);
                
                await sock.sendMessage(extra.from, {
                    react: { text: '✅', key: msg.key }
                });
            }
            
            console.log('[APK-DEBUG] ========== END ==========\n');
            
        } catch (error) {
            console.error('[APK-DEBUG] ❌ Error:', error.message);
            console.error('[APK-DEBUG] Stack:', error.stack);
            console.error('[APK-DEBUG] ========== END ==========\n');
            
            await extra.reply(`❌ Failed to download APK.\n\nError: ${error.message}\n\nPlease try again later.`);
        }
    },
    
    // Handle number selection from search results
    async handleNumberSelection(sock, msg, number, extra) {
        try {
            const sessionKey = `apk_search_${msg.key.id}`;
            const session = global.apkSearchSessions?.[msg.key.id];
            
            if (!session || !session.results) {
                return false;
            }
            
            const index = parseInt(number) - 1;
            if (index < 0 || index >= session.results.length) {
                await extra.reply('❌ Invalid selection number.');
                return true;
            }
            
            const appDetails = session.results[index];
            
            // Download the app
            const filename = `${appDetails.name}_${appDetails.file.vername}.apk`.replace(/[^a-zA-Z0-9._-]/g, '_');
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const filepath = path.join(tempDir, filename);
            
            await extra.reply(`📥 *Downloading*\n\n` +
                `📱 Name: ${appDetails.name}\n` +
                `📀 Version: ${appDetails.file.vername}\n` +
                `💾 Size: ${formatSize(appDetails.file.filesize)}\n` +
                `📦 Package: ${appDetails.package}\n\n` +
                `Please wait...`);
            
            await downloadApk(appDetails, filepath);
            
            const fileSize = fs.statSync(filepath).size;
            
            await sock.sendMessage(extra.from, {
                document: fs.readFileSync(filepath),
                mimetype: 'application/vnd.android.package-archive',
                fileName: filename,
                caption: `✅ *Download Complete*\n\n📱 ${appDetails.name}\n📀 ${appDetails.file.vername}\n💾 ${formatSize(fileSize)}\n\n> *Downloaded by ${config.botName}*`
            }, { quoted: msg });
            
            fs.unlinkSync(filepath);
            
            // Clean up session
            delete global.apkSearchSessions[msg.key.id];
            
            return true;
        } catch (error) {
            console.error('[APK] Selection error:', error);
            await extra.reply(`❌ Failed to download: ${error.message}`);
            return true;
        }
    }
};
