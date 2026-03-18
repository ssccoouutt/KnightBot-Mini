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
        
        const session = sessionManager.getSession(sender, from);
        
        if (session) {
            const commandName = session.command;
            sessionManager.clearSession(sender, from);
            await react('🗑️');
            await reply(`✅ *Session Cancelled*\n\nYour *${commandName}* session has been ended.`);
        } else {
            await reply('❌ You have no active session.');
        }
    }
};
