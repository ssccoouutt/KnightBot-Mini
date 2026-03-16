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
            const presenceStart = Date.now();
            
            let onWhatsApp = false;
            let presence = null;
            let lastSeen = null;
            let isOnline = false;
            let profilePic = null;
            let isBusiness = false;
            let businessInfo = null;

            try {
                // First check if number exists on WhatsApp
                const result = await sock.onWhatsApp(jid);
                if (result && result.length > 0) {
                    onWhatsApp = result[0].exists;
                }
            } catch (checkError) {
                console.log('onWhatsApp check error:', checkError.message);
            }

            if (onWhatsApp) {
                // Subscribe to presence updates (this is key for online/last seen)
                try {
                    await sock.presenceSubscribe(jid);
                    
                    // Wait for presence data to arrive
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Check store for presence data
                    if (sock.store && sock.store.presences) {
                        const userPresence = sock.store.presences[jid];
                        if (userPresence) {
                            presence = userPresence;
                            
                            // Check online status
                            if (presence.lastKnownPresence === 'available') {
                                isOnline = true;
                                lastSeen = 'Currently Online';
                            } else if (presence.lastKnownPresence === 'composing') {
                                isOnline = true;
                                lastSeen = 'Currently Typing';
                            } else if (presence.lastKnownPresence === 'recording') {
                                isOnline = true;
                                lastSeen = 'Currently Recording';
                            } else {
                                isOnline = false;
                                // Get last seen timestamp if available
                                if (presence.lastSeen) {
                                    const lastSeenDate = new Date(presence.lastSeen * 1000);
                                    const now = new Date();
                                    const diffMs = now - lastSeenDate;
                                    const diffMins = Math.floor(diffMs / 60000);
                                    const diffHours = Math.floor(diffMins / 60);
                                    const diffDays = Math.floor(diffHours / 24);
                                    
                                    if (diffMins < 1) {
                                        lastSeen = 'Just now';
                                    } else if (diffMins < 60) {
                                        lastSeen = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
                                    } else if (diffHours < 24) {
                                        lastSeen = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                                    } else {
                                        lastSeen = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                                    }
                                } else {
                                    lastSeen = 'Last seen unavailable';
                                }
                            }
                        }
                    }
                    
                    // Unsubscribe after getting data
                    setTimeout(() => {
                        sock.presenceUnsubscribe(jid).catch(() => {});
                    }, 5000);
                    
                } catch (presenceError) {
                    console.log('Presence error:', presenceError.message);
                }

                // Get profile picture
                try {
                    profilePic = await sock.profilePictureUrl(jid, 'image');
                } catch (ppError) {
                    // No profile picture
                }

                // Check if business account
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

            const responseTime = Date.now() - presenceStart;

            // Format the response
            const formattedNumber = pn.getNumber('international') || `+${cleanNumber}`;
            const nationalNumber = pn.getNumber('national') || cleanNumber;
            const countryCode = pn.getCountryCode() || 'Unknown';
            const regionCode = pn.getRegionCode() || 'Unknown';
            const possible = pn.isPossible() ? 'Yes' : 'No';

            let resultText = `📱 *NUMBER INFORMATION*\n\n`;
            resultText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // Basic info
            resultText += `*📞 Number:* ${formattedNumber}\n`;
            resultText += `*🏷️ National:* ${nationalNumber}\n`;
            resultText += `*🌍 Country:* ${regionCode} (${countryCode})\n`;
            resultText += `*✅ Valid Format:* ${isValidPhone ? 'Yes' : 'No'}\n`;
            resultText += `*🔢 Possible:* ${possible}\n\n`;
            
            resultText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            // WhatsApp status
            resultText += `*💬 WhatsApp Status*\n`;
            resultText += `• *Registered:* ${onWhatsApp ? '✅ YES' : '❌ NO'}\n`;
            
            if (onWhatsApp) {
                // Online/Offline status with emoji
                if (isOnline) {
                    resultText += `• *Status:* 🟢 **ONLINE NOW**\n`;
                } else {
                    resultText += `• *Status:* ⚫ **OFFLINE**\n`;
                }
                
                // Last seen with human readable format
                if (lastSeen) {
                    resultText += `• *Last Seen:* ${lastSeen}\n`;
                }
                
                resultText += `• *Business:* ${isBusiness ? '✅ Yes' : '❌ No'}\n`;
                if (profilePic) {
                    resultText += `• *Profile Picture:* ✅ Available\n`;
                } else {
                    resultText += `• *Profile Picture:* ❌ Not set\n`;
                }
                
                // Show JID format info
                resultText += `\n*📌 Note:* Due to WhatsApp privacy updates, users may appear as @lid instead of phone numbers in groups [citation:7].\n`;
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

            console.log(`📱 Number check: ${formattedNumber} - WhatsApp: ${onWhatsApp ? 'Yes' : 'No'} - Online: ${isOnline ? 'Yes' : 'No'}`);

        } catch (error) {
            console.error('Number check error:', error);
            await react('❌');
            await reply(`❌ *Failed to check number*\n\nError: ${error.message}`);
        }
    }
};
