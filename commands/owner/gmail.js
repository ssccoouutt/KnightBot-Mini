/**
 * Gmail Command - Fetch latest emails from all authorized Gmail accounts
 * Supports both pickle (Python) and JSON (Node.js) token formats
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { google } = require('googleapis');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const GMAIL_TOKENS_FOLDER_ID = "1i0j8efZESXrQtmA9TyPnpEgm6G3NOb43";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;
let credJson = null;

// Gmail Scopes
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// ==================== TOKEN FUNCTIONS ====================

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        
        console.log('[GMAIL] Fetching Google Drive token...');
        
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
            console.log('[GMAIL] Token expired, refreshing...');
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
        console.error('[GMAIL] Failed to get Google Drive token:', error.message);
        return null;
    }
}

async function downloadCredentials() {
    try {
        const token = await getAccessToken();
        if (!token) return null;
        
        // Look for cred.json in the folder
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and name='cred.json'`,
                fields: 'files(id,name)'
            }
        });
        
        const files = response.data.files || [];
        if (files.length === 0) {
            console.log('[GMAIL] cred.json not found in folder');
            return null;
        }
        
        const credFileId = files[0].id;
        
        const credResponse = await axios({
            method: 'GET',
            url: `https://www.googleapis.com/drive/v3/files/${credFileId}?alt=media`,
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'text',
            timeout: 30000
        });
        
        credJson = JSON.parse(credResponse.data);
        console.log('[GMAIL] Credentials loaded successfully');
        return credJson;
        
    } catch (error) {
        console.error('[GMAIL] Failed to download credentials:', error.message);
        return null;
    }
}

async function listTokenFiles() {
    try {
        const token = await getAccessToken();
        if (!token) return [];
        
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and (name contains '.json' or name contains '.pickle') and name != 'cred.json'`,
                fields: 'files(id,name,mimeType)',
                pageSize: 100
            }
        });
        
        return response.data.files || [];
        
    } catch (error) {
        console.error('[GMAIL] Failed to list token files:', error.message);
        return [];
    }
}

async function downloadTokenFile(fileId, fileName) {
    try {
        const token = await getAccessToken();
        if (!token) return null;
        
        const tempDir = path.join(process.cwd(), 'temp', 'gmail_tokens');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const filePath = path.join(tempDir, fileName);
        
        const response = await axios({
            method: 'GET',
            url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'stream',
            timeout: 30000
        });
        
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        return filePath;
        
    } catch (error) {
        console.error('[GMAIL] Failed to download token file:', error.message);
        return null;
    }
}

async function uploadTokenFile(filePath, fileName) {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        
        const fileBuffer = fs.readFileSync(filePath);
        
        const metadata = {
            name: fileName,
            mimeType: 'application/json',
            parents: [GMAIL_TOKENS_FOLDER_ID]
        };
        
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('metadata', JSON.stringify(metadata), { contentType: 'application/json' });
        formData.append('file', fileBuffer, { filename: fileName });
        
        await axios.post(UPLOAD_URL, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        console.log(`[GMAIL] Token uploaded: ${fileName}`);
        return true;
        
    } catch (error) {
        console.error('[GMAIL] Failed to upload token file:', error.message);
        return false;
    }
}

async function deleteTokenFile(fileId) {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        
        await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log(`[GMAIL] Token file deleted: ${fileId}`);
        return true;
        
    } catch (error) {
        console.error('[GMAIL] Failed to delete token file:', error.message);
        return false;
    }
}

// Convert pickle token to JSON using Python
async function convertPickleToJson(picklePath, email) {
    return new Promise((resolve, reject) => {
        const pythonScript = `
import pickle
import json
import sys

try:
    with open('${picklePath}', 'rb') as f:
        creds = pickle.load(f)
    
    token_data = {
        'refresh_token': creds.refresh_token,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret
    }
    
    print(json.dumps(token_data))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
        
        const scriptPath = path.join(process.cwd(), 'temp', `convert_${Date.now()}.py`);
        fs.writeFileSync(scriptPath, pythonScript);
        
        exec(`python3 ${scriptPath}`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            fs.unlinkSync(scriptPath);
            
            if (error) {
                reject(new Error(`Python conversion failed: ${error.message}`));
                return;
            }
            
            try {
                const result = JSON.parse(stdout);
                if (result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            } catch (e) {
                reject(new Error(`Failed to parse Python output: ${e.message}`));
            }
        });
    });
}

// Authenticate using token (supports both JSON and pickle)
async function authenticateWithToken(tokenPath, email) {
    try {
        const fileExt = path.extname(tokenPath);
        let tokenData;
        
        if (fileExt === '.pickle') {
            console.log(`[GMAIL] Converting pickle token for ${email}...`);
            tokenData = await convertPickleToJson(tokenPath, email);
        } else {
            const content = fs.readFileSync(tokenPath, 'utf8');
            tokenData = JSON.parse(content);
        }
        
        if (!tokenData.refresh_token) {
            console.log(`[GMAIL] No refresh token for ${email}`);
            return null;
        }
        
        const oAuth2Client = new google.auth.OAuth2(
            credJson.installed.client_id,
            credJson.installed.client_secret,
            credJson.installed.redirect_uris[0]
        );
        
        oAuth2Client.setCredentials({
            refresh_token: tokenData.refresh_token
        });
        
        // Refresh token to verify
        await oAuth2Client.getAccessToken();
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        
        // Verify access by getting profile
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const userEmail = profile.data.emailAddress;
        
        console.log(`[GMAIL] ✅ Authenticated: ${userEmail}`);
        return { gmail, email: userEmail, oAuth2Client, tokenData };
        
    } catch (error) {
        console.error(`[GMAIL] Authentication failed for ${email}:`, error.message);
        return null;
    }
}

async function getLatestEmail(gmail, emailAddress) {
    try {
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 1,
            labelIds: ['INBOX']
        });
        
        const messages = response.data.messages || [];
        if (messages.length === 0) return null;
        
        const messageId = messages[0].id;
        
        const message = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        const headers = message.data.payload.headers;
        let subject = 'No Subject';
        let from = 'Unknown Sender';
        let date = 'Unknown Date';
        let dateTimestamp = parseInt(message.data.internalDate);
        
        for (const header of headers) {
            if (header.name === 'Subject') subject = header.value;
            if (header.name === 'From') from = header.value;
            if (header.name === 'Date') date = header.value;
        }
        
        let body = '';
        if (message.data.payload.parts) {
            for (const part of message.data.payload.parts) {
                if (part.mimeType === 'text/plain' && part.body.data) {
                    body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    break;
                }
            }
        } else if (message.data.payload.body && message.data.payload.body.data) {
            body = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
        }
        
        if (!body || body.length < 10) {
            body = message.data.snippet || 'No content available';
        }
        
        body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (body.length > 500) body = body.substring(0, 500) + '...';
        
        return {
            id: messageId,
            subject,
            from,
            date,
            timestamp: dateTimestamp,
            body
        };
        
    } catch (error) {
        console.error(`[GMAIL] Error fetching email:`, error.message);
        return null;
    }
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Extract email from filename
function extractEmailFromFilename(filename) {
    let email = filename.replace('.json', '').replace('.pickle', '').replace('token_', '');
    email = email.replace(/_/g, '@');
    return email;
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'gmail',
    aliases: [],
    description: 'Fetch latest emails from all authorized Gmail accounts',
    usage: '.gmail\n.gmail list\n.gmail convert\n.gmail remove <email>\n.gmail refresh',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const subCommand = args[0]?.toLowerCase();
        
        if (subCommand === 'list') {
            await handleListAccounts(sock, from, reply, react);
            return;
        }
        
        if (subCommand === 'convert') {
            await handleConvertTokens(sock, from, reply, react);
            return;
        }
        
        if (subCommand === 'remove') {
            await handleRemoveAccount(sock, from, reply, react, args);
            return;
        }
        
        if (subCommand === 'refresh') {
            await handleRefreshTokens(sock, from, reply, react);
            return;
        }
        
        // Default: fetch latest email
        await handleFetchEmails(sock, from, reply, react);
    }
};

async function handleFetchEmails(sock, from, reply, react) {
    await react('📧');
    const processingMsg = await reply(`📧 *Fetching latest emails...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        
        if (!credJson) {
            await sock.sendMessage(from, {
                text: `❌ *Credentials not found*\n\nPlease upload cred.json to the Google Drive folder.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        const tokenFiles = await listTokenFiles();
        
        // Filter out creds.json and gmail_accounts
        const validTokens = tokenFiles.filter(f => 
            f.name !== 'creds.json' && 
            f.name !== 'gmail_accounts.json' &&
            !f.name.includes('gmail_accounts')
        );
        
        if (validTokens.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ *No Gmail accounts configured*\n\nUse \`.gmail convert\` to convert existing pickle tokens.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        await sock.sendMessage(from, {
            text: `📥 *Found ${validTokens.length} account(s)*\n\nAuthenticating...`,
            edit: processingMsg.key
        });
        
        const accounts = [];
        
        for (const file of validTokens) {
            const email = extractEmailFromFilename(file.name);
            
            const tokenPath = await downloadTokenFile(file.id, file.name);
            
            if (tokenPath) {
                const auth = await authenticateWithToken(tokenPath, email);
                if (auth && auth.gmail) {
                    accounts.push({
                        email: auth.email,
                        gmail: auth.gmail,
                        tokenPath: tokenPath
                    });
                }
            }
        }
        
        if (accounts.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ *No accounts could be authenticated*\n\nTokens may be expired. Use \`.gmail convert\` to refresh.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        await sock.sendMessage(from, {
            text: `✅ *Authenticated ${accounts.length} account(s)*\n\nFetching latest emails...`,
            edit: processingMsg.key
        });
        
        const emails = [];
        
        for (const account of accounts) {
            const emailData = await getLatestEmail(account.gmail, account.email);
            if (emailData) {
                emails.push({
                    account: account.email,
                    ...emailData
                });
            }
            
            try {
                if (account.tokenPath && fs.existsSync(account.tokenPath)) {
                    fs.unlinkSync(account.tokenPath);
                }
            } catch (e) {}
        }
        
        if (emails.length === 0) {
            await sock.sendMessage(from, {
                text: `📭 *No emails found* in any account.`,
                edit: processingMsg.key
            });
            await react('📭');
            return;
        }
        
        emails.sort((a, b) => b.timestamp - a.timestamp);
        const latest = emails[0];
        
        const emailMessage = `📧 *LATEST EMAIL ACROSS ALL ACCOUNTS*\n\n` +
                            `👤 *Account:* ${latest.account}\n` +
                            `📌 *Subject:* ${latest.subject}\n` +
                            `📨 *From:* ${latest.from}\n` +
                            `📅 *Date:* ${formatDate(latest.timestamp)}\n\n` +
                            `📄 *Content:*\n\`\`\`\n${latest.body}\n\`\`\`\n\n` +
                            `📊 *Found ${emails.length} email(s) from ${accounts.length} account(s)*`;
        
        await sock.sendMessage(from, {
            text: emailMessage,
            edit: processingMsg.key
        });
        
        if (emails.length > 1) {
            let summary = `📋 *Other recent emails:*\n\n`;
            for (let i = 1; i < Math.min(emails.length, 5); i++) {
                summary += `${i}. *${emails[i].account}*\n`;
                summary += `   📌 ${emails[i].subject.substring(0, 50)}\n`;
                summary += `   📅 ${formatDate(emails[i].timestamp)}\n\n`;
            }
            await reply(summary);
        }
        
        await react('✅');
        
    } catch (error) {
        console.error('[GMAIL] Error:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to fetch emails*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleConvertTokens(sock, from, reply, react) {
    await react('🔄');
    const processingMsg = await reply(`🔄 *Converting pickle tokens to JSON...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        
        if (!credJson) {
            await sock.sendMessage(from, {
                text: `❌ *Credentials not found*\n\nPlease upload cred.json to the Google Drive folder.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        const tokenFiles = await listTokenFiles();
        const pickleFiles = tokenFiles.filter(f => f.name.endsWith('.pickle'));
        
        if (pickleFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `📭 *No pickle files found*\n\nAll tokens are already in JSON format.`,
                edit: processingMsg.key
            });
            await react('✅');
            return;
        }
        
        let converted = 0;
        let failed = 0;
        
        for (const file of pickleFiles) {
            const email = extractEmailFromFilename(file.name);
            const tokenPath = await downloadTokenFile(file.id, file.name);
            
            if (tokenPath) {
                try {
                    const tokenData = await convertPickleToJson(tokenPath, email);
                    
                    if (tokenData && tokenData.refresh_token) {
                        const jsonFileName = `token_${email.replace(/@/g, '_')}.json`;
                        const jsonPath = path.join(path.dirname(tokenPath), jsonFileName);
                        fs.writeFileSync(jsonPath, JSON.stringify(tokenData, null, 2));
                        
                        const uploaded = await uploadTokenFile(jsonPath, jsonFileName);
                        
                        if (uploaded) {
                            await deleteTokenFile(file.id);
                            converted++;
                            console.log(`[GMAIL] Converted: ${email}`);
                        } else {
                            failed++;
                        }
                        
                        fs.unlinkSync(jsonPath);
                    } else {
                        failed++;
                    }
                } catch (err) {
                    console.error(`[GMAIL] Failed to convert ${email}:`, err.message);
                    failed++;
                }
                
                fs.unlinkSync(tokenPath);
            } else {
                failed++;
            }
        }
        
        await sock.sendMessage(from, {
            text: `✅ *Token Conversion Complete*\n\n` +
                  `🔄 Converted: ${converted}\n` +
                  `❌ Failed: ${failed}\n` +
                  `📊 Total: ${pickleFiles.length}\n\n` +
                  `💡 Use \`.gmail\` to fetch emails.`,
            edit: processingMsg.key
        });
        await react('✅');
        
    } catch (error) {
        console.error('[GMAIL] Convert error:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to convert tokens*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleListAccounts(sock, from, reply, react) {
    await react('📋');
    const processingMsg = await reply(`📋 *Fetching account list...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        const tokenFiles = await listTokenFiles();
        
        const validTokens = tokenFiles.filter(f => 
            f.name !== 'creds.json' && 
            f.name !== 'gmail_accounts.json' &&
            !f.name.includes('gmail_accounts')
        );
        
        if (validTokens.length === 0) {
            await sock.sendMessage(from, {
                text: `📭 *No Gmail accounts configured*\n\nUse \`.gmail convert\` to convert existing tokens.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        let listMsg = `📧 *Gmail Accounts*\n\n`;
        listMsg += `📊 *Total:* ${validTokens.length} account(s)\n\n`;
        
        for (let i = 0; i < validTokens.length; i++) {
            const file = validTokens[i];
            let email = extractEmailFromFilename(file.name);
            listMsg += `${i + 1}. ${email}\n`;
        }
        
        listMsg += `\n💡 Use \`.gmail\` to fetch latest emails\n`;
        listMsg += `💡 Use \`.gmail convert\` to convert pickle tokens to JSON\n`;
        listMsg += `💡 Use \`.gmail remove <email>\` to remove an account`;
        
        await sock.sendMessage(from, {
            text: listMsg,
            edit: processingMsg.key
        });
        await react('✅');
        
    } catch (error) {
        console.error('[GMAIL] Error listing accounts:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to list accounts*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleRemoveAccount(sock, from, reply, react, args) {
    const emailToRemove = args[1];
    
    if (!emailToRemove) {
        await reply(`❌ *Usage:* \`.gmail remove <email>\`\n\nExample: \`.gmail remove techzone3606@gmail.com\``);
        return;
    }
    
    await react('🗑️');
    const processingMsg = await reply(`🗑️ *Removing account...*\n\n${emailToRemove}`);
    
    try {
        const tokenFiles = await listTokenFiles();
        let found = false;
        const normalizedEmail = emailToRemove.toLowerCase().replace(/@/g, '_');
        
        for (const file of tokenFiles) {
            const fileEmail = extractEmailFromFilename(file.name).toLowerCase();
            if (fileEmail === emailToRemove.toLowerCase() || file.name.includes(normalizedEmail)) {
                await deleteTokenFile(file.id);
                found = true;
                break;
            }
        }
        
        if (found) {
            await sock.sendMessage(from, {
                text: `✅ *Account Removed*\n\n📧 ${emailToRemove}\n\nUse \`.gmail list\` to see remaining accounts.`,
                edit: processingMsg.key
            });
            await react('✅');
        } else {
            await sock.sendMessage(from, {
                text: `❌ *Account not found*\n\nNo token found for: ${emailToRemove}\n\nUse \`.gmail list\` to see all accounts.`,
                edit: processingMsg.key
            });
            await react('❌');
        }
        
    } catch (error) {
        console.error('[GMAIL] Remove account error:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to remove account*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleRefreshTokens(sock, from, reply, react) {
    await react('🔄');
    const processingMsg = await reply(`🔄 *Refreshing tokens...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        const tokenFiles = await listTokenFiles();
        
        const validTokens = tokenFiles.filter(f => 
            f.name !== 'creds.json' && 
            f.name !== 'gmail_accounts.json' &&
            !f.name.includes('gmail_accounts')
        );
        
        if (validTokens.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ *No Gmail accounts configured*`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        let refreshed = 0;
        let failed = 0;
        
        for (const file of validTokens) {
            const email = extractEmailFromFilename(file.name);
            const tokenPath = await downloadTokenFile(file.id, file.name);
            
            if (tokenPath) {
                const auth = await authenticateWithToken(tokenPath, email);
                
                if (auth && auth.gmail) {
                    refreshed++;
                } else {
                    failed++;
                }
                
                try {
                    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
                } catch (e) {}
            } else {
                failed++;
            }
        }
        
        await sock.sendMessage(from, {
            text: `✅ *Token Refresh Complete*\n\n` +
                  `🔄 Valid: ${refreshed}\n` +
                  `❌ Invalid/Expired: ${failed}\n` +
                  `📊 Total: ${validTokens.length}\n\n` +
                  `💡 Use \`.gmail\` to fetch latest emails\n` +
                  `💡 Use \`.gmail convert\` to convert pickle tokens`,
            edit: processingMsg.key
        });
        await react('✅');
        
    } catch (error) {
        console.error('[GMAIL] Error refreshing tokens:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to refresh tokens*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}