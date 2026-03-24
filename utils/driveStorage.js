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

// Convert config object to text format
function configToText(config) {
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

// Parse text format to config object
function textToConfig(text) {
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

// Read configuration file from Google Drive
async function readConfig() {
    try {
        const token = await getAccessToken();
        if (!token) {
            console.log('⚠️ No token available, using default config');
            return DEFAULT_CONFIG;
        }
        
        console.log('📖 Reading forwarding config from Google Drive...');
        console.log(`   File ID: ${CONFIG_FILE_ID}`);
        
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
            
            console.log(`✅ File downloaded, size: ${response.data.length} bytes`);
            console.log(`   First 200 chars: ${response.data.substring(0, 200)}`);
            
            // Try to parse as JSON first
            try {
                const jsonConfig = JSON.parse(response.data);
                if (jsonConfig && jsonConfig.forwardings) {
                    const ruleCount = Object.keys(jsonConfig.forwardings).length;
                    console.log(`✅ Loaded ${ruleCount} forwarding rules from Drive (JSON format)`);
                    return jsonConfig;
                }
            } catch (e) {
                console.log('📝 Not JSON, parsing as text format...');
                const config = textToConfig(response.data);
                const ruleCount = Object.keys(config.forwardings).length;
                console.log(`✅ Loaded ${ruleCount} forwarding rules from Drive (Text format)`);
                return config;
            }
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('📝 Config file not found (404), will create new one');
                return DEFAULT_CONFIG;
            } else if (error.response?.status === 403) {
                console.log('⚠️ Cannot access file (403), will use local config');
                return DEFAULT_CONFIG;
            } else if (error.response?.status === 401) {
                console.log('⚠️ Token expired (401), will refresh and retry');
                cachedToken = null;
                tokenExpiry = null;
                return await readConfig();
            }
            throw error;
        }
        
        return DEFAULT_CONFIG;
        
    } catch (error) {
        console.error('❌ Failed to read config from Drive:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
        return DEFAULT_CONFIG;
    }
}

// Write configuration file to Google Drive (as text) - FIXED VERSION
async function writeConfig(config) {
    try {
        const token = await getAccessToken();
        if (!token) {
            console.log('⚠️ No token available, cannot save to Drive');
            return false;
        }
        
        console.log('💾 Saving forwarding config to Google Drive as text file...');
        console.log(`   File ID: ${CONFIG_FILE_ID}`);
        
        // Convert to text format
        const textContent = configToText(config);
        console.log(`   Content length: ${textContent.length} bytes`);
        console.log(`   Rules count: ${Object.keys(config.forwardings).length}`);
        
        // Prepare the file content
        const fileBuffer = Buffer.from(textContent, 'utf8');
        
        // First, check if file exists
        let fileExists = false;
        try {
            const fileInfo = await axios.get(`https://www.googleapis.com/drive/v3/files/${CONFIG_FILE_ID}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fileExists = true;
            console.log(`✅ File exists: ${fileInfo.data.name}`);
        } catch (e) {
            if (e.response?.status === 404) {
                console.log('📝 File does not exist, will create new');
                fileExists = false;
            } else if (e.response?.status === 401) {
                console.log('⚠️ Token expired, refreshing...');
                cachedToken = null;
                tokenExpiry = null;
                return await writeConfig(config);
            } else {
                console.log(`⚠️ Error checking file: ${e.message}`);
                fileExists = false;
            }
        }
        
        if (!fileExists) {
            // Create new file
            console.log('📤 Creating new file...');
            const metadata = {
                name: 'forwarding_config.txt',
                mimeType: 'text/plain',
                parents: ['root']
            };
            
            const formData = new FormData();
            formData.append('metadata', JSON.stringify(metadata), { contentType: 'application/json' });
            formData.append('file', fileBuffer, { filename: 'forwarding_config.txt', contentType: 'text/plain' });
            
            const createResponse = await axios.post(UPLOAD_URL, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });
            
            console.log('✅ New file created on Google Drive!');
            console.log(`   File ID: ${createResponse.data.id}`);
            return true;
        }
        
        // Update existing file - Use the simple upload method with media upload URL
        const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${CONFIG_FILE_ID}?uploadType=media`;
        
        console.log(`📤 Updating file at: ${updateUrl}`);
        
        const response = await axios({
            method: 'PATCH',
            url: updateUrl,
            data: fileBuffer,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'text/plain',
                'Content-Length': fileBuffer.length
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        console.log('✅ Config saved to Google Drive successfully!');
        console.log(`   File ID: ${response.data.id}`);
        console.log(`   File Name: ${response.data.name}`);
        return true;
        
    } catch (error) {
        console.error('❌ Failed to write config to Drive:');
        console.error(`   Message: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Status Text: ${error.response.statusText}`);
            console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
        }
        console.error(`   Stack: ${error.stack}`);
        return false;
    }
}

// Save forwarding configuration
async function saveForwardingConfig(sourceJid, config) {
    console.log(`\n📝 Saving forwarding config for: ${sourceJid}`);
    const data = await readConfig();
    if (!data) {
        console.log('❌ Failed to read existing config');
        return false;
    }
    
    if (!data.forwardings) data.forwardings = {};
    
    data.forwardings[sourceJid] = {
        ...config,
        updatedAt: Date.now()
    };
    
    console.log(`   Total rules after save: ${Object.keys(data.forwardings).length}`);
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
    console.log(`\n🗑️ Removing forwarding config for: ${sourceJid}`);
    const data = await readConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        delete data.forwardings[sourceJid];
        console.log(`   Rules remaining: ${Object.keys(data.forwardings).length}`);
        return await writeConfig(data);
    }
    console.log(`   Rule not found`);
    return false;
}

// Toggle forwarding configuration
async function toggleForwardingConfig(sourceJid, enabled) {
    console.log(`\n🔄 Toggling forwarding config for: ${sourceJid} -> ${enabled ? 'ENABLED' : 'DISABLED'}`);
    const data = await readConfig();
    if (!data || !data.forwardings) return false;
    
    if (data.forwardings[sourceJid]) {
        data.forwardings[sourceJid].enabled = enabled;
        data.forwardings[sourceJid].updatedAt = Date.now();
        return await writeConfig(data);
    }
    console.log(`   Rule not found`);
    return false;
}

// Update forwarding filters
async function updateForwardingFilters(sourceJid, filters) {
    console.log(`\n🔧 Updating filters for: ${sourceJid}`);
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
    console.log('\n📤 Loading forwarding configurations from Google Drive...');
    const forwardings = await getAllForwardings();
    console.log(`✅ Loaded ${forwardings.length} forwarding rules from Google Drive`);
    
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
