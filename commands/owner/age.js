const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

module.exports = {
    name: 'age',
    aliases: ['calculate-age', 'howold'],
    description: 'Calculate your age from birth year',
    usage: 'age',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Create a session for age calculation
        sessionManager.createSession(sender, from, this.name, {
            step: 1,
            data: {}
        });
        
        await react('📅');
        
        // Send first prompt and store message ID
        const sentMsg = await reply(`📅 *Age Calculator*\n\nPlease enter your birth year (e.g., 1990):`);
        sessionManager.addPendingMessage(sender, from, sentMsg.key.id, this.name);
        
        console.log(`✅ Age session created for ${sender}`);
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        // Get the message text
        const text = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    '';
        
        // Handle button clicks (not applicable for this command)
        if (isButtonClick) {
            await reply(`❌ Please type your birth year, don't use buttons.`);
            return true;
        }
        
        // Handle empty messages
        if (!text || text.trim() === '') {
            await reply('❌ Please enter a valid birth year.');
            return true;
        }
        
        const currentYear = new Date().getFullYear();
        
        switch (session.step) {
            case 1:
                // Validate birth year
                const birthYear = parseInt(text.trim());
                
                // Check if it's a valid number
                if (isNaN(birthYear)) {
                    await reply('❌ Please enter a valid number (e.g., 1990).');
                    return true;
                }
                
                // Check if year is realistic (between 1900 and current year)
                if (birthYear < 1900 || birthYear > currentYear) {
                    await reply(`❌ Please enter a year between 1900 and ${currentYear}.`);
                    return true;
                }
                
                // Calculate age
                let age = currentYear - birthYear;
                
                // Store the result
                sessionManager.updateSession(sender, from, {
                    data: {
                        birthYear,
                        age
                    }
                });
                
                // Ask if they want more precise calculation
                const sentMsg1 = await reply(`📊 You are approximately *${age} years old*.\n\nWould you like a more precise calculation? (yes/no)`);
                sessionManager.addPendingMessage(sender, from, sentMsg1.key.id, this.name);
                break;
                
            case 2:
                // Handle response for more precise calculation
                const response = text.trim().toLowerCase();
                const birthYearData = session.data.birthYear;
                
                if (response === 'yes' || response === 'y') {
                    // Ask for birth month
                    sessionManager.updateSession(sender, from, {
                        data: { ...session.data, preciseMode: true }
                    });
                    
                    const sentMsg2 = await reply(`📅 Please enter your birth month (1-12):`);
                    sessionManager.addPendingMessage(sender, from, sentMsg2.key.id, this.name);
                    
                } else if (response === 'no' || response === 'n') {
                    // End session with simple result
                    const { age } = session.data;
                    sessionManager.clearSession(sender, from);
                    
                    await reply(`✅ *Age Calculation Complete*\n\nYou are *${age} years old*.\n\nThank you for using the age calculator! 🎂`);
                    
                } else {
                    await reply(`❌ Please answer with "yes" or "no".`);
                    return true;
                }
                break;
                
            case 3:
                // Validate month
                const month = parseInt(text.trim());
                if (isNaN(month) || month < 1 || month > 12) {
                    await reply('❌ Please enter a valid month (1-12).');
                    return true;
                }
                
                sessionManager.updateSession(sender, from, {
                    data: { ...session.data, month }
                });
                
                // Ask for day
                const sentMsg3 = await reply(`📅 Please enter your birth day (1-31):`);
                sessionManager.addPendingMessage(sender, from, sentMsg3.key.id, this.name);
                break;
                
            case 4:
                // Validate day
                const day = parseInt(text.trim());
                const { birthYear: year, month: birthMonth } = session.data;
                
                // Simple day validation (not checking days per month for simplicity)
                if (isNaN(day) || day < 1 || day > 31) {
                    await reply('❌ Please enter a valid day (1-31).');
                    return true;
                }
                
                // Calculate precise age
                const today = new Date();
                const birthDate = new Date(year, birthMonth - 1, day);
                
                let preciseAge = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                
                // Adjust if birthday hasn't occurred yet this year
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    preciseAge--;
                }
                
                // Clear session
                sessionManager.clearSession(sender, from);
                
                // Send result with fun message
                const ageEmoji = preciseAge < 18 ? '🧒' : 
                                preciseAge < 30 ? '👨' : 
                                preciseAge < 50 ? '👴' : '🧓';
                
                await reply(`✅ *Age Calculation Complete*\n\n` +
                           `${ageEmoji} You are exactly *${preciseAge} years old*.\n\n` +
                           `📅 Born: ${year}-${birthMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}\n` +
                           `🎂 Happy birthday${preciseAge % 10 === 0 ? ' milestone' : ''}!`);
                break;
                
            default:
                // Unknown step - clear session
                sessionManager.clearSession(sender, from);
                await reply('❌ Session error. Please start over with `.age`');
        }
        
        return true;
    }
};
