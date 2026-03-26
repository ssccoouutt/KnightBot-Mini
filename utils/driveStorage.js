// utils/driveStorage.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Google Drive Configuration
const FORWARDING_FILE_ID = '1bK0_FSna8KzX-XgvlVlfHA9Al2M385qV'; // Forwarding config file
const USERS_FILE_ID = '14J77cWIzzyB3hLHK4__zi_m-p-khVYuk'; // Users subscription file
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;

// Default empty configs
const DEFAULT_FORWARDING_CONFIG = {
    forwardings: {},
    version: 1,
    lastUpdated: Date.now()
};

const DEFAULT_USERS_CONFIG = {
    users: {},
    version: 1,
    lastUpdated: Date.now()
};

// ==================== TOKEN MANAGEMENT ====================
async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            console.log('✅ Using cached token (valid until:', tokenExpiry.toLocaleString(), ')');
            return cachedToken;
        }
        
        console.log('📥 Fetching Google Drive token...');
        
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
        
        console.log('📋 Token data loaded');
        
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('🔄 Token expired, refreshing...');
            const refreshData = {
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            const refreshResponse = await axios.post(tokenData.token_uri, refreshData);
            cachedToken = refreshResponse.data.access_token;
            tokenExpiry = new Date(Date.now() + 3600 * 1000);
            console.log('✅ Token refreshed, expires at:', tokenExpiry.toLocaleString());
        } else {
            cachedToken = tokenData.token;
            tokenExpiry = new Date(expiryDate);
            console.log('✅ Using existing token, expires at:', tokenExpiry.toLocaleString());
        }
        
        return cachedToken;
        
    } catch (error) {
        console.error('❌ Failed to get Google Drive token:', error.message);
        return null;
    }
}

// ==================== FORWARDING CONFIG FUNCTIONS ====================
function forwardingConfigToText(config) {
    let text = '# KnightBot-Mini Forwarding Configuration\n';
    text += '# Format: SOURCE_JID -> TARGET_JID [enabled|disabled] [filters]\n';
    text += '# Filters: types:text,image,video | caption:only | caption:without | exclude:media | exclude:text\n';
    text += '# Example: 120363408035540146@g.us -> 120363421227499361@g.us enabled types:text,image\n';
    text += `# Last updated: ${new Date(config.lastUpdated).toLocaleString()}\n\n`;
    
    for (const [source, rule] of Object.entries(config.forwardings)) {
        let line = `${source} -> ${rule.targetGroupId}`;
        line += rule.enabled ? ' enabled' : ' disabled';
        
        if (rule.filters) {
            const filters = [];
            if (rule.filters.types && rule.filters.types.length > 0 && rule.filters.types.length < 10) {
                filters.push(`types:${rule.filters.types.join(',')}`);
            }
            if (rule.filters.onlyWithCaption) filters.push('caption:only');
            if (rule.filters.onlyWithoutCaption) filters.push('caption:without');
            if (rule.filters.excludeMedia) filters.push('exclude:media');
            if (rule.filters.excludeText) filters.push('exclude:text');
            if (filters.length > 0) {
                line += ` ${filters.join(' ')}`;
            }
        }
        
        text += line + '\n';
    }
    
    return text;
}

function forwardingTextToConfig(text) {
    const forwardings = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const arrowMatch = trimmed.match(/^([^\s]+)\s*->\s*([^\s]+)/);
        if (!arrowMatch) continue;
        
        const sourceJid = arrowMatch[1];
        const targetJid = arrowMatch[2];
        
        const remaining = trimmed.substring(arrowMatch[0].length).trim();
        const parts = remaining.split(/\s+/);
        
        let enabled = true;
        const filters = {
            types: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'poll'],
            onlyWithCaption: false,
            onlyWithoutCaption: false,
            excludeMedia: false,
            excludeText: false
        };
        
        for (const part of parts) {
            if (part === 'enabled') {
                enabled = true;
            } else if (part === 'disabled') {
                enabled = false;
            } else if (part.startsWith('types:')) {
                filters.types = part.substring(6).split(',');
            } else if (part === 'caption:only') {
                filters.onlyWithCaption = true;
            } else if (part === 'caption:without') {
                filters.onlyWithoutCaption = true;
            } else if (part === 'exclude:media') {
                filters.excludeMedia = true;
            } else if (part === 'exclude:text') {
                filters.excludeText = true;
            }
        }
        
        forwardings[sourceJid] = {
            targetGroupId: targetJid,
            enabled: enabled,
            forwarderJid: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            filters: filters
        };
    }
    
    return {
        forwardings: forwardings,
        version: 1,
        lastUpdated: Date.now()
    };
}

// ==================== USER SUBSCRIPTION FUNCTIONS ====================
function usersConfigToText(config) {
    let text = '# KnightBot-Mini Allowed Users\n';
    text += '# Format: USER_JID | SUBSCRIBED_AT | SUBSCRIBED_BY\n';
    text += '# Example: 923001234567@s.whatsapp.net | 2026-03-25 10:30:45 | 923400315734@s.whatsapp.net\n';
    text += `# Last updated: ${new Date(config.lastUpdated).toLocaleString()}\n\n`;
    
    for (const [jid, userData] of Object.entries(config.users)) {
        text += `${jid} | ${userData.subscribedAt} | ${userData.subscribedBy || 'owner'}\n`;
    }
    
    return text;
}

function usersTextToConfig(text) {
    const users = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const parts = trimmed.split('|');
        if (parts.length >= 2) {
            const jid = parts[0].trim();
            const subscribedAt = parts[1].trim();
            const subscribedBy = parts[2] ? parts[2].trim() : 'owner';
            users[jid] = { subscribedAt, subscribedBy };
        }
    }
    
    return {
        users: users,
        version: 1,
        lastUpdated: Date.now()
    };
}

// ==================== GENERIC FILE READ/WRITE ====================
async function readFile(fileId, textToConfigFunc, defaultConfig) {
    try {
        const token = await getAccessToken();
        if (!token) return defaultConfig;
        
        console.log(`📖 Reading file from Google Drive: ${fileId}`);
        
        try {
            const response = await axios({
                method: 'GET',
                url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                headers: { 'Authorization': `Bearer ${token}` },
                responseType: 'text',
                timeout: 30000
            });
            
            // Try JSON first
            try {
                const jsonConfig = JSON.parse(response.data);
                return jsonConfig;
            } catch (e) {
                const config = textToConfigFunc(response.data);
                return config;
            }
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('📝 File not found, will create new one');
                return defaultConfig;
            } else if (error.response?.status === 401) {
                cachedToken = null;
                tokenExpiry = null;
                return await readFile(fileId, textToConfigFunc, defaultConfig);
            }
            throw error;
        }
        
    } catch (error) {
        console.error(`❌ Failed to read file:`, error.message);
        return defaultConfig;
    }
}

async function writeFile(fileId, config, configToTextFunc, filename) {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        
        console.log(`💾 Saving to Google Drive: ${filename}`);
        
        const textContent = configToTextFunc(config);
        const fileBuffer = Buffer.from(textContent, 'utf8');
        
        // Check if file exists
        let fileExists = false;
        try {
            await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fileExists = true;
        } catch (e) {
            fileExists = false;
        }
        
        if (fileExists) {
            const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
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
                name: filename,
                mimeType: 'text/plain',
                parents: ['root']
            }), { contentType: 'application/json' });
            formData.append('file', fileBuffer, { filename: filename, contentType: 'text/plain' });
            
            await axios.post(UPLOAD_URL, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });
        }
        
        console.log(`✅ Saved to Google Drive: ${filename}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to write file:`, error.message);
        return false;
    }
}

// ==================== FORWARDING API ====================
async function readForwardingConfig() {
    return await readFile(FORWARDING_FILE_ID, forwardingTextToConfig, DEFAULT_FORWARDING_CONFIG);
}

async function writeForwardingConfig(config) {
    return await writeFile(FORWARDING_FILE_ID, config, forwardingConfigToText, 'forwarding_config.txt');
}

async function saveForwardingConfig(sourceJid, config) {
    console.log(`\n📝 Saving forwarding config for: ${sourceJid}`);
    const data = await readForwardingConfig();
    if (!data) return false;
    
    if (!data.forwardings) data.forwardings = {};
    
    data.forwardings[sourceJid] = {
        ...config,
        updatedAt: Date.now()
    };
    
    console.log(`   Total rules after save: ${Object.keys(data.forwardings).length}`);
    return await writeForwardingConfig(data);
}

async function getForwardingConfig(sourceJid) {
    const data = await readForwardingConfig();
    if (!data || !data.forwardings) return null;
    return data.forwardings[sourceJid] || null;
}

async function getAllForwardings() {
    const data = await readForwardingConfig();
    if (!data || !data.forwardings) return [];
    return Object.entries(data.forwardings).map(([source, config]) => ({
        sourceGroupId: source,
        ...config
    }));
}

async function removeForwardingConfig(sourceJid) {
    console.log(`\n🗑️ Removing forwarding config for: ${sourceJid}`);
    const data = await readForwardingConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        delete data.forwardings[sourceJid];
        return await writeForwardingConfig(data);
    }
    return false;
}

async function toggleForwardingConfig(sourceJid, enabled) {
    const data = await readForwardingConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        data.forwardings[sourceJid].enabled = enabled;
        data.forwardings[sourceJid].updatedAt = Date.now();
        return await writeForwardingConfig(data);
    }
    return false;
}

async function updateForwardingFilters(sourceJid, filters) {
    const data = await readForwardingConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        data.forwardings[sourceJid].filters = {
            ...data.forwardings[sourceJid].filters,
            ...filters
        };
        data.forwardings[sourceJid].updatedAt = Date.now();
        return await writeForwardingConfig(data);
    }
    return false;
}

async function loadAllForwardings() {
    console.log('\n📤 Loading forwarding configurations from Google Drive...');
    const forwardings = await getAllForwardings();
    console.log(`✅ Loaded ${forwardings.length} forwarding rules`);
    
    for (const f of forwardings) {
        console.log(`   • ${f.sourceGroupId} → ${f.targetGroupId} [${f.enabled ? 'ACTIVE' : 'DISABLED'}]`);
        if (f.filters) {
            const filterStr = [];
            if (f.filters.types && f.filters.types.length > 0 && f.filters.types.length < 10) 
                filterStr.push(`types:${f.filters.types.join(',')}`);
            if (f.filters.onlyWithCaption) filterStr.push('caption:only');
            if (f.filters.onlyWithoutCaption) filterStr.push('caption:without');
            if (f.filters.excludeMedia) filterStr.push('exclude:media');
            if (f.filters.excludeText) filterStr.push('exclude:text');
            if (filterStr.length > 0) {
                console.log(`     Filters: ${filterStr.join(' ')}`);
            }
        }
    }
    
    return forwardings;
}

// ==================== USER SUBSCRIPTION API ====================
async function readUsersConfig() {
    return await readFile(USERS_FILE_ID, usersTextToConfig, DEFAULT_USERS_CONFIG);
}

async function writeUsersConfig(config) {
    return await writeFile(USERS_FILE_ID, config, usersConfigToText, 'allowed_users.txt');
}

async function isUserAllowed(userJid) {
    const config = await readUsersConfig();
    const normalizedJid = userJid.split('@')[0] + '@s.whatsapp.net';
    return config.users.hasOwnProperty(normalizedJid);
}

async function addUser(userJid, subscribedBy) {
    const config = await readUsersConfig();
    const normalizedJid = userJid.split('@')[0] + '@s.whatsapp.net';
    
    config.users[normalizedJid] = {
        subscribedAt: new Date().toLocaleString(),
        subscribedBy: subscribedBy
    };
    
    return await writeUsersConfig(config);
}

async function removeUser(userJid) {
    const config = await readUsersConfig();
    const normalizedJid = userJid.split('@')[0] + '@s.whatsapp.net';
    
    if (config.users[normalizedJid]) {
        delete config.users[normalizedJid];
        return await writeUsersConfig(config);
    }
    return false;
}

async function getAllUsers() {
    const config = await readUsersConfig();
    return config.users;
}

async function getUserCount() {
    const config = await readUsersConfig();
    return Object.keys(config.users).length;
}

async function loadAllUsers() {
    console.log('\n👥 Loading allowed users from Google Drive...');
    const users = await getAllUsers();
    console.log(`✅ Loaded ${Object.keys(users).length} allowed users`);
    
    for (const [jid, data] of Object.entries(users)) {
        console.log(`   • ${jid} (subscribed: ${data.subscribedAt} by ${data.subscribedBy})`);
    }
    
    return users;
}

module.exports = {
    // Forwarding functions
    readForwardingConfig,
    writeForwardingConfig,
    saveForwardingConfig,
    getForwardingConfig,
    getAllForwardings,
    removeForwardingConfig,
    toggleForwardingConfig,
    updateForwardingFilters,
    loadAllForwardings,
    
    // User subscription functions
    readUsersConfig,
    writeUsersConfig,
    isUserAllowed,
    addUser,
    removeUser,
    getAllUsers,
    getUserCount,
    loadAllUsers
};
