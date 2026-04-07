/**
 * Gmail Command - Fetch latest emails from all authorized Gmail accounts
 * Tokens are stored in Google Drive folder
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
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
let gmailTokens = new Map();

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

async function listTokenFiles() {
    try {
        const token = await getAccessToken();
        if (!token) return [];
        
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and (name contains '.pickle' or name contains '.token' or name contains '.json')`,
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
            mimeType: 'application/octet-stream',
            parents: [GMAIL_TOKENS_FOLDER_ID]
        };
        
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
        
        return true;
        
    } catch (error) {
        console.error('[GMAIL] Failed to upload token file:', error.message);
        return false;
    }
}

// ==================== GMAIL FUNCTIONS ====================

async function authenticateWithToken(tokenPath, email) {
    try {
        // For pickle files (Python format), we need to handle differently
        // Since we're in Node.js, we'll use a different approach
        // We'll store tokens as JSON files instead
        
        const tokenContent = fs.readFileSync(tokenPath, 'utf8');
        let credentials;
        
        try {
            credentials = JSON.parse(tokenContent);
        } catch (e) {
            // If not JSON, it might be a pickle file - we can't use it directly in Node.js
            console.log(`[GMAIL] Token for ${email} is in pickle format, skipping`);
            return null;
        }
        
        const { client_secret, client_id, refresh_token } = credentials;
        
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
        oAuth2Client.setCredentials({
            refresh_token: refresh_token
        });
        
        // Refresh token if needed
        await oAuth2Client.getAccessToken();
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        
        // Verify access by getting profile
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const userEmail = profile.data.emailAddress;
        
        return { gmail, email: userEmail };
        
    } catch (error) {
        console.error(`[GMAIL] Authentication failed for ${email}:`, error.message);
        return null;
    }
}

async function getLatestEmail(gmail, emailAddress) {
    try {
        // Get the latest email
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 1,
            labelIds: ['INBOX']
        });
        
        const messages = response.data.messages || [];
        if (messages.length === 0) return null;
        
        const messageId = messages[0].id;
        
        // Get full message
        const message = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        
        // Extract headers
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
        
        // Decode body
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
        
        // Clean HTML
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
        console.error(`[GMAIL] Error fetching email for ${emailAddress}:`, error.message);
        return null;
    }
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'gmail',
    aliases: [],
    description: 'Fetch latest emails from all authorized Gmail accounts',
    usage: '.gmail\n.gmail list\n.gmail refresh',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const subCommand = args[0]?.toLowerCase();
        
        if (subCommand === 'list') {
            await handleListAccounts(sock, from, reply, react);
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
        // Get all token files from Google Drive
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ *No Gmail accounts configured*\n\nPlease add token files to the Google Drive folder:\n${GMAIL_TOKENS_FOLDER_ID}`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        await sock.sendMessage(from, {
            text: `📥 *Found ${tokenFiles.length} account(s)*\n\nAuthenticating...`,
            edit: processingMsg.key
        });
        
        const accounts = [];
        
        for (const file of tokenFiles) {
            // Extract email from filename
            let email = file.name.replace('.json', '').replace('.token', '').replace('token_', '');
            
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
                text: `❌ *No accounts could be authenticated*\n\nToken files may be invalid or expired.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        await sock.sendMessage(from, {
            text: `✅ *Authenticated ${accounts.length} account(s)*\n\nFetching latest emails...`,
            edit: processingMsg.key
        });
        
        // Fetch latest email from each account
        const emails = [];
        
        for (const account of accounts) {
            const emailData = await getLatestEmail(account.gmail, account.email);
            if (emailData) {
                emails.push({
                    account: account.email,
                    ...emailData
                });
            }
            
            // Clean up temp token file
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
        
        // Sort by timestamp (newest first)
        emails.sort((a, b) => b.timestamp - a.timestamp);
        
        const latest = emails[0];
        
        // Format the email message
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
        
        // If there are more emails, show summary
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

async function handleListAccounts(sock, from, reply, react) {
    await react('📋');
    const processingMsg = await reply(`📋 *Fetching account list...*\n\nPlease wait...`);
    
    try {
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `📭 *No Gmail accounts configured*\n\nAdd token files to:\n${GMAIL_TOKENS_FOLDER_ID}`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        let listMsg = `📧 *Gmail Accounts*\n\n`;
        listMsg += `📊 *Total:* ${tokenFiles.length} account(s)\n\n`;
        
        for (let i = 0; i < tokenFiles.length; i++) {
            const file = tokenFiles[i];
            let email = file.name.replace('.json', '').replace('.token', '').replace('token_', '');
            listMsg += `${i + 1}. ${email}\n`;
        }
        
        listMsg += `\n💡 Use \`.gmail\` to fetch latest emails\n`;
        listMsg += `💡 Use \`.gmail refresh\` to refresh tokens`;
        
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

async function handleRefreshTokens(sock, from, reply, react) {
    await react('🔄');
    const processingMsg = await reply(`🔄 *Refreshing tokens...*\n\nPlease wait...`);
    
    try {
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ *No Gmail accounts configured*`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        let refreshed = 0;
        let failed = 0;
        
        for (const file of tokenFiles) {
            const tokenPath = await downloadTokenFile(file.id, file.name);
            
            if (tokenPath) {
                let email = file.name.replace('.json', '').replace('.token', '').replace('token_', '');
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
                  `🔄 Refreshed: ${refreshed}\n` +
                  `❌ Failed: ${failed}\n` +
                  `📊 Total: ${tokenFiles.length}\n\n` +
                  `💡 Use \`.gmail\` to fetch latest emails`,
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