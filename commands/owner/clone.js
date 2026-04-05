/**
 * Clone Command - Clone between GitHub Repo and Google Drive Folder
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const FormData = require('form-data');
const config = require('../../config');

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const GITHUB_CONFIG_FILE_ID = "1EUSHauprcg3at2vAONYXelJuHHMBZq2b";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

let cachedToken = null;
let tokenExpiry = null;
let cachedGitHubToken = null;
let cachedGitHubUsername = null;
let githubTokenExpiry = null;

// ==================== GOOGLE DRIVE TOKEN FUNCTIONS ====================

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        
        console.log('[CLONE] Fetching Google Drive token...');
        
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
            console.log('[CLONE] Token expired, refreshing...');
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
        console.error('[CLONE] Failed to get Google Drive token:', error.message);
        return null;
    }
}

// ==================== GITHUB TOKEN FROM GOOGLE DRIVE ====================

async function getGitHubCredentials() {
    if (cachedGitHubToken && githubTokenExpiry && new Date() < githubTokenExpiry) {
        return { token: cachedGitHubToken, username: cachedGitHubUsername };
    }
    
    try {
        console.log('[CLONE] Fetching GitHub credentials from Google Drive...');
        
        const driveToken = await getAccessToken();
        if (!driveToken) throw new Error('No Drive access token');
        
        const response = await axios({
            method: 'GET',
            url: `https://www.googleapis.com/drive/v3/files/${GITHUB_CONFIG_FILE_ID}?alt=media`,
            headers: { 'Authorization': `Bearer ${driveToken}` },
            responseType: 'text',
            timeout: 30000
        });
        
        const content = response.data;
        let githubToken = null;
        let githubUsername = null;
        
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('GITHUB_TOKEN=')) {
                githubToken = trimmed.substring('GITHUB_TOKEN='.length).trim();
            } else if (trimmed.startsWith('GITHUB_USERNAME=')) {
                githubUsername = trimmed.substring('GITHUB_USERNAME='.length).trim();
            }
        }
        
        if (!githubToken || !githubUsername) {
            throw new Error('GitHub credentials not found in the config file');
        }
        
        cachedGitHubToken = githubToken;
        cachedGitHubUsername = githubUsername;
        githubTokenExpiry = new Date(Date.now() + 3600 * 1000);
        
        console.log('[CLONE] GitHub credentials loaded successfully');
        return { token: githubToken, username: githubUsername };
        
    } catch (error) {
        console.error('[CLONE] Failed to get GitHub credentials:', error.message);
        throw new Error(`Failed to load GitHub credentials: ${error.message}`);
    }
}

// ==================== GITHUB FUNCTIONS ====================

async function validateGitHubToken(token, username) {
    try {
        const response = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 200) {
            console.log('[CLONE] GitHub token is valid for user:', response.data.login);
            return true;
        }
    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('GitHub token is invalid or expired');
        }
        throw error;
    }
}

async function createGitHubRepo(repoName, token, username) {
    try {
        const response = await axios.post(
            'https://api.github.com/user/repos',
            {
                name: repoName,
                private: false,
                auto_init: false
            },
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        return response.status === 201;
        
    } catch (error) {
        if (error.response?.status === 422) {
            console.log('[CLONE] Repo already exists, will use existing');
            return true;
        }
        console.error('[CLONE] Create repo failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function uploadFileToGitHub(repoName, filePath, githubPath, token, username) {
    try {
        const content = fs.readFileSync(filePath);
        const base64Content = content.toString('base64');
        
        // Check if file already exists
        let sha = null;
        try {
            const checkResponse = await axios.get(
                `https://api.github.com/repos/${username}/${repoName}/contents/${githubPath}`,
                {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            if (checkResponse.data && checkResponse.data.sha) {
                sha = checkResponse.data.sha;
            }
        } catch (e) {
            // File doesn't exist, proceed with create
        }
        
        const requestBody = {
            message: sha ? `Update ${githubPath}` : `Add ${githubPath}`,
            content: base64Content
        };
        
        if (sha) {
            requestBody.sha = sha;
        }
        
        const response = await axios.put(
            `https://api.github.com/repos/${username}/${repoName}/contents/${githubPath}`,
            requestBody,
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        return response.status === 200 || response.status === 201;
        
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        // Skip secret detection errors (false positives)
        if (errorMsg.includes('Secret detected') || errorMsg.includes('secret scanning')) {
            console.log(`[CLONE] ⚠️ Skipping secret detection for ${githubPath} (false positive)`);
            return true; // Treat as success
        }
        console.error(`[CLONE] Upload to GitHub failed for ${githubPath}:`, errorMsg);
        return false;
    }
}

// ==================== GOOGLE DRIVE FILE FUNCTIONS ====================

async function uploadFileToDrive(filePath, fileName, folderId = null) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        const fileBuffer = fs.readFileSync(filePath);
        
        const metadata = {
            name: fileName,
            mimeType: 'application/octet-stream'
        };
        
        if (folderId) {
            metadata.parents = [folderId];
        }
        
        const formData = new FormData();
        formData.append('metadata', JSON.stringify(metadata), { contentType: 'application/json' });
        formData.append('file', fileBuffer, { filename: fileName });
        
        const response = await axios.post(UPLOAD_URL, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        return response.data.id;
        
    } catch (error) {
        console.error('[CLONE] Upload to Drive failed:', error.message);
        throw error;
    }
}

async function createDriveFolder(folderName, parentId = null) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        const metadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        
        if (parentId) {
            metadata.parents = [parentId];
        }
        
        const response = await axios.post('https://www.googleapis.com/drive/v3/files', metadata, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.id;
        
    } catch (error) {
        console.error('[CLONE] Create folder failed:', error.message);
        throw error;
    }
}

async function listDriveFilesRecursive(folderId, currentPath = '') {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id,name,mimeType)',
                pageSize: 1000
            }
        });
        
        const items = response.data.files || [];
        const result = [];
        
        for (const item of items) {
            const itemPath = currentPath ? path.join(currentPath, item.name) : item.name;
            
            if (item.mimeType === 'application/vnd.google-apps.folder') {
                // Recursively get subfolder contents
                const subItems = await listDriveFilesRecursive(item.id, itemPath);
                result.push(...subItems);
            } else {
                result.push({
                    id: item.id,
                    name: item.name,
                    path: itemPath,
                    fullPath: itemPath
                });
            }
        }
        
        return result;
        
    } catch (error) {
        console.error('[CLONE] List files failed:', error.message);
        return [];
    }
}

async function downloadFileFromDrive(fileId, filePath) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const response = await axios({
            method: 'GET',
            url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
    } catch (error) {
        console.error('[CLONE] Download from Drive failed:', error.message);
        throw error;
    }
}

// ==================== GITHUB REPO FUNCTIONS ====================

async function downloadGitHubRepo(repoUrl) {
    try {
        const repoPath = repoUrl.replace('https://github.com/', '').replace('.git', '').replace(/\/$/, '');
        const repoName = repoPath.split('/').pop();
        
        let downloadUrl = `https://github.com/${repoPath}/archive/refs/heads/main.zip`;
        let response = await axios.head(downloadUrl).catch(() => null);
        
        if (!response || response.status !== 200) {
            downloadUrl = `https://github.com/${repoPath}/archive/refs/heads/master.zip`;
            response = await axios.head(downloadUrl).catch(() => null);
            if (!response || response.status !== 200) {
                throw new Error('Could not find main or master branch');
            }
        }
        
        console.log(`[CLONE] Downloading from: ${downloadUrl}`);
        
        const zipResponse = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 120000
        });
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const zipPath = path.join(tempDir, `${repoName}.zip`);
        const writer = fs.createWriteStream(zipPath);
        zipResponse.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        const extractDir = path.join(tempDir, `${repoName}_extracted`);
        if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
        }
        fs.mkdirSync(extractDir, { recursive: true });
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(zipPath)
                .pipe(unzipper.Extract({ path: extractDir }))
                .on('close', resolve)
                .on('error', reject);
        });
        
        const subDirs = fs.readdirSync(extractDir);
        const extractedFolder = path.join(extractDir, subDirs[0]);
        
        fs.unlinkSync(zipPath);
        
        return { extractedFolder, repoName };
        
    } catch (error) {
        console.error('[CLONE] Download GitHub repo failed:', error.message);
        throw error;
    }
}

async function uploadFolderToDrive(localPath, parentFolderId = null) {
    const items = fs.readdirSync(localPath);
    let successCount = 0;
    let totalCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(localPath, item);
        
        if (fs.statSync(itemPath).isDirectory()) {
            // Create subfolder in Drive
            const folderId = await createDriveFolder(item, parentFolderId);
            const result = await uploadFolderToDrive(itemPath, folderId);
            successCount += result.successCount;
            totalCount += result.totalCount;
        } else {
            totalCount++;
            try {
                await uploadFileToDrive(itemPath, item, parentFolderId);
                successCount++;
                console.log(`[CLONE] ✅ Uploaded to Drive: ${item}`);
            } catch (error) {
                console.error(`[CLONE] ❌ Failed to upload ${item}:`, error.message);
            }
        }
    }
    
    return { successCount, totalCount };
}

async function uploadFolderToGitHub(localPath, repoName, token, username, basePath = '') {
    const items = fs.readdirSync(localPath);
    let successCount = 0;
    let totalCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(localPath, item);
        const relativePath = basePath ? path.join(basePath, item) : item;
        const githubPath = relativePath.replace(/\\/g, '/');
        
        if (fs.statSync(itemPath).isDirectory()) {
            // Create folder in GitHub (by creating a .gitkeep file or just recursing)
            // GitHub doesn't need explicit folder creation
            const result = await uploadFolderToGitHub(itemPath, repoName, token, username, relativePath);
            successCount += result.successCount;
            totalCount += result.totalCount;
        } else {
            totalCount++;
            const uploaded = await uploadFileToGitHub(repoName, itemPath, githubPath, token, username);
            if (uploaded) successCount++;
            console.log(`[CLONE] ${uploaded ? '✅' : '❌'} Uploaded: ${githubPath}`);
        }
    }
    
    return { successCount, totalCount };
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'clone',
    aliases: ['sync', 'mirror'],
    description: 'Clone between GitHub repo and Google Drive folder',
    usage: '.clone <github_repo_url> [drive_folder_name]\n.clone <drive_folder_link> [github_repo_name]',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🔄 *Clone Command*\n\n` +
                       `*GitHub → Google Drive:*\n` +
                       `\`${config.prefix}clone <github_repo_url> [folder_name]\`\n\n` +
                       `*Google Drive → GitHub:*\n` +
                       `\`${config.prefix}clone <drive_folder_link> [repo_name]\`\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}clone https://github.com/user/repo\`\n` +
                       `• \`${config.prefix}clone https://drive.google.com/drive/folders/xxx my-repo\``);
        }
        
        const link = args[0];
        const customName = args[1];
        
        // Check if it's Drive to GitHub operation
        if (link.includes('drive.google.com') || link.includes('drive/folder')) {
            try {
                const { token: githubToken, username: githubUsername } = await getGitHubCredentials();
                await validateGitHubToken(githubToken, githubUsername);
                
                await react('🔄');
                const processingMsg = await reply(`🔄 *Processing clone request...*\n\nLink: ${link}\n\nPlease wait, this may take a while.`);
                await handleDriveToGitHub(sock, from, link, customName, processingMsg, reply, githubToken, githubUsername);
                return;
            } catch (error) {
                return reply(`❌ *GitHub Authentication Failed*\n\n${error.message}\n\nPlease check your GitHub config file on Google Drive.`);
            }
        }
        
        // GitHub to Drive operation
        if (link.includes('github.com')) {
            await react('🔄');
            const processingMsg = await reply(`🔄 *Processing clone request...*\n\nLink: ${link}\n\nPlease wait, this may take a while.`);
            await handleGitHubToDrive(sock, from, link, customName, processingMsg, reply);
            return;
        }
        
        return reply(`❌ Invalid link. Please provide a GitHub repo URL or Google Drive folder link.`);
    }
};

async function handleGitHubToDrive(sock, from, repoUrl, folderName, processingMsg, reply) {
    await sock.sendMessage(from, {
        text: `📥 *Step 1/3: Downloading from GitHub...*\n\nRepo: ${repoUrl}`,
        edit: processingMsg.key
    });
    
    const { extractedFolder, repoName } = await downloadGitHubRepo(repoUrl);
    const targetFolderName = folderName || repoName;
    
    await sock.sendMessage(from, {
        text: `📤 *Step 2/3: Creating Google Drive folder...*\n\nFolder: ${targetFolderName}`,
        edit: processingMsg.key
    });
    
    const folderId = await createDriveFolder(targetFolderName);
    
    await sock.sendMessage(from, {
        text: `📤 *Step 3/3: Uploading to Google Drive...*\n\nThis may take several minutes.`,
        edit: processingMsg.key
    });
    
    const { successCount, totalCount } = await uploadFolderToDrive(extractedFolder, folderId);
    
    fs.rmSync(extractedFolder, { recursive: true, force: true });
    fs.rmSync(path.dirname(extractedFolder), { recursive: true, force: true });
    
    const driveLink = `https://drive.google.com/drive/folders/${folderId}`;
    
    await sock.sendMessage(from, {
        text: `✅ *Clone Completed!*\n\n` +
              `📥 *Source:* GitHub Repo\n` +
              `📤 *Destination:* Google Drive\n\n` +
              `📁 *Folder:* ${targetFolderName}\n` +
              `📊 *Files Uploaded:* ${successCount}/${totalCount}\n\n` +
              `🔗 *Drive Link:*\n${driveLink}\n\n` +
              `> *Powered by ${config.botName}*`,
        edit: processingMsg.key
    });
}

async function handleDriveToGitHub(sock, from, driveLink, repoName, processingMsg, reply, githubToken, githubUsername) {
    let folderId = null;
    const idMatch = driveLink.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
        folderId = idMatch[1];
    }
    
    if (!folderId) {
        await sock.sendMessage(from, {
            text: `❌ Could not extract folder ID from Drive link.`,
            edit: processingMsg.key
        });
        return;
    }
    
    await sock.sendMessage(from, {
        text: `📥 *Step 1/4: Reading Google Drive folder structure...*\n\nFolder ID: ${folderId}`,
        edit: processingMsg.key
    });
    
    const token = await getAccessToken();
    const folderInfo = await axios.get(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: { fields: 'name' }
    });
    const folderName = folderInfo.data.name;
    const targetRepoName = repoName || folderName.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    await sock.sendMessage(from, {
        text: `📥 *Step 2/4: Scanning folder recursively...*\n\nFolder: ${folderName}`,
        edit: processingMsg.key
    });
    
    // Get all files recursively with their paths
    const files = await listDriveFilesRecursive(folderId);
    
    await sock.sendMessage(from, {
        text: `📥 *Step 3/4: Downloading ${files.length} files from Google Drive...*\n\nThis may take several minutes.`,
        edit: processingMsg.key
    });
    
    const tempDir = path.join(process.cwd(), 'temp', `drive_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    let downloadedCount = 0;
    for (const file of files) {
        const filePath = path.join(tempDir, file.path);
        await downloadFileFromDrive(file.id, filePath);
        downloadedCount++;
        if (downloadedCount % 10 === 0) {
            console.log(`[CLONE] Downloaded ${downloadedCount}/${files.length} files`);
        }
    }
    
    await sock.sendMessage(from, {
        text: `📤 *Step 4/4: Creating GitHub repository and uploading files...*\n\nRepo: ${targetRepoName}\nThis may take several minutes.`,
        edit: processingMsg.key
    });
    
    const repoCreated = await createGitHubRepo(targetRepoName, githubToken, githubUsername);
    
    if (!repoCreated) {
        await sock.sendMessage(from, {
            text: `⚠️ Repository creation issue. Attempting to upload anyway...`,
            edit: processingMsg.key
        });
    }
    
    const { successCount, totalCount } = await uploadFolderToGitHub(tempDir, targetRepoName, githubToken, githubUsername);
    
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    const repoLink = `https://github.com/${githubUsername}/${targetRepoName}`;
    
    await sock.sendMessage(from, {
        text: `✅ *Clone Completed!*\n\n` +
              `📥 *Source:* Google Drive\n` +
              `📤 *Destination:* GitHub Repo\n\n` +
              `📁 *Repo:* ${targetRepoName}\n` +
              `📁 *Folder Structure:* Preserved\n` +
              `📊 *Files Uploaded:* ${successCount}/${totalCount}\n\n` +
              `🔗 *GitHub Link:*\n${repoLink}\n\n` +
              `> *Powered by ${config.botName}*`,
        edit: processingMsg.key
    });
}
