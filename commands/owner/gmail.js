/**
 * Gmail Command - Fetch latest emails from all authorized Gmail accounts
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const GMAIL_TOKENS_FOLDER_ID = "1i0j8efZESXrQtmA9TyPnpEgm6G3NOb43";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

let cachedToken = null;
let tokenExpiry = null;
let credJson = null;

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Store auth data temporarily
const tempAuthStore = new Map();

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
        
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and (name='cred.json' or name='credentials.json')`,
                fields: 'files(id,name)'
            }
        });
        
        const files = response.data.files || [];
        if (files.length === 0) {
            console.log('[GMAIL] cred.json not found');
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
        console.log('[GMAIL] Credentials loaded');
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
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and name contains '.json'`,
                fields: 'files(id,name,mimeType)',
                pageSize: 100
            }
        });
        
        const files = response.data.files || [];
        return files.filter(file => 
            file.name.startsWith('token_') && 
            file.name !== 'cred.json' && 
            file.name !== 'credentials.json'
        );
        
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

async function generateAuthUrl() {
    if (!credJson) {
        await downloadCredentials();
    }
    
    if (!credJson) {
        throw new Error('Credentials not found. Please upload cred.json to the Google Drive folder.');
    }
    
    const oAuth2Client = new google.auth.OAuth2(
        credJson.installed.client_id,
        credJson.installed.client_secret,
        credJson.installed.redirect_uris[0]
    );
    
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
    
    return { oAuth2Client, authUrl };
}

async function getTokensFromCode(oAuth2Client, code) {
    const { tokens } = await oAuth2Client.getToken(code);
    return tokens;
}

async function authenticateWithToken(tokenPath, email) {
    try {
        const content = fs.readFileSync(tokenPath, 'utf8');
        const tokenData = JSON.parse(content);
        
        if (!tokenData.refresh_token) return null;
        
        const oAuth2Client = new google.auth.OAuth2(
            credJson.installed.client_id,
            credJson.installed.client_secret,
            credJson.installed.redirect_uris[0]
        );
        
        oAuth2Client.setCredentials({ refresh_token: tokenData.refresh_token });
        await oAuth2Client.getAccessToken();
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        
        return { gmail, email: profile.data.emailAddress };
        
    } catch (error) {
        console.error(`[GMAIL] Auth failed for ${email}:`, error.message);
        return null;
    }
}

async function getLatestEmail(gmail) {
    try {
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 1,
            labelIds: ['INBOX']
        });
        
        const messages = response.data.messages || [];
        if (messages.length === 0) return null;
        
        const message = await gmail.users.messages.get({
            userId: 'me',
            id: messages[0].id,
            format: 'full'
        });
        
        const headers = message.data.payload.headers;
        let subject = 'No Subject', from = 'Unknown', date = 'Unknown';
        
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
        } else if (message.data.payload.body?.data) {
            body = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
        }
        
        body = (body || message.data.snippet || 'No content').substring(0, 2000);
        
        return { subject, from, date, timestamp: parseInt(message.data.internalDate), body };
        
    } catch (error) {
        console.error('[GMAIL] Error fetching email:', error.message);
        return null;
    }
}

function extractEmailFromFilename(filename) {
    return filename.replace(/^token_/, '').replace('.json', '').replace(/_/g, '@');
}

function extractCodeFromUrl(url) {
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    return codeMatch ? decodeURIComponent(codeMatch[1]) : url;
}

// ==================== MAIN COMMAND (SAME PATTERN AS DRIVE.JS) ====================

module.exports = {
    name: 'gmail',
    aliases: [],
    description: 'Fetch latest emails from all authorized Gmail accounts',
    usage: '.gmail',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create session (like drive.js)
        const session = sessionManager.createSession(sender, from, this.name, {
            type: 'menu' // Start with menu
        });
        
        await react('📧');
        
        const sessionId = session.id.split(':').pop();
        
        const buttons = [
            { id: `gmail_fetch_${sessionId}`, text: '📥 Fetch Email' },
            { id: `gmail_list_${sessionId}`, text: '📋 List Accounts' },
            { id: `gmail_add_${sessionId}`, text: '➕ Add Account' },
            { id: `gmail_remove_${sessionId}`, text: '🗑️ Remove Account' },
            { id: `gmail_cancel_${sessionId}`, text: '❌ Cancel' }
        ];
        
        const sentMsg = await sendButtons(sock, from, {
            text: `📧 *Gmail Manager*\n\nChoose an option:`,
            footer: 'Gmail Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        console.log(`✅ Gmail session created: ${session.id}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        // Handle button clicks (like drive.js)
        if (isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (!buttonId) return true;
            
            console.log(`[GMAIL] Button clicked: ${buttonId}`);
            
            if (buttonId.includes('gmail_fetch_')) {
                await handleFetchEmails(sock, from, reply, react);
                return true;
            }
            
            if (buttonId.includes('gmail_list_')) {
                await handleListAccounts(sock, from, reply, react);
                return true;
            }
            
            if (buttonId.includes('gmail_add_')) {
                // Set session type to 'auth' - just like drive.js sets type to 'url'
                sessionManager.updateSession(sender, from, { type: 'auth' });
                
                // Store temp data for this session
                tempAuthStore.set(sender, { step: 'waiting' });
                
                // Generate and send auth URL
                try {
                    await downloadCredentials();
                    const { oAuth2Client, authUrl } = await generateAuthUrl();
                    
                    // Store OAuth client for later
                    tempAuthStore.set(sender, { oAuth2Client, step: 'waiting_for_code' });
                    
                    const sentMsg = await reply(`🔐 *Add Gmail Account*\n\n1. Click this link:\n${authUrl}\n\n2. After authorizing, Google will redirect you to a URL\n\n3. **Copy the FULL URL** and send it here\n\nExample: \`http://localhost/?code=4/0Aci98E8...\``);
                    
                    // Add pending message for this response
                    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'gmail');
                    
                } catch (error) {
                    await reply(`❌ Failed: ${error.message}`);
                    sessionManager.clearSession(session.id);
                }
                return true;
            }
            
            if (buttonId.includes('gmail_remove_') && !buttonId.includes('gmail_remove_account_')) {
                await showRemoveAccountSelection(sock, from, reply, react);
                return true;
            }
            
            if (buttonId.includes('gmail_remove_account_')) {
                const parts = buttonId.split('_');
                const email = decodeURIComponent(parts.slice(4).join('_'));
                await handleRemoveAccount(sock, from, reply, react, email);
                return true;
            }
            
            if (buttonId.includes('gmail_cancel_')) {
                sessionManager.clearSession(session.id);
                tempAuthStore.delete(sender);
                await reply('❌ Cancelled.');
                return true;
            }
        }
        
        // Handle text input - THIS IS THE KEY PART (like drive.js handles URL input)
        if (session.data.type === 'auth') {
            // Get the text message
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation.trim();
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text.trim();
            }
            
            if (!text) return true;
            
            console.log(`[GMAIL] Received auth input: ${text.substring(0, 50)}...`);
            
            // Cancel check
            if (text.toLowerCase() === 'cancel') {
                sessionManager.clearSession(session.id);
                tempAuthStore.delete(sender);
                await reply('❌ Authentication cancelled.');
                return true;
            }
            
            // Get stored OAuth client
            const authData = tempAuthStore.get(sender);
            if (!authData || !authData.oAuth2Client) {
                await reply('❌ Session expired. Please run .gmail add again.');
                sessionManager.clearSession(session.id);
                tempAuthStore.delete(sender);
                return true;
            }
            
            // Extract code from URL
            const code = extractCodeFromUrl(text);
            
            if (!code || code.length < 20) {
                await reply('❌ Invalid code. Please send the FULL redirect URL from Google.\n\nIt should look like: http://localhost/?code=4/0Aci98E8...');
                return true;
            }
            
            await reply('🔄 Exchanging code for tokens...');
            
            try {
                // Exchange code for tokens
                const tokens = await getTokensFromCode(authData.oAuth2Client, code);
                
                // Get user email
                authData.oAuth2Client.setCredentials(tokens);
                const gmail = google.gmail({ version: 'v1', auth: authData.oAuth2Client });
                const profile = await gmail.users.getProfile({ userId: 'me' });
                const email = profile.data.emailAddress;
                
                // Save token
                const tokenData = {
                    refresh_token: tokens.refresh_token,
                    client_id: credJson.installed.client_id,
                    client_secret: credJson.installed.client_secret
                };
                
                const tempDir = path.join(process.cwd(), 'temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                
                const tokenFileName = `token_${email.replace(/@/g, '_')}.json`;
                const tokenPath = path.join(tempDir, tokenFileName);
                fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
                
                const uploaded = await uploadTokenFile(tokenPath, tokenFileName);
                fs.unlinkSync(tokenPath);
                
                if (uploaded) {
                    await reply(`✅ *Account Added!*\n\n📧 ${email}\n\nUse .gmail to fetch emails.`);
                } else {
                    await reply(`❌ Failed to save token to Google Drive.`);
                }
                
                // Clean up
                sessionManager.clearSession(session.id);
                tempAuthStore.delete(sender);
                
            } catch (error) {
                console.error('[GMAIL] Auth error:', error);
                await reply(`❌ Authentication failed: ${error.message}`);
                sessionManager.clearSession(session.id);
                tempAuthStore.delete(sender);
            }
            
            return true;
        }
        
        return true;
    }
};

// ==================== HELPER FUNCTIONS ====================

async function showRemoveAccountSelection(sock, from, reply, react) {
    await react('🗑️');
    await reply(`🗑️ Loading accounts...`);
    
    try {
        await downloadCredentials();
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await reply(`📭 No accounts to remove.`);
            return;
        }
        
        const sessionId = `${Date.now()}`;
        const buttons = [];
        
        for (const file of tokenFiles) {
            const email = extractEmailFromFilename(file.name);
            buttons.push({
                id: `gmail_remove_account_${sessionId}_${encodeURIComponent(email)}`,
                text: email.length > 30 ? email.substring(0, 27) + '...' : email
            });
        }
        
        buttons.push({ id: `gmail_cancel_${sessionId}`, text: '❌ Cancel' });
        
        await sendButtons(sock, from, {
            text: `🗑️ Select account to remove:`,
            footer: 'Gmail Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
    } catch (error) {
        console.error('[GMAIL] Error:', error);
        await reply(`❌ Failed: ${error.message}`);
    }
}

async function handleFetchEmails(sock, from, reply, react) {
    await react('📧');
    const processingMsg = await reply(`📧 Fetching emails...`);
    
    try {
        await downloadCredentials();
        
        if (!credJson) {
            await reply(`❌ Credentials not found.`);
            return;
        }
        
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await reply(`❌ No Gmail accounts configured. Use .gmail add`);
            return;
        }
        
        const accounts = [];
        
        for (const file of tokenFiles) {
            const email = extractEmailFromFilename(file.name);
            const tokenPath = await downloadTokenFile(file.id, file.name);
            
            if (tokenPath) {
                const auth = await authenticateWithToken(tokenPath, email);
                if (auth && auth.gmail) {
                    accounts.push(auth);
                }
                try { fs.unlinkSync(tokenPath); } catch (e) {}
            }
        }
        
        if (accounts.length === 0) {
            await reply(`❌ No accounts could be authenticated.`);
            return;
        }
        
        const emails = [];
        for (const account of accounts) {
            const emailData = await getLatestEmail(account.gmail);
            if (emailData) {
                emails.push({ account: account.email, ...emailData });
            }
        }
        
        if (emails.length === 0) {
            await reply(`📭 No emails found.`);
            return;
        }
        
        emails.sort((a, b) => b.timestamp - a.timestamp);
        const latest = emails[0];
        
        const message = `📧 *Latest Email*\n\n` +
                       `👤 *Account:* ${latest.account}\n` +
                       `📌 *Subject:* ${latest.subject}\n` +
                       `📨 *From:* ${latest.from}\n` +
                       `📅 *Date:* ${new Date(latest.timestamp).toLocaleString()}\n\n` +
                       `📄 *Content:*\n${latest.body.substring(0, 1000)}`;
        
        await sock.sendMessage(from, { text: message, edit: processingMsg.key });
        await react('✅');
        
    } catch (error) {
        console.error('[GMAIL] Error:', error);
        await sock.sendMessage(from, { text: `❌ Failed: ${error.message}`, edit: processingMsg.key });
        await react('❌');
    }
}

async function handleListAccounts(sock, from, reply, react) {
    await react('📋');
    
    try {
        await downloadCredentials();
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await reply(`📭 No Gmail accounts configured.`);
            return;
        }
        
        let listMsg = `📧 *Gmail Accounts*\n\n📊 Total: ${tokenFiles.length}\n\n`;
        for (let i = 0; i < tokenFiles.length; i++) {
            const email = extractEmailFromFilename(tokenFiles[i].name);
            listMsg += `${i + 1}. ${email}\n`;
        }
        
        await reply(listMsg);
        await react('✅');
        
    } catch (error) {
        console.error('[GMAIL] Error:', error);
        await reply(`❌ Failed: ${error.message}`);
        await react('❌');
    }
}

async function handleRemoveAccount(sock, from, reply, react, emailToRemove) {
    await react('🗑️');
    
    try {
        const tokenFiles = await listTokenFiles();
        let found = false;
        
        for (const file of tokenFiles) {
            const fileEmail = extractEmailFromFilename(file.name);
            if (fileEmail.toLowerCase() === emailToRemove.toLowerCase()) {
                await deleteTokenFile(file.id);
                found = true;
                break;
            }
        }
        
        if (found) {
            await reply(`✅ Account removed: ${emailToRemove}`);
        } else {
            await reply(`❌ Account not found: ${emailToRemove}`);
        }
        
    } catch (error) {
        console.error('[GMAIL] Error:', error);
        await reply(`❌ Failed: ${error.message}`);
    }
}