/**
 * AutoReply Manager - Manage automatic replies for specific commands with button support
 * Each button can have its own unique reply
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

// Store button handlers for auto-reply buttons (keep them alive)
const buttonHandlers = new Map();

// Helper function to parse escape sequences
function parseEscapeSequences(str) {
    if (!str) return str;
    return str.replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\r/g, '\r')
              .replace(/\\\\/g, '\\');
}

// Default rules with buttons and their replies
const DEFAULT_RULES = {
    "Need-Help": {
        text: "🆘 *Help Menu*\n\nWhat do you need help with?",
        buttons: [
            { id: "help_gemini", text: "🤖 Gemini AI", reply: "🤖 *Gemini AI Help*\n\n• `.gemini <question>` - Ask a question\n• Reply to media with `.gemini` - Analyze media\n• `.gemini <q> --file <url>` - Analyze file URL" },
            { id: "help_media", text: "🎬 Media Downloaders", reply: "🎬 *Media Downloaders*\n\n• `.ytvideo <url>` - YouTube video\n• `.song <url>` - YouTube audio\n• `.instagram <url>` - Instagram\n• `.tiktok <url>` - TikTok\n• `.facebook <url>` - Facebook" },
            { id: "help_commands", text: "📋 All Commands", reply: "📋 *All Commands*\n\nUse `.menu` to see all available commands.\nUse `.list` for detailed command list." },
            { id: "help_channel", text: "📢 Join Channel", reply: "📢 *Join Our Channel*\n\nhttps://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A\n\nGet updates, new features, and announcements!" }
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
    text += '# Buttons format: id:text:reply,id:text:reply\n';
    text += '# Use \\n for new lines in replies\n';
    text += '# Example: Need-Help | Help message | help1:🤖 Option 1:This is reply 1,help2:🎬 Option 2:This is reply 2\n';
    text += `# Last updated: ${new Date().toLocaleString()}\n\n`;
    
    for (const [command, rule] of rules) {
        let line = `${command} | ${rule.text.replace(/\n/g, '\\n')}`;
        if (rule.buttons && rule.buttons.length > 0) {
            const buttonsStr = rule.buttons.map(b => `${b.id}:${b.text}:${b.reply.replace(/\n/g, '\\n')}`).join(',');
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
            let replyText = parseEscapeSequences(parts[1]);
            let buttons = [];
            
            if (parts.length >= 3 && parts[2]) {
                const buttonParts = parts[2].split(',');
                for (const btn of buttonParts) {
                    const btnParts = btn.split(':');
                    if (btnParts.length >= 3) {
                        const id = btnParts[0];
                        const text = btnParts[1];
                        const reply = parseEscapeSequences(btnParts.slice(2).join(':'));
                        if (id && text && reply) {
                            buttons.push({ id, text, reply });
                        }
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
            // Send with buttons - use simple timestamp as session ID
            const sessionId = Date.now().toString();
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
            
            // Store button handlers with their replies
            buttonHandlers.set(sessionId, {
                command: trimmedMsg,
                buttons: rule.buttons,
                originalMessageId: sentMsg.key.id,
                timestamp: Date.now(),
                sessionId: sessionId
            });
            
            console.log(`[AUTOREPLY] Stored handler for session: ${sessionId} with ${rule.buttons.length} buttons`);
            
            // Clean up old handlers after 30 minutes
            setTimeout(() => {
                buttonHandlers.delete(sessionId);
                console.log(`[AUTOREPLY] Cleaned up handler for session: ${sessionId}`);
            }, 30 * 60 * 1000);
            
        } else {
            // Send as plain text
            await reply(rule.text);
        }
        
        console.log(`[AUTOREPLY] Replied to "${trimmedMsg}" from ${sender} ${rule.buttons.length > 0 ? '(with buttons)' : ''}`);
        return true;
    }
    return false;
}

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply) {
    console.log(`[AUTOREPLY] Handling button click: ${buttonId}, Text: ${buttonText}`);
    
    // Extract session ID and button index from button ID
    // Format: autoreply_<sessionId>_<index>
    const parts = buttonId.split('_');
    if (parts.length >= 3 && parts[0] === 'autoreply') {
        // The session ID is everything between the first and last underscore
        const buttonIndex = parseInt(parts[parts.length - 1]);
        const sessionId = parts.slice(1, -1).join('_');
        
        console.log(`[AUTOREPLY] Extracted sessionId: ${sessionId}, buttonIndex: ${buttonIndex}`);
        
        // Find handler by session ID
        const handler = buttonHandlers.get(sessionId);
        
        if (handler && handler.buttons && handler.buttons[buttonIndex]) {
            const button = handler.buttons[buttonIndex];
            console.log(`[AUTOREPLY] Button clicked: ${button.id} - ${button.text}`);
            
            // Send the button's specific reply
            if (button.reply) {
                await reply(button.reply);
                console.log(`[AUTOREPLY] Sent reply for button: ${button.id}`);
            } else {
                await reply(`📌 *${button.text}*\n\nYou selected: ${button.text}\n\nNo reply configured for this button.`);
                console.log(`[AUTOREPLY] No reply configured for button: ${button.id}`);
            }
            
            return true;
        } else {
            console.log(`[AUTOREPLY] Handler not found for sessionId: ${sessionId}`);
            console.log(`[AUTOREPLY] Available handlers: ${Array.from(buttonHandlers.keys()).join(', ')}`);
        }
    }
    
    console.log(`[AUTOREPLY] No handler found for button: ${buttonId}`);
    return false;
}

module.exports = {
    name: 'autoreply',
    aliases: ['ar', 'autorespond', 'autor'],
    description: 'Manage automatic replies for specific commands',
    usage: '.autoreply <list|add|remove|update|reload|help>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🤖 *AutoReply Manager*\n\n` +
                       `*Rules Count:* ${autoreplyRules.size}\n\n` +
                       `*Commands:*\n` +
                       `• \`.autoreply list\` - Show all rules\n` +
                       `• \`.autoreply add <command> | <text> | <buttons>\` - Add rule\n` +
                       `• \`.autoreply remove <command>\` - Remove rule\n` +
                       `• \`.autoreply update <command> | <text> | <buttons>\` - Update rule\n` +
                       `• \`.autoreply reload\` - Reload from Drive\n` +
                       `• \`.autoreply help\` - Show help\n\n` +
                       `*Button Format:*\n` +
                       `id:text:reply,id:text:reply\n` +
                       `*Example:*\n` +
                       `.autoreply add Shop-Menu | 🛒 *Shop Menu*\\n\\nWhat would you like? | buy1:📱 iPhone:iPhone 15 - $999\\n\\nClick .buy,btn2:💻 MacBook:MacBook Pro - $1999\\n\\nClick .buy`);
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
                    listMsg += `   🔘 Buttons:\n`;
                    for (const btn of rule.buttons) {
                        const replyPreview = btn.reply.length > 40 ? btn.reply.substring(0, 40) + '...' : btn.reply;
                        listMsg += `      • ${btn.text} → ${replyPreview}\n`;
                    }
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
                return reply('❌ Usage: .autoreply add <command> | <text> | <buttons>\n\nExample: .autoreply add Shop-Menu | 🛒 *Shop Menu*\\n\\nWhat would you like? | buy1:📱 iPhone:iPhone 15 - $999\\n\\nClick .buy,btn2:💻 MacBook:MacBook Pro - $1999\\n\\nClick .buy');
            }
            
            const fullArgs = args.slice(1).join(' ');
            const parts = fullArgs.split('|').map(p => p.trim());
            
            if (parts.length < 2) {
                return reply('❌ Invalid format. Use: command | text | buttons');
            }
            
            const command = parts[0];
            let text = parts[1];
            text = parseEscapeSequences(text);
            let buttons = [];
            
            if (parts.length >= 3 && parts[2]) {
                const buttonParts = parts[2].split(',');
                for (const btn of buttonParts) {
                    const btnParts = btn.split(':');
                    if (btnParts.length >= 3) {
                        const id = btnParts[0];
                        const btnText = btnParts[1];
                        let btnReply = btnParts.slice(2).join(':');
                        btnReply = parseEscapeSequences(btnReply);
                        buttons.push({ id, text: btnText, reply: btnReply });
                    } else {
                        return reply(`❌ Invalid button format: ${btn}\n\nUse: id:text:reply`);
                    }
                }
            }
            
            await addRule(command, text, buttons);
            await react('✅');
            return reply(`✅ *Rule Added*\n\nCommand: \`${command}\`\nText: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\nButtons: ${buttons.length}`);
        }
        
        if (subCommand === 'update') {
            if (args.length < 3) {
                return reply('❌ Usage: .autoreply update <command> | <text> | <buttons>');
            }
            
            const fullArgs = args.slice(1).join(' ');
            const parts = fullArgs.split('|').map(p => p.trim());
            
            if (parts.length < 2) {
                return reply('❌ Invalid format. Use: command | text | buttons');
            }
            
            const command = parts[0];
            let text = parts[1];
            text = parseEscapeSequences(text);
            let buttons = [];
            
            if (parts.length >= 3 && parts[2]) {
                const buttonParts = parts[2].split(',');
                for (const btn of buttonParts) {
                    const btnParts = btn.split(':');
                    if (btnParts.length >= 3) {
                        const id = btnParts[0];
                        const btnText = btnParts[1];
                        let btnReply = btnParts.slice(2).join(':');
                        btnReply = parseEscapeSequences(btnReply);
                        buttons.push({ id, text: btnText, reply: btnReply });
                    } else {
                        return reply(`❌ Invalid button format: ${btn}\n\nUse: id:text:reply`);
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
                       `• \`.autoreply add <command> | <text> | <buttons>\` - Add new rule\n` +
                       `• \`.autoreply update <command> | <text> | <buttons>\` - Update rule\n` +
                       `• \`.autoreply remove <command>\` - Remove a rule\n` +
                       `• \`.autoreply reload\` - Reload from Google Drive\n` +
                       `• \`.autoreply help\` - Show this help\n\n` +
                       `*Button Format:*\n` +
                       `id:text:reply,id:text:reply\n\n` +
                       `*Example:*\n` +
                       `.autoreply add Need-Help | Choose an option | opt1:📱 Option 1:This is reply for option 1,opt2:🎬 Option 2:This is reply for option 2\n\n` +
                       `*Note:* Use \\n for new lines in replies\n\n` +
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
async function handleAutoReplyButton(sock, msg, buttonId, buttonText, from, sender, reply) {
    return await handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply);
}

module.exports.checkAutoReply = checkAutoReply;
module.exports.handleAutoReplyButton = handleAutoReplyButton;
module.exports.loadRules = loadRules;
module.exports.autoreplyRules = () => autoreplyRules;
