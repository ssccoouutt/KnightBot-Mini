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
        
        // Create a new session for this user in this chat
        sessionManager.createSession(sender, from, 'survey', {
            step: 1,
            answers: {}
        });
        
        await react('📝');
        await reply(`📋 *Quick Survey*\n\n` +
                   `Step 1/3: What's your name?`);
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
            return true; // Keep session alive
        }
        
        // Process based on current step
        switch (session.step) {
            case 1:
                // Save name and ask for age
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, name: text }
                });
                await reply(`👋 Nice to meet you, *${text}*!\n\n` +
                           `Step 2/3: How old are you?`);
                break;
                
            case 2:
                // Validate age
                const age = parseInt(text);
                if (isNaN(age) || age < 1 || age > 120) {
                    await reply('❌ Please enter a valid age (1-120).');
                    return true; // Keep session alive
                }
                
                // Save age and ask for favorite color
                sessionManager.updateSession(sender, from, { 
                    answers: { ...session.data.answers, age: age }
                });
                await reply(`📊 Age recorded: *${age}*\n\n` +
                           `Step 3/3: What's your favorite color?`);
                break;
                
            case 3:
                // Save favorite color
                const { name, age } = session.data.answers;
                
                // Clear the session
                sessionManager.clearSession(sender, from);
                
                // Show complete results
                await reply(`✅ *Survey Complete!*\n\n` +
                           `📋 *Your Answers:*\n` +
                           `• Name: *${name}*\n` +
                           `• Age: *${age}*\n` +
                           `• Favorite Color: *${text}*\n\n` +
                           `Thanks for participating! 🎉`);
                
                // Log for debugging
                console.log(`📊 Survey completed by ${sender}:`, {
                    name,
                    age,
                    color: text
                });
                break;
                
            default:
                // Unknown step - clear session
                sessionManager.clearSession(sender, from);
                await reply('❌ Session error. Please start over with `.survey`');
        }
        
        return true; // Session handled
    }
};
