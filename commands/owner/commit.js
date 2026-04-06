/**
 * Commit Command - Search and replace file content across GitHub repositories
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
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
        
        console.log('[COMMIT] Fetching Google Drive token...');
        
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        const tempTokenFile = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenDir = path.dirname(tempTokenFile);
        if (!fs.existsSync(tokenDir)) {
            fs.mkdirSync(tokenDir, { recursive: true });
        }
        
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
            console.log('[COMMIT] Token expired, refreshing...');
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
        console.error('[COMMIT] Failed to get Google Drive token:', error.message);
        return null;
    }
}

async function getGitHubCredentials() {
    if (cachedGitHubToken && githubTokenExpiry && new Date() < githubTokenExpiry) {
        return { token: cachedGitHubToken, username: cachedGitHubUsername };
    }
    
    try {
        console.log('[COMMIT] Fetching GitHub credentials from Google Drive...');
        
        const driveToken = await getAccessToken();
        if (!driveToken) {
            throw new Error('No Drive access token');
        }
        
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
        
        console.log('[COMMIT] GitHub credentials loaded successfully');
        return { token: githubToken, username: githubUsername };
        
    } catch (error) {
        console.error('[COMMIT] Failed to get GitHub credentials:', error.message);
        throw new Error('Failed to load GitHub credentials: ' + error.message);
    }
}

// ==================== GITHUB API FUNCTIONS ====================

async function getAllRepositories(token, username) {
    try {
        let allRepos = [];
        let page = 1;
        
        while (true) {
            const response = await axios.get(
                'https://api.github.com/user/repos',
                {
                    headers: { 'Authorization': 'token ' + token },
                    params: { page: page, per_page: 100, sort: 'updated' }
                }
            );
            
            if (response.data.length === 0) {
                break;
            }
            
            allRepos = allRepos.concat(response.data);
            page++;
        }
        
        console.log('[COMMIT] Found ' + allRepos.length + ' repositories');
        return allRepos;
        
    } catch (error) {
        console.error('[COMMIT] Failed to get repositories:', error.message);
        throw new Error('Failed to fetch repositories');
    }
}

async function searchFileInRepo(token, username, repoName, fileName) {
    try {
        const searchUrl = 'https://api.github.com/search/code?q=' + encodeURIComponent(fileName) + '+repo:' + username + '/' + repoName;
        
        const response = await axios.get(searchUrl, {
            headers: { 'Authorization': 'token ' + token }
        });
        
        return response.data.items || [];
        
    } catch (error) {
        console.error('[COMMIT] Error searching in ' + repoName + ':', error.message);
        return [];
    }
}

async function getFileContent(token, username, repoName, filePath, branch) {
    branch = branch || 'main';
    try {
        const url = 'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + filePath;
        
        const response = await axios.get(url, {
            headers: { 'Authorization': 'token ' + token },
            params: { ref: branch }
        });
        
        if (response.data && response.data.content) {
            const content = Buffer.from(response.data.content, 'base64').toString('utf8');
            const sha = response.data.sha;
            return { content: content, sha: sha };
        }
        
        return null;
        
    } catch (error) {
        console.error('[COMMIT] Error getting file content:', error.message);
        return null;
    }
}

async function updateFileContent(token, username, repoName, filePath, content, sha, commitMessage, branch) {
    branch = branch || 'main';
    try {
        const base64Content = Buffer.from(content, 'utf8').toString('base64');
        
        const response = await axios.put(
            'https://api.github.com/repos/' + username + '/' + repoName + '/contents/' + filePath,
            {
                message: commitMessage,
                content: base64Content,
                sha: sha,
                branch: branch
            },
            {
                headers: {
                    'Authorization': 'token ' + token,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        return response.data;
        
    } catch (error) {
        console.error('[COMMIT] Error updating file:', error.message);
        throw new Error('Failed to update file: ' + (error.response?.data?.message || error.message));
    }
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'commit',
    aliases: ['updatefile', 'replacefile', 'editfile'],
    description: 'Search and replace file content across GitHub repositories',
    usage: '.commit <filename>',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply('\uD83D\uDCDD *Commit Command*\n\n' +
                       '*Usage:*\n' +
                       '• `' + config.prefix + 'commit <filename>` - Search for file in all repos\n' +
                       '• `' + config.prefix + 'commit config.js` - Example\n\n' +
                       '*What it does:*\n' +
                       '1. Searches for the file in all your GitHub repositories\n' +
                       '2. Shows repositories where the file exists\n' +
                       '3. If multiple files with same name, lets you choose\n' +
                       '4. You can then send new content (one or multiple messages)\n' +
                       '5. Click "Done" to commit the changes\n\n' +
                       '*Note:* Files are committed to the main/master branch');
        }
        
        const fileName = args[0];
        
        await react('\uD83D\uDD0D');
        const processingMsg = await reply('\uD83D\uDD0D *Searching for "' + fileName + '" in all repositories...*\n\nPlease wait...');
        
        try {
            const credentials = await getGitHubCredentials();
            const token = credentials.token;
            const username = credentials.username;
            
            // Get all repositories
            const repos = await getAllRepositories(token, username);
            
            if (repos.length === 0) {
                await sock.sendMessage(from, {
                    text: '❌ No repositories found for user ' + username + '.',
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
            
            // Search for file in each repository
            const reposWithFile = [];
            
            for (const repo of repos) {
                const results = await searchFileInRepo(token, username, repo.name, fileName);
                if (results.length > 0) {
                    reposWithFile.push({
                        name: repo.name,
                        fullName: repo.full_name,
                        files: results.map(function(r) {
                            return {
                                path: r.path,
                                url: r.url,
                                sha: null
                            };
                        })
                    });
                }
            }
            
            if (reposWithFile.length === 0) {
                await sock.sendMessage(from, {
                    text: '❌ No repositories found containing "' + fileName + '".\n\nMake sure the file exists in one of your repositories.',
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
            
            // Create session
            const session = sessionManager.createSession(sender, from, 'commit', {
                step: 'selecting_repo',
                fileName: fileName,
                repos: reposWithFile,
                selectedRepo: null,
                selectedFile: null,
                fileContent: null,
                fileSha: null,
                newContent: '',
                contentParts: []
            });
            
            const sessionId = session.id.split(':').pop();
            
            // Show repositories as buttons
            const buttons = [];
            for (var i = 0; i < Math.min(reposWithFile.length, 15); i++) {
                var repo = reposWithFile[i];
                buttons.push({
                    id: 'commit_repo_' + sessionId + '_' + i,
                    text: repo.name.length > 40 ? repo.name.substring(0, 37) + '...' : repo.name
                });
            }
            buttons.push({ id: 'cancel', text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: '✅ *Found ' + fileName + ' in ' + reposWithFile.length + ' repository(s)*\n\nSelect which repository to edit:',
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: '📁 *Select Repository*\n\nFile: `' + fileName + '`\n\nFound in ' + reposWithFile.length + ' repository(s):',
                footer: 'Commit Tool',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
            
            await react('✅');
            
        } catch (error) {
            await sock.sendMessage(from, {
                text: '❌ *Failed to search repositories*\n\nError: ' + error.message,
                edit: processingMsg.key
            });
            await react('❌');
        }
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
                var listReply = msg.message.listResponseMessage.singleSelectReply;
                if (listReply) {
                    buttonId = listReply.selectedRowId;
                    buttonText = listReply.title;
                }
            } else if (msg.message?.interactiveResponseMessage) {
                var interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        var params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
            }
            
            if (buttonId === 'cancel') {
                sessionManager.clearSession(session.id);
                await reply('❌ Operation cancelled.');
                return true;
            }
            
            if (buttonId && buttonId.indexOf('commit_repo_') === 0) {
                var parts = buttonId.split('_');
                var index = parseInt(parts[3]);
                var repos = session.data.repos;
                
                if (!isNaN(index) && index >= 0 && index < repos.length) {
                    var selectedRepo = repos[index];
                    
                    // Update session
                    sessionManager.updateSession(sender, from, {
                        step: 'selecting_file',
                        selectedRepo: selectedRepo,
                        selectedFile: null
                    });
                    
                    // Check if multiple files with same name exist in this repo
                    if (selectedRepo.files.length === 1) {
                        // Single file, proceed to get content
                        var file = selectedRepo.files[0];
                        await handleFileSelected(sock, from, sender, reply, react, session, selectedRepo, file);
                    } else {
                        // Multiple files, show selection
                        var sessionId = session.id.split(':').pop();
                        var buttons = [];
                        
                        for (var i = 0; i < selectedRepo.files.length; i++) {
                            var file = selectedRepo.files[i];
                            buttons.push({
                                id: 'commit_file_' + sessionId + '_' + i,
                                text: file.path.length > 50 ? file.path.substring(0, 47) + '...' : file.path
                            });
                        }
                        buttons.push({ id: 'cancel', text: '❌ Cancel' });
                        
                        var sentMsg = await sendButtons(sock, from, {
                            text: '📁 *Multiple files named "' + session.data.fileName + '" found in ' + selectedRepo.name + '*\n\nSelect which file to edit:',
                            footer: 'Commit Tool',
                            buttons: buttons,
                            aimode: FORCE_AI_MODE
                        }, {});
                        
                        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
                    }
                }
                return true;
            }
            
            if (buttonId && buttonId.indexOf('commit_file_') === 0) {
                var parts = buttonId.split('_');
                var index = parseInt(parts[3]);
                var selectedRepo = session.data.selectedRepo;
                var files = selectedRepo.files;
                
                if (!isNaN(index) && index >= 0 && index < files.length) {
                    var selectedFile = files[index];
                    await handleFileSelected(sock, from, sender, reply, react, session, selectedRepo, selectedFile);
                }
                return true;
            }
            
            if (buttonId === 'commit_done') {
                await handleCommitDone(sock, from, sender, reply, react, session);
                return true;
            }
            
            if (buttonId === 'commit_cancel') {
                sessionManager.clearSession(session.id);
                await reply('❌ Operation cancelled.');
                return true;
            }
        }
        
        // Handle text input (new file content)
        var text = '';
        if (msg.message?.conversation) {
            text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        }
        
        if (text && session.data.step === 'collecting_content') {
            // Collect content parts
            var contentParts = session.data.contentParts || [];
            contentParts.push(text);
            sessionManager.updateSession(sender, from, {
                contentParts: contentParts
            });
            
            // Send confirmation
            await reply('✅ Part ' + contentParts.length + ' received. Total length: ' + contentParts.join('').length + ' characters.\n\nSend more content or click "Done" to finish.');
            return true;
        }
        
        return true;
    }
};

async function handleFileSelected(sock, from, sender, reply, react, session, selectedRepo, selectedFile) {
    await react('📥');
    var processingMsg = await reply('📥 *Fetching file content...*\n\nFile: ' + selectedFile.path + '\nRepo: ' + selectedRepo.name + '\n\nPlease wait...');
    
    try {
        var credentials = await getGitHubCredentials();
        var token = credentials.token;
        var username = credentials.username;
        
        // Get file content
        var fileData = await getFileContent(token, username, selectedRepo.name, selectedFile.path);
        
        if (!fileData) {
            await sock.sendMessage(from, {
                text: '❌ Failed to fetch file content. Make sure the file exists.',
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        // Update session
        sessionManager.updateSession(sender, from, {
            step: 'collecting_content',
            selectedFile: selectedFile,
            selectedRepo: selectedRepo,
            fileContent: fileData.content,
            fileSha: fileData.sha,
            contentParts: [],
            newContent: null
        });
        
        // Show current content preview
        var contentPreview = fileData.content.length > 500 ? 
            fileData.content.substring(0, 500) + '\n\n... (truncated)' : 
            fileData.content;
        
        var sessionId = session.id.split(':').pop();
        
        var buttons = [
            { id: 'commit_done', text: '✅ Done - Commit Changes' },
            { id: 'commit_cancel', text: '❌ Cancel' }
        ];
        
        await sock.sendMessage(from, {
            text: '📄 *Current File Content*\n\n' +
                  '📁 *Repo:* ' + selectedRepo.name + '\n' +
                  '📂 *Path:* ' + selectedFile.path + '\n' +
                  '📊 *Size:* ' + fileData.content.length + ' characters\n\n' +
                  '*Preview:*\n```\n' + contentPreview + '\n```\n\n' +
                  '✏️ *Send the new content for this file.*\n\n' +
                  'You can send multiple messages (they will be combined).\n' +
                  'When done, click the "Done" button.',
            edit: processingMsg.key
        });
        
        var sentMsg = await sendButtons(sock, from, {
            text: '✏️ *Ready to receive new content*\n\n' +
                  'File: `' + selectedFile.path + '`\n\n' +
                  'Send the new content (can be multiple messages).\n' +
                  'When finished, click "Done - Commit Changes".',
            footer: 'Commit Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: '❌ *Failed to fetch file*\n\nError: ' + error.message,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleCommitDone(sock, from, sender, reply, react, session) {
    var contentParts = session.data.contentParts || [];
    var newContent = contentParts.join('');
    
    if (!newContent || newContent.trim().length === 0) {
        await reply('❌ No new content received. Please send the new content first.');
        return;
    }
    
    await react('📤');
    var processingMsg = await reply('📤 *Committing changes...*\n\nPlease wait...');
    
    try {
        var credentials = await getGitHubCredentials();
        var token = credentials.token;
        var username = credentials.username;
        var selectedRepo = session.data.selectedRepo;
        var selectedFile = session.data.selectedFile;
        var fileSha = session.data.fileSha;
        
        var commitMessage = 'Update ' + selectedFile.path;
        
        var result = await updateFileContent(
            token, username, selectedRepo.name, selectedFile.path,
            newContent, fileSha, commitMessage
        );
        
        await sock.sendMessage(from, {
            text: '✅ *File Updated Successfully!*\n\n' +
                  '📁 *Repo:* ' + selectedRepo.name + '\n' +
                  '📂 *Path:* ' + selectedFile.path + '\n' +
                  '📊 *New Size:* ' + newContent.length + ' characters\n' +
                  '💬 *Commit:* ' + commitMessage + '\n\n' +
                  '🔗 *View on GitHub:*\n' + (result.content?.html_url || 'https://github.com/' + username + '/' + selectedRepo.name + '/blob/main/' + selectedFile.path) + '\n\n' +
                  '> *Powered by ' + config.botName + '*',
            edit: processingMsg.key
        });
        
        // Clear session
        sessionManager.clearSession(session.id);
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: '❌ *Commit failed*\n\nError: ' + error.message,
            edit: processingMsg.key
        });
        await react('❌');
    }
}
