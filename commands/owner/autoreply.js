/**
 * AutoReply Manager - Manage automatic replies for specific commands with button support
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

// Default rules with buttons
const DEFAULT_RULES = {
    "Need-Gemini-Pro": {
        text: "🤖 *Gemini Pro Access*\n\nYou can use Gemini AI with the following options:",
        buttons: [
            { id: "gemini_text", text: "💬 Text Query" },
            { id: "gemini_media", text: "🖼️ Analyze Media" },
            { id: "gemini_url", text: "🔗 File URL" }
        ]
    },
    "Need-YouTube-Downloader": {
        text: "🎬 *YouTube Downloader*\n\nDownload YouTube videos/audio with these options:",
        buttons: [
            { id: "yt_video", text: "📹 Download Video" },
            { id: "yt_audio", text: "🎵 Download Audio" }
        ]
    },
    "Need-Instagram-Downloader": {
        text: "📸 *Instagram Downloader*\n\nDownload Instagram content:",
        buttons: [
            { id: "ig_media", text: "📷 Download Media" },
            { id: "ig_sticker", text: "🔘 Convert to Sticker" }
        ]
    },
    "Need-Help": {
        text: "🆘 *Help Menu*\n\nWhat do you need help with?",
        buttons: [
            { id: "help_gemini", text: "🤖 Gemini AI" },
            { id: "help_media", text: "🎬 Media Downloaders" },
            { id: "help_commands", text: "📋 All Commands" },
            { id: "help_channel", text: "📢 Join Channel" }
        ]
    }
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
    text += '# Format: COMMAND | TEXT | BUTTONS\n';
    text += '# Buttons format: id:text,id:text\n';
    text += '# Example: Need-Help | Help message | help_gemini:🤖 Gemini AI,help_media:🎬 Media\n';
    text += `# Last updated: ${new Date().toLocaleString()}\n\n`;
    
    for (const [command, rule] of rules) {
        let line = `${command} | ${rule.text.replace(/\n/g, '\\n')}`;
        if (rule.buttons && rule.buttons.length > 0) {
            const buttonsStr = rule.buttons.map(b => `${b.id}:${b.text}`).join(',');
            line += ` | ${buttonsStr}`;
        }
        text += line + '\n';
    }
    
    return text;
}

function textToRules(text) {
    const rules = new Map();
    const lines = text.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const parts = trimmed.split('|').map(p => p.trim());
        if (parts.length >= 2) {
            const command = parts[0];
            let replyText = parts[1].replace(/\\n/g, '\n');
            let buttons = [];
            
            if (parts.length >= 3 && parts[2]) {
                const buttonParts = parts[2].split(',');
                for (const btn of buttonParts) {
                    const [id, text] = btn.split(':');
                    if (id && text) {
                        buttons.push({ id, text });
                    }
                }
            }
            
            if (command && replyText) {
                rules.set(command, { text: replyText, buttons });
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
            const FormData = require('form-data');
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

async function addRule(command, text, buttons = []) {
    autoreplyRules.set(command, { text, buttons });
    return await saveRules();
}

async function removeRule(command) {
    const deleted = autoreplyRules.delete(command);
    if (deleted) await saveRules();
    return deleted;
}

async function updateRule(command, text, buttons = null) {
    const existing = autoreplyRules.get(command);
    if (existing) {
        autoreplyRules.set(command, {
            text: text || existing.text,
            buttons: buttons !== null ? buttons : existing.buttons
        });
        return await saveRules();
    }
    return false;
}

async function getRule(command) {
    return autoreplyRules.get(command);
}

async function getAllRules() {
    return Array.from(autoreplyRules.entries()).map(([cmd, rule]) => ({ 
        command: cmd, 
        text: rule.text,
        buttons: rule.buttons || []
    }));
}

async function checkAndReply(sock, from, sender, message, reply) {
    const trimmedMsg = message.trim();
    if (autoreplyRules.has(trimmedMsg)) {
        const rule = autoreplyRules.get(trimmedMsg);
        
        if (rule.buttons && rule.buttons.length > 0) {
            // Send with buttons
            const sessionId = `${sender}_${Date.now()}`;
            const buttons = rule.buttons.map((btn, idx) => ({
                id: `autoreply_${sessionId}_${idx}`,
                text: btn.text
            }));
            
            const sentMsg = await sendButtons(sock, from, {
                text: rule.text,
                footer: 'Auto Reply',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            // Store button handlers in a temporary map
            if (!global.autoreplyButtonHandlers) {
                global.autoreplyButtonHandlers = new Map();
            }
            global.autoreplyButtonHandlers.set(sentMsg.key.id, {
                command: trimmedMsg,
                buttons: rule.buttons
            });
            
        } else {
            // Send as plain text
            await reply(rule.text);
        }
        
        console.log(`[AUTOREPLY] Replied to "${trimmedMsg}" from ${sender} ${rule.buttons.length > 0 ? '(with buttons)' : ''}`);
        return true;
    }
    return false;
}

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender) {
    // Handle autoreply button clicks
    if (buttonId && buttonId.startsWith('autoreply_')) {
        const parts = buttonId.split('_');
        const idx = parseInt(parts[2]);
        
        // Get the stored handler info
        if (global.autoreplyButtonHandlers && global.autoreplyButtonHandlers.has(msg.key.id)) {
            const handler = global.autoreplyButtonHandlers.get(msg.key.id);
            const button = handler.buttons[idx];
            
            if (button) {
                // Handle specific button actions
                switch (button.id) {
                    case 'gemini_text':
                        await sock.sendMessage(from, {
                            text: "💬 *Text Query*\n\nUse: `.gemini <your question>`\n\nExample: `.gemini What is artificial intelligence?`"
                        }, { quoted: msg });
                        break;
                    case 'gemini_media':
                        await sock.sendMessage(from, {
                            text: "🖼️ *Analyze Media*\n\nReply to any image/video/document with:\n`.gemini`\n\nOr send a file URL:\n`.gemini <question> --file <url>`"
                        }, { quoted: msg });
                        break;
                    case 'gemini_url':
                        await sock.sendMessage(from, {
                            text: "🔗 *File URL*\n\nUse: `.gemini <question> --file <url>`\n\nExample: `.gemini What's in this PDF? --file https://example.com/doc.pdf`"
                        }, { quoted: msg });
                        break;
                    case 'yt_video':
                        await sock.sendMessage(from, {
                            text: "📹 *Download Video*\n\nUse: `.ytvideo <url>`\n\nExample: `.ytvideo https://youtu.be/xxxxx`"
                        }, { quoted: msg });
                        break;
                    case 'yt_audio':
                        await sock.sendMessage(from, {
                            text: "🎵 *Download Audio*\n\nUse: `.song <url>`\n\nExample: `.song https://youtu.be/xxxxx`"
                        }, { quoted: msg });
                        break;
                    case 'ig_media':
                        await sock.sendMessage(from, {
                            text: "📷 *Download Media*\n\nUse: `.instagram <url>`\n\nExample: `.instagram https://www.instagram.com/p/xxxxx`"
                        }, { quoted: msg });
                        break;
                    case 'ig_sticker':
                        await sock.sendMessage(from, {
                            text: "🔘 *Convert to Sticker*\n\nUse: `.igs <url>` or `.igsc <url>`\n\nExample: `.igs https://www.instagram.com/p/xxxxx`"
                        }, { quoted: msg });
                        break;
                    case 'help_gemini':
                        await sock.sendMessage(from, {
                            text: "🤖 *Gemini AI Help*\n\n• `.gemini <question>` - Ask a question\n• Reply to media with `.gemini` - Analyze media\n• `.gemini <q> --file <url>` - Analyze file URL"
                        }, { quoted: msg });
                        break;
                    case 'help_media':
                        await sock.sendMessage(from, {
                            text: "🎬 *Media Downloaders*\n\n• `.ytvideo <url>` - YouTube video\n• `.song <url>` - YouTube audio\n• `.instagram <url>` - Instagram\n• `.tiktok <url>` - TikTok\n• `.facebook <url>` - Facebook"
                        }, { quoted: msg });
                        break;
                    case 'help_commands':
                        await sock.sendMessage(from, {
                            text: "📋 *All Commands*\n\nUse `.menu` to see all available commands.\nUse `.list` for detailed command list."
                        }, { quoted: msg });
                        break;
                    case 'help_channel':
                        await sock.sendMessage(from, {
                            text: "📢 *Join Our Channel*\n\nhttps://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A\n\nGet updates, new features, and announcements!"
                        }, { quoted: msg });
                        break;
                    default:
                        // Generic response for custom buttons
                        await sock.sendMessage(from, {
                            text: `📌 *${button.text}*\n\nYou selected: ${button.text}\n\nType .menu for available commands.`
                        }, { quoted: msg });
                }
                
                // Clean up handler
                setTimeout(() => {
                    global.autoreplyButtonHandlers.delete(msg.key.id);
                }, 60000);
                
                return true;
            }
        }
    }
    return false;
}

module.exports = {
    name: 'autoreply',
    aliases: ['ar', 'autorespond', 'autor'],
    description: 'Manage automatic replies for specific commands',
    usage: '.autoreply <on|off|list|add|remove|update|reload> [command] [text] [buttons]',
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
                       `• \`.autoreply add <command> <text> [buttons]\` - Add rule\n` +
                       `• \`.autoreply remove <command>\` - Remove rule\n` +
                       `• \`.autoreply update <command> <text> [buttons]\` - Update rule\n` +
                       `• \`.autoreply reload\` - Reload from Drive\n` +
                       `• \`.autoreply help\` - Show help\n\n` +
                       `*Button format:* id:text,id:text\n` +
                       `*Example:*\n` +
                       `.autoreply add Need-Help | Help message | help1:Option 1,help2:Option 2`);
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
                const textPreview = rule.text.length > 50 ? rule.text.substring(0, 50) + '...' : rule.text;
                listMsg += `${i + 1}. \`${rule.command}\`\n`;
                listMsg += `   💬 ${textPreview}\n`;
                if (rule.buttons && rule.buttons.length > 0) {
                    listMsg += `   🔘 Buttons: ${rule.buttons.map(b => b.text).join(', ')}\n`;
                }
                listMsg += `\n`;
            }
            
            if (rules.length > 20) {
                listMsg += `... and ${rules.length - 20} more rules`;
            }
            
            return reply(listMsg);
        }
        
        if (subCommand === 'add') {
            if (args.length < 3) {
                return reply('❌ Usage: .autoreply add <command> | <text> | [buttons]\n\nExample: .autoreply add Need-Help | This is help | btn1:Option 1,btn2:Option 2');
            }
            
            const fullArgs = args.slice(1).join(' ');
            const parts = fullArgs.split('|').map(p => p.trim());
            
            if (parts.length < 2) {
                return reply('❌ Invalid format. Use: command | text | buttons');
            }
            
            const command = parts[0];
            const text = parts[1];
            let buttons = [];
            
            if (parts.length >= 3 && parts[2]) {
                const buttonParts = parts[2].split(',');
                for (const btn of buttonParts) {
                    const [id, btnText] = btn.split(':');
                    if (id && btnText) {
                        buttons.push({ id, text: btnText });
                    }
                }
            }
            
            await addRule(command, text, buttons);
            await react('✅');
            return reply(`✅ *Rule Added*\n\nCommand: \`${command}\`\nText: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\nButtons: ${buttons.length}`);
        }
        
        if (subCommand === 'update') {
            if (args.length < 3) {
                return reply('❌ Usage: .autoreply update <command> | <text> | [buttons]');
            }
            
            const fullArgs = args.slice(1).join(' ');
            const parts = fullArgs.split('|').map(p => p.trim());
            
            if (parts.length < 2) {
                return reply('❌ Invalid format. Use: command | text | buttons');
            }
            
            const command = parts[0];
            const text = parts[1];
            let buttons = null;
            
            if (parts.length >= 3 && parts[2]) {
                buttons = [];
                const buttonParts = parts[2].split(',');
                for (const btn of buttonParts) {
                    const [id, btnText] = btn.split(':');
                    if (id && btnText) {
                        buttons.push({ id, text: btnText });
                    }
                }
            }
            
            const updated = await updateRule(command, text, buttons);
            if (updated) {
                await react('🔄');
                return reply(`✅ *Rule Updated*\n\nCommand: \`${command}\``);
            } else {
                return reply(`❌ Rule not found: \`${command}\``);
            }
        }
        
        if (subCommand === 'remove' || subCommand === 'delete') {
            if (args.length < 2) {
                return reply('❌ Usage: .autoreply remove <command>');
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
        
        if (subCommand === 'help') {
            return reply(`🤖 *AutoReply Manager - Help*\n\n` +
                       `*Commands:*\n` +
                       `• \`.autoreply list\` - List all rules\n` +
                       `• \`.autoreply add <command> | <text> | [buttons]\` - Add new rule\n` +
                       `• \`.autoreply update <command> | <text> | [buttons]\` - Update rule\n` +
                       `• \`.autoreply remove <command>\` - Remove a rule\n` +
                       `• \`.autoreply reload\` - Reload from Google Drive\n` +
                       `• \`.autoreply help\` - Show this help\n\n` +
                       `*Button Format:*\n` +
                       `id1:Button Text 1,id2:Button Text 2\n\n` +
                       `*Example:*\n` +
                       `.autoreply add Need-Help | Choose an option | opt1:📱 Option 1,opt2:🎬 Option 2\n\n` +
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
async function checkAutoReply(sock, from, sender, message, reply) {
    // Only process in private chats
    if (from.endsWith('@g.us')) return false;
    if (from.includes('@broadcast')) return false;
    if (from.includes('@newsletter')) return false;
    
    return await checkAndReply(sock, from, sender, message, reply);
}

// Function to handle button clicks from auto-reply messages
async function handleAutoReplyButton(sock, msg, buttonId, buttonText, from, sender) {
    return await handleButtonClick(sock, msg, buttonId, buttonText, from, sender);
}

module.exports.checkAutoReply = checkAutoReply;
module.exports.handleAutoReplyButton = handleAutoReplyButton;
module.exports.loadRules = loadRules;
module.exports.autoreplyRules = () => autoreplyRules;
