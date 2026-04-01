/**
 * AutoReply Manager - Manage automatic replies for specific commands
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Google Drive Configuration
const AUTOREPLY_FILE_ID = '14vVikOWDqrt1fghgs5REWH4BWX6upUVD';
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;

// Store autoreply rules in memory
let autoreplyRules = new Map();

// Default rules
const DEFAULT_RULES = {
    "Need-Gemini-Pro": "🤖 *Gemini Pro Access*\n\nYou can use Gemini AI with:\n• `.gemini <question>`\n• Reply to media with `.gemini`\n• `.gemini <question> --file <url>`\n\n*Examples:*\n`.gemini What is AI?`\n`.gemini Analyze this image`",
    "Need-YouTube-Downloader": "🎬 *YouTube Downloader*\n\nDownload YouTube videos/audio:\n• `.ytvideo <url>` - Download video\n• `.song <url>` - Download audio\n\n*Examples:*\n`.ytvideo https://youtu.be/xxxxx`\n`.song https://youtu.be/xxxxx`",
    "Need-Instagram-Downloader": "📸 *Instagram Downloader*\n\nDownload Instagram content:\n• `.instagram <url>` - Download photos/videos\n• `.igs <url>` - Convert to sticker\n• `.igsc <url>` - Crop to square sticker\n\n*Example:*\n`.instagram https://www.instagram.com/p/xxxxx`",
    "Need-TikTok-Downloader": "🎵 *TikTok Downloader*\n\nDownload TikTok videos:\n• `.tiktok <url>` - Download video\n\n*Example:*\n`.tiktok https://www.tiktok.com/@username/video/xxxxx`",
    "Need-Facebook-Downloader": "📘 *Facebook Downloader*\n\nDownload Facebook videos:\n• `.facebook <url>` - Download video\n\n*Example:*\n`.facebook https://www.facebook.com/watch/?v=xxxxx`",
    "Need-WhatsApp-Channel": "📢 *WhatsApp Channel*\n\nJoin our official WhatsApp channel:\nhttps://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A\n\nGet updates, new features, and announcements!",
    "Need-Help": "🆘 *Help Menu*\n\nUse these commands to get help:\n• `.menu` - Show all commands\n• `.list` - List commands with descriptions\n• `.ping` - Check bot status\n• `.help <command>` - Get command details\n\nFor specific help:\n• `Need-Gemini-Pro` - Gemini AI info\n• `Need-YouTube-Downloader` - YouTube downloader\n• `Need-Instagram-Downloader` - Instagram downloader\n• `Need-TikTok-Downloader` - TikTok downloader\n• `Need-Facebook-Downloader` - Facebook downloader\n• `Need-WhatsApp-Channel` - Join WhatsApp channel"
};

// ==================== GOOGLE DRIVE FUNCTIONS ====================

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        
        console.log('[AUTOREPLY] Fetching Google Drive token...');
        
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        const tempTokenFile = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenDir = path.dirname(tempTokenFile);
        if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
        
        const tokenWriter = fs.createWriteStream(tempTokenFile);
        tokenResponse.data.pipe(tokenWriter);
        
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        
        const tokenData = JSON.parse(fs.readFileSync(tempTokenFile, 'utf8'));
        fs.unlinkSync(tempTokenFile);
        
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('[AUTOREPLY] Token expired, refreshing...');
            const refreshData = {
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
            cachedToken = refreshResponse.data.access_token;
            tokenExpiry = new Date(Date.now() + 3600 * 1000);
        } else {
            cachedToken = tokenData.token;
            tokenExpiry = new Date(expiryDate);
        }
        
        return cachedToken;
        
    } catch (error) {
        console.error('[AUTOREPLY] Failed to get token:', error.message);
        return null;
    }
}

function rulesToText(rules) {
    let text = '# KnightBot-Mini AutoReply Rules\n';
    text += '# Format: COMMAND | REPLY\n';
    text += '# Example: Need-Help | This is the help message\n';
    text += `# Last updated: ${new Date().toLocaleString()}\n\n`;
    
    for (const [command, reply] of rules) {
        text += `${command} | ${reply.replace(/\n/g, '\\n')}\n`;
    }
    
    return text;
}

function textToRules(text) {
    const rules = new Map();
    const lines = text.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const separatorIndex = trimmed.indexOf('|');
        if (separatorIndex !== -1) {
            const command = trimmed.substring(0, separatorIndex).trim();
            let reply = trimmed.substring(separatorIndex + 1).trim();
            reply = reply.replace(/\\n/g, '\n');
            if (command && reply) {
                rules.set(command, reply);
            }
        }
    }
    
    return rules;
}

async function readRulesFromDrive() {
    try {
        const token = await getAccessToken();
        if (!token) return DEFAULT_RULES;
        
        console.log('[AUTOREPLY] Reading rules from Google Drive...');
        
        try {
            const response = await axios({
                method: 'GET',
                url: `https://www.googleapis.com/drive/v3/files/${AUTOREPLY_FILE_ID}?alt=media`,
                headers: { 'Authorization': `Bearer ${token}` },
                responseType: 'text',
                timeout: 30000
            });
            
            const rules = textToRules(response.data);
            if (rules.size > 0) {
                console.log(`[AUTOREPLY] Loaded ${rules.size} rules from Drive`);
                return rules;
            }
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('[AUTOREPLY] File not found, creating new with defaults');
            } else {
                console.error('[AUTOREPLY] Failed to read:', error.message);
            }
        }
        
        return new Map(Object.entries(DEFAULT_RULES));
        
    } catch (error) {
        console.error('[AUTOREPLY] Error reading rules:', error.message);
        return new Map(Object.entries(DEFAULT_RULES));
    }
}

async function writeRulesToDrive(rules) {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        
        console.log('[AUTOREPLY] Saving rules to Google Drive...');
        
        const textContent = rulesToText(rules);
        const fileBuffer = Buffer.from(textContent, 'utf8');
        
        let fileExists = false;
        try {
            await axios.get(`https://www.googleapis.com/drive/v3/files/${AUTOREPLY_FILE_ID}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fileExists = true;
        } catch (e) {
            fileExists = false;
        }
        
        if (fileExists) {
            const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${AUTOREPLY_FILE_ID}?uploadType=media`;
            await axios.patch(updateUrl, fileBuffer, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'text/plain',
                    'Content-Length': fileBuffer.length
                }
            });
        } else {
            const formData = new FormData();
            formData.append('metadata', JSON.stringify({
                name: 'autoreply_rules.txt',
                mimeType: 'text/plain',
                parents: ['root']
            }), { contentType: 'application/json' });
            formData.append('file', fileBuffer, {
                filename: 'autoreply_rules.txt',
                contentType: 'text/plain'
            });
            
            await axios.post(UPLOAD_URL, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });
        }
        
        console.log('[AUTOREPLY] Rules saved to Drive');
        return true;
        
    } catch (error) {
        console.error('[AUTOREPLY] Failed to save:', error.message);
        return false;
    }
}

async function loadRules() {
    const rules = await readRulesFromDrive();
    autoreplyRules = rules;
    return rules;
}

async function saveRules() {
    return await writeRulesToDrive(autoreplyRules);
}

async function addRule(command, reply) {
    autoreplyRules.set(command, reply);
    return await saveRules();
}

async function removeRule(command) {
    const deleted = autoreplyRules.delete(command);
    if (deleted) await saveRules();
    return deleted;
}

async function toggleRule(command, enabled) {
    if (autoreplyRules.has(command)) {
        if (enabled) {
            // Keep as is
        } else {
            // To disable, we could comment out or remove
            // For simplicity, we'll remove and store in disabled list
            // But for now, just remove
            autoreplyRules.delete(command);
            await saveRules();
        }
        return true;
    }
    return false;
}

async function getRule(command) {
    return autoreplyRules.get(command);
}

async function getAllRules() {
    return Array.from(autoreplyRules.entries()).map(([cmd, reply]) => ({ command: cmd, reply }));
}

async function getEnabledCount() {
    return autoreplyRules.size;
}

async function checkAndReply(sock, from, sender, message, reply) {
    const trimmedMsg = message.trim();
    if (autoreplyRules.has(trimmedMsg)) {
        const autoReply = autoreplyRules.get(trimmedMsg);
        await reply(autoReply);
        console.log(`[AUTOREPLY] Replied to "${trimmedMsg}" from ${sender}`);
        return true;
    }
    return false;
}

module.exports = {
    name: 'autoreply',
    aliases: ['ar', 'autorespond', 'autor'],
    description: 'Manage automatic replies for specific commands',
    usage: '.autoreply <on|off|list|add|remove|reload> [command] [reply]',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            const status = autoreplyRules.size > 0 ? 'ON' : 'OFF';
            return reply(`🤖 *AutoReply Manager*\n\n` +
                       `*Status:* ${status}\n` +
                       `*Rules Count:* ${autoreplyRules.size}\n\n` +
                       `*Commands:*\n` +
                       `• \`.autoreply list\` - Show all rules\n` +
                       `• \`.autoreply add <command> <reply>\` - Add rule\n` +
                       `• \`.autoreply remove <command>\` - Remove rule\n` +
                       `• \`.autoreply reload\` - Reload from Drive\n` +
                       `• \`.autoreply help\` - Show help\n\n` +
                       `*Example:*\n` +
                       `.autoreply add Need-Help | This is the help message`);
        }
        
        const subCommand = args[0].toLowerCase();
        
        if (subCommand === 'list') {
            const rules = await getAllRules();
            if (rules.length === 0) {
                return reply('📭 No auto-reply rules configured.');
            }
            
            let listMsg = '🤖 *AutoReply Rules*\n\n';
            for (let i = 0; i < Math.min(rules.length, 20); i++) {
                const rule = rules[i];
                const replyPreview = rule.reply.length > 50 ? rule.reply.substring(0, 50) + '...' : rule.reply;
                listMsg += `${i + 1}. \`${rule.command}\`\n`;
                listMsg += `   💬 ${replyPreview}\n\n`;
            }
            
            if (rules.length > 20) {
                listMsg += `... and ${rules.length - 20} more rules`;
            }
            
            return reply(listMsg);
        }
        
        if (subCommand === 'add' || subCommand === 'set') {
            if (args.length < 3) {
                return reply('❌ Usage: .autoreply add <command> <reply>\n\nExample: .autoreply add Need-Help This is the help message');
            }
            
            const command = args[1];
            const replyText = args.slice(2).join(' ');
            
            await addRule(command, replyText);
            await react('✅');
            return reply(`✅ *Rule Added*\n\nCommand: \`${command}\`\nReply: ${replyText.substring(0, 100)}${replyText.length > 100 ? '...' : ''}`);
        }
        
        if (subCommand === 'remove' || subCommand === 'delete') {
            if (args.length < 2) {
                return reply('❌ Usage: .autoreply remove <command>\n\nExample: .autoreply remove Need-Help');
            }
            
            const command = args[1];
            const removed = await removeRule(command);
            
            if (removed) {
                await react('🗑️');
                return reply(`✅ *Rule Removed*\n\nCommand: \`${command}\``);
            } else {
                return reply(`❌ Rule not found: \`${command}\``);
            }
        }
        
        if (subCommand === 'reload') {
            await loadRules();
            await react('🔄');
            return reply(`✅ *Rules Reloaded*\n\nLoaded ${autoreplyRules.size} rules from Google Drive.`);
        }
        
        if (subCommand === 'on' || subCommand === 'enable') {
            await react('✅');
            return reply(`✅ *AutoReply Enabled*\n\nAuto-reply is active with ${autoreplyRules.size} rules.`);
        }
        
        if (subCommand === 'off' || subCommand === 'disable') {
            // Clear all rules (but keep defaults? No, just clear)
            // This is dangerous, so we'll just show status
            return reply(`⚠️ *AutoReply Status*\n\nAuto-reply is currently ${autoreplyRules.size > 0 ? 'ON' : 'OFF'}.\n\nTo disable all rules, use \`.autoreply clear\` to remove all rules.\n\n*Note:* The bot will still check for commands if rules exist.`);
        }
        
        if (subCommand === 'clear') {
            // Confirm first
            return reply(`⚠️ *Warning*\n\nThis will remove ALL auto-reply rules (${autoreplyRules.size} rules).\n\nTo confirm, type: \`.autoreply confirm-clear\``);
        }
        
        if (subCommand === 'confirm-clear') {
            const oldCount = autoreplyRules.size;
            autoreplyRules.clear();
            await saveRules();
            await react('🗑️');
            return reply(`✅ *All Rules Cleared*\n\nRemoved ${oldCount} auto-reply rules.`);
        }
        
        if (subCommand === 'help') {
            return reply(`🤖 *AutoReply Manager - Help*\n\n` +
                       `*Commands:*\n` +
                       `• \`.autoreply list\` - List all rules\n` +
                       `• \`.autoreply add <command> <reply>\` - Add new rule\n` +
                       `• \`.autoreply remove <command>\` - Remove a rule\n` +
                       `• \`.autoreply reload\` - Reload from Google Drive\n` +
                       `• \`.autoreply clear\` - Remove all rules\n` +
                       `• \`.autoreply help\` - Show this help\n\n` +
                       `*How it works:*\n` +
                       `When someone sends a message that exactly matches a command (case-sensitive), the bot will automatically reply with the configured message.\n\n` +
                       `*Example:*\n` +
                       `User: \`Need-Help\`\n` +
                       `Bot: *Help Message*\n\n` +
                       `*Storage:*\n` +
                       `All rules are saved to Google Drive and persist across bot restarts.`);
        }
        
        return reply(`❌ Unknown subcommand: ${subCommand}\n\nUse \`.autoreply help\` for available commands.`);
    }
};

// ==================== EXPORT FOR HANDLER INTEGRATION ====================

// Initialize on module load
loadRules().catch(console.error);

// Function to check and reply to messages (to be called from handler)
async function checkAutoReply(sock, from, sender, message, replyFunc) {
    // Only process in private chats
    if (from.endsWith('@g.us')) return false;
    if (from.includes('@broadcast')) return false;
    if (from.includes('@newsletter')) return false;
    
    return await checkAndReply(sock, from, sender, message, replyFunc);
}

module.exports.checkAutoReply = checkAutoReply;
module.exports.loadRules = loadRules;
module.exports.autoreplyRules = () => autoreplyRules;
