const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

module.exports = {
    name: 'survey',
    aliases: [],
    description: 'Test multi-step session with a simple survey',
    usage: 'survey',
    category: 'utility',
    ownerOnly: false,

    // Start the survey session
    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create a new session
        sessionManager.createSession(sender, from, 'survey', {
            step: 1,
            answers: {}
        });
        
        await react('📝');
        
        // Send message and capture its ID
        const sentMsg = await sock.sendMessage(from, { 
            text: `📋 *Quick Survey*\n\nStep 1/3: What's your name?` 
        });
        
        // Store this message ID in session
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, 'survey');
    },
    
    // Handle survey responses
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply } = context;
        
        // Get the message text
        const text = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    '';
        
        if (!text) {
            await reply('❌ Please enter a valid response.');
            return true;
        }
        
        switch (session.step) {
            case 1:
                // Save name and ask for age
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, name: text }
                });
                
                const sentMsg1 = await reply(`👋 Nice to meet you, *${text}*!\n\nStep 2/3: How old are you?`);
                sessionManager.addPendingMessage(sender, from, sentMsg1.key.id, 'survey');
                break;
                
            case 2:
                const userAge = parseInt(text);
                if (isNaN(userAge) || userAge < 1 || userAge > 120) {
                    await reply('❌ Please enter a valid age (1-120).');
                    return true;
                }
                
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, age: userAge }
                });
                
                const sentMsg2 = await reply(`📊 Age recorded: *${userAge}*\n\nStep 3/3: What's your favorite color?`);
                sessionManager.addPendingMessage(sender, from, sentMsg2.key.id, 'survey');
                break;
                
            case 3:
                const { name, age } = session.data.answers;
                
                // Clear the session
                sessionManager.clearSession(sender, from);
                
                await reply(`✅ *Survey Complete!*\n\n` +
                           `📋 *Your Answers:*\n` +
                           `• Name: *${name}*\n` +
                           `• Age: *${age}*\n` +
                           `• Favorite Color: *${text}*\n\n` +
                           `Thanks for participating! 🎉`);
                break;
        }
        
        return true;
    }
};
