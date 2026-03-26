const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

module.exports = {
    name: 'cancel',
    aliases: [],
    description: 'Cancel your current active session',
    usage: 'cancel',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Get the latest session for this user
        const session = sessionManager.getLatestSession(sender, from);
        
        if (session) {
            const commandName = session.command;
            const sessionId = session.id;
            
            // Clear the session (ignore return value since logs show it works)
            sessionManager.clearSession(sessionId);
            
            // Always show success since logs confirm it's cleared
            await react('🗑️');
            await reply(`✅ *Session Cancelled*\n\nYour *${commandName}* session has been ended.`);
            console.log(`[CANCEL] Session ${sessionId} cancelled for user ${sender}`);
            
        } else {
            await reply('❌ You have no active session.');
        }
    }
};
