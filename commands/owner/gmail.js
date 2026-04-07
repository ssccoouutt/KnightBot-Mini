/**
 * Gmail Command - Fetch latest emails from all authorized Gmail accounts
 * Uses session-based button handling (same pattern as commit/audit)
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
        
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and (name='cred.json' or name='credentials.json')`,
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
                q: `'${GMAIL_TOKENS_FOLDER_ID}' in parents and name contains '.json'`,
                fields: 'files(id,name,mimeType)',
                pageSize: 100
            }
        });
        
        const files = response.data.files || [];
        return files.filter(file => 
            file.name.startsWith('token_') && 
            file.name !== 'cred.json' && 
            file.name !== 'credentials.json' &&
            file.name !== 'gmail_accounts.json'
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

// ==================== GMAIL AUTH FUNCTIONS ====================

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
        prompt: 'consent',
        include_granted_scopes: true
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
        
        await oAuth2Client.getAccessToken();
        
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const userEmail = profile.data.emailAddress;
        
        console.log(`[GMAIL] ✅ Authenticated: ${userEmail}`);
        return { gmail, email: userEmail, oAuth2Client };
        
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
        
        return {
            id: messageId,
            subject,
            from,
            date,
            timestamp: dateTimestamp,
            body: body
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

function splitLongMessage(text, maxLength = 4000) {
    if (text.length <= maxLength) return [text];
    
    const parts = [];
    let remaining = text;
    
    while (remaining.length > 0) {
        let part = remaining.substring(0, maxLength);
        const lastNewline = part.lastIndexOf('\n');
        const lastSpace = part.lastIndexOf(' ');
        const breakPoint = Math.max(lastNewline, lastSpace);
        
        if (breakPoint > maxLength / 2) {
            part = remaining.substring(0, breakPoint);
            remaining = remaining.substring(breakPoint + 1);
        } else {
            remaining = remaining.substring(maxLength);
        }
        
        parts.push(part);
    }
    
    return parts;
}

function extractEmailFromFilename(filename) {
    let email = filename.replace(/^token_/, '').replace('.json', '');
    email = email.replace(/_/g, '@');
    return email;
}

function extractCodeFromUrl(url) {
    // Extract code from URL like: http://localhost/?code=4/0Aci98E8...
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    if (codeMatch) {
        return decodeURIComponent(codeMatch[1]);
    }
    return url;
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'gmail',
    aliases: [],
    description: 'Fetch latest emails from all authorized Gmail accounts',
    usage: '.gmail',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const session = sessionManager.createSession(sender, from, 'gmail', {
            step: 'main_menu'
        });
        
        const sessionId = session.id.split(':').pop();
        
        const buttons = [
            { id: `gmail_fetch_${sessionId}`, text: '📥 Fetch Latest Email' },
            { id: `gmail_list_${sessionId}`, text: '📋 List Accounts' },
            { id: `gmail_add_${sessionId}`, text: '➕ Add Account' },
            { id: `gmail_remove_${sessionId}`, text: '🗑️ Remove Account' },
            { id: `gmail_refresh_${sessionId}`, text: '🔄 Refresh Tokens' }
        ];
        
        const sentMsg = await sendButtons(sock, from, {
            text: `📧 *Gmail Manager*\n\nChoose an option:`,
            footer: 'Gmail Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'gmail');
        await react('📧');
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
            } else if (msg.message?.listResponseMessage) {
                const listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                }
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
            }
            
            if (buttonId) {
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
                    await handleAddAccount(sock, from, sender, reply, react);
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
                
                if (buttonId.includes('gmail_refresh_')) {
                    await handleRefreshTokens(sock, from, reply, react);
                    return true;
                }
                
                if (buttonId.includes('gmail_cancel_')) {
                    await reply(`❌ Operation cancelled.`);
                    return true;
                }
            }
        }
        
        // Handle text input for auth code
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation.trim();
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.trim();
        }
        
        if (text && session.data && session.data.step === 'waiting_for_code') {
            console.log(`[GMAIL] Received code input: ${text.substring(0, 50)}...`);
            const code = extractCodeFromUrl(text);
            if (code && (code.startsWith('4/') || code.length > 30)) {
                await handleCodeInput(sock, from, sender, reply, react, session, code);
            } else {
                await reply(`❌ Invalid code format.\n\nPlease send the full URL or the authorization code from Google.\n\nThe URL should look like:\n\`http://localhost/?code=4/0Aci98E8...\``);
            }
            return true;
        }
        
        return true;
    }
};

// ==================== HELPER FUNCTIONS ====================

async function showRemoveAccountSelection(sock, from, reply, react) {
    await react('🗑️');
    const processingMsg = await reply(`🗑️ *Loading accounts...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `📭 *No accounts to remove*\n\nUse \`.gmail add\` to add an account first.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        const sessionId = `${Date.now()}`;
        const buttons = [];
        
        for (let i = 0; i < tokenFiles.length; i++) {
            const file = tokenFiles[i];
            const email = extractEmailFromFilename(file.name);
            buttons.push({
                id: `gmail_remove_account_${sessionId}_${encodeURIComponent(email)}`,
                text: email.length > 30 ? email.substring(0, 27) + '...' : email
            });
        }
        
        buttons.push({ id: `gmail_cancel_${sessionId}`, text: '❌ Cancel' });
        
        await sock.sendMessage(from, {
            text: `✅ *Found ${tokenFiles.length} account(s)*\n\nSelect which account to remove:`,
            edit: processingMsg.key
        });
        
        const sentMsg = await sendButtons(sock, from, {
            text: `🗑️ *Remove Account*\n\nSelect the account you want to remove:`,
            footer: 'Gmail Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
    } catch (error) {
        console.error('[GMAIL] Error loading accounts for removal:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to load accounts*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

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
        
        if (tokenFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ *No Gmail accounts configured*\n\nUse \`.gmail add\` to add an account.`,
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
                text: `❌ *No accounts could be authenticated*\n\nTokens may be expired. Use \`.gmail add\` to re-add.`,
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
                            `📄 *Content:*\n${latest.body}\n\n` +
                            `📊 *Found ${emails.length} email(s) from ${accounts.length} account(s)*`;
        
        if (emailMessage.length > 4000) {
            const parts = splitLongMessage(emailMessage, 4000);
            await sock.sendMessage(from, {
                text: parts[0],
                edit: processingMsg.key
            });
            for (let i = 1; i < parts.length; i++) {
                await sock.sendMessage(from, { text: parts[i] });
            }
        } else {
            await sock.sendMessage(from, {
                text: emailMessage,
                edit: processingMsg.key
            });
        }
        
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

async function handleAddAccount(sock, from, sender, reply, react) {
    await react('🔐');
    
    const processingMsg = await reply(`🔐 *Starting Gmail authentication...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        
        if (!credJson) {
            await sock.sendMessage(from, {
                text: `❌ *Credentials not found*\n\nPlease upload cred.json to the Google Drive folder first.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        const { oAuth2Client, authUrl } = await generateAuthUrl();
        
        // Clear any existing auth sessions for this user first
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'gmail_auth') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        // Create new auth session
        const authSession = sessionManager.createSession(sender, from, 'gmail_auth', {
            step: 'waiting_for_code',
            oAuth2Client: oAuth2Client
        });
        
        const authMessage = `🔐 *Add Gmail Account*\n\n` +
                           `1. Click the link below to authorize:\n${authUrl}\n\n` +
                           `2. After granting permission, Google will redirect you to a URL\n\n` +
                           `3. Copy the FULL URL and send it here\n\n` +
                           `*Example URL:*\n\`http://localhost/?code=4/0Aci98E8...\`\n\n` +
                           `*Note:* The code expires in 10 minutes.\n\n` +
                           `⚠️ *Send the URL in this chat* - I'm waiting for your response!`;
        
        await sock.sendMessage(from, {
            text: authMessage,
            edit: processingMsg.key
        });
        
        const sessionId = authSession.id.split(':').pop();
        const buttons = [
            { id: `gmail_cancel_${sessionId}`, text: '❌ Cancel' }
        ];
        
        const sentMsg = await sendButtons(sock, from, {
            text: `🔐 *Waiting for authorization URL*\n\nSend the full redirect URL you received from Google.\n\nType \`cancel\` to abort.`,
            footer: 'Gmail Auth',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'gmail_auth');
        
        console.log(`[GMAIL] Waiting for code from user ${sender}`);
        
    } catch (error) {
        console.error('[GMAIL] Add account error:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to start authentication*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleCodeInput(sock, from, sender, reply, react, session, code) {
    const oAuth2Client = session.data.oAuth2Client;
    
    if (!oAuth2Client) {
        await reply(`❌ *Session expired*\n\nPlease run \`.gmail add\` again.`);
        sessionManager.clearSession(session.id);
        return;
    }
    
    await react('🔄');
    const processingMsg = await reply(`🔄 *Exchanging code for tokens...*\n\nPlease wait...`);
    
    try {
        const tokens = await getTokensFromCode(oAuth2Client, code);
        
        oAuth2Client.setCredentials(tokens);
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress;
        
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
            await sock.sendMessage(from, {
                text: `✅ *Account Added Successfully!*\n\n` +
                      `📧 *Email:* ${email}\n` +
                      `💾 *Token saved to Google Drive*\n\n` +
                      `Use \`.gmail\` to fetch emails.`,
                edit: processingMsg.key
            });
            await react('✅');
        } else {
            await sock.sendMessage(from, {
                text: `❌ *Failed to save token to Google Drive*\n\nPlease check folder permissions.`,
                edit: processingMsg.key
            });
            await react('❌');
        }
        
        sessionManager.clearSession(session.id);
        
    } catch (error) {
        console.error('[GMAIL] Code exchange error:', error);
        await sock.sendMessage(from, {
            text: `❌ *Failed to authenticate*\n\nError: ${error.message}\n\nPlease try \`.gmail add\` again.`,
            edit: processingMsg.key
        });
        await react('❌');
        sessionManager.clearSession(session.id);
    }
}

async function handleListAccounts(sock, from, reply, react) {
    await react('📋');
    const processingMsg = await reply(`📋 *Fetching account list...*\n\nPlease wait...`);
    
    try {
        await downloadCredentials();
        const tokenFiles = await listTokenFiles();
        
        if (tokenFiles.length === 0) {
            await sock.sendMessage(from, {
                text: `📭 *No Gmail accounts configured*\n\nUse \`.gmail add\` to add an account.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        let listMsg = `📧 *Gmail Accounts*\n\n`;
        listMsg += `📊 *Total:* ${tokenFiles.length} account(s)\n\n`;
        
        for (let i = 0; i < tokenFiles.length; i++) {
            const file = tokenFiles[i];
            const email = extractEmailFromFilename(file.name);
            listMsg += `${i + 1}. ${email}\n`;
        }
        
        listMsg += `\n💡 Use \`.gmail\` to return to main menu`;
        
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

async function handleRemoveAccount(sock, from, reply, react, emailToRemove) {
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
                text: `✅ *Account Removed*\n\n📧 ${emailToRemove}\n\nUse \`.gmail\` to return to main menu.`,
                edit: processingMsg.key
            });
            await react('✅');
        } else {
            await sock.sendMessage(from, {
                text: `❌ *Account not found*\n\nNo token found for: ${emailToRemove}`,
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
                  `📊 Total: ${tokenFiles.length}\n\n` +
                  `💡 Use \`.gmail\` to return to main menu`,
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
