const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const GoogleDrive = require('../../utils/googleDrive');
const giftedBtns = require('gifted-btns');

const { sendButtons } = giftedBtns;
const FORCE_AI_MODE = true;

// Your specific file ID
const FILE_ID = "1NCIWtN_OoToORJ18XPC-1M6zQC8nFRr6";

module.exports = {
    name: 'editor',
    aliases: ['edit', 'append', 'timestamp'],
    description: 'Edit a Google Drive text file',
    usage: 'editor [read|append|clear|status]',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        const subCommand = args[0]?.toLowerCase() || 'append';
        
        await react('⏳');
        
        const drive = new GoogleDrive();
        
        try {
            const now = new Date();
            const timeString = now.toLocaleString('en-US', { 
                timeZone: 'Asia/Karachi',
                dateStyle: 'full',
                timeStyle: 'medium'
            });
            
            let currentContent = '';
            let result;
            
            switch (subCommand) {
                case 'read':
                case 'view':
                    // Just read and display the file
                    currentContent = await drive.readTextFile(FILE_ID);
                    await reply(
                        `📄 *File Content*\n\n` +
                        `\`\`\`\n${currentContent || '(empty)'}\n\`\`\``
                    );
                    break;
                    
                case 'append':
                case 'add':
                case '':
                    // Append timestamp
                    try {
                        currentContent = await drive.readTextFile(FILE_ID);
                    } catch {
                        currentContent = '';
                    }
                    
                    const newContent = currentContent + 
                        `\n[${timeString}] - Editor command executed`;
                    
                    result = await drive.editTextFile(FILE_ID, newContent);
                    
                    await reply(
                        `✅ *Timestamp Added*\n\n` +
                        `📝 *Appended:* \`${timeString}\`\n` +
                        `🔗 ${result.viewLink}`
                    );
                    break;
                    
                case 'clear':
                case 'reset':
                    // Clear the file and start fresh
                    const freshContent = `📝 File Edit History\nCreated: ${timeString}\n\n`;
                    result = await drive.editTextFile(FILE_ID, freshContent);
                    
                    await reply(
                        `🔄 *File Reset*\n\n` +
                        `📝 Created new history log\n` +
                        `🔗 ${result.viewLink}`
                    );
                    break;
                    
                case 'status':
                    // Show file info
                    const token = await drive.getAccessToken();
                    const axios = require('axios');
                    
                    const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${FILE_ID}`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                        params: { fields: 'name, size, createdTime, modifiedTime, webViewLink' }
                    });
                    
                    const fileInfo = response.data;
                    const sizeKB = (fileInfo.size / 1024).toFixed(2);
                    
                    await reply(
                        `📁 *File Information*\n\n` +
                        `📌 *Name:* ${fileInfo.name}\n` +
                        `📦 *Size:* ${sizeKB} KB\n` +
                        `📅 *Created:* ${new Date(fileInfo.createdTime).toLocaleString()}\n` +
                        `✏️ *Modified:* ${new Date(fileInfo.modifiedTime).toLocaleString()}\n` +
                        `🔗 ${fileInfo.webViewLink}`
                    );
                    break;
                    
                default:
                    await reply(`❌ Unknown command. Use: \`editor [read|append|clear|status]\``);
            }
            
            await react('✅');
            
        } catch (error) {
            console.error('Editor error:', error);
            await reply(`❌ Failed: ${error.message}`);
            await react('❌');
        } finally {
            drive.cleanup();
        }
    }
};
