/**
 * Audit Command - Search through GitHub repository files with replace functionality
 * COMPLETE VERSION - Supports multiple replacement modes
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

// Replacement modes
const REPLACE_MODES = {
    EXACT: 'exact',
    WHOLE_WORD: 'whole_word',
    WHOLE_LINE: 'whole_line',
    REGEX: 'regex'
};

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
        
        fs.unlinkSync(zipPath);
        
        // Find the actual root directory
        let extractedFolder = extractDir;
        
        function findRepoRoot(dir, depth = 0) {
            if (depth > 5) return dir;
            
            const items = fs.readdirSync(dir);
            
            const hasGitDir = items.includes('.git');
            const hasPackageJson = items.includes('package.json');
            const hasRequirements = items.includes('requirements.txt');
            const hasReadme = items.some(i => i.toLowerCase().includes('readme'));
            
            if (hasGitDir || hasPackageJson || hasRequirements || hasReadme) {
                return dir;
            }
            
            const subDirs = items.filter(item => {
                const itemPath = path.join(dir, item);
                try {
                    return fs.statSync(itemPath).isDirectory();
                } catch {
                    return false;
                }
            });
            
            if (subDirs.length === 1) {
                const nextDir = path.join(dir, subDirs[0]);
                console.log(`[AUDIT] Descending into: ${nextDir}`);
                return findRepoRoot(nextDir, depth + 1);
            }
            
            return dir;
        }
        
        extractedFolder = findRepoRoot(extractDir);
        console.log(`[AUDIT] Repository root detected at: ${extractedFolder}`);
        
        return { extractedFolder, repoName, tempDir };
        
    } catch (error) {
        console.error('[AUDIT] Download GitHub repo failed:', error.message);
        throw error;
    }
}

// ==================== REPLACEMENT FUNCTIONS WITH MODES ====================

async function replaceInFileWithMode(filePath, searchTerm, replaceTerm, isCaseSensitive = false, mode = REPLACE_MODES.EXACT) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let newContent = content;
        let replaceCount = 0;
        
        if (mode === REPLACE_MODES.EXACT) {
            // Replace only exact search term
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
        } 
        else if (mode === REPLACE_MODES.WHOLE_WORD) {
            // Replace whole word that contains the search term
            const wordBoundary = isCaseSensitive ? 
                new RegExp(`\\b\\S*${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S*\\b`, 'g') :
                new RegExp(`\\b\\S*${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S*\\b`, 'gi');
            const matches = content.match(wordBoundary);
            replaceCount = matches ? matches.length : 0;
            newContent = content.replace(wordBoundary, replaceTerm);
        }
        else if (mode === REPLACE_MODES.WHOLE_LINE) {
            // Replace whole line that contains the search term
            const lines = content.split('\n');
            const newLines = [];
            
            for (const line of lines) {
                let found = false;
                if (isCaseSensitive) {
                    found = line.includes(searchTerm);
                } else {
                    found = line.toLowerCase().includes(searchTerm.toLowerCase());
                }
                
                if (found) {
                    newLines.push(replaceTerm);
                    replaceCount++;
                } else {
                    newLines.push(line);
                }
            }
            
            newContent = newLines.join('\n');
        }
        else if (mode === REPLACE_MODES.REGEX) {
            // Use custom regex pattern
            try {
                const flags = isCaseSensitive ? 'g' : 'gi';
                const regex = new RegExp(searchTerm, flags);
                const matches = content.match(regex);
                replaceCount = matches ? matches.length : 0;
                newContent = content.replace(regex, replaceTerm);
            } catch (e) {
                console.error(`[AUDIT] Invalid regex pattern: ${searchTerm}`);
                return { replaceCount: 0, changed: false };
            }
        }
        
        if (replaceCount > 0) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            return { replaceCount, changed: true };
        }
        
        return { replaceCount: 0, changed: false };
    } catch (error) {
        console.error(`[AUDIT] Error replacing in ${filePath}:`, error.message);
        return { replaceCount: 0, changed: false };
    }
}

async function replaceInDirectoryWithMode(dirPath, searchTerm, replaceTerm, isCaseSensitive = false, mode = REPLACE_MODES.EXACT, onProgress, modifiedFilesList, specificFiles = null) {
    let items;
    
    if (specificFiles && specificFiles.length > 0) {
        items = specificFiles;
    } else {
        if (!fs.existsSync(dirPath)) return { totalReplacements: 0, affectedFiles: 0 };
        items = fs.readdirSync(dirPath);
    }
    
    let totalReplacements = 0;
    let affectedFiles = 0;
    let processedCount = 0;
    
    for (const item of items) {
        const itemPath = specificFiles ? item : path.join(dirPath, item);
        
        try {
            if (!fs.existsSync(itemPath)) continue;
            
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                const result = await replaceInDirectoryWithMode(itemPath, searchTerm, replaceTerm, isCaseSensitive, mode, onProgress, modifiedFilesList, null);
                totalReplacements += result.totalReplacements;
                affectedFiles += result.affectedFiles;
            } else {
                processedCount++;
                if (onProgress && processedCount % 10 === 0) {
                    onProgress(`Replacing... (${processedCount} files processed, ${totalReplacements} replacements so far)`);
                }
                
                const ext = path.extname(itemPath).toLowerCase();
                const textExtensions = ['.txt', '.js', '.json', '.md', '.py', '.html', '.css', '.xml', '.yml', '.yaml', '.cfg', '.conf', '.ini', '.log', '.sh', '.bat', '.ps1'];
                if (!textExtensions.includes(ext)) continue;
                
                const { replaceCount, changed } = await replaceInFileWithMode(itemPath, searchTerm, replaceTerm, isCaseSensitive, mode);
                if (changed) {
                    totalReplacements += replaceCount;
                    affectedFiles++;
                    modifiedFilesList.push({
                        path: itemPath,
                        fileName: path.basename(itemPath),
                        replacements: replaceCount,
                        relativePath: itemPath
                    });
                }
            }
        } catch (error) {
            // Skip problematic files
        }
    }
    
    return { totalReplacements, affectedFiles };
}

// ==================== FILE SEARCH FUNCTIONS ====================

async function findFilesByName(dirPath, fileName, results = []) {
    if (!fs.existsSync(dirPath)) return results;
    
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return results;
    
    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            
            try {
                const itemStat = fs.statSync(itemPath);
                
                if (itemStat.isDirectory()) {
                    await findFilesByName(itemPath, fileName, results);
                } else if (item === fileName) {
                    results.push(itemPath);
                }
            } catch (err) {
                // Skip inaccessible files
            }
        }
    } catch (error) {
        // Skip directories that can't be read
    }
    
    return results;
}

async function searchInFile(filePath, searchTerm, isCaseSensitive = false) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const results = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let found = false;
            
            if (isCaseSensitive) {
                found = line.includes(searchTerm);
            } else {
                found = line.toLowerCase().includes(searchTerm.toLowerCase());
            }
            
            if (found) {
                results.push({
                    lineNumber: i + 1,
                    line: line,
                    preview: line
                });
            }
        }
        
        return results;
    } catch (error) {
        return null;
    }
}

async function searchDirectory(dirPath, searchTerm, isCaseSensitive = false, onProgress, specificFiles = null) {
    const results = [];
    let items;
    
    if (specificFiles && specificFiles.length > 0) {
        items = specificFiles;
    } else {
        if (!fs.existsSync(dirPath)) return results;
        items = fs.readdirSync(dirPath);
    }
    
    let processedCount = 0;
    
    for (const item of items) {
        const itemPath = specificFiles ? item : path.join(dirPath, item);
        
        try {
            if (!fs.existsSync(itemPath)) continue;
            
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                const subResults = await searchDirectory(itemPath, searchTerm, isCaseSensitive, onProgress, null);
                results.push(...subResults);
            } else {
                processedCount++;
                if (onProgress && processedCount % 10 === 0) {
                    onProgress(`Searching... (${processedCount} files processed)`);
                }
                
                const ext = path.extname(itemPath).toLowerCase();
                const textExtensions = ['.txt', '.js', '.json', '.md', '.py', '.html', '.css', '.xml', '.yml', '.yaml', '.cfg', '.conf', '.ini', '.log', '.sh', '.bat', '.ps1'];
                if (!textExtensions.includes(ext)) continue;
                
                const fileResults = await searchInFile(itemPath, searchTerm, isCaseSensitive);
                if (fileResults && fileResults.length > 0) {
                    results.push({
                        file: itemPath,
                        fileName: path.basename(itemPath),
                        relativePath: itemPath,
                        matches: fileResults
                    });
                }
            }
        } catch (error) {
            // Skip problematic files
        }
    }
    
    return results;
}

async function pushModifiedFilesToGitHub(session, token, username, commitMessagePrefix) {
    const repoName = session.data.repoName;
    const repoRoot = session.data.extractedFolder;
    const modifiedFiles = session.data.modifiedFiles || [];
    
    if (modifiedFiles.length === 0) {
        return { successCount: 0, totalCount: 0, failedFiles: [], message: "No files were modified" };
    }
    
    let successCount = 0;
    let failedFiles = [];
    
    for (const file of modifiedFiles) {
        let relativePath = path.relative(repoRoot, file.path);
        relativePath = relativePath.replace(/\\/g, '/');
        
        const fileName = path.basename(file.path);
        const commitMessage = `${commitMessagePrefix} ${fileName}`;
        
        try {
            const content = fs.readFileSync(file.path, 'utf8');
            const base64Content = Buffer.from(content).toString('base64');
            
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
            console.log(`[AUDIT] ✅ Pushed: ${relativePath}`);
            
        } catch (error) {
            console.error(`[AUDIT] ❌ Failed to push ${relativePath}:`, error.response?.data?.message || error.message);
            failedFiles.push({ file: relativePath, error: error.response?.data?.message || error.message });
        }
    }
    
    return { successCount, totalCount: modifiedFiles.length, failedFiles };
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
        
        output += `📄 *${fileName}*\n`;
        output += `└ 📁 \`${result.relativePath}\`\n`;
        output += `└ 🎯 *${result.matches.length} match(es)*\n`;
        
        const previewCount = Math.min(result.matches.length, 3);
        for (let j = 0; j < previewCount; j++) {
            const match = result.matches[j];
            output += `   └ 📍 Line ${match.lineNumber}: \`${match.line}\`\n`;
        }
        
        if (result.matches.length > 3) {
            output += `   └ ... and ${result.matches.length - 3} more matches\n`;
        }
        
        output += `\n`;
    }
    
    if (results.length > 15) {
        output += `*... and ${results.length - 15} more files*\n\n`;
    }
    
    output += `💡 Use the buttons below to replace text with different modes.`;
    
    return output;
}

function formatReplaceResults(totalReplacements, affectedFiles, modifiedFiles, mode) {
    if (totalReplacements === 0) {
        return `🔍 *No replacements made*\n\nNo occurrences of the search term were found.`;
    }
    
    let modeText = '';
    switch(mode) {
        case REPLACE_MODES.EXACT: modeText = 'Exact Match'; break;
        case REPLACE_MODES.WHOLE_WORD: modeText = 'Whole Word'; break;
        case REPLACE_MODES.WHOLE_LINE: modeText = 'Whole Line'; break;
        case REPLACE_MODES.REGEX: modeText = 'Regex Pattern'; break;
        default: modeText = 'Exact Match';
    }
    
    let output = `✅ *Replacements Complete*\n\n`;
    output += `📊 *Mode:* ${modeText}\n`;
    output += `📊 *Total Replacements:* ${totalReplacements}\n`;
    output += `📁 *Affected Files:* ${affectedFiles}\n\n`;
    
    if (modifiedFiles && modifiedFiles.length > 0) {
        output += `*Modified Files:*\n`;
        for (const file of modifiedFiles.slice(0, 10)) {
            output += `• ${file.fileName} (${file.replacements} replacement(s))\n`;
        }
        if (modifiedFiles.length > 10) {
            output += `• ... and ${modifiedFiles.length - 10} more files\n`;
        }
        output += `\n`;
    }
    
    output += `💡 Click the "Push to GitHub" button below to upload your changes.`;
    
    return output;
}

// ==================== UI FUNCTIONS ====================

async function showFileModeSelection(sock, from, sender, reply, session) {
    const sessionId = session.id.split(':').pop();
    
    const buttons = [
        { id: `mode_all_${sessionId}`, text: '📁 Search All Files' },
        { id: `mode_single_${sessionId}`, text: '📄 Search Single File' },
        { id: 'clear_repo', text: '🗑️ Clear Repository' }
    ];
    
    const sentMsg = await sendButtons(sock, from, {
        text: `🔍 *Search Mode Selection*\n\n` +
              `📁 *Repo:* ${session.data.repoName}\n\n` +
              `How would you like to search?\n\n` +
              `• *All Files* - Search through every text file in the repository\n` +
              `• *Single File* - Search only in a specific file\n\n` +
              `Choose an option below:`,
        footer: 'Audit Tool',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
}

async function handleFileSelection(sock, from, sender, reply, react, session, buttonId) {
    if (buttonId.includes('mode_all')) {
        sessionManager.updateSession(sender, from, { searchMode: 'all', waitingForSearch: true });
        await reply(`🔍 *Search Mode: All Files*\n\nSend me the word/phrase you want to search for.`);
        return true;
    }
    
    if (buttonId.includes('mode_single')) {
        sessionManager.updateSession(sender, from, { searchMode: 'single', waitingForFileName: true });
        await reply(`📄 *Search Mode: Single File*\n\nSend me the exact filename (e.g., config.js) you want to search in.\n\nType \`cancel\` to go back.`);
        return true;
    }
    
    return false;
}

async function handleFileNameInput(sock, from, sender, reply, react, session, fileName) {
    const repoRoot = session.data.extractedFolder;
    
    console.log(`[AUDIT] Searching for ${fileName} in ${repoRoot}`);
    
    if (!fs.existsSync(repoRoot)) {
        await reply(`❌ Repository folder not found. Please reload the repository.`);
        return;
    }
    
    const foundFiles = await findFilesByName(repoRoot, fileName, []);
    
    if (foundFiles.length === 0) {
        await reply(`❌ No file named "${fileName}" found in the repository.\n\nMake sure you entered the exact filename including extension.`);
        sessionManager.updateSession(sender, from, { waitingForFileName: true });
        return;
    }
    
    if (foundFiles.length === 1) {
        sessionManager.updateSession(sender, from, {
            searchMode: 'single',
            specificFiles: foundFiles,
            waitingForSearch: true,
            waitingForFileName: false
        });
        await reply(`🔍 *Search Mode: Single File*\n\nFound: \`${foundFiles[0]}\`\n\nSend me the word/phrase you want to search for.`);
    } else {
        const sessionId = session.id.split(':').pop();
        const buttons = [];
        
        for (let i = 0; i < foundFiles.length; i++) {
            const filePath = foundFiles[i];
            const relativePath = path.relative(repoRoot, filePath);
            buttons.push({
                id: `select_file_${sessionId}_${i}`,
                text: relativePath.length > 50 ? relativePath.substring(0, 47) + '...' : relativePath
            });
        }
        
        buttons.push({ id: 'cancel', text: '❌ Cancel' });
        
        sessionManager.updateSession(sender, from, {
            foundFiles: foundFiles,
            waitingForFileSelection: true,
            waitingForFileName: false
        });
        
        const sentMsg = await sendButtons(sock, from, {
            text: `📁 *Multiple files named "${fileName}" found*\n\nSelect which file to search in:`,
            footer: 'Audit Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
    }
}

async function handleFileSelectionChoice(sock, from, sender, reply, react, session, buttonId) {
    const parts = buttonId.split('_');
    const index = parseInt(parts[3]);
    const foundFiles = session.data.foundFiles;
    
    if (!isNaN(index) && index >= 0 && index < foundFiles.length) {
        sessionManager.updateSession(sender, from, {
            searchMode: 'single',
            specificFiles: [foundFiles[index]],
            waitingForSearch: true,
            waitingForFileSelection: false,
            foundFiles: null
        });
        await reply(`🔍 *Search Mode: Single File*\n\nSelected: \`${foundFiles[index]}\`\n\nSend me the word/phrase you want to search for.`);
    } else {
        await reply(`❌ Invalid selection.`);
    }
}

async function showReplaceModeSelection(sock, from, sender, reply, session) {
    const sessionId = session.id.split(':').pop();
    
    const buttons = [
        { id: `replace_exact_${sessionId}`, text: '🎯 Exact Match' },
        { id: `replace_word_${sessionId}`, text: '📝 Whole Word' },
        { id: `replace_line_${sessionId}`, text: '📄 Whole Line' },
        { id: `replace_regex_${sessionId}`, text: '🔧 Regex Pattern' },
        { id: 'cancel', text: '❌ Cancel' }
    ];
    
    const sentMsg = await sendButtons(sock, from, {
        text: `✏️ *Replace Mode Selection*\n\n` +
              `Search term: \`${session.data.lastSearchTerm}\`\n\n` +
              `Choose how you want to replace:\n\n` +
              `• *Exact Match* - Replace only the exact search term\n` +
              `• *Whole Word* - Replace the entire word containing the search term\n` +
              `• *Whole Line* - Replace the entire line containing the search term\n` +
              `• *Regex Pattern* - Use custom regex pattern\n\n` +
              `Example: Searching for ".com" with "Whole Word" will replace "google.com" entirely.`,
        footer: 'Audit Tool',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
}

async function showFileSelectionForReplace(sock, from, sender, reply, session, searchResults) {
    const sessionId = session.id.split(':').pop();
    const buttons = [];
    
    buttons.push({ id: `replace_all_${sessionId}`, text: '📁 Replace in ALL files' });
    
    for (let i = 0; i < Math.min(searchResults.length, 10); i++) {
        const result = searchResults[i];
        const fileName = path.basename(result.file);
        const relativePath = result.relativePath;
        const displayText = relativePath.length > 40 ? relativePath.substring(0, 37) + '...' : relativePath;
        buttons.push({
            id: `replace_file_${sessionId}_${i}`,
            text: `📄 ${displayText}`
        });
    }
    
    buttons.push({ id: 'cancel', text: '❌ Cancel' });
    
    sessionManager.updateSession(sender, from, {
        searchResults: searchResults,
        waitingForFileReplaceSelection: true
    });
    
    const sentMsg = await sendButtons(sock, from, {
        text: `✏️ *Select files to replace*\n\nFound ${searchResults.length} file(s) with matches.\n\nChoose which files to apply replacements to:`,
        footer: 'Audit Tool',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
}

// ==================== BUTTON HANDLER ====================

async function handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react) {
    console.log(`[AUDIT] Handling button: ${buttonId}`);
    
    const session = sessionManager.getLatestSession(sender, from);
    
    if (!session || session.command !== 'audit') {
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
        if (session.data.searchResults && session.data.searchResults.length > 0) {
            await showReplaceModeSelection(sock, from, sender, reply, session);
        } else {
            await reply(`❌ No search results found. Please perform a search first.`);
        }
        return true;
    }
    
    if (buttonId && buttonId.startsWith('replace_exact_')) {
        sessionManager.updateSession(sender, from, { replaceMode: REPLACE_MODES.EXACT });
        await showFileSelectionForReplace(sock, from, sender, reply, session, session.data.searchResults);
        return true;
    }
    
    if (buttonId && buttonId.startsWith('replace_word_')) {
        sessionManager.updateSession(sender, from, { replaceMode: REPLACE_MODES.WHOLE_WORD });
        await showFileSelectionForReplace(sock, from, sender, reply, session, session.data.searchResults);
        return true;
    }
    
    if (buttonId && buttonId.startsWith('replace_line_')) {
        sessionManager.updateSession(sender, from, { replaceMode: REPLACE_MODES.WHOLE_LINE });
        await showFileSelectionForReplace(sock, from, sender, reply, session, session.data.searchResults);
        return true;
    }
    
    if (buttonId && buttonId.startsWith('replace_regex_')) {
        sessionManager.updateSession(sender, from, { replaceMode: REPLACE_MODES.REGEX });
        await reply(`🔧 *Regex Mode*\n\nSend me the regex pattern to search for.\n\nExample: \`\\b\\w+@\\w+\\.\\w+\\b\` for emails\n\nType \`cancel\` to cancel.`);
        sessionManager.updateSession(sender, from, { waitingForRegexPattern: true });
        return true;
    }
    
    if (buttonId && buttonId.startsWith('replace_all_')) {
        return await handleFileReplaceSelection(sock, from, sender, reply, react, session, buttonId);
    }
    
    if (buttonId && buttonId.startsWith('replace_file_')) {
        return await handleFileReplaceSelection(sock, from, sender, reply, react, session, buttonId);
    }
    
    if (buttonId === 'push_to_github') {
        const commitMessagePrefix = session.data.lastReplaceTerm 
            ? `Replace "${session.data.lastSearchTerm}" with "${session.data.lastReplaceTerm}" in`
            : 'Update';
        await pushToGitHub(sock, from, sender, reply, react, session, commitMessagePrefix);
        return true;
    }
    
    if (buttonId && (buttonId.includes('mode_all') || buttonId.includes('mode_single'))) {
        return await handleFileSelection(sock, from, sender, reply, react, session, buttonId);
    }
    
    if (buttonId && buttonId.startsWith('select_file_')) {
        return await handleFileSelectionChoice(sock, from, sender, reply, react, session, buttonId);
    }
    
    return false;
}

async function handleFileReplaceSelection(sock, from, sender, reply, react, session, buttonId) {
    const parts = buttonId.split('_');
    const action = parts[1];
    const index = parseInt(parts[3]);
    const searchResults = session.data.searchResults;
    const replaceMode = session.data.replaceMode || REPLACE_MODES.EXACT;
    
    if (action === 'all') {
        sessionManager.updateSession(sender, from, {
            waitingForReplace: true,
            replaceSearchTerm: session.data.lastSearchTerm,
            replaceSpecificFiles: searchResults.map(r => r.file),
            replaceMode: replaceMode
        });
        
        let modeText = '';
        switch(replaceMode) {
            case REPLACE_MODES.EXACT: modeText = 'Exact Match'; break;
            case REPLACE_MODES.WHOLE_WORD: modeText = 'Whole Word'; break;
            case REPLACE_MODES.WHOLE_LINE: modeText = 'Whole Line'; break;
            case REPLACE_MODES.REGEX: modeText = 'Regex Pattern'; break;
        }
        
        await reply(`🔧 *Replace Mode: ${modeText}*\n\nSearching for: \`${session.data.lastSearchTerm}\`\n\nPlease send the text you want to replace it with.\n\nType \`cancel\` to cancel.`);
        return true;
    }
    
    if (action === 'file' && !isNaN(index) && index >= 0 && index < searchResults.length) {
        sessionManager.updateSession(sender, from, {
            waitingForReplace: true,
            replaceSearchTerm: session.data.lastSearchTerm,
            replaceSpecificFiles: [searchResults[index].file],
            replaceMode: replaceMode
        });
        
        let modeText = '';
        switch(replaceMode) {
            case REPLACE_MODES.EXACT: modeText = 'Exact Match'; break;
            case REPLACE_MODES.WHOLE_WORD: modeText = 'Whole Word'; break;
            case REPLACE_MODES.WHOLE_LINE: modeText = 'Whole Line'; break;
            case REPLACE_MODES.REGEX: modeText = 'Regex Pattern'; break;
        }
        
        await reply(`🔧 *Replace Mode: ${modeText}*\n\nSelected file: \`${searchResults[index].fileName}\`\n\nSearching for: \`${session.data.lastSearchTerm}\`\n\nPlease send the text you want to replace it with.\n\nType \`cancel\` to cancel.`);
        return true;
    }
    
    await reply(`❌ Invalid selection.`);
    return true;
}

async function showSearchOptions(sock, from, sender, reply, session) {
    const sessionId = session.id.split(':').pop();
    const hasResults = session.data.searchResults && session.data.searchResults.length > 0;
    const hasChanges = session.data.hasChanges && session.data.modifiedFiles && session.data.modifiedFiles.length > 0;
    
    const buttons = [
        { id: `search_${sessionId}`, text: '🔍 New Search' },
        { id: 'export_results', text: '📄 Export Results' }
    ];
    
    if (hasResults && !hasChanges) {
        buttons.push({ id: 'start_replace', text: '✏️ Replace Text' });
    }
    
    if (hasChanges) {
        buttons.push({ id: 'push_to_github', text: '📤 Push to GitHub' });
    }
    
    buttons.push({ id: 'case_sensitive', text: session.data.caseSensitive ? '🔒 Case: ON' : '🔓 Case: OFF' });
    buttons.push({ id: 'clear_repo', text: '🗑️ Clear Repository' });
    
    let statusText = `🔍 *Search Options*\n\n` +
              `📁 *Repo:* ${session.data.repoName}\n` +
              `🔒 *Case Sensitive:* ${session.data.caseSensitive ? 'ON' : 'OFF'}\n`;
    
    if (hasResults) {
        statusText += `📊 *Last Search:* "${session.data.lastSearchTerm}" (${session.data.searchResults.length} files)\n`;
    }
    
    if (hasChanges) {
        statusText += `✏️ *Pending Changes:* ${session.data.modifiedFiles.length} file(s) modified\n`;
        statusText += `💡 Click "Push to GitHub" to upload your changes.\n\n`;
    } else {
        statusText += `\nSend me the word/phrase you want to search for, or adjust options below.`;
    }
    
    const sentMsg = await sendButtons(sock, from, {
        text: statusText,
        footer: 'Audit Tool',
        buttons: buttons,
        aimode: FORCE_AI_MODE
    }, {});
    
    sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'audit');
    sessionManager.updateSession(sender, from, { waitingForSearch: !hasChanges });
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
        const searchMode = session.data.searchMode || 'all';
        const specificFiles = session.data.specificFiles || null;
        
        let results;
        
        if (searchMode === 'single' && specificFiles && specificFiles.length > 0) {
            results = await searchDirectory(null, searchTerm, isCaseSensitive, null, specificFiles);
        } else {
            results = await searchDirectory(session.data.extractedFolder, searchTerm, isCaseSensitive, null, null);
        }
        
        const formattedResults = formatResults(results, searchTerm);
        
        sessionManager.updateSession(sender, from, {
            searchResults: results,
            lastSearchTerm: searchTerm,
            waitingForReplace: false,
            hasChanges: false,
            waitingForFileReplaceSelection: false,
            replaceSpecificFiles: null,
            replaceMode: REPLACE_MODES.EXACT
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
    
    const mode = session.data.replaceMode || REPLACE_MODES.EXACT;
    let modeText = '';
    switch(mode) {
        case REPLACE_MODES.EXACT: modeText = 'Exact Match'; break;
        case REPLACE_MODES.WHOLE_WORD: modeText = 'Whole Word'; break;
        case REPLACE_MODES.WHOLE_LINE: modeText = 'Whole Line'; break;
        case REPLACE_MODES.REGEX: modeText = 'Regex Pattern'; break;
    }
    
    const processingMsg = await reply(`✏️ *Replacing with mode: ${modeText}*\n\n"${searchTerm}" → "${replaceTerm}"\n\nThis may take a while...`);
    
    try {
        const isCaseSensitive = session.data.caseSensitive || false;
        const modifiedFilesList = [];
        const specificFiles = session.data.replaceSpecificFiles || null;
        
        let result;
        
        if (specificFiles && specificFiles.length > 0) {
            result = await replaceInDirectoryWithMode(null, searchTerm, replaceTerm, isCaseSensitive, mode, null, modifiedFilesList, specificFiles);
        } else {
            result = await replaceInDirectoryWithMode(session.data.extractedFolder, searchTerm, replaceTerm, isCaseSensitive, mode, null, modifiedFilesList, null);
        }
        
        const { totalReplacements, affectedFiles } = result;
        
        const formattedResults = formatReplaceResults(totalReplacements, affectedFiles, modifiedFilesList, mode);
        
        sessionManager.updateSession(sender, from, {
            hasChanges: totalReplacements > 0,
            replaceCount: totalReplacements,
            affectedFiles: affectedFiles,
            modifiedFiles: modifiedFilesList,
            lastReplaceSearch: searchTerm,
            lastReplaceTerm: replaceTerm,
            waitingForReplace: false,
            replaceSpecificFiles: null
        });
        
        await sock.sendMessage(from, {
            text: formattedResults,
            edit: processingMsg.key
        });
        
        await showSearchOptions(sock, from, sender, reply, session);
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Replace failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function pushToGitHub(sock, from, sender, reply, react, session, commitMessagePrefix) {
    await react('📤');
    const processingMsg = await reply(`📤 *Pushing changes to GitHub...*\n\nPlease wait...`);
    
    try {
        const { token, username } = await getGitHubCredentials();
        
        const { successCount, totalCount, failedFiles } = await pushModifiedFilesToGitHub(session, token, username, commitMessagePrefix);
        
        let resultText = '';
        
        if (successCount > 0) {
            resultText = `✅ *Changes Pushed to GitHub!*\n\n` +
                        `📁 *Repo:* ${session.data.repoName}\n` +
                        `📊 *Files Pushed:* ${successCount}/${totalCount}\n\n`;
            
            if (failedFiles.length > 0) {
                resultText += `⚠️ *Failed to push ${failedFiles.length} file(s):*\n`;
                for (const failed of failedFiles) {
                    resultText += `• \`${failed.file}\`\n  └ ${failed.error}\n`;
                }
                resultText += `\n`;
            }
            
            resultText += `🔗 *GitHub Link:*\nhttps://github.com/${username}/${session.data.repoName}\n\n`;
            resultText += `> *Powered by ${config.botName}*`;
            
            await sock.sendMessage(from, {
                text: resultText,
                edit: processingMsg.key
            });
            
            sessionManager.updateSession(sender, from, { hasChanges: false, modifiedFiles: [] });
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
    usage: '.audit <github_repo_url>\n.audit <github_repo_url> <search_term>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`🔍 *Audit/Search Command*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}audit <github_repo_url>\` - Load repo for searching\n` +
                       `• \`${config.prefix}audit <github_repo_url> <search_term>\` - Search immediately\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}audit https://github.com/user/repo\`\n` +
                       `• \`${config.prefix}audit https://github.com/user/repo "api key"\`\n` +
                       `• \`${config.prefix}audit https://github.com/user/repo ".com"\`\n\n` +
                       `*Replace Modes:*\n` +
                       `• *Exact Match* - Replace only the exact search term\n` +
                       `• *Whole Word* - Replace the entire word containing the term (e.g., "google.com" → new text)\n` +
                       `• *Whole Line* - Replace the entire line containing the term\n` +
                       `• *Regex Pattern* - Use custom regex pattern`);
        }
        
        const firstArg = args[0];
        
        if (firstArg.includes('github.com')) {
            const repoUrl = firstArg;
            const searchTerm = args.slice(1).join(' ');
            
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
                    searchResults: null,
                    waitingForSearch: false,
                    waitingForReplace: false,
                    waitingForFileName: false,
                    waitingForFileSelection: false,
                    waitingForFileReplaceSelection: false,
                    waitingForRegexPattern: false,
                    hasChanges: false,
                    modifiedFiles: [],
                    searchMode: null,
                    specificFiles: null,
                    foundFiles: null,
                    replaceSpecificFiles: null,
                    replaceMode: REPLACE_MODES.EXACT
                });
                
                if (searchTerm && searchTerm.trim().length > 0) {
                    sessionManager.updateSession(sender, from, { searchMode: 'all', waitingForSearch: true });
                    await performSearch(sock, from, sender, reply, react, session, searchTerm);
                } else {
                    await sock.sendMessage(from, {
                        text: `✅ *Repository Loaded Successfully!*\n\n📁 *Repo:* ${repoName}\n📊 *Status:* Ready for search`,
                        edit: processingMsg.key
                    });
                    await showFileModeSelection(sock, from, sender, reply, session);
                }
                
                await react('✅');
                
            } catch (error) {
                await sock.sendMessage(from, {
                    text: `❌ *Failed to load repository*\n\nError: ${error.message}`,
                    edit: processingMsg.key
                });
                await react('❌');
            }
            return;
        }
        
        return reply(`❌ Invalid usage. Provide a GitHub repository URL.`);
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
                const handled = await handleButtonClick(sock, msg, buttonId, buttonText, from, sender, reply, react);
                if (handled) return true;
            }
            return true;
        }
        
        let text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation.trim();
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text.trim();
        }
        
        if (!text) return true;
        
        if (text.toLowerCase() === 'cancel') {
            sessionManager.updateSession(sender, from, { 
                waitingForSearch: false, 
                waitingForReplace: false,
                waitingForFileName: false,
                waitingForFileSelection: false,
                waitingForFileReplaceSelection: false,
                waitingForRegexPattern: false
            });
            await showFileModeSelection(sock, from, sender, reply, session);
            return true;
        }
        
        // Handle regex pattern input
        if (session.data.waitingForRegexPattern) {
            sessionManager.updateSession(sender, from, { 
                waitingForRegexPattern: false,
                replaceSearchTerm: text,
                replaceMode: REPLACE_MODES.REGEX
            });
            await showFileSelectionForReplace(sock, from, sender, reply, session, session.data.searchResults);
            return true;
        }
        
        // Handle replace text input
        if (session.data.waitingForReplace && session.data.replaceSearchTerm) {
            sessionManager.updateSession(sender, from, { waitingForReplace: false });
            await performReplace(sock, from, sender, reply, react, session, session.data.replaceSearchTerm, text);
            return true;
        }
        
        // Handle file name input for single file mode
        if (session.data.waitingForFileName) {
            sessionManager.updateSession(sender, from, { waitingForFileName: false });
            await handleFileNameInput(sock, from, sender, reply, react, session, text);
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

module.exports.handleButtonClick = handleButtonClick;
