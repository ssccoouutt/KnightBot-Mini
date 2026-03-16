const phoneNumber = require('awesome-phonenumber');
const config = require('../../config');

module.exports = {
    name: 'numcheck',
    aliases: ['check', 'numberinfo', 'numinfo', 'whatsappcheck'],
    description: 'Get information about a WhatsApp number including online status',
    usage: 'numcheck [phone number]',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;

        if (args.length === 0) {
            await reply(`❌ *Please provide a phone number!*\n\nUsage: \`${config.prefix}numcheck [number]\`\n\n*Examples:*\n• \`${config.prefix}numcheck 1234567890\`\n• \`${config.prefix}numcheck +1234567890\`\n• \`${config.prefix}numcheck 447911123456\`\n\nInclude country code for accurate results.`);
            return;
        }

        let number = args.join(' ').trim();
        await react('⏳');
        await reply(`🔍 *Checking number:* ${number}\n\nPlease wait...`);

        try {
            // Clean the number
            const cleanNumber = number.replace(/[^0-9]/g, '');
            
            // Validate with awesome-phonenumber
            const pn = phoneNumber('+' + cleanNumber);
            const isValidPhone = pn.isValid();
            
            if (!isValidPhone) {
                await reply(`⚠️ *Warning:* The number may not be valid according to international standards.\nProceeding with check anyway...`);
            }

            // Format the JID
            const jid = cleanNumber + '@s.whatsapp.net';

            // Check if number exists on WhatsApp
            const presenceStart = Date.now();
            let onWhatsApp = false;
            let whatsappInfo = null;

            try {
                // Try to check if user exists on WhatsApp
                const result = await sock.onWhatsApp(jid);
                if (result && result.length > 0) {
                    onWhatsApp = result[0].exists;
                    if (result[0].jid) {
                        whatsappInfo = result[0];
                    }
                }
            } catch (checkError) {
                console.log('onWhatsApp check error:', checkError.message);
                // Continue anyway
            }

            // Try to get presence (online status)
            let presence = null;
            let lastSeen = null;
            let isOnline = false;

            if (onWhatsApp) {
                try {
                    // Request presence update
                    await sock.presenceSubscribe(jid);
                    
                    // Wait a bit for presence data
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Get presence from store if available
                    if (sock.store && sock.store.presences) {
                        const userPresence = sock.store.presences[jid];
                        if (userPresence) {
                            presence = userPresence;
                            if (presence.lastKnownPresence === 'available') {
                                isOnline = true;
                            }
                            if (presence.lastSeen) {
                                lastSeen = new Date(presence.lastSeen * 1000).toLocaleString();
                            }
                        }
                    }
                } catch (presenceError) {
                    console.log('Presence check error:', presenceError.message);
                }
            }

            // Try to get profile picture
            let profilePic = null;
            if (onWhatsApp) {
                try {
                    profilePic = await sock.profilePictureUrl(jid, 'image');
                } catch (ppError) {
                    // No profile picture
                }
            }

            // Try to get business profile if exists
            let isBusiness = false;
            let businessInfo = null;
            if (onWhatsApp) {
                try {
                    const bizProfile = await sock.getBusinessProfile(jid);
                    if (bizProfile) {
                        isBusiness = true;
                        businessInfo = bizProfile;
                    }
                } catch (bizError) {
                    // Not a business account
                }
            }

            // Calculate response time
            const responseTime = Date.now() - presenceStart;

            // Format the response - FIXED: Removed getNumberType()
            const formattedNumber = pn.getNumber('international') || `+${cleanNumber}`;
            const nationalNumber = pn.getNumber('national') || cleanNumber;
            const countryCode = pn.getCountryCode() || 'Unknown';
            const regionCode = pn.getRegionCode() || 'Unknown';
            const possible = pn.isPossible() ? 'Yes' : 'No';

            // Determine number type manually
            let numberType = 'Unknown';
            if (cleanNumber.length > 15) numberType = 'Possible Toll-Free';
            else if (cleanNumber.length < 10) numberType = 'Possible Local';
            else numberType = 'Mobile/Unknown';

            let resultText = `📱 *NUMBER INFORMATION*\n\n`;
            resultText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // Basic info
            resultText += `*📞 Number:* ${formattedNumber}\n`;
            resultText += `*🏷️ National:* ${nationalNumber}\n`;
            resultText += `*🌍 Country:* ${regionCode} (${countryCode})\n`;
            resultText += `*📋 Type:* ${numberType}\n`;
            resultText += `*✅ Valid Format:* ${isValidPhone ? 'Yes' : 'No'}\n`;
            resultText += `*🔢 Possible:* ${possible}\n\n`;
            
            resultText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // WhatsApp status
            resultText += `*💬 WhatsApp Status*\n`;
            resultText += `• *Registered:* ${onWhatsApp ? '✅ YES' : '❌ NO'}\n`;
            
            if (onWhatsApp) {
                resultText += `• *Online:* ${isOnline ? '🟢 Online Now' : '⚫ Offline'}\n`;
                if (lastSeen) {
                    resultText += `• *Last Seen:* ${lastSeen}\n`;
                }
                resultText += `• *Business:* ${isBusiness ? '✅ Yes' : '❌ No'}\n`;
                if (profilePic) {
                    resultText += `• *Profile Picture:* ✅ Available\n`;
                } else {
                    resultText += `• *Profile Picture:* ❌ Not set\n`;
                }
                resultText += `• *JID:* \`${jid}\`\n`;
            }
            
            resultText += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // Additional business info if available
            if (isBusiness && businessInfo) {
                resultText += `*🏢 Business Information*\n`;
                if (businessInfo.description) {
                    resultText += `• *Description:* ${businessInfo.description}\n`;
                }
                if (businessInfo.email) {
                    resultText += `• *Email:* ${businessInfo.email}\n`;
                }
                if (businessInfo.address) {
                    resultText += `• *Address:* ${businessInfo.address}\n`;
                }
                if (businessInfo.website) {
                    resultText += `• *Website:* ${businessInfo.website}\n`;
                }
                resultText += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
            }
            
            resultText += `*⚡ Response Time:* ${responseTime}ms\n`;
            resultText += `*🕐 Checked:* ${new Date().toLocaleString()}`;

            await react('✅');
            await reply(resultText);

            // If profile picture exists, send it
            if (profilePic) {
                await sock.sendMessage(from, {
                    image: { url: profilePic },
                    caption: `🖼️ *Profile Picture for ${formattedNumber}*`
                });
            }

            // Log the check
            console.log(`📱 Number check: ${formattedNumber} - WhatsApp: ${onWhatsApp ? 'Yes' : 'No'}`);

        } catch (error) {
            console.error('Number check error:', error);
            await react('❌');
            await reply(`❌ *Failed to check number*\n\nError: ${error.message}`);
        }
    }
};
