// utils/driveStorage.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Google Drive Configuration
const CONFIG_FILE_ID = '1bK0_FSna8KzX-XgvlVlfHA9Al2M385qV'; // Your text file
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;

// Default empty config
const DEFAULT_CONFIG = {
    forwardings: {},
    version: 1,
    lastUpdated: Date.now()
};

// Get Google Drive access token
async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
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
        
        const expiryDate = new Date(tokenData.expiry);
        if (new Date() > expiryDate) {
            console.log('🔄 Refreshing token...');
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
        
        console.log('✅ Google Drive token obtained');
        return cachedToken;
        
    } catch (error) {
        console.error('❌ Failed to get Google Drive token:', error.message);
        return null;
    }
}

// Convert config object to text format
function configToText(config) {
    let text = '# KnightBot-Mini Forwarding Configuration\n';
    text += '# Format: SOURCE_JID -> TARGET_JID [enabled|disabled] [filters]\n';
    text += '# Filters: types:text,image,video | caption:only | exclude:media\n';
    text += '# Example: 120363408035540146@g.us -> 120363421227499361@g.us enabled types:text,image\n';
    text += '# Last updated: ' + new Date(config.lastUpdated).toLocaleString() + '\n\n';
    
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

// Parse text format to config object
function textToConfig(text) {
    const forwardings = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
        // Skip comments and empty lines
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Parse: SOURCE -> TARGET [enabled|disabled] [filters...]
        const arrowMatch = trimmed.match(/^([^\s]+)\s*->\s*([^\s]+)/);
        if (!arrowMatch) continue;
        
        const sourceJid = arrowMatch[1];
        const targetJid = arrowMatch[2];
        
        // Parse remaining parts
        const remaining = trimmed.substring(arrowMatch[0].length).trim();
        const parts = remaining.split(/\s+/);
        
        // Default values
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

// Read configuration file from Google Drive
async function readConfig() {
    try {
        const token = await getAccessToken();
        if (!token) return DEFAULT_CONFIG;
        
        console.log('📖 Reading forwarding config from Google Drive...');
        
        try {
            const response = await axios({
                method: 'GET',
                url: `https://www.googleapis.com/drive/v3/files/${CONFIG_FILE_ID}?alt=media`,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                responseType: 'text',
                timeout: 30000
            });
            
            const fileContent = response.data;
            
            // Check if it's JSON or text
            try {
                const jsonConfig = JSON.parse(fileContent);
                if (jsonConfig && jsonConfig.forwardings) {
                    console.log(`✅ Loaded ${Object.keys(jsonConfig.forwardings).length} forwarding rules from Drive (JSON format)`);
                    return jsonConfig;
                }
            } catch (e) {
                // Not JSON, treat as text
                const config = textToConfig(fileContent);
                const ruleCount = Object.keys(config.forwardings).length;
                console.log(`✅ Loaded ${ruleCount} forwarding rules from Drive (Text format)`);
                return config;
            }
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('📝 Config file not found, will create new one');
                return DEFAULT_CONFIG;
            } else if (error.response?.status === 403) {
                console.log('⚠️ Cannot access file, will use local config');
                return DEFAULT_CONFIG;
            }
            throw error;
        }
        
        return DEFAULT_CONFIG;
        
    } catch (error) {
        console.error('❌ Failed to read config from Drive:', error.message);
        return DEFAULT_CONFIG;
    }
}

// Write configuration file to Google Drive (as text)
async function writeConfig(config) {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        
        console.log('💾 Saving forwarding config to Google Drive as text file...');
        
        // Convert to text format
        const textContent = configToText(config);
        
        // Update the file
        const formData = new FormData();
        formData.append('metadata', JSON.stringify({
            name: 'forwarding_config.txt',
            mimeType: 'text/plain'
        }), { contentType: 'application/json' });
        
        formData.append('file', Buffer.from(textContent, 'utf8'), {
            filename: 'forwarding_config.txt',
            contentType: 'text/plain'
        });
        
        await axios.patch(`${FILE_URL}/${CONFIG_FILE_ID}?uploadType=multipart`, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            }
        });
        
        console.log('✅ Config saved to Google Drive as text file');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to write config to Drive:', error.message);
        return false;
    }
}

// Save forwarding configuration
async function saveForwardingConfig(sourceJid, config) {
    const data = await readConfig();
    if (!data) return false;
    
    if (!data.forwardings) data.forwardings = {};
    
    data.forwardings[sourceJid] = {
        ...config,
        updatedAt: Date.now()
    };
    
    return await writeConfig(data);
}

// Get forwarding configuration
async function getForwardingConfig(sourceJid) {
    const data = await readConfig();
    if (!data || !data.forwardings) return null;
    return data.forwardings[sourceJid] || null;
}

// Get all forwarding configurations
async function getAllForwardings() {
    const data = await readConfig();
    if (!data || !data.forwardings) return [];
    return Object.entries(data.forwardings).map(([source, config]) => ({
        sourceGroupId: source,
        ...config
    }));
}

// Remove forwarding configuration
async function removeForwardingConfig(sourceJid) {
    const data = await readConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        delete data.forwardings[sourceJid];
        return await writeConfig(data);
    }
    return false;
}

// Toggle forwarding configuration
async function toggleForwardingConfig(sourceJid, enabled) {
    const data = await readConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        data.forwardings[sourceJid].enabled = enabled;
        data.forwardings[sourceJid].updatedAt = Date.now();
        return await writeConfig(data);
    }
    return false;
}

// Update forwarding filters
async function updateForwardingFilters(sourceJid, filters) {
    const data = await readConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        data.forwardings[sourceJid].filters = {
            ...data.forwardings[sourceJid].filters,
            ...filters
        };
        data.forwardings[sourceJid].updatedAt = Date.now();
        return await writeConfig(data);
    }
    return false;
}

// Initialize and load all forwardings on bot start
async function loadAllForwardings() {
    const forwardings = await getAllForwardings();
    console.log(`\n📤 Loading ${forwardings.length} forwarding rules from Google Drive...`);
    
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

module.exports = {
    readConfig,
    writeConfig,
    saveForwardingConfig,
    getForwardingConfig,
    getAllForwardings,
    removeForwardingConfig,
    toggleForwardingConfig,
    updateForwardingFilters,
    loadAllForwardings
};
