const fs = require('fs');
const path = require('path');
const phoneNumber = require('awesome-phonenumber');
const config = require('../../config');

module.exports = {
    name: 'scrap',
    aliases: ['scrape', 'extract', 'getmembers', 'groupnumbers'],
    description: 'Extract all phone numbers from a WhatsApp group',
    usage: 'scrap [group link or group JID]',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, reply, react } = context;
        
        if (args.length === 0) {
            await reply(`❌ *Please provide a group link or JID!*\n\nUsage: \`${config.prefix}scrap [group link or JID]\`\n\n*Examples:*\n• Using link: \`${config.prefix}scrap https://chat.whatsapp.com/ABC123xyz\`\n• Using JID: \`${config.prefix}scrap 1234567890-123456@g.us\``);
            return;
        }

        const input = args.join(' ').trim();
        await react('⏳');
        await reply(`🔍 *Processing...*\n\nAnalyzing group information.`);

        try {
            let groupJid = null;
            let groupMetadata = null;
            let temporarilyJoined = false;

            // Check if input is a group link
            if (input.includes('chat.whatsapp.com/')) {
                // Extract invite code
                const inviteCode = input.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
                
                await reply(`🔗 *Group link detected*\nInvite code: \`${inviteCode}\`\n\nAttempting to join temporarily...`);

                try {
                    // Try to join the group temporarily
                    groupJid = await sock.groupAcceptInvite(inviteCode);
                    temporarilyJoined = true;
                    await reply(`✅ *Temporarily joined group*\n\nFetching member list...`);
                    
                    // Get group metadata
                    groupMetadata = await sock.groupMetadata(groupJid);
                    
                } catch (joinError) {
                    console.log('Could not join group:', joinError.message);
                    
                    // If can't join, try to get info without joining
                    try {
                        const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                        if (inviteInfo) {
                            return await reply(`❌ *Cannot join group*\n\nThis group requires approval or is private. Cannot extract members without joining.`);
                        }
                    } catch (e) {
                        return await reply(`❌ *Invalid group link*\n\nThe link may be expired or invalid.`);
                    }
                }
            } 
            // Check if input is a group JID
            else if (input.includes('@g.us')) {
                groupJid = input;
                await reply(`🔗 *Group JID detected*\n\nFetching group information...`);
                
                try {
                    groupMetadata = await sock.groupMetadata(groupJid);
                } catch (e) {
                    return await reply(`❌ *Cannot access group*\n\nMake sure the bot is in this group and has admin privileges.`);
                }
            }
            else {
                return await reply(`❌ *Invalid input*\n\nPlease provide a valid group link or group JID.`);
            }

            if (!groupMetadata || !groupMetadata.participants) {
                return await reply(`❌ *Failed to fetch group information*`);
            }

            // Extract participant information
            const participants = groupMetadata.participants;
            const groupName = groupMetadata.subject || 'Unnamed Group';
            const groupDesc = groupMetadata.desc || 'No description';
            const groupOwner = groupMetadata.owner || 'Unknown';
            const memberCount = participants.length;

            // Categorize members
            const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
            const superAdmins = participants.filter(p => p.admin === 'superadmin');
            const regularMembers = participants.filter(p => !p.admin);

            // Create timestamp for filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            // Create text file with phone numbers (formatted with +)
            const numbersFile = path.join(tempDir, `members_${timestamp}.txt`);
            
            let fileContent = `========================================\n`;
            fileContent += `      GROUP MEMBERS EXPORT\n`;
            fileContent += `========================================\n\n`;
            fileContent += `Group: ${groupName}\n`;
            fileContent += `JID: ${groupJid}\n`;
            fileContent += `Total Members: ${memberCount}\n`;
            fileContent += `Admins: ${admins.length}\n`;
            fileContent += `Super Admins: ${superAdmins.length}\n`;
            fileContent += `Regular Members: ${regularMembers.length}\n`;
            fileContent += `Generated: ${new Date().toLocaleString()}\n`;
            fileContent += `========================================\n\n`;
            
            fileContent += `ALL PHONE NUMBERS (${memberCount}):\n`;
            fileContent += `----------------------------------------\n`;
            
            // Extract and format phone numbers (with +)
            participants.forEach((p, index) => {
                const rawNumber = p.id.split('@')[0];
                // Try to format with country code
                let formattedNumber = rawNumber;
                try {
                    // Assume it's a valid phone number, format it
                    const pn = phoneNumber(rawNumber);
                    if (pn.isValid()) {
                        formattedNumber = pn.getNumber('international'); // Returns +1234567890
                    } else {
                        formattedNumber = '+' + rawNumber;
                    }
                } catch (e) {
                    formattedNumber = '+' + rawNumber;
                }
                
                const isAdmin = p.admin ? ` [${p.admin}]` : '';
                fileContent += `${formattedNumber}${isAdmin}\n`;
            });
            
            fileContent += `\n========================================\n`;
            fileContent += `ADMIN LIST (${admins.length}):\n`;
            fileContent += `----------------------------------------\n`;
            admins.forEach((p, index) => {
                const rawNumber = p.id.split('@')[0];
                let formattedNumber = rawNumber;
                try {
                    const pn = phoneNumber(rawNumber);
                    if (pn.isValid()) {
                        formattedNumber = pn.getNumber('international');
                    } else {
                        formattedNumber = '+' + rawNumber;
                    }
                } catch (e) {
                    formattedNumber = '+' + rawNumber;
                }
                const role = p.admin === 'superadmin' ? 'SUPER ADMIN' : 'ADMIN';
                fileContent += `${index + 1}. ${formattedNumber} - ${role}\n`;
            });
            
            fileContent += `\n========================================\n`;
            fileContent += `REGULAR MEMBERS (${regularMembers.length}):\n`;
            fileContent += `----------------------------------------\n`;
            regularMembers.forEach((p, index) => {
                const rawNumber = p.id.split('@')[0];
                let formattedNumber = rawNumber;
                try {
                    const pn = phoneNumber(rawNumber);
                    if (pn.isValid()) {
                        formattedNumber = pn.getNumber('international');
                    } else {
                        formattedNumber = '+' + rawNumber;
                    }
                } catch (e) {
                    formattedNumber = '+' + rawNumber;
                }
                fileContent += `${index + 1}. ${formattedNumber}\n`;
            });
            
            fs.writeFileSync(numbersFile, fileContent);

            // Create a clean list with just numbers (one per line, formatted)
            const cleanNumbersFile = path.join(tempDir, `numbers_${timestamp}.txt`);
            const cleanNumbers = participants.map(p => {
                const rawNumber = p.id.split('@')[0];
                try {
                    const pn = phoneNumber(rawNumber);
                    if (pn.isValid()) {
                        return pn.getNumber('international');
                    }
                    return '+' + rawNumber;
                } catch (e) {
                    return '+' + rawNumber;
                }
            }).join('\n');
            fs.writeFileSync(cleanNumbersFile, cleanNumbers);

            // Leave the group if we temporarily joined
            if (temporarilyJoined) {
                await reply(`📤 *Leaving group* (temporary join only)...`);
                try {
                    await sock.groupLeave(groupJid);
                } catch (leaveError) {
                    console.log('Error leaving group:', leaveError.message);
                }
            }

            // Send the files
            const stats = fs.statSync(numbersFile);
            const fileSizeKB = Math.round(stats.size / 1024);

            // Send detailed file
            await sock.sendMessage(from, {
                document: fs.readFileSync(numbersFile),
                fileName: `group_members_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.txt`,
                mimetype: 'text/plain',
                caption: `📊 *Group Members Export*\n\n` +
                        `📌 *Group:* ${groupName}\n` +
                        `👥 *Total:* ${memberCount}\n` +
                        `👑 *Admins:* ${admins.length}\n` +
                        `👤 *Regular:* ${regularMembers.length}\n` +
                        `📁 *File:* ${fileSizeKB}KB\n\n` +
                        `✅ Full list attached with formatted numbers (+923...)`
            });

            // Send clean numbers file
            await sock.sendMessage(from, {
                document: fs.readFileSync(cleanNumbersFile),
                fileName: `phone_numbers_${timestamp}.txt`,
                mimetype: 'text/plain',
                caption: `📱 *Phone Numbers Only*\n\n` +
                        `${memberCount} numbers extracted (one per line, formatted with +)`
            });

            // Send preview
            let preview = `📋 *PREVIEW (First 10 numbers)*\n\n`;
            participants.slice(0, 10).forEach((p, i) => {
                const rawNumber = p.id.split('@')[0];
                let formattedNumber = rawNumber;
                try {
                    const pn = phoneNumber(rawNumber);
                    if (pn.isValid()) {
                        formattedNumber = pn.getNumber('international');
                    } else {
                        formattedNumber = '+' + rawNumber;
                    }
                } catch (e) {
                    formattedNumber = '+' + rawNumber;
                }
                const role = p.admin ? ` (${p.admin})` : '';
                preview += `${i + 1}. ${formattedNumber}${role}\n`;
            });
            if (participants.length > 10) {
                preview += `... and ${participants.length - 10} more\n`;
            }
            preview += `\n📁 *Full list in attached files*`;

            await sock.sendMessage(from, { text: preview });
            
            await react('✅');

            // Clean up temp files after 5 minutes
            setTimeout(() => {
                try {
                    if (fs.existsSync(numbersFile)) fs.unlinkSync(numbersFile);
                    if (fs.existsSync(cleanNumbersFile)) fs.unlinkSync(cleanNumbersFile);
                } catch (e) {}
            }, 5 * 60 * 1000);

        } catch (error) {
            console.error('Scrap command error:', error);
            await react('❌');
            await reply(`❌ *Failed to scrape group*\n\nError: ${error.message}`);
        }
    }
};
