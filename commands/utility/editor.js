const config = require('../../config');
const GoogleDrive = require('../../utils/googleDrive');
const path = require('path');
const fs = require('fs');

// Your new file ID from the link
// https://drive.google.com/file/d/1bK0_FSna8KzX-XgvlVlfHA9Al2M385qV/view
const FILE_ID = "1bK0_FSna8KzX-XgvlVlfHA9Al2M385qV";

module.exports = {
    name: 'editor',
    aliases: ['edit', 'append', 'timestamp'],
    description: 'Append current time to the activity log file',
    usage: 'editor',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        await react('⏳');
        
        const drive = new GoogleDrive();
        
        try {
            const now = new Date();
            const timeString = now.toLocaleString('en-US', { 
                timeZone: 'Asia/Karachi',
                dateStyle: 'full',
                timeStyle: 'medium'
            });
            
            // Read current content
            let currentContent = '';
            try {
                currentContent = await drive.readTextFile(FILE_ID);
                console.log(`📖 Read ${currentContent.split('\n').length} lines`);
            } catch (readError) {
                console.log('File read error:', readError.message);
                currentContent = '📝 Activity Log\n\n';
            }
            
            // Create new entry
            const userInfo = msg.key.participant || msg.key.remoteJid;
            const userNumber = userInfo.split('@')[0];
            
            const newEntry = `[${timeString}] - Editor command executed by ${userNumber}`;
            const newContent = currentContent + '\n' + newEntry;
            
            // Update file (preserves ID)
            const result = await drive.editTextFile(FILE_ID, newContent);
            
            // Show preview of last few entries
            const lines = newContent.split('\n');
            const lastEntries = lines.slice(-5).join('\n');
            
            await reply(
                `✅ *Activity Log Updated!*\n\n` +
                `📝 *New Entry:*\n\`${newEntry}\`\n\n` +
                `📋 *Last 5 Entries:*\n\`\`\`\n${lastEntries}\n\`\`\`\n\n` +
                `📁 *File:* ${result.name}\n` +
                `🔗 ${result.viewLink}`
            );
            
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
