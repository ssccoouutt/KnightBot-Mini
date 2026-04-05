/**
 * Audit Command - Search through GitHub repository files with replace functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons, sendInteractiveMessage } = giftedBtns;

// Force AI mode ON for gifted buttons
const FORCE_AI_MODE = true;

// Google Drive Configuration for GitHub token
const GITHUB_CONFIG_FILE_ID = "1EUSHauprcg3at2vAONYXelJuHHMBZq2b";
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";

let cachedToken = null;
let tokenExpiry = null;
let cachedGitHubToken = null;
let cachedGitHubUsername = null;
let githubTokenExpiry = null;

// ==================== TOKEN FUNCTIONS ====================

async function getAccessToken() {
    try {
        if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
            return cachedToken;
        }
        
        console.log('[AUDIT] Fetching Google Drive token...');
        
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
            console.log('[AUDIT] Token expired, refreshing...');
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
        console.error('[AUDIT] Failed to get Google Drive token:', error.message);
        return null;
    }
}

async function getGitHubCredentials() {
    if (cachedGitHubToken && githubTokenExpiry && new Date() < githubTokenExpiry) {
        return { token: cachedGitHubToken, username: cachedGitHubUsername };
    }
    
    try {
        console.log('[AUDIT] Fetching GitHub credentials from Google Drive...');
        
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
        
        console.log('[AUDIT] GitHub credentials loaded successfully');
        return { token: githubToken, username: githubUsername };
        
    } catch (error) {
        console.error('[AUDIT] Failed to get GitHub credentials:', error.message);
        throw new Error(`Failed to load GitHub credentials: ${error.message}`);
    }
}

// ==================== GITHUB REPO FUNCTIONS ====================

async function downloadGitHubRepo(repoUrl, onProgress) {
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
        
        console.log(`[AUDIT] Downloading from: ${downloadUrl}`);
        if (onProgress) onProgress('Downloading repository...');
        
        const zipResponse = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 120000
        });
        
        const tempDir = path.join(process.cwd(), 'temp', `audit_${Date.now()}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const zipPath = path.join(tempDir, `${repoName}.zip`);
        const writer = fs.createWriteStream(zipPath);
        zipResponse.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        if (onProgress) onProgress('Extracting files...');
        
        const extractDir = path.join(tempDir, `${repoName}_extracted`);
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
        
        return { extractedFolder, repoName, tempDir };
        
    } catch (error) {
        console.error('[AUDIT] Download GitHub repo failed:', error.message);
        throw error;
    }
}

async function searchInFile(filePath, searchTerm, isCaseSensitive = false) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const results = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let found = false;
            let matchText = '';
            
            if (isCaseSensitive) {
                if (line.includes(searchTerm)) {
                    found = true;
                    matchText = line;
                }
            } else {
                if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
                    found = true;
                    matchText = line;
                }
            }
            
            if (found) {
                results.push({
                    lineNumber: i + 1,
                    line: matchText,
                    preview: matchText.substring(0, 100).trim()
                });
            }
        }
        
        return results;
    } catch (error) {
        return null;
    }
}

async function replaceInFile(filePath, searchTerm, replaceTerm, isCaseSensitive = false) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let newContent;
        let replaceCount = 0;
        
        if (isCaseSensitive) {
            const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const matches = content.match(regex);
            replaceCount = matches ? matches.length : 0;
            newContent = content.replace(regex, replaceTerm);
        } else {
            const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = content.match(regex);
            replaceCount = matches ? matches.length : 0;
            newContent = content.replace(regex, replaceTerm);
        }
        
        if (replaceCount > 0) {
            fs.writeFileSync(filePath, newContent, 'utf8');
        }
        
        return replaceCount;
    } catch (error) {
        return 0;
    }
}

async function searchDirectory(dirPath, searchTerm, fileExtensions = null, isCaseSensitive = false, onProgress) {
    const results = [];
    const items = fs.readdirSync(dirPath);
    let processedCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            const subResults = await searchDirectory(itemPath, searchTerm, fileExtensions, isCaseSensitive, onProgress);
            results.push(...subResults);
        } else {
            processedCount++;
            if (onProgress && processedCount % 10 === 0) {
                onProgress(`Searching... (${processedCount} files processed)`);
            }
            
            // Check file extension filter
            const ext = path.extname(item).toLowerCase();
            if (fileExtensions && fileExtensions.length > 0 && !fileExtensions.includes(ext)) {
                continue;
            }
            
            // Only search text files
            const textExtensions = ['.txt', '.js', '.json', '.md', '.py', '.html', '.css', '.xml', '.yml', '.yaml', '.cfg', '.conf', '.ini', '.log', '.sh', '.bat', '.ps1'];
            if (!textExtensions.includes(ext) && fileExtensions === null) {
                continue;
            }
            
            const fileResults = await searchInFile(itemPath, searchTerm, isCaseSensitive);
            if (fileResults && fileResults.length > 0) {
                results.push({
                    file: itemPath,
                    fileName: item,
                    relativePath: itemPath,
                    matches: fileResults
                });
            }
        }
    }
    
    return results;
}

async function replaceInDirectory(dirPath, searchTerm, replaceTerm, fileExtensions = null, isCaseSensitive = false, onProgress) {
    const items = fs.readdirSync(dirPath);
    let totalReplacements = 0;
    let affectedFiles = 0;
    let processedCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            const result = await replaceInDirectory(itemPath, searchTerm, replaceTerm, fileExtensions, isCaseSensitive, onProgress);
            totalReplacements += result.totalReplacements;
            affectedFiles += result.affectedFiles;
        } else {
            processedCount++;
            if (onProgress && processedCount % 10 === 0) {
                onProgress(`Replacing... (${processedCount} files processed, ${totalReplacements} replacements so far)`);
            }
            
            // Check file extension filter
            const ext = path.extname(item).toLowerCase();
            if (fileExtensions && fileExtensions.length > 0 && !fileExtensions.includes(ext)) {
                continue;
            }
            
            const textExtensions = ['.txt', '.js', '.json', '.md', '.py', '.html', '.css', '.xml', '.yml', '.yaml', '.cfg', '.conf', '.ini', '.log', '.sh', '.bat', '.ps1'];
            if (!textExtensions.includes(ext) && fileExtensions === null) {
                continue;
            }
            
            const replacements = await replaceInFile(itemPath, searchTerm, replaceTerm, isCaseSensitive);
            if (replacements > 0) {
                totalReplacements += replacements;
                affectedFiles++;
                console.log(`[AUDIT] Replaced ${replacements} occurrence(s) in ${item}`);
            }
        }
    }
    
    return { totalReplacements, affectedFiles };
}

async function uploadChangesToGitHub(repoPath, repoName, commitMessage, token, username) {
    try {
        const items = fs.readdirSync(repoPath);
        let successCount = 0;
        let totalCount = 0;
        
        for (const item of items) {
            const itemPath = path.join(repoPath, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                const result = await uploadFolderToGitHub(itemPath, repoName, token, username, item);
                successCount += result.successCount;
                totalCount += result.totalCount;
            } else {
                totalCount++;
                const relativePath = item;
                const content = fs.readFileSync(itemPath, 'utf8');
                const base64Content = Buffer.from(content).toString('base64');
                
                try {
                    // Check if file exists
                    let sha = null;
                    try {
                        const checkResponse = await axios.get(
                            `https://api.github.com/repos/${username}/${repoName}/contents/${relativePath}`,
                            {
                                headers: { 'Authorization': `token ${token}` }
                            }
                        );
                        if (checkResponse.data && checkResponse.data.sha) {
                            sha = checkResponse.data.sha;
                        }
                    } catch (e) {}
                    
                    await axios.put(
                        `https://api.github.com/repos/${username}/${repoName}/contents/${relativePath}`,
                        {
                            message: commitMessage,
                            content: base64Content,
                            sha: sha
                        },
                        {
                            headers: {
                                'Authorization': `token ${token}`,
                                'Accept': 'application/vnd.github.v3+json'
                            }
                        }
                    );
                    successCount++;
                    console.log(`[AUDIT] ✅ Uploaded: ${relativePath}`);
                } catch (error) {
                    console.error(`[AUDIT] ❌ Failed to upload ${relativePath}:`, error.message);
                }
            }
        }
        
        return { successCount, totalCount };
        
    } catch (error) {
        console.error('[AUDIT] Upload failed:', error.message);
        return { successCount: 0, totalCount: 0 };
    }
}

async function uploadFolderToGitHub(localPath, repoName, token, username, basePath = '') {
    const items = fs.readdirSync(localPath);
    let successCount = 0;
    let totalCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(localPath, item);
        const relativePath = basePath ? `${basePath}/${item}` : item;
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            const result = await uploadFolderToGitHub(itemPath, repoName, token, username, relativePath);
            successCount += result.successCount;
            totalCount += result.totalCount;
        } else {
            totalCount++;
            const content = fs.readFileSync(itemPath, 'utf8');
            const base64Content = Buffer.from(content).toString('base64');
            
            try {
                let sha = null;
                try {
                    const checkResponse = await axios.get(
                        `https://api.github.com/repos/${username}/${repoName}/contents/${relativePath}`,
                        { headers: { 'Authorization': `token ${token}` } }
                    );
                    if (checkResponse.data && checkResponse.data.sha) {
                        sha = checkResponse.data.sha;
                    }
                } catch (e) {}
                
                await axios.put(
                    `https://api.github.com/repos/${username}/${repoName}/contents/${relativePath}`,
                    {
                        message: `Update ${relativePath}`,
                        content: base64Content,
                        sha: sha
                    },
                    { headers: { 'Authorization': `token ${token}` } }
                );
                successCount++;
            } catch (error) {
                console.error(`[AUDIT] Failed to upload ${relativePath}:`, error.message);
            }
        }
    }
    
    return { successCount, totalCount };
}

function formatResults(results, searchTerm) {
    if (results.length === 0) {
        return `🔍 *No results found for "${searchTerm}"*\n\nTry different search term or check case sensitivity.`;
    }
    
    let output = `🔍 *Search Results for "${searchTerm}"*\n\n`;
    output += `📊 *Found in ${results.length} file(s)*\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (let i = 0; i < Math.min(results.length, 15); i++) {
        const result = results[i];
        const fileName = path.basename(result.file);
        const relativePath = result.relativePath;
        
        output += `📄 *${fileName}*\n`;
        output += `└ 📁 \`${relativePath}\`\n`;
        output += `└ 🎯 *${result.matches.length} match(es)*\n`;
        
        const previewCount = Math.min(result.matches.length, 3);
        for (let j = 0; j < previewCount; j++) {
            const match = result.matches[j];
            const linePreview = match.preview.length > 80 ? match.preview.substring(0, 80) + '...' : match.preview;
            output += `   └ 📍 Line ${match.lineNumber}: \`${linePreview}\`\n`;
        }
        
        if (result.matches.length > 3) {
            output += `   └ ... and ${result.matches.length - 3} more matches\n`;
        }
        
        output += `\n`;
    }
    
    if (results.length > 15) {
        output += `*... and ${results.length - 15} more files*\n\n`;
    }
    
    output += `💡 Use \`.audit export\` to get full results file.\n`;
    output += `💡 Use \`.audit replace <search> <replace>\` to replace text in files.`;
    
    return output;
}

function formatReplaceResults(totalReplacements, affectedFiles) {
    if (totalReplacements === 0) {
        return `🔍 *No replacements made*\n\nNo occurrences of the search term were found.`;
    }
    
    return `✅ *Replacements Complete*\n\n` +
           `📊 *Total Replacements:* ${totalReplacements}\n` +
           `📁 *Affected Files:* ${affectedFiles}\n\n` +
           `💡 The changes have been applied to your local copy.\n` +
           `💡 Use \`.audit push <commit message>\` to upload changes to GitHub.`;
}

// ==================== BUTTON HANDLER ====================

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply) {
    console.log(`[AUDIT] Handling button: ${buttonId}`);
    
    const session = sessionManager.getLatestSession(sender, from);
    
    if (!session || session.command !== 'audit') {
        console.log(`[AUDIT] No active audit session for ${sender}`);
        return false;
    }
    
    if (buttonId === 'export_results') {
        await exportSearchResults(sock, from, sender, reply, session);
        return true;
    }
    
    if (buttonId === 'case_sensitive') {
        const newState = !session.data.caseSensitive;
        sessionManager.updateSession(sender, from, { caseSensitive: newState });
        await showSearchOptions(sock, from, sender, reply, session);
        return true;
    }
    
    if (buttonId === 'clear_repo') {
        if (session.data.tempDir && fs.existsSync(session.data.tempDir)) {
            fs.rmSync(session.data.tempDir, { recursive: true, force: true });
        }
        sessionManager.clearSession(session.id);
        await reply(`✅ Repository cleared from memory.`);
        return true;
    }
    
    if (buttonId === 'start_replace') {
        sessionManager.updateSession(sender, from, { waitingForReplace: true, replaceSearchTerm: session.data.lastSearchTerm });
        await reply(`🔧 *Replace Mode*\n\nSearching for: \`${session.data.lastSearchTerm}\`\n\nPlease send the text you want to replace it with.\n\nType \`cancel\` to cancel.`);
        return true;
    }
    
    if (buttonId && buttonId.startsWith('search_')) {
        return false;
    }
    
    return false;
}

async function showSearchOptions(sock, from, sender, reply, session) {
    const sessionId = session.id.split(':').pop();
    const hasResults = session.data.searchResults && session.data.searchResults.length > 0;
    
    const buttons = [
        { id: `search_${sessionId}`, text: '🔍 New Search' },
        { id: 'export_results', text: '📄 Export Results' }
    ];
    
    if (hasResults) {
        buttons.push({ id: 'start_replace', text: '✏️ Replace Text' });
    }
    
    buttons.push({ id: 'case_sensitive', text: session.data.caseSensitive ? '🔒 Case: ON' : '🔓 Case: OFF' });
    buttons.push({ id: 'clear_repo', text: '🗑️ Clear Repository' });
    
    const sentMsg = await sendButtons(sock, from, {
        text: `🔍 *Search Options*\n\n` +
              `📁 *Repo:* ${session.data.repoName}\n` +
              `🔒 *Case Sensitive:* ${session.data.caseSensitive ? 'ON' : 'OFF'}\n` +
              `${hasResults ? `📊 *Last Search:* "${session.data.lastSearchTerm}" (${session.data.searchResults.length} files)\n` : ''}\n` +
              `Send me the word/phrase you want to search for, or adjust options below.`,
        footer: 'Audit Tool',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
    sessionManager.updateSession(sender, from, { waitingForSearch: true });
}

async function exportSearchResults(sock, from, sender, reply, session) {
    const results = session.data.searchResults;
    const searchTerm = session.data.lastSearchTerm;
    
    if (!results || results.length === 0) {
        await reply(`❌ No search results to export. Please perform a search first.`);
        return;
    }
    
    await reply(`📄 *Exporting results...*`);
    
    let exportContent = `Search Results for "${searchTerm}"\n`;
    exportContent += `Repository: ${session.data.repoName}\n`;
    exportContent += `Date: ${new Date().toLocaleString()}\n`;
    exportContent += `Case Sensitive: ${session.data.caseSensitive ? 'Yes' : 'No'}\n`;
    exportContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const result of results) {
        exportContent += `📄 File: ${result.fileName}\n`;
        exportContent += `📍 Path: ${result.relativePath}\n`;
        exportContent += `🎯 Matches: ${result.matches.length}\n`;
        exportContent += `─────────────────────────────────────────────────\n`;
        
        for (const match of result.matches) {
            exportContent += `  Line ${match.lineNumber}: ${match.line}\n`;
        }
        exportContent += `\n`;
    }
    
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const filename = `audit_results_${searchTerm.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
    const filepath = path.join(tempDir, filename);
    fs.writeFileSync(filepath, exportContent);
    
    await sock.sendMessage(from, {
        document: fs.readFileSync(filepath),
        mimetype: 'text/plain',
        fileName: filename,
        caption: `📄 *Search Results Export*\n\n` +
                 `🔍 *Term:* ${searchTerm}\n` +
                 `📊 *Files Found:* ${results.length}\n` +
                 `📁 *Repo:* ${session.data.repoName}\n\n` +
                 `> *Exported by ${config.botName}*`
    });
    
    fs.unlinkSync(filepath);
    
    await reply(`✅ Results exported successfully!`);
}

async function performSearch(sock, from, sender, reply, react, session, searchTerm) {
    await react('🔍');
    const processingMsg = await reply(`🔍 *Searching for "${searchTerm}"...*\n\nPlease wait...`);
    
    try {
        const isCaseSensitive = session.data.caseSensitive || false;
        const fileExtensions = session.data.fileExtensions ? session.data.fileExtensions.split(',') : null;
        
        const results = await searchDirectory(session.data.extractedFolder, searchTerm, fileExtensions, isCaseSensitive, (msg) => {
            sock.sendMessage(from, { text: `🔍 *${msg}*`, edit: processingMsg.key }).catch(() => {});
        });
        
        const formattedResults = formatResults(results, searchTerm);
        
        sessionManager.updateSession(sender, from, {
            searchResults: results,
            lastSearchTerm: searchTerm,
            waitingForReplace: false
        });
        
        await sock.sendMessage(from, {
            text: formattedResults,
            edit: processingMsg.key
        });
        
        await showSearchOptions(sock, from, sender, reply, session);
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Search failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function performReplace(sock, from, sender, reply, react, session, searchTerm, replaceTerm) {
    await react('✏️');
    const processingMsg = await reply(`✏️ *Replacing "${searchTerm}" with "${replaceTerm}"...*\n\nThis may take a while...`);
    
    try {
        const isCaseSensitive = session.data.caseSensitive || false;
        const fileExtensions = session.data.fileExtensions ? session.data.fileExtensions.split(',') : null;
        
        const { totalReplacements, affectedFiles } = await replaceInDirectory(
            session.data.extractedFolder, searchTerm, replaceTerm, fileExtensions, isCaseSensitive,
            (msg) => {
                sock.sendMessage(from, { text: `✏️ *${msg}*`, edit: processingMsg.key }).catch(() => {});
            }
        );
        
        const formattedResults = formatReplaceResults(totalReplacements, affectedFiles);
        
        sessionManager.updateSession(sender, from, {
            hasChanges: totalReplacements > 0,
            replaceCount: totalReplacements,
            affectedFiles: affectedFiles,
            lastReplaceSearch: searchTerm,
            lastReplaceTerm: replaceTerm
        });
        
        const sessionId = session.id.split(':').pop();
        
        let resultText = formattedResults;
        if (totalReplacements > 0) {
            resultText += `\n\n📤 *Push to GitHub:*\nUse \`.audit push "Commit message"\` to upload changes to GitHub.`;
        }
        
        const buttons = [
            { id: `search_${sessionId}`, text: '🔍 New Search' },
            { id: 'export_results', text: '📄 Export Results' },
            { id: 'clear_repo', text: '🗑️ Clear Repository' }
        ];
        
        await sock.sendMessage(from, {
            text: resultText,
            edit: processingMsg.key
        });
        
        const sentMsg = await sendButtons(sock, from, {
            text: resultText + '\n\nWhat would you like to do next?',
            footer: 'Audit Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Replace failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function pushToGitHub(sock, from, sender, reply, react, session, commitMessage) {
    await react('📤');
    const processingMsg = await reply(`📤 *Pushing changes to GitHub...*\n\nCommit: ${commitMessage}\n\nPlease wait...`);
    
    try {
        const { token, username } = await getGitHubCredentials();
        const repoName = session.data.repoName;
        const extractedFolder = session.data.extractedFolder;
        
        // Find the root folder name (the repo name folder)
        const rootItems = fs.readdirSync(extractedFolder);
        const repoRoot = path.join(extractedFolder, rootItems[0]);
        
        const { successCount, totalCount } = await uploadFolderToGitHub(repoRoot, repoName, token, username);
        
        if (successCount > 0) {
            await sock.sendMessage(from, {
                text: `✅ *Changes Pushed to GitHub!*\n\n` +
                      `📁 *Repo:* ${repoName}\n` +
                      `📊 *Files Updated:* ${successCount}/${totalCount}\n` +
                      `💬 *Commit:* ${commitMessage}\n\n` +
                      `🔗 *GitHub Link:*\nhttps://github.com/${username}/${repoName}\n\n` +
                      `> *Powered by ${config.botName}*`,
                edit: processingMsg.key
            });
            await react('✅');
        } else {
            await sock.sendMessage(from, {
                text: `❌ *Failed to push changes*\n\nNo files were uploaded. Please check your GitHub token and try again.`,
                edit: processingMsg.key
            });
            await react('❌');
        }
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Push failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'audit',
    aliases: ['search', 'grep', 'find'],
    description: 'Search through GitHub repository files with replace functionality',
    usage: '.audit <github_repo_url>\n.audit <github_repo_url> <search_term>\n.audit search <search_term>\n.audit replace <search> <replace>\n.audit push <commit_message>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🔍 *Audit/Search Command*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}audit <github_repo_url>\` - Load repo for searching\n` +
                       `• \`${config.prefix}audit <github_repo_url> <search_term>\` - Search immediately\n` +
                       `• \`${config.prefix}audit search <term>\` - Search loaded repo\n` +
                       `• \`${config.prefix}audit replace <search> <replace>\` - Replace text in loaded repo\n` +
                       `• \`${config.prefix}audit push <commit_message>\` - Push changes to GitHub\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}audit https://github.com/user/repo\`\n` +
                       `• \`${config.prefix}audit https://github.com/user/repo telegram\`\n` +
                       `• \`${config.prefix}audit search api_key\`\n` +
                       `• \`${config.prefix}audit replace .com example.com\`\n` +
                       `• \`${config.prefix}audit push "Updated URLs"\``);
        }
        
        const firstArg = args[0];
        
        // Check if it's a GitHub URL
        if (firstArg.includes('github.com')) {
            const repoUrl = firstArg;
            const searchTerm = args[1];
            
            if (searchTerm) {
                await handleRepoLoadAndSearch(sock, from, sender, reply, react, repoUrl, searchTerm);
            } else {
                await handleRepoLoad(sock, from, sender, reply, react, repoUrl);
            }
            return;
        }
        
        // Get user's active audit session
        const session = sessionManager.getLatestSession(sender, from);
        
        if (!session || session.command !== 'audit' || !session.data.extractedFolder) {
            return reply(`❌ *No repository loaded*\n\nPlease load a repository first:\n\`${config.prefix}audit <github_repo_url>\``);
        }
        
        // Handle replace command
        if (firstArg === 'replace' && args.length >= 3) {
            const searchTerm = args[1];
            const replaceTerm = args.slice(2).join(' ');
            await performReplace(sock, from, sender, reply, react, session, searchTerm, replaceTerm);
            return;
        }
        
        // Handle push command
        if (firstArg === 'push') {
            const commitMessage = args.slice(1).join(' ') || 'Updated files via audit command';
            
            if (!session.data.hasChanges) {
                return reply(`⚠️ *No changes to push*\n\nNo replacements have been made yet. Use \`.audit replace\` first.`);
            }
            
            await pushToGitHub(sock, from, sender, reply, react, session, commitMessage);
            return;
        }
        
        // Handle search command
        if (firstArg === 'search' && args[1]) {
            const searchTerm = args[1];
            await performSearch(sock, from, sender, reply, react, session, searchTerm);
            return;
        }
        
        return reply(`❌ Invalid usage. Use \`.audit help\` for more information.`);
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
                const handled = await handleButtonClick(sock, msg, buttonId, buttonText, from, sender, (text) => sock.sendMessage(from, { text }, { quoted: msg }));
                if (handled) {
                    return true;
                }
            }
            return true;
        }
        
        // Handle text input
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation.trim();
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.trim();
        }
        
        if (!text) return true;
        
        if (text.toLowerCase() === 'cancel') {
            sessionManager.updateSession(sender, from, { waitingForSearch: false, waitingForReplace: false });
            await reply(`❌ Operation cancelled.`);
            return true;
        }
        
        // Handle replace text input
        if (session.data.waitingForReplace && session.data.replaceSearchTerm) {
            sessionManager.updateSession(sender, from, { waitingForReplace: false });
            await performReplace(sock, from, sender, reply, react, session, session.data.replaceSearchTerm, text);
            return true;
        }
        
        // Handle search text input
        if (session.data.waitingForSearch) {
            sessionManager.updateSession(sender, from, { waitingForSearch: false, pendingSearch: text });
            await performSearch(sock, from, sender, reply, react, session, text);
            return true;
        }
        
        return true;
    }
};

// Export the button handler
module.exports.handleButtonClick = handleButtonClick;

// ==================== HELPER FUNCTIONS ====================

async function handleRepoLoad(sock, from, sender, reply, react, repoUrl) {
    await react('📥');
    const processingMsg = await reply(`🔄 *Loading repository...*\n\nRepo: ${repoUrl}\n\nPlease wait, downloading...`);
    
    try {
        await getGitHubCredentials();
        
        const updateProgress = (msg) => {
            sock.sendMessage(from, { text: `🔄 *${msg}*`, edit: processingMsg.key }).catch(() => {});
        };
        
        const { extractedFolder, repoName, tempDir } = await downloadGitHubRepo(repoUrl, updateProgress);
        
        const session = sessionManager.createSession(sender, from, 'audit', {
            repoUrl: repoUrl,
            repoName: repoName,
            extractedFolder: extractedFolder,
            tempDir: tempDir,
            caseSensitive: false,
            fileExtensions: null,
            searchResults: null,
            waitingForSearch: false,
            waitingForReplace: false,
            pendingSearch: null,
            hasChanges: false
        });
        
        await sock.sendMessage(from, {
            text: `✅ *Repository Loaded Successfully!*\n\n📁 *Repo:* ${repoName}\n📊 *Status:* Ready for search\n\nWhat would you like to do?`,
            edit: processingMsg.key
        });
        
        await showSearchOptions(sock, from, sender, reply, session);
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Failed to load repository*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleRepoLoadAndSearch(sock, from, sender, reply, react, repoUrl, searchTerm) {
    await react('📥');
    const processingMsg = await reply(`🔄 *Loading repository and searching...*\n\nRepo: ${repoUrl}\nSearch: "${searchTerm}"\n\nPlease wait...`);
    
    try {
        await getGitHubCredentials();
        
        const updateProgress = (msg) => {
            sock.sendMessage(from, { text: `🔄 *${msg}*`, edit: processingMsg.key }).catch(() => {});
        };
        
        const { extractedFolder, repoName, tempDir } = await downloadGitHubRepo(repoUrl, updateProgress);
        
        updateProgress('Searching files...');
        
        const results = await searchDirectory(extractedFolder, searchTerm, null, false, updateProgress);
        
        const formattedResults = formatResults(results, searchTerm);
        
        const session = sessionManager.createSession(sender, from, 'audit', {
            repoUrl: repoUrl,
            repoName: repoName,
            extractedFolder: extractedFolder,
            tempDir: tempDir,
            caseSensitive: false,
            fileExtensions: null,
            searchResults: results,
            lastSearchTerm: searchTerm,
            waitingForSearch: false,
            waitingForReplace: false,
            hasChanges: false
        });
        
        await sock.sendMessage(from, {
            text: formattedResults,
            edit: processingMsg.key
        });
        
        await showSearchOptions(sock, from, sender, reply, session);
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}
