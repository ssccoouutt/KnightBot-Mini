/**
 * Commit Command - Edit existing files or create new files in GitHub repositories
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
        
        console.log('[COMMIT] Fetching Google Drive token...');
        
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
        
        console.log('[COMMIT] GitHub credentials loaded successfully');
        return { token: githubToken, username: githubUsername };
        
    } catch (error) {
        console.error('[COMMIT] Failed to get GitHub credentials:', error.message);
        throw new Error(`Failed to load GitHub credentials: ${error.message}`);
    }
}

// ==================== GITHUB API FUNCTIONS ====================

async function getRepositoryContent(token, username, repoName, path = '') {
    try {
        const url = `https://api.github.com/repos/${username}/${repoName}/contents/${path}`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `token ${token}` }
        });
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            return null;
        }
        console.error(`[COMMIT] Error getting content:`, error.message);
        return null;
    }
}

async function getAllFilesInRepo(token, username, repoName, path = '', files = []) {
    try {
        const contents = await getRepositoryContent(token, username, repoName, path);
        
        if (!contents) return files;
        
        for (const item of contents) {
            if (item.type === 'file') {
                files.push({
                    name: item.name,
                    path: item.path,
                    sha: item.sha,
                    url: item.download_url
                });
            } else if (item.type === 'dir') {
                await getAllFilesInRepo(token, username, repoName, item.path, files);
            }
        }
        
        return files;
    } catch (error) {
        console.error(`[COMMIT] Error listing files:`, error.message);
        return files;
    }
}

async function findFilesByNameInRepo(token, username, repoName, fileName) {
    const allFiles = await getAllFilesInRepo(token, username, repoName);
    return allFiles.filter(file => file.name === fileName);
}

async function getFileContent(token, username, repoName, filePath) {
    try {
        const url = `https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (response.data && response.data.content) {
            const content = Buffer.from(response.data.content, 'base64').toString('utf8');
            const sha = response.data.sha;
            return { content, sha };
        }
        
        return null;
    } catch (error) {
        console.error(`[COMMIT] Error getting file content:`, error.message);
        return null;
    }
}

async function updateFileContent(token, username, repoName, filePath, content, sha, commitMessage) {
    try {
        const base64Content = Buffer.from(content, 'utf8').toString('base64');
        
        const response = await axios.put(
            `https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`,
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
        
        return response.data;
        
    } catch (error) {
        console.error(`[COMMIT] Error updating file:`, error.message);
        throw new Error(`Failed to update file: ${error.response?.data?.message || error.message}`);
    }
}

async function createNewFile(token, username, repoName, filePath, content, commitMessage) {
    try {
        const base64Content = Buffer.from(content, 'utf8').toString('base64');
        
        const response = await axios.put(
            `https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`,
            {
                message: commitMessage,
                content: base64Content
            },
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        return response.data;
        
    } catch (error) {
        console.error(`[COMMIT] Error creating file:`, error.message);
        throw new Error(`Failed to create file: ${error.response?.data?.message || error.message}`);
    }
}

// ==================== MAIN COMMAND ====================

module.exports = {
    name: 'commit',
    aliases: ['updatefile', 'replacefile', 'editfile', 'createfile'],
    description: 'Edit existing files or create new files in GitHub repositories',
    usage: '.commit <repo_name>\n.commit KnightBot-Mini',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args.length === 0) {
            return reply(`📝 *Commit Command*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}commit <repo_name>\` - Work with a repository\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}commit KnightBot-Mini\`\n\n` +
                       `*What you can do:*\n` +
                       `1. Edit an existing file (replace all content)\n` +
                       `2. Create a new file in any folder\n` +
                       `3. Push changes directly to GitHub\n\n` +
                       `*Note:* You need to have write access to the repository`);
        }
        
        const repoName = args[0];
        
        await react('📥');
        const processingMsg = await reply(`🔄 *Connecting to repository...*\n\nRepo: ${repoName}\n\nPlease wait...`);
        
        try {
            const { token, username } = await getGitHubCredentials();
            
            // Verify repository exists and is accessible
            try {
                await axios.get(`https://api.github.com/repos/${username}/${repoName}`, {
                    headers: { 'Authorization': `token ${token}` }
                });
            } catch (error) {
                if (error.response?.status === 404) {
                    await sock.sendMessage(from, {
                        text: `❌ Repository "${repoName}" not found for user ${username}.\n\nMake sure the repository name is correct and you have access.`,
                        edit: processingMsg.key
                    });
                    await react('❌');
                    return;
                }
                throw error;
            }
            
            // Create session
            const session = sessionManager.createSession(sender, from, 'commit', {
                step: 'selecting_action',
                repoName: repoName,
                username: username,
                token: token,
                selectedFile: null,
                fileContent: null,
                fileSha: null,
                newContent: '',
                contentParts: [],
                isNewFile: false,
                newFilePath: null
            });
            
            const sessionId = session.id.split(':').pop();
            
            const buttons = [
                { id: `commit_edit_${sessionId}`, text: '✏️ Edit Existing File' },
                { id: `commit_create_${sessionId}`, text: '📄 Create New File' },
                { id: 'cancel', text: '❌ Cancel' }
            ];
            
            await sock.sendMessage(from, {
                text: `✅ *Connected to repository*\n\n📁 *Repo:* ${repoName}\n👤 *Owner:* ${username}\n\nWhat would you like to do?`,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `📁 *Repository: ${repoName}*\n\nChoose an action:`,
                footer: 'Commit Tool',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
            
            await react('✅');
            
        } catch (error) {
            await sock.sendMessage(from, {
                text: `❌ *Failed to connect to repository*\n\nError: ${error.message}`,
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
            
            if (buttonId === 'cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Operation cancelled.`);
                return true;
            }
            
            if (buttonId && buttonId.startsWith('commit_edit_')) {
                sessionManager.updateSession(sender, from, { step: 'searching_file', isNewFile: false });
                await reply(`✏️ *Edit Existing File*\n\nSend me the exact filename you want to edit (e.g., config.js, handler.js, commands/owner/forward.js)\n\nType \`cancel\` to go back.`);
                return true;
            }
            
            if (buttonId && buttonId.startsWith('commit_create_')) {
                sessionManager.updateSession(sender, from, { step: 'getting_filepath', isNewFile: true });
                await reply(`📄 *Create New File*\n\nSend me the full path for the new file (e.g., commands/owner/newcommand.js, utils/helper.js)\n\nYou can create folders by including them in the path.\n\nType \`cancel\` to go back.`);
                return true;
            }
            
            if (buttonId && buttonId.startsWith('commit_file_')) {
                const parts = buttonId.split('_');
                const index = parseInt(parts[3]);
                const files = session.data.filesList;
                
                if (!isNaN(index) && index >= 0 && index < files.length) {
                    const selectedFile = files[index];
                    await handleFileSelected(sock, from, sender, reply, react, session, selectedFile);
                }
                return true;
            }
            
            if (buttonId === 'commit_done') {
                await handleCommitDone(sock, from, sender, reply, react, session);
                return true;
            }
            
            if (buttonId === 'commit_cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Operation cancelled.`);
                return true;
            }
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
            // Go back to previous step
            const currentStep = session.data.step;
            if (currentStep === 'searching_file' || currentStep === 'getting_filepath') {
                sessionManager.updateSession(sender, from, { step: 'selecting_action' });
                const sessionId = session.id.split(':').pop();
                const buttons = [
                    { id: `commit_edit_${sessionId}`, text: '✏️ Edit Existing File' },
                    { id: `commit_create_${sessionId}`, text: '📄 Create New File' },
                    { id: 'cancel', text: '❌ Cancel' }
                ];
                const sentMsg = await sendButtons(sock, from, {
                    text: `📁 *Repository: ${session.data.repoName}*\n\nChoose an action:`,
                    footer: 'Commit Tool',
                    buttons: buttons,
                    aimode: FORCE_AI_MODE
                }, {});
                sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
                return true;
            } else if (currentStep === 'collecting_content') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Operation cancelled.`);
                return true;
            }
            await reply(`❌ Cancelled.`);
            return true;
        }
        
        // Handle file search for editing
        if (session.data.step === 'searching_file') {
            await handleFileSearch(sock, from, sender, reply, react, session, text);
            return true;
        }
        
        // Handle new file path input
        if (session.data.step === 'getting_filepath') {
            sessionManager.updateSession(sender, from, {
                step: 'collecting_content',
                newFilePath: text,
                contentParts: [],
                newContent: null
            });
            
            const sessionId = session.id.split(':').pop();
            const buttons = [
                { id: 'commit_done', text: '✅ Done - Create File' },
                { id: 'commit_cancel', text: '❌ Cancel' }
            ];
            
            await reply(`✏️ *Creating new file: ${text}*\n\nSend the content for this file (can be multiple messages).\nWhen done, click the "Done - Create File" button.`);
            
            const sentMsg = await sendButtons(sock, from, {
                text: `📄 *Creating New File*\n\nPath: \`${text}\`\n\nSend the content (multiple messages allowed).\nClick "Done - Create File" when finished.`,
                footer: 'Commit Tool',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
            return true;
        }
        
        // Handle content collection
        if (session.data.step === 'collecting_content') {
            const contentParts = session.data.contentParts || [];
            contentParts.push(text);
            sessionManager.updateSession(sender, from, {
                contentParts: contentParts
            });
            
            await reply(`✅ Part ${contentParts.length} received. Total length: ${contentParts.join('').length} characters.\n\nSend more content or click the "Done" button to finish.`);
            return true;
        }
        
        return true;
    }
};

async function handleFileSearch(sock, from, sender, reply, react, session, fileName) {
    await react('🔍');
    const processingMsg = await reply(`🔍 *Searching for "${fileName}" in ${session.data.repoName}...*\n\nPlease wait...`);
    
    try {
        const { token, username } = await getGitHubCredentials();
        const repoName = session.data.repoName;
        
        // Search for files with matching name
        const files = await findFilesByNameInRepo(token, username, repoName, fileName);
        
        if (files.length === 0) {
            await sock.sendMessage(from, {
                text: `❌ No file named "${fileName}" found in ${repoName}.\n\nMake sure the filename is exact (including extension).\n\nTry again or type \`cancel\` to go back.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        // Store files list in session
        sessionManager.updateSession(sender, from, {
            filesList: files,
            step: 'selecting_file'
        });
        
        if (files.length === 1) {
            // Single file found, proceed directly
            await handleFileSelected(sock, from, sender, reply, react, session, files[0]);
        } else {
            // Multiple files, show selection
            const sessionId = session.id.split(':').pop();
            const buttons = [];
            
            for (let i = 0; i < Math.min(files.length, 15); i++) {
                const file = files[i];
                buttons.push({
                    id: `commit_file_${sessionId}_${i}`,
                    text: file.path.length > 50 ? file.path.substring(0, 47) + '...' : file.path
                });
            }
            buttons.push({ id: 'cancel', text: '❌ Cancel' });
            
            await sock.sendMessage(from, {
                text: `📁 *Multiple files named "${fileName}" found*\n\nSelect which file to edit:`,
                edit: processingMsg.key
            });
            
            const sentMsg = await sendButtons(sock, from, {
                text: `📁 *Select File to Edit*\n\nFound ${files.length} file(s) named "${fileName}":`,
                footer: 'Commit Tool',
                buttons: buttons,
                aimode: FORCE_AI_MODE
            }, {});
            
            sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
        }
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Search failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleFileSelected(sock, from, sender, reply, react, session, selectedFile) {
    await react('📥');
    const processingMsg = await reply(`📥 *Fetching file content...*\n\nFile: ${selectedFile.path}\n\nPlease wait...`);
    
    try {
        const { token, username } = await getGitHubCredentials();
        const repoName = session.data.repoName;
        
        // Get file content
        const fileData = await getFileContent(token, username, repoName, selectedFile.path);
        
        if (!fileData) {
            await sock.sendMessage(from, {
                text: `❌ Failed to fetch file content. Make sure the file exists.`,
                edit: processingMsg.key
            });
            await react('❌');
            return;
        }
        
        // Update session
        sessionManager.updateSession(sender, from, {
            step: 'collecting_content',
            selectedFile: selectedFile,
            fileContent: fileData.content,
            fileSha: fileData.sha,
            contentParts: [],
            newContent: null,
            isNewFile: false
        });
        
        // Show current content preview
        const contentPreview = fileData.content.length > 500 ? 
            fileData.content.substring(0, 500) + '\n\n... (truncated)' : 
            fileData.content;
        
        const sessionId = session.id.split(':').pop();
        
        const buttons = [
            { id: 'commit_done', text: '✅ Done - Commit Changes' },
            { id: 'commit_cancel', text: '❌ Cancel' }
        ];
        
        await sock.sendMessage(from, {
            text: `📄 *Current File Content*\n\n` +
                  `📁 *Repo:* ${repoName}\n` +
                  `📂 *Path:* ${selectedFile.path}\n` +
                  `📊 *Size:* ${fileData.content.length} characters\n\n` +
                  `*Preview:*\n\`\`\`\n${contentPreview}\n\`\`\`\n\n` +
                  `✏️ *Send the new content for this file.*\n\n` +
                  `You can send multiple messages (they will be combined).\n` +
                  `When done, click the "Done" button.`,
            edit: processingMsg.key
        });
        
        const sentMsg = await sendButtons(sock, from, {
            text: `✏️ *Editing File*\n\nPath: \`${selectedFile.path}\`\n\nSend the new content (multiple messages allowed).\nClick "Done - Commit Changes" when finished.`,
            footer: 'Commit Tool',
            buttons: buttons,
            aimode: FORCE_AI_MODE
        }, {});
        
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'commit');
        
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Failed to fetch file*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}

async function handleCommitDone(sock, from, sender, reply, react, session) {
    const contentParts = session.data.contentParts || [];
    const newContent = contentParts.join('');
    
    if (!newContent || newContent.trim().length === 0) {
        await reply(`❌ No content received. Please send the content first.`);
        return;
    }
    
    await react('📤');
    const processingMsg = await reply(`📤 *Committing changes...*\n\nPlease wait...`);
    
    try {
        const { token, username } = await getGitHubCredentials();
        const repoName = session.data.repoName;
        const isNewFile = session.data.isNewFile;
        
        let result;
        let commitMessage;
        
        if (isNewFile) {
            const filePath = session.data.newFilePath;
            commitMessage = `Create ${filePath}`;
            result = await createNewFile(token, username, repoName, filePath, newContent, commitMessage);
            
            await sock.sendMessage(from, {
                text: `✅ *File Created Successfully!*\n\n` +
                      `📁 *Repo:* ${repoName}\n` +
                      `📂 *Path:* ${filePath}\n` +
                      `📊 *Size:* ${newContent.length} characters\n` +
                      `💬 *Commit:* ${commitMessage}\n\n` +
                      `🔗 *View on GitHub:*\n${result.content?.html_url || `https://github.com/${username}/${repoName}/blob/main/${filePath}`}\n\n` +
                      `> *Powered by ${config.botName}*`,
                edit: processingMsg.key
            });
        } else {
            const selectedFile = session.data.selectedFile;
            const fileSha = session.data.fileSha;
            commitMessage = `Update ${selectedFile.path}`;
            result = await updateFileContent(token, username, repoName, selectedFile.path, newContent, fileSha, commitMessage);
            
            await sock.sendMessage(from, {
                text: `✅ *File Updated Successfully!*\n\n` +
                      `📁 *Repo:* ${repoName}\n` +
                      `📂 *Path:* ${selectedFile.path}\n` +
                      `📊 *New Size:* ${newContent.length} characters\n` +
                      `💬 *Commit:* ${commitMessage}\n\n` +
                      `🔗 *View on GitHub:*\n${result.content?.html_url || `https://github.com/${username}/${repoName}/blob/main/${selectedFile.path}`}\n\n` +
                      `> *Powered by ${config.botName}*`,
                edit: processingMsg.key
            });
        }
        
        // Clear session
        sessionManager.clearSession(session.id);
        await react('✅');
        
    } catch (error) {
        await sock.sendMessage(from, {
            text: `❌ *Commit failed*\n\nError: ${error.message}`,
            edit: processingMsg.key
        });
        await react('❌');
    }
}
