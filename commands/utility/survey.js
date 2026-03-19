const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

module.exports = {
    name: 'survey',
    aliases: [],
    description: 'Take a quick survey',
    usage: 'survey',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create session
        const session = sessionManager.createSession(sender, from, this.name, {
            step: 1,
            answers: {}
        });
        
        await react('📝');
        const sentMsg = await reply(`📋 *Survey*\n\nStep 1/3: What's your name?`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        
        console.log(`✅ Survey session created: ${session.id}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, isButtonClick } = context;
        
        const text = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    '';
        
        if (isButtonClick) {
            await reply(`❌ Please type your response, don't use buttons for this command.`);
            return true;
        }
        
        if (!text) {
            await reply('❌ Please enter a valid response.');
            return true;
        }
        
        switch (session.step) {
            case 1:
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, name: text }
                });
                
                const sentMsg1 = await reply(`👋 Nice to meet you, *${text}*!\n\nStep 2/3: How old are you?`);
                sessionManager.addPendingMessage(sender, from, sentMsg1.key.id, this.name);
                break;
                
            case 2:
                const userAge = parseInt(text);  // Changed from 'age' to 'userAge'
                if (isNaN(userAge) || userAge < 1 || userAge > 120) {
                    await reply('❌ Please enter a valid age (1-120).');
                    return true;
                }
                
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, age: userAge }  // Store as 'age' in answers
                });
                
                const sentMsg2 = await reply(`📊 Age recorded: *${userAge}*\n\nStep 3/3: What's your favorite color?`);
                sessionManager.addPendingMessage(sender, from, sentMsg2.key.id, this.name);
                break;
                
            case 3:
                const { name, age } = session.data.answers;  // This is fine - 'age' comes from answers object
                
                // Clear the session when done
                sessionManager.clearSession(session.id);
                
                await reply(`✅ *Survey Complete!*\n\n` +
                           `📋 *Your Answers:*\n` +
                           `• Name: *${name}*\n` +
                           `• Age: *${age}*\n` +
                           `• Favorite Color: *${text}*`);
                break;
                
            default:
                // Clear session on error
                sessionManager.clearSession(session.id);
                await reply('❌ Session error. Please start over with `.survey`');
        }
        
        return true;
    }
};
