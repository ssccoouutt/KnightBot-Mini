const config = require('../../config');
const util = require('util');

// Try to import gifted-btns with debugging
let giftedBtns;
try {
    giftedBtns = require('gifted-btns');
    console.log('✅ [DEBUG] gifted-btns loaded successfully');
    console.log('📦 [DEBUG] Available exports:', Object.keys(giftedBtns));
} catch (importError) {
    console.error('❌ [DEBUG] Failed to import gifted-btns:', importError.message);
    console.log('💡 [DEBUG] Run: npm install gifted-btns');
    giftedBtns = {};
}

// Destructure with debugging
const {
    sendButtons,
    sendList,
    sendAIMode,
    sendNativeFlow,
    sendCTA
} = giftedBtns;

// Log available functions
console.log('\n🔍 [DEBUG] Gifted-btns functions:');
console.log(`   sendButtons: ${typeof sendButtons}`);
console.log(`   sendList: ${typeof sendList}`);
console.log(`   sendAIMode: ${typeof sendAIMode}`);
console.log(`   sendNativeFlow: ${typeof sendNativeFlow}`);
console.log(`   sendCTA: ${typeof sendCTA}\n`);

module.exports = {
    name: 'button',
    aliases: ['buttons', 'interactive', 'quickreply', 'cta', 'debugbtn'],
    description: 'Send interactive button messages (with full debugging)',
    usage: 'button [type] [parameters]',
    category: 'utility',
    ownerOnly: false,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;
        const startTime = Date.now();

        console.log('\n' + '='.repeat(60));
        console.log('🔘 BUTTON COMMAND EXECUTED');
        console.log('='.repeat(60));
        console.log(`📥 Input args:`, args);
        console.log(`👤 From: ${from}`);
        console.log(`⏱️  Time: ${new Date().toISOString()}`);

        if (args.length === 0) {
            console.log('ℹ️ No arguments provided, showing help');
            await showDebugHelp(sock, from, reply, config);
            return;
        }

        const subCommand = args[0].toLowerCase();
        console.log(`\n🔍 Subcommand: "${subCommand}"`);
        
        await react('⏳');
        const processingMsg = await reply(`🔍 *Debug Mode Active*\n\nTesting button type: *${subCommand}*`);

        try {
            // Log available functions for this subcommand
            console.log('\n📋 Available functions check:');
            console.log(`   sendButtons: ${sendButtons ? '✅' : '❌'} (${typeof sendButtons})`);
            console.log(`   sendList: ${sendList ? '✅' : '❌'} (${typeof sendList})`);
            console.log(`   sendAIMode: ${sendAIMode ? '✅' : '❌'} (${typeof sendAIMode})`);

            let result;
            
            switch (subCommand) {
                case 'native':
                case 'flow':
                    console.log('\n🎯 Testing Native Flow Buttons');
                    result = await testNativeFlow(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'url':
                case 'cta_url':
                    console.log('\n🎯 Testing CTA URL Buttons');
                    result = await testCTAUrl(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'call':
                case 'cta_call':
                    console.log('\n🎯 Testing CTA Call Buttons');
                    result = await testCTACall(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'copy':
                case 'cta_copy':
                    console.log('\n🎯 Testing CTA Copy Buttons');
                    result = await testCTACopy(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'location':
                case 'cta_location':
                    console.log('\n🎯 Testing CTA Location Buttons');
                    result = await testCTALocation(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'list':
                    console.log('\n🎯 Testing List Message');
                    result = await testList(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'ai':
                case 'aimode':
                    console.log('\n🎯 Testing AI Mode');
                    result = await testAIMode(sock, from, args.slice(1).join(' '), msg, reply, processingMsg);
                    break;
                    
                case 'combo':
                case 'all':
                    console.log('\n🎯 Testing Combo (All Types)');
                    result = await testCombo(sock, from, msg, reply, processingMsg);
                    break;
                    
                case 'functions':
                case 'listall':
                    console.log('\n📋 Listing all available functions');
                    await listAllFunctions(sock, from, reply, processingMsg);
                    return;
                    
                case 'inspect':
                case 'debug':
                    console.log('\n🔍 Inspecting gifted-btns module');
                    await inspectModule(sock, from, giftedBtns, reply, processingMsg);
                    return;
                    
                default:
                    console.log(`❌ Unknown subcommand: ${subCommand}`);
                    await showDebugHelp(sock, from, reply, config, processingMsg);
            }
            
            const elapsed = Date.now() - startTime;
            console.log(`\n✅ Command completed in ${elapsed}ms`);
            await react('✅');
            
        } catch (error) {
            const elapsed = Date.now() - startTime;
            console.error('\n❌ ERROR DETAILS:');
            console.error('='.repeat(40));
            console.error(`Message: ${error.message}`);
            console.error(`Stack: ${error.stack}`);
            console.error(`Time: ${elapsed}ms`);
            
            if (error.errors) {
                console.error('Validation errors:', error.errors);
            }
            if (error.warnings) {
                console.error('Warnings:', error.warnings);
            }
            
            // Try to inspect the error object fully
            console.error('\n🔍 Full error inspection:');
            console.error(util.inspect(error, { showHidden: true, depth: null }));
            
            await sendErrorMessage(sock, from, error, processingMsg, reply);
            await react('❌');
        }
    }
};

async function showDebugHelp(sock, chatId, reply, config, processingMsg = null) {
    const helpText = `🔘 *Button Command Debug Help*\n\n` +
                    `*Available test commands:*\n\n` +
                    
                    `1️⃣ *Native Flow*\n` +
                    `└ \`${config.prefix}button native Question | Button1,Button2,Button3\`\n` +
                    `└ Example: \`${config.prefix}button native Do you like pizza? | Yes,No,Maybe\`\n\n` +
                    
                    `2️⃣ *CTA URL*\n` +
                    `└ \`${config.prefix}button url Title | Desc | Button | URL\`\n` +
                    `└ Example: \`${config.prefix}button url Offer | 50% off | Shop | https://google.com\`\n\n` +
                    
                    `3️⃣ *CTA Call*\n` +
                    `└ \`${config.prefix}button call Title | Desc | Button | Phone\`\n` +
                    `└ Example: \`${config.prefix}button call Support | Need help? | Call | +1234567890\`\n\n` +
                    
                    `4️⃣ *CTA Copy*\n` +
                    `└ \`${config.prefix}button copy Title | Desc | Button | Text\`\n` +
                    `└ Example: \`${config.prefix}button copy Coupon | Save 20% | Copy | SAVE20\`\n\n` +
                    
                    `5️⃣ *CTA Location*\n` +
                    `└ \`${config.prefix}button location Title | Desc | Button | lat,long\`\n` +
                    `└ Example: \`${config.prefix}button location Store | Visit | Map | 40.7128,-74.0060\`\n\n` +
                    
                    `6️⃣ *List*\n` +
                    `└ \`${config.prefix}button list Title | Desc | Option1,Option2,Option3\`\n` +
                    `└ Example: \`${config.prefix}button list Menu | Choose | Pizza,Burger,Pasta\`\n\n` +
                    
                    `7️⃣ *AI Mode*\n` +
                    `└ \`${config.prefix}button ai [on/off]\`\n` +
                    `└ Example: \`${config.prefix}button ai on\`\n\n` +
                    
                    `8️⃣ *Combo*\n` +
                    `└ \`${config.prefix}button combo\`\n\n` +
                    
                    `9️⃣ *Debug Commands*\n` +
                    `└ \`${config.prefix}button functions\` - List all functions\n` +
                    `└ \`${config.prefix}button inspect\` - Inspect module\n`;

    if (processingMsg) {
        await sock.sendMessage(chatId, {
            text: helpText,
            edit: processingMsg.key
        });
    } else {
        await reply(helpText);
    }
}

async function sendErrorMessage(sock, chatId, error, processingMsg, reply) {
    let errorText = `❌ *Button Error*\n\n`;
    errorText += `*Message:* ${error.message}\n\n`;
    
    if (error.errors) {
        errorText += `*Validation Errors:*\n`;
        error.errors.forEach(e => errorText += `• ${e}\n`);
        errorText += '\n';
    }
    
    if (error.warnings && error.warnings.length > 0) {
        errorText += `*Warnings:*\n`;
        error.warnings.forEach(w => errorText += `• ${w}\n`);
        errorText += '\n';
    }
    
    errorText += `*Stack:*\n\`\`\`\n${error.stack?.substring(0, 500)}...\n\`\`\``;
    
    if (processingMsg) {
        await sock.sendMessage(chatId, {
            text: errorText,
            edit: processingMsg.key
        });
    } else {
        await reply(errorText);
    }
}

async function listAllFunctions(sock, chatId, reply, processingMsg) {
    let text = `📋 *Gifted-Buttons Available Functions*\n\n`;
    
    const functions = [
        { name: 'sendButtons', fn: sendButtons },
        { name: 'sendList', fn: sendList },
        { name: 'sendAIMode', fn: sendAIMode },
        { name: 'sendNativeFlow', fn: sendNativeFlow },
        { name: 'sendCTA', fn: sendCTA }
    ];
    
    functions.forEach(f => {
        text += `• *${f.name}*: ${f.fn ? '✅ Available' : '❌ Not Available'}\n`;
        if (f.fn) {
            text += `  Type: ${typeof f.fn}\n`;
            text += `  Parameters: ${f.fn.length}\n`;
        }
    });
    
    text += `\n*Module Exports:*\n`;
    Object.keys(giftedBtns).forEach(key => {
        text += `• ${key}: ${typeof giftedBtns[key]}\n`;
    });
    
    await sock.sendMessage(chatId, {
        text: text,
        edit: processingMsg.key
    });
}

async function inspectModule(sock, chatId, module, reply, processingMsg) {
    let text = `🔍 *Module Inspection*\n\n`;
    
    try {
        text += `*Full exports:*\n`;
        Object.keys(module).forEach(key => {
            const value = module[key];
            text += `• ${key}: ${typeof value}`;
            if (typeof value === 'function') {
                text += ` (length: ${value.length})`;
            }
            text += '\n';
        });
        
        // Try to get function source
        if (sendButtons) {
            text += `\n*sendButtons source preview:*\n`;
            text += '```\n' + sendButtons.toString().substring(0, 300) + '...\n```\n';
        }
        
    } catch (e) {
        text += `\n❌ Inspection error: ${e.message}`;
    }
    
    await sock.sendMessage(chatId, {
        text: text,
        edit: processingMsg.key
    });
}

// 1️⃣ Test Native Flow Buttons
async function testNativeFlow(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing Native Flow:');
    console.log(`   Input text: "${text}"`);
    
    const parts = text.split('|').map(p => p.trim());
    console.log(`   Parsed parts:`, parts);
    
    if (parts.length < 2) {
        console.log('❌ Invalid format - need at least 2 parts');
        await sock.sendMessage(chatId, {
            text: '❌ Format: `button native Question | Button1,Button2,Button3`',
            edit: processingMsg.key
        });
        return;
    }

    const question = parts[0];
    const buttonsText = parts[1].split(',').map(b => b.trim());
    
    console.log(`   Question: "${question}"`);
    console.log(`   Buttons:`, buttonsText);

    // Create buttons array
    const buttons = buttonsText.map((btnText, index) => {
        const buttonId = `btn_${Date.now()}_${index}_${Math.random().toString(36).substring(7)}`;
        console.log(`   Creating button ${index}: "${btnText}" (ID: ${buttonId})`);
        
        return {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: btnText,
                id: buttonId
            })
        };
    });

    const payload = {
        text: question,
        footer: 'Debug Mode - Choose option',
        buttons: buttons
    };
    
    console.log('\n📦 Final payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    console.log('\n📤 Calling sendButtons...');
    
    try {
        const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendButtons success');
        console.log('📥 Response:', result);
        
        await sock.sendMessage(chatId, {
            text: '✅ Native flow buttons sent successfully!',
            edit: processingMsg.key
        });
    } catch (error) {
        console.error('❌ sendButtons failed:', error);
        throw error;
    }
}

// 2️⃣ Test CTA URL Buttons
async function testCTAUrl(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing CTA URL:');
    console.log(`   Input text: "${text}"`);
    
    const parts = text.split('|').map(p => p.trim());
    console.log(`   Parsed parts:`, parts);
    
    if (parts.length < 4) {
        await sock.sendMessage(chatId, {
            text: '❌ Format: `button url Title | Description | Button Text | URL`',
            edit: processingMsg.key
        });
        return;
    }

    const [title, description, buttonText, url] = parts;
    
    console.log(`   Title: "${title}"`);
    console.log(`   Description: "${description}"`);
    console.log(`   Button: "${buttonText}"`);
    console.log(`   URL: "${url}"`);

    // Validate URL
    try {
        new URL(url);
        console.log('✅ URL is valid');
    } catch {
        console.log('❌ URL is invalid');
        await sock.sendMessage(chatId, {
            text: '❌ Invalid URL format',
            edit: processingMsg.key
        });
        return;
    }

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                url: url
            })
        }]
    };
    
    console.log('\n📦 Final payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    try {
        const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendButtons success');
        
        await sock.sendMessage(chatId, {
            text: '✅ CTA URL button sent successfully!',
            edit: processingMsg.key
        });
    } catch (error) {
        console.error('❌ sendButtons failed:', error);
        throw error;
    }
}

// 3️⃣ Test CTA Call Buttons
async function testCTACall(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing CTA Call:');
    console.log(`   Input text: "${text}"`);
    
    const parts = text.split('|').map(p => p.trim());
    console.log(`   Parsed parts:`, parts);
    
    if (parts.length < 4) {
        await sock.sendMessage(chatId, {
            text: '❌ Format: `button call Title | Description | Button Text | Phone`',
            edit: processingMsg.key
        });
        return;
    }

    const [title, description, buttonText, phone] = parts;
    const cleanPhone = phone.replace(/\D/g, '');
    
    console.log(`   Title: "${title}"`);
    console.log(`   Description: "${description}"`);
    console.log(`   Button: "${buttonText}"`);
    console.log(`   Phone: "${phone}" -> Clean: "${cleanPhone}"`);

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_call',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                phone_number: cleanPhone
            })
        }]
    };
    
    console.log('\n📦 Final payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    try {
        const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendButtons success');
        
        await sock.sendMessage(chatId, {
            text: '✅ CTA Call button sent successfully!',
            edit: processingMsg.key
        });
    } catch (error) {
        console.error('❌ sendButtons failed:', error);
        throw error;
    }
}

// 4️⃣ Test CTA Copy Buttons
async function testCTACopy(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing CTA Copy:');
    console.log(`   Input text: "${text}"`);
    
    const parts = text.split('|').map(p => p.trim());
    console.log(`   Parsed parts:`, parts);
    
    if (parts.length < 4) {
        await sock.sendMessage(chatId, {
            text: '❌ Format: `button copy Title | Description | Button Text | Text to copy`',
            edit: processingMsg.key
        });
        return;
    }

    const [title, description, buttonText, copyText] = parts;
    
    console.log(`   Title: "${title}"`);
    console.log(`   Description: "${description}"`);
    console.log(`   Button: "${buttonText}"`);
    console.log(`   Copy Text: "${copyText}"`);

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                copy_code: copyText
            })
        }]
    };
    
    console.log('\n📦 Final payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    try {
        const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendButtons success');
        
        await sock.sendMessage(chatId, {
            text: '✅ CTA Copy button sent successfully!',
            edit: processingMsg.key
        });
    } catch (error) {
        console.error('❌ sendButtons failed:', error);
        throw error;
    }
}

// 5️⃣ Test CTA Location Buttons
async function testCTALocation(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing CTA Location:');
    console.log(`   Input text: "${text}"`);
    
    const parts = text.split('|').map(p => p.trim());
    console.log(`   Parsed parts:`, parts);
    
    if (parts.length < 4) {
        await sock.sendMessage(chatId, {
            text: '❌ Format: `button location Title | Description | Button Text | lat,long`',
            edit: processingMsg.key
        });
        return;
    }

    const [title, description, buttonText, coordinates] = parts;
    const [lat, long] = coordinates.split(',').map(c => parseFloat(c.trim()));
    
    console.log(`   Title: "${title}"`);
    console.log(`   Description: "${description}"`);
    console.log(`   Button: "${buttonText}"`);
    console.log(`   Coordinates: ${lat}, ${long}`);

    if (isNaN(lat) || isNaN(long)) {
        console.log('❌ Invalid coordinates');
        await sock.sendMessage(chatId, {
            text: '❌ Invalid coordinates. Use format: lat,long (e.g., 40.7128,-74.0060)',
            edit: processingMsg.key
        });
        return;
    }

    const payload = {
        text: `${title}\n\n${description}`,
        buttons: [{
            name: 'cta_location',
            buttonParamsJson: JSON.stringify({
                display_text: buttonText,
                latitude: lat,
                longitude: long
            })
        }]
    };
    
    console.log('\n📦 Final payload:');
    console.log(JSON.stringify(payload, null, 2));
    
    try {
        const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendButtons success');
        
        await sock.sendMessage(chatId, {
            text: '✅ CTA Location button sent successfully!',
            edit: processingMsg.key
        });
    } catch (error) {
        console.error('❌ sendButtons failed:', error);
        throw error;
    }
}

// 6️⃣ Test List Message
async function testList(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing List Message:');
    console.log(`   Input text: "${text}"`);
    
    const parts = text.split('|').map(p => p.trim());
    console.log(`   Parsed parts:`, parts);
    
    if (parts.length < 3) {
        await sock.sendMessage(chatId, {
            text: '❌ Format: `button list Title | Description | Option1,Option2,Option3`',
            edit: processingMsg.key
        });
        return;
    }

    const [title, description, optionsText] = parts;
    const options = optionsText.split(',').map(o => o.trim());
    
    console.log(`   Title: "${title}"`);
    console.log(`   Description: "${description}"`);
    console.log(`   Options:`, options);

    // Try different methods based on what's available
    if (sendList && typeof sendList === 'function') {
        console.log('📤 Using sendList method');
        
        const sections = [{
            title: title,
            rows: options.map((opt, index) => ({
                title: opt,
                description: `Select ${opt}`,
                rowId: `opt_${Date.now()}_${index}`
            }))
        }];
        
        const payload = {
            text: description,
            footer: title,
            title: title,
            buttonText: '📋 Choose Option',
            sections: sections
        };
        
        console.log('📦 Payload:', JSON.stringify(payload, null, 2));
        
        try {
            const result = await sendList(sock, chatId, payload, { quoted: quotedMsg });
            console.log('✅ sendList success');
            
            await sock.sendMessage(chatId, {
                text: '✅ List message sent successfully!',
                edit: processingMsg.key
            });
            return;
        } catch (error) {
            console.log('❌ sendList failed, falling back to buttons');
        }
    }
    
    // Fallback to sendButtons
    console.log('📤 Using sendButtons fallback');
    
    const buttons = [{
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: '📋 Show Options',
            id: `list_btn_${Date.now()}`
        })
    }];
    
    const optionsText2 = options.map(o => `• ${o}`).join('\n');
    const payload2 = {
        text: `${title}\n\n${description}\n\n*Options:*\n${optionsText2}`,
        buttons: buttons
    };
    
    console.log('📦 Fallback payload:', JSON.stringify(payload2, null, 2));
    
    const result = await sendButtons(sock, chatId, payload2, { quoted: quotedMsg });
    console.log('✅ sendButtons success');
    
    await sock.sendMessage(chatId, {
        text: '✅ List (as buttons) sent successfully!',
        edit: processingMsg.key
    });
}

// 7️⃣ Test AI Mode
async function testAIMode(sock, chatId, text, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing AI Mode:');
    console.log(`   Input text: "${text}"`);
    
    const mode = text.toLowerCase().trim();
    console.log(`   Mode: "${mode}"`);
    
    if (sendAIMode && typeof sendAIMode === 'function') {
        console.log('📤 Using sendAIMode method');
        
        let payload;
        if (mode === 'on' || mode === 'true' || mode === '1') {
            payload = {
                status: 'on',
                text: '✨ *AI Mode Enabled*\n\nI can help you with questions and tasks!'
            };
        } else if (mode === 'off' || mode === 'false' || mode === '0') {
            payload = {
                status: 'off',
                text: '🔕 *AI Mode Disabled*'
            };
        } else {
            payload = {
                status: 'toggle',
                text: '🤖 *AI Assistant*\n\nEnable AI mode?',
                buttons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '✅ Yes',
                            id: 'ai_on'
                        })
                    },
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: '❌ No',
                            id: 'ai_off'
                        })
                    }
                ]
            };
        }
        
        console.log('📦 Payload:', JSON.stringify(payload, null, 2));
        
        const result = await sendAIMode(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendAIMode success');
        
        await sock.sendMessage(chatId, {
            text: '✅ AI Mode message sent!',
            edit: processingMsg.key
        });
    } else {
        console.log('📤 sendAIMode not available, using sendButtons');
        
        let text;
        if (mode === 'on' || mode === 'true' || mode === '1') {
            text = '✨ *AI Mode Enabled* (Demo)';
        } else if (mode === 'off' || mode === 'false' || mode === '0') {
            text = '🔕 *AI Mode Disabled* (Demo)';
        } else {
            text = '🤖 *AI Mode*\n\nThis is a demo. Enable?';
        }
        
        const payload = {
            text: text,
            buttons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '✅ Enable',
                        id: 'ai_on_demo'
                    })
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '❌ Disable',
                        id: 'ai_off_demo'
                    })
                }
            ]
        };
        
        const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
        console.log('✅ sendButtons success');
        
        await sock.sendMessage(chatId, {
            text: '✅ AI Mode (demo) sent!',
            edit: processingMsg.key
        });
    }
}

// 8️⃣ Test Combo (All Types)
async function testCombo(sock, chatId, quotedMsg, reply, processingMsg) {
    console.log('\n📝 Testing Combo Message');
    
    const payload = {
        text: '🔘 *All Button Types Demo*\n\nTry each button type:',
        footer: 'Debug Mode',
        buttons: [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '✅ Yes',
                    id: `combo_yes_${Date.now()}`
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '❌ No',
                    id: `combo_no_${Date.now()}`
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🌐 Google',
                    url: 'https://google.com'
                })
            },
            {
                name: 'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: '📞 Call',
                    phone_number: '1234567890'
                })
            },
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: '📋 Copy',
                    copy_code: 'DEMO123'
                })
            }
        ]
    };
    
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    const result = await sendButtons(sock, chatId, payload, { quoted: quotedMsg });
    console.log('✅ sendButtons success');
    
    await sock.sendMessage(chatId, {
        text: '✅ Combo message sent successfully!',
        edit: processingMsg.key
    });
}
