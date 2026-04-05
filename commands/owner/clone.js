/**
 * Clone Command - Clone between GitHub Repo and Google Drive Folder
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const FormData = require('form-data');
const { google } = require('googleapis');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Google Drive Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

// GitHub Configuration
const GITHUB_TOKEN = "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";
const GITHUB_USERNAME = "ssccoouutt";

let cachedToken = null;
let tokenExpiry = null;

// ==================== GOOGLE DRIVE FUNCTIONS ====================

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

async function uploadFileToDrive(filePath, fileName, folderId = null) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
        const fileBuffer = fs.readFileSync(filePath);
        const stats = fs.statSync(filePath);
        
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

async function listDriveFiles(folderId) {
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
        
        return response.data.files || [];
        
    } catch (error) {
        console.error('[CLONE] List files failed:', error.message);
        throw error;
    }
}

async function downloadFileFromDrive(fileId, filePath) {
    try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token');
        
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

// ==================== GITHUB FUNCTIONS ====================

async function createGitHubRepo(repoName) {
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
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        return response.status === 201;
        
    } catch (error) {
        if (error.response?.status === 422) {
            console.log('[CLONE] Repo already exists');
            return true;
        }
        console.error('[CLONE] Create repo failed:', error.message);
        return false;
    }
}

async function uploadFileToGitHub(repoName, filePath, githubPath) {
    try {
        const content = fs.readFileSync(filePath);
        const base64Content = content.toString('base64');
        
        const response = await axios.put(
            `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/${githubPath}`,
            {
                message: `Add ${githubPath}`,
                content: base64Content
            },
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        return response.status === 201 || response.status === 200;
        
    } catch (error) {
        console.error(`[CLONE] Upload to GitHub failed for ${githubPath}:`, error.message);
        return false;
    }
}

async function downloadGitHubRepo(repoUrl) {
    try {
        // Format: https://github.com/username/repo
        const repoPath = repoUrl.replace('https://github.com/', '').replace('.git', '').replace(/\/$/, '');
        const repoName = repoPath.split('/').pop();
        
        // Try main branch first, then master
        let downloadUrl = `https://github.com/${repoPath}/archive/refs/heads/main.zip`;
        let response = await axios.head(downloadUrl).catch(() => null);
        
        if (!response || response.status !== 200) {
            downloadUrl = `https://github.com/${repoPath}/archive/refs/heads/master.zip`;
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
        
        // Extract zip
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
        
        // Find the actual extracted folder (it will be repo-name-main or repo-name-master)
        const subDirs = fs.readdirSync(extractDir);
        const extractedFolder = path.join(extractDir, subDirs[0]);
        
        // Clean up zip
        fs.unlinkSync(zipPath);
        
        return { extractedFolder, repoName };
        
    } catch (error) {
        console.error('[CLONE] Download GitHub repo failed:', error.message);
        throw error;
    }
}

async function uploadFolderToGitHub(localPath, repoName, basePath = '') {
    const items = fs.readdirSync(localPath);
    let successCount = 0;
    let totalCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(localPath, item);
        const relativePath = basePath ? path.join(basePath, item) : item;
        const githubPath = relativePath.replace(/\\/g, '/');
        
        if (fs.statSync(itemPath).isDirectory()) {
            totalCount += await uploadFolderToGitHub(itemPath, repoName, relativePath);
        } else {
            totalCount++;
            const uploaded = await uploadFileToGitHub(repoName, itemPath, githubPath);
            if (uploaded) successCount++;
            console.log(`[CLONE] Uploaded: ${githubPath}`);
        }
    }
    
    return { successCount, totalCount };
}

async function uploadFolderToDrive(localPath, parentFolderId = null) {
    const items = fs.readdirSync(localPath);
    let successCount = 0;
    let totalCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(localPath, item);
        
        if (fs.statSync(itemPath).isDirectory()) {
            const folderId = await createDriveFolder(item, parentFolderId);
            const result = await uploadFolderToDrive(itemPath, folderId);
            successCount += result.successCount;
            totalCount += result.totalCount;
        } else {
            totalCount++;
            try {
                await uploadFileToDrive(itemPath, item, parentFolderId);
                successCount++;
                console.log(`[CLONE] Uploaded to Drive: ${item}`);
            } catch (error) {
                console.error(`[CLONE] Failed to upload ${item}:`, error.message);
            }
        }
    }
    
    return { successCount, totalCount };
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'clone',
    aliases: [],
    description: 'Clone between GitHub repo and Google Drive folder',
    usage: '.clone <github_repo_url> [drive_folder_name]\n.clone <drive_folder_link> [github_repo_name]',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🔄 *Clone Command*\n\n` +
                       `*GitHub → Google Drive:*\n` +
                       `\`${config.prefix}clone https://github.com/user/repo [folder_name]\`\n\n` +
                       `*Google Drive → GitHub:*\n` +
                       `\`${config.prefix}clone https://drive.google.com/drive/folders/xxx [repo_name]\`\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}clone https://github.com/ssccoouutt/KnightBot-Mini\`\n` +
                       `• \`${config.prefrefix}clone https://drive.google.com/drive/folders/xxx my-repo\``);
        }
        
        const link = args[0];
        const customName = args[1];
        
        await react('🔄');
        const processingMsg = await reply(`🔄 *Processing clone request...*\n\nLink: ${link}\n\nPlease wait, this may take a while.`);
        
        try {
            // Check if it's a GitHub URL
            if (link.includes('github.com')) {
                await handleGitHubToDrive(sock, from, link, customName, processingMsg, reply);
            }
            // Check if it's a Google Drive URL
            else if (link.includes('drive.google.com') || link.includes('drive/folder')) {
                await handleDriveToGitHub(sock, from, link, customName, processingMsg, reply);
            }
            else {
                await sock.sendMessage(from, {
                    text: `❌ Invalid link. Please provide a GitHub repo URL or Google Drive folder link.`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
            
        } catch (error) {
            console.error('[CLONE] Error:', error);
            await sock.sendMessage(from, {
                text: `❌ Clone failed: ${error.message}`,
                edit: processingMsg.key
            });
            await react('❌');
        }
    }
};

async function handleGitHubToDrive(sock, from, repoUrl, folderName, processingMsg, reply) {
    await sock.sendMessage(from, {
        text: `📥 *Step 1/3: Downloading from GitHub...*\n\nRepo: ${repoUrl}`,
        edit: processingMsg.key
    });
    
    // Download GitHub repo
    const { extractedFolder, repoName } = await downloadGitHubRepo(repoUrl);
    const targetFolderName = folderName || repoName;
    
    await sock.sendMessage(from, {
        text: `📤 *Step 2/3: Creating Google Drive folder...*\n\nFolder: ${targetFolderName}`,
        edit: processingMsg.key
    });
    
    // Create Drive folder
    const folderId = await createDriveFolder(targetFolderName);
    
    await sock.sendMessage(from, {
        text: `📤 *Step 3/3: Uploading to Google Drive...*\n\nThis may take several minutes.`,
        edit: processingMsg.key
    });
    
    // Upload to Drive
    const { successCount, totalCount } = await uploadFolderToDrive(extractedFolder, folderId);
    
    // Clean up temp files
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

async function handleDriveToGitHub(sock, from, driveLink, repoName, processingMsg, reply) {
    // Extract folder ID from Drive link
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
        text: `📥 *Step 1/4: Reading Google Drive folder...*\n\nFolder ID: ${folderId}`,
        edit: processingMsg.key
    });
    
    // Get folder name
    const token = await getAccessToken();
    const folderInfo = await axios.get(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: { fields: 'name' }
    });
    const folderName = folderInfo.data.name;
    const targetRepoName = repoName || folderName;
    
    await sock.sendMessage(from, {
        text: `📥 *Step 2/4: Downloading from Google Drive...*\n\nFolder: ${folderName}`,
        edit: processingMsg.key
    });
    
    // Create temp directory for Drive files
    const tempDir = path.join(process.cwd(), 'temp', `drive_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Download all files from Drive folder
    const files = await listDriveFiles(folderId);
    let downloadedCount = 0;
    
    for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            // Skip folders for now (simplified version)
            continue;
        }
        
        const filePath = path.join(tempDir, file.name);
        await downloadFileFromDrive(file.id, filePath);
        downloadedCount++;
        console.log(`[CLONE] Downloaded: ${file.name}`);
    }
    
    await sock.sendMessage(from, {
        text: `📤 *Step 3/4: Creating GitHub repository...*\n\nRepo: ${targetRepoName}`,
        edit: processingMsg.key
    });
    
    // Create GitHub repo
    const repoCreated = await createGitHubRepo(targetRepoName);
    
    if (!repoCreated) {
        await sock.sendMessage(from, {
            text: `⚠️ Repository already exists or could not be created. Continuing with upload...`,
            edit: processingMsg.key
        });
    }
    
    await sock.sendMessage(from, {
        text: `📤 *Step 4/4: Uploading to GitHub...*\n\nThis may take several minutes.`,
        edit: processingMsg.key
    });
    
    // Upload to GitHub
    const { successCount, totalCount } = await uploadFolderToGitHub(tempDir, targetRepoName);
    
    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    const repoLink = `https://github.com/${GITHUB_USERNAME}/${targetRepoName}`;
    
    await sock.sendMessage(from, {
        text: `✅ *Clone Completed!*\n\n` +
              `📥 *Source:* Google Drive\n` +
              `📤 *Destination:* GitHub Repo\n\n` +
              `📁 *Repo:* ${targetRepoName}\n` +
              `📊 *Files Uploaded:* ${successCount}/${totalCount}\n\n` +
              `🔗 *GitHub Link:*\n${repoLink}\n\n` +
              `> *Powered by ${config.botName}*`,
        edit: processingMsg.key
    });
}
