const config = require('../../config');

module.exports = {
    name: 'button',
    aliases: ['buttons', 'interactive', 'quickreply', 'cta'],
    description: 'Send interactive button messages (Yes/No, Call-to-Action, etc.)',
    usage: 'button <title> | <description> | <footer> | <button1>,<button2>,<button3>\n' +
           'button cta <title> | <description> | <button text> | <url>\n' +
           'button call <title> | <description> | <button text> | <phone number>',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await showHelp(sock, from, reply, config);
            return;
        }

        // Parse subcommands
        const subCommand = args[0].toLowerCase();

        if (subCommand === 'cta' && args.length >= 5) {
            // Format: button cta Title | Description | Button Text | URL
            const fullText = args.slice(1).join(' ');
            await handleCTASend(sock, from, fullText, reply, react);
        }
        else if (subCommand === 'call' && args.length >= 5) {
            // Format: button call Title | Description | Button Text | Phone
            const fullText = args.slice(1).join(' ');
            await handleCallButton(sock, from, fullText, reply, react);
        }
        else {
            // Default: quick reply buttons
            const fullText = args.join(' ');
            await handleQuickReply(sock, from, fullText, reply, react);
        }
    }
};

async function showHelp(sock, chatId, reply, config) {
    await reply(`🔘 *Interactive Button Messages*\n\n` +
                `Send messages with buttons for quick replies or actions.\n\n` +
                `*Quick Reply Buttons:*\n` +
                `\`${config.prefix}button Title | Description | Footer | Yes,No,Maybe\`\n` +
                `Example: \`${config.prefix}button Order Confirmation | Would you like to confirm? | Thank you | Confirm,Cancel\`\n\n` +
                
                `*Call-to-Action Button (URL):*\n` +
                `\`${config.prefix}button cta Title | Description | Button Text | https://example.com\`\n` +
                `Example: \`${config.prefix}button cta Special Offer | 50% off today! | Shop Now | https://example.com/sale\`\n\n` +
                
                `*Call-to-Action Button (Phone):*\n` +
                `\`${config.prefix}button call Title | Description | Button Text | +1234567890\`\n` +
                `Example: \`${config.prefix}button call Customer Support | Need help? | Call Now | +1234567890\``);
}

async function handleQuickReply(sock, chatId, text, reply, react) {
    await react('⏳');

    try {
        // Parse the format: Title | Description | Footer | Button1,Button2,Button3
        const parts = text.split('|').map(p => p.trim());
        
        if (parts.length < 4) {
            await reply(`❌ Invalid format!\n\nUse: \`button Title | Description | Footer | Button1,Button2,Button3\``);
            await react('❌');
            return;
        }

        const title = parts[0];
        const description = parts[1];
        const footer = parts[2];
        const buttonsText = parts[3].split(',').map(b => b.trim());

        if (buttonsText.length < 1 || buttonsText.length > 3) {
            await reply(`❌ You can only have 1-3 buttons.`);
            await react('❌');
            return;
        }

        // Create buttons array
        const buttons = buttonsText.map((btnText, index) => ({
            buttonId: `btn_${index}_${Date.now()}`,
            buttonText: { displayText: btnText },
            type: 1 // Quick reply button type
        }));

        // Prepare the interactive message
        const interactiveMessage = {
            body: { text: description },
            footer: { text: footer },
            header: { 
                type: 'text',
                text: title
            },
            nativeFlowMessage: {
                buttons: buttons
            }
        };

        // Send the interactive message
        await sock.sendMessage(chatId, {
            interactive: interactiveMessage
        });

        await react('✅');

    } catch (error) {
        console.error('Button send error:', error);
        await reply(`❌ Failed to send buttons: ${error.message}`);
        await react('❌');
    }
}

async function handleCTASend(sock, chatId, text, reply, react) {
    await react('⏳');

    try {
        // Parse the format: Title | Description | Button Text | URL
        const parts = text.split('|').map(p => p.trim());
        
        if (parts.length < 4) {
            await reply(`❌ Invalid format!\n\nUse: \`button cta Title | Description | Button Text | URL\``);
            await react('❌');
            return;
        }

        const title = parts[0];
        const description = parts[1];
        const buttonText = parts[2];
        const url = parts[3];

        // Validate URL
        try {
            new URL(url);
        } catch {
            await reply(`❌ Invalid URL format. Make sure to include http:// or https://`);
            await react('❌');
            return;
        }

        // Create URL button
        const button = {
            buttonId: `cta_${Date.now()}`,
            buttonText: { displayText: buttonText },
            type: 2, // URL button type
            url: url
        };

        // Prepare the interactive message
        const interactiveMessage = {
            body: { text: description },
            header: { 
                type: 'text',
                text: title
            },
            nativeFlowMessage: {
                buttons: [button]
            }
        };

        // Send the interactive message
        await sock.sendMessage(chatId, {
            interactive: interactiveMessage
        });

        await react('✅');

    } catch (error) {
        console.error('CTA button error:', error);
        await reply(`❌ Failed to send CTA button: ${error.message}`);
        await react('❌');
    }
}

async function handleCallButton(sock, chatId, text, reply, react) {
    await react('⏳');

    try {
        // Parse the format: Title | Description | Button Text | Phone Number
        const parts = text.split('|').map(p => p.trim());
        
        if (parts.length < 4) {
            await reply(`❌ Invalid format!\n\nUse: \`button call Title | Description | Button Text | Phone Number\``);
            await react('❌');
            return;
        }

        const title = parts[0];
        const description = parts[1];
        const buttonText = parts[2];
        let phoneNumber = parts[3];

        // Clean phone number (remove + if present, ensure numbers only)
        phoneNumber = phoneNumber.replace(/\D/g, '');

        if (!phoneNumber) {
            await reply(`❌ Invalid phone number.`);
            await react('❌');
            return;
        }

        // Create call button
        const button = {
            buttonId: `call_${Date.now()}`,
            buttonText: { displayText: buttonText },
            type: 3, // Phone number button type
            phoneNumber: phoneNumber
        };

        // Prepare the interactive message
        const interactiveMessage = {
            body: { text: description },
            header: { 
                type: 'text',
                text: title
            },
            nativeFlowMessage: {
                buttons: [button]
            }
        };

        // Send the interactive message
        await sock.sendMessage(chatId, {
            interactive: interactiveMessage
        });

        await react('✅');

    } catch (error) {
        console.error('Call button error:', error);
        await reply(`❌ Failed to send call button: ${error.message}`);
        await react('❌');
    }
}
