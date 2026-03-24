// utils/driveStorage.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Google Drive Configuration
const CONFIG_FILE_ID = '1NIcD3sFVwilLdhgiPqZLeG7D8jiMO2aN';
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;

// Get Google Drive access token
async function getAccessToken() {
    try {
        // Check if cached token is still valid
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        
        console.log('📥 Fetching Google Drive token...');
        
        // Download token.json from the provided link
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
        
        // Check if token needs refresh
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
            tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour
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

// Read configuration file from Google Drive
async function readConfig() {
    try {
        const token = await getAccessToken();
        if (!token) return null;
        
        console.log('📖 Reading forwarding config from Google Drive...');
        
        // Download the file
        const response = await axios({
            method: 'GET',
            url: `https://www.googleapis.com/drive/v3/files/${CONFIG_FILE_ID}?alt=media`,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            responseType: 'text',
            timeout: 30000
        });
        
        const config = JSON.parse(response.data);
        console.log(`✅ Loaded ${Object.keys(config.forwardings || {}).length} forwarding rules from Drive`);
        return config;
        
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('📝 Config file not found, creating new one...');
            return { forwardings: {}, version: 1, lastUpdated: Date.now() };
        }
        console.error('❌ Failed to read config from Drive:', error.message);
        return null;
    }
}

// Write configuration file to Google Drive
async function writeConfig(config) {
    try {
        const token = await getAccessToken();
        if (!token) return false;
        
        console.log('💾 Saving forwarding config to Google Drive...');
        
        config.lastUpdated = Date.now();
        const configContent = JSON.stringify(config, null, 2);
        
        // First, check if file exists and get its metadata
        let fileExists = false;
        try {
            await axios.get(`https://www.googleapis.com/drive/v3/files/${CONFIG_FILE_ID}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fileExists = true;
        } catch (e) {
            fileExists = false;
        }
        
        if (fileExists) {
            // Update existing file
            const formData = new FormData();
            formData.append('metadata', JSON.stringify({
                name: 'forwarding_config.json',
                mimeType: 'application/json'
            }), { contentType: 'application/json' });
            formData.append('file', Buffer.from(configContent, 'utf8'), {
                filename: 'forwarding_config.json',
                contentType: 'application/json'
            });
            
            await axios.patch(`${FILE_URL}/${CONFIG_FILE_ID}?uploadType=multipart`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });
        } else {
            // Create new file
            const formData = new FormData();
            formData.append('metadata', JSON.stringify({
                name: 'forwarding_config.json',
                parents: ['root']
            }), { contentType: 'application/json' });
            formData.append('file', Buffer.from(configContent, 'utf8'), {
                filename: 'forwarding_config.json',
                contentType: 'application/json'
            });
            
            await axios.post(UPLOAD_URL, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });
        }
        
        console.log('✅ Config saved to Google Drive');
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
    
    data.forwardings[sourceJid] = {
        ...config,
        updatedAt: Date.now()
    };
    
    return await writeConfig(data);
}

// Get forwarding configuration
async function getForwardingConfig(sourceJid) {
    const data = await readConfig();
    if (!data) return null;
    return data.forwardings[sourceJid] || null;
}

// Get all forwarding configurations
async function getAllForwardings() {
    const data = await readConfig();
    if (!data) return [];
    return Object.entries(data.forwardings).map(([source, config]) => ({
        sourceGroupId: source,
        ...config
    }));
}

// Remove forwarding configuration
async function removeForwardingConfig(sourceJid) {
    const data = await readConfig();
    if (!data) return false;
    
    if (data.forwardings[sourceJid]) {
        delete data.forwardings[sourceJid];
        return await writeConfig(data);
    }
    return false;
}

// Toggle forwarding configuration
async function toggleForwardingConfig(sourceJid, enabled) {
    const data = await readConfig();
    if (!data) return false;
    
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
    if (!data) return false;
    
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
            if (f.filters.types && f.filters.types.length > 0) filterStr.push(`types:${f.filters.types.join(',')}`);
            if (f.filters.onlyWithCaption) filterStr.push('only with caption');
            if (f.filters.onlyWithoutCaption) filterStr.push('only without caption');
            if (f.filters.excludeMedia) filterStr.push('exclude media');
            if (f.filters.excludeText) filterStr.push('exclude text');
            if (filterStr.length > 0) {
                console.log(`     Filters: ${filterStr.join(', ')}`);
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
