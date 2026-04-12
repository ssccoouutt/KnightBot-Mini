/**
 * Bulk Join Command - Join multiple WhatsApp groups from a text file
 * Supports: replying to .txt file OR providing direct download link to .txt file
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

module.exports = {
    name: 'bulkjoin',
    aliases: ['bj', 'massjoin', 'bulk', 'joinall'],
    category: 'owner',
    description: 'Join multiple WhatsApp groups from a text file',
    usage: '.bulkjoin (reply to .txt file)\n.bulkjoin https://example.com/groups.txt\n.bulkjoin --help',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Show help
        if (args[0] === '--help' || args.length === 0) {
            return reply(`🔗 *BULK JOIN COMMAND*\n\n` +
                       `*Usage:*\n` +
                       `1. Reply to a .txt file:\n   \`.bulkjoin\` (reply to text file)\n\n` +
                       `2. Provide direct download link:\n   \`.bulkjoin https://example.com/groups.txt\`\n\n` +
                       `*File Format:*\n` +
                       `One WhatsApp group link per line:\n` +
                       `https://chat.whatsapp.com/ABC123\n` +
                       `https://chat.whatsapp.com/XYZ789\n` +
                       `Or just invite codes: ABC123\n\n` +
                       `*Features:*\n` +
                       `• Shows detailed group info after joining\n` +
                       `• Handles join requests (admin approval needed)\n` +
                       `• Detects groups already joined\n` +
                       `• Generates complete JSON report\n` +
                       `• 5-second delay between joins\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        await react('🔗');
        
        let fileContent = null;
        let fileName = null;
        let isDirectLink = false;
        
        // Check if it's a direct download link
        const url = args[0];
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            isDirectLink = true;
            
            const processingMsg = await reply(`📥 *Downloading file from URL...*\n\n${url}\n\nPlease wait...`);
            
            try {
                // Download from direct URL
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    maxContentLength: 5 * 1024 * 1024 // 5MB max
                });
                
                fileContent = response.data.toString('utf-8');
                fileName = url.split('/').pop() || 'groups.txt';
                
                await sock.sendMessage(from, {
                    text: `✅ *File downloaded successfully!*\n\n📄 ${fileName}\n📊 Size: ${(response.data.length / 1024).toFixed(2)} KB`,
                    edit: processingMsg.key
                });
                
            } catch (downloadError) {
                await sock.sendMessage(from, {
                    text: `❌ *Failed to download file*\n\nError: ${downloadError.message}\n\nMake sure the URL is a direct download link to a .txt file.`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
        } 
        else {
            // Check if replying to a document
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quotedMessage?.documentMessage) {
                return reply(`❌ *No file provided!*\n\nPlease reply to a .txt file containing group links.\n\nOr use a direct download link:\n\`.bulkjoin https://example.com/groups.txt\``);
            }
            
            const document = quotedMessage.documentMessage;
            fileName = document.fileName || 'groups.txt';
            
            // Check if it's a text file
            if (!fileName.endsWith('.txt') && document.mimetype !== 'text/plain') {
                return reply(`❌ *Invalid file type!*\n\nPlease upload a .txt file.\nReceived: ${fileName} (${document.mimetype})`);
            }
            
            const processingMsg = await reply(`📥 *Downloading file...*\n\n📄 ${fileName}\n⏳ Please wait.`);
            
            try {
                // Download the file from WhatsApp
                const stream = await downloadContentFromMessage(document, 'document');
                const buffer = [];
                for await (const chunk of stream) {
                    buffer.push(chunk);
                }
                fileContent = Buffer.concat(buffer).toString('utf-8');
                
                await sock.sendMessage(from, {
                    text: `✅ *File loaded successfully!*\n\n📄 ${fileName}\n📊 Size: ${(Buffer.concat(buffer).length / 1024).toFixed(2)} KB`,
                    edit: processingMsg.key
                });
                
            } catch (downloadError) {
                await sock.sendMessage(from, {
                    text: `❌ *Failed to download file*\n\nError: ${downloadError.message}`,
                    edit: processingMsg.key
                });
                await react('❌');
                return;
            }
        }
        
        // Parse links from file content
        const links = fileContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => {
                // Accept both full URLs and just invite codes
                return line.includes('chat.whatsapp.com/') || /^[A-Za-z0-9_-]{20,}$/.test(line);
            });
        
        if (links.length === 0) {
            return reply(`❌ *No valid WhatsApp group links found!*\n\nMake sure each line contains a valid WhatsApp invite link or invite code.`);
        }
        
        await react('📥');
        
        // Start bulk join process
        await startBulkJoin(sock, from, sender, links, fileName);
    }
};

async function startBulkJoin(sock, chatId, sender, links, fileName) {
    const startTime = Date.now();
    const results = {
        total: 0,
        successful: 0,
        failed: 0,
        alreadyIn: 0,
        requestSent: 0,
        invalid: 0,
        details: []
    };
    
    results.total = links.length;
    
    // Send start message
    const startMsg = await sock.sendMessage(chatId, { 
        text: `🔄 *STARTING BULK JOIN PROCESS*\n\n` +
              `📄 *File:* ${fileName}\n` +
              `📊 *Total links:* ${results.total}\n` +
              `⏱️ *Estimated time:* ${Math.ceil(results.total * 5 / 60)} minutes\n\n` +
              `📋 I'll update you after each join attempt.\n` +
              `⏳ *Processing...*`
    });
    
    // Process each link
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const linkNumber = i + 1;
        
        // Create detail object for this link
        const detail = {
            link: link,
            status: 'processing',
            timestamp: new Date().toISOString(),
            groupInfo: {}
        };
        
        try {
            // Extract invite code
            let inviteCode = link;
            if (link.includes('chat.whatsapp.com/')) {
                inviteCode = link.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
            }
            
            if (!inviteCode || inviteCode.length < 20) {
                throw new Error('Invalid invite code format');
            }
            
            // Get invite info first
            let inviteInfo = null;
            try {
                inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                detail.groupInfo = {
                    name: inviteInfo.subject || 'Unknown',
                    description: inviteInfo.desc || 'No description',
                    members: inviteInfo.size || 0,
                    creator: inviteInfo.creator || 'Unknown',
                    creation: inviteInfo.creation ? new Date(inviteInfo.creation * 1000).toLocaleString() : 'Unknown',
                    inviteCode: inviteCode,
                    link: link
                };
            } catch (e) {
                detail.groupInfo = {
                    inviteCode: inviteCode,
                    link: link,
                    name: 'Unknown (could not fetch info)'
                };
            }
            
            // Try to join
            let groupJid;
            try {
                groupJid = await sock.groupAcceptInvite(inviteCode);
            } catch (joinError) {
                // Check if already in group
                if (joinError.message?.includes('already-exists') || joinError.data === 304) {
                    detail.status = 'already_in';
                    detail.message = 'Bot already in group';
                    
                    // Try to get full metadata
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        const existingGroup = Object.entries(groups).find(([jid, g]) => 
                            g.inviteCode === inviteCode || g.subject === detail.groupInfo.name
                        );
                        if (existingGroup) {
                            const [jid, metadata] = existingGroup;
                            detail.groupInfo = {
                                ...detail.groupInfo,
                                jid: jid,
                                name: metadata.subject || 'Unknown',
                                description: metadata.desc || 'No description',
                                members: metadata.participants?.length || 0,
                                announce: metadata.announce ? 'Yes (Only admins)' : 'No (Everyone)',
                                restrict: metadata.restrict ? 'Yes (Only admins)' : 'No (Everyone)',
                                creator: metadata.owner || 'Unknown',
                                creation: metadata.creation ? new Date(metadata.creation * 1000).toLocaleString() : 'Unknown',
                                inviteCode: metadata.inviteCode || inviteCode,
                                link: link
                            };
                        }
                    } catch (e) {}
                    
                    results.alreadyIn++;
                    results.details.push(detail);
                    
                    await sock.sendMessage(chatId, { 
                        text: `━━━━━━━━━━━━━━━━━━\n` +
                              `[${linkNumber}/${results.total}] ⏭️ *ALREADY IN GROUP*\n` +
                              `━━━━━━━━━━━━━━━━━━\n` +
                              `📌 *Name:* ${detail.groupInfo.name || 'Unknown'}\n` +
                              `👥 *Members:* ${detail.groupInfo.members || 0}\n` +
                              `🔗 *Link:* ${link.substring(0, 50)}...\n` +
                              `━━━━━━━━━━━━━━━━━━`
                    });
                    continue;
                }
                
                // Check if join request sent (needs admin approval)
                if (joinError.message?.includes('conflict') || joinError.data === 409) {
                    detail.status = 'request_sent';
                    detail.message = 'Join request sent (needs admin approval)';
                    
                    results.requestSent++;
                    results.details.push(detail);
                    
                    await sock.sendMessage(chatId, { 
                        text: `━━━━━━━━━━━━━━━━━━\n` +
                              `[${linkNumber}/${results.total}] ⏳ *REQUEST SENT*\n` +
                              `━━━━━━━━━━━━━━━━━━\n` +
                              `📌 *Name:* ${detail.groupInfo.name || 'Unknown'}\n` +
                              `👥 *Members:* ${detail.groupInfo.members || 0}\n` +
                              `🔗 *Link:* ${link.substring(0, 50)}...\n` +
                              `⏰ *Needs admin approval*\n` +
                              `━━━━━━━━━━━━━━━━━━`
                    });
                    continue;
                }
                
                throw joinError;
            }
            
            if (groupJid) {
                // Successfully joined - get full metadata
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                try {
                    const metadata = await sock.groupMetadata(groupJid);
                    
                    detail.status = 'success';
                    detail.jid = groupJid;
                    detail.groupInfo = {
                        jid: groupJid,
                        name: metadata.subject || 'Unknown',
                        description: metadata.desc || 'No description',
                        members: metadata.participants?.length || 0,
                        announce: metadata.announce ? 'Yes (Only admins can message)' : 'No (Everyone can message)',
                        restrict: metadata.restrict ? 'Yes (Only admins can edit)' : 'No (Everyone can edit)',
                        creator: metadata.owner || 'Unknown',
                        creation: metadata.creation ? new Date(metadata.creation * 1000).toLocaleString() : 'Unknown',
                        inviteCode: inviteCode,
                        link: link
                    };
                    
                    // Check if bot is admin
                    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    const botParticipant = metadata.participants?.find(p => p.id === botId);
                    detail.groupInfo.botAdmin = botParticipant?.admin ? 'Yes' : 'No';
                    
                    results.successful++;
                    results.details.push(detail);
                    
                    // Send detailed success message
                    await sock.sendMessage(chatId, { 
                        text: `━━━━━━━━━━━━━━━━━━\n` +
                              `[${linkNumber}/${results.total}] ✅ *SUCCESSFULLY JOINED*\n` +
                              `━━━━━━━━━━━━━━━━━━\n` +
                              `📌 *Name:* ${detail.groupInfo.name}\n` +
                              `👥 *Members:* ${detail.groupInfo.members}\n` +
                              `🤖 *Bot Admin:* ${detail.groupInfo.botAdmin}\n` +
                              `👑 *Creator:* ${detail.groupInfo.creator.split('@')[0]}\n` +
                              `🔒 *Restrict:* ${detail.groupInfo.restrict}\n` +
                              `🔇 *Announce:* ${detail.groupInfo.announce}\n` +
                              `📝 *Description:* ${(detail.groupInfo.description || 'No description').substring(0, 100)}${detail.groupInfo.description?.length > 100 ? '...' : ''}\n` +
                              `🆔 *JID:* ${groupJid}\n` +
                              `━━━━━━━━━━━━━━━━━━`
                    });
                    
                } catch (metaError) {
                    // Use invite info if metadata fails
                    detail.status = 'success';
                    detail.jid = groupJid;
                    results.successful++;
                    results.details.push(detail);
                    
                    await sock.sendMessage(chatId, { 
                        text: `━━━━━━━━━━━━━━━━━━\n` +
                              `[${linkNumber}/${results.total}] ✅ *JOINED (Limited Info)*\n` +
                              `━━━━━━━━━━━━━━━━━━\n` +
                              `📌 *Name:* ${detail.groupInfo.name || 'Unknown'}\n` +
                              `👥 *Members:* ${detail.groupInfo.members || 0}\n` +
                              `🆔 *JID:* ${groupJid}\n` +
                              `━━━━━━━━━━━━━━━━━━`
                    });
                }
            }
            
        } catch (error) {
            // Failed to join
            detail.status = 'failed';
            detail.error = error.message;
            results.failed++;
            results.details.push(detail);
            
            await sock.sendMessage(chatId, { 
                text: `━━━━━━━━━━━━━━━━━━\n` +
                      `[${linkNumber}/${results.total}] ❌ *FAILED*\n` +
                      `━━━━━━━━━━━━━━━━━━\n` +
                      `📌 *Group:* ${detail.groupInfo.name || 'Unknown'}\n` +
                      `🔗 *Link:* ${link.substring(0, 50)}...\n` +
                      `⚠️ *Reason:* ${error.message.substring(0, 100)}\n` +
                      `━━━━━━━━━━━━━━━━━━`
            });
        }
        
        // Wait 5 seconds between joins (except after last)
        if (i < links.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    // Generate final report
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);
    const minutes = Math.floor(timeTaken / 60);
    const seconds = timeTaken % 60;
    
    let report = `📊 *BULK JOIN FINAL REPORT*\n` +
                 `━━━━━━━━━━━━━━━━━━\n` +
                 `⏱️ *Time:* ${minutes}m ${seconds}s\n` +
                 `📄 *File:* ${fileName}\n` +
                 `📊 *Total Links:* ${results.total}\n` +
                 `✅ *Joined:* ${results.successful}\n` +
                 `⏭️ *Already In:* ${results.alreadyIn}\n` +
                 `⏳ *Requests Sent:* ${results.requestSent}\n` +
                 `❌ *Failed:* ${results.failed}\n` +
                 `━━━━━━━━━━━━━━━━━━\n`;
    
    // Summary of joined groups
    if (results.successful > 0) {
        report += `\n*✅ SUCCESSFULLY JOINED (${results.successful}):*\n`;
        report += `━━━━━━━━━━━━━━━━━━\n`;
        results.details
            .filter(d => d.status === 'success')
            .slice(0, 15)
            .forEach((d, idx) => {
                report += `${idx + 1}. ${d.groupInfo.name}\n`;
                report += `   👥 ${d.groupInfo.members} members | 🤖 Bot Admin: ${d.groupInfo.botAdmin || 'No'}\n`;
            });
        if (results.successful > 15) {
            report += `\n... and ${results.successful - 15} more\n`;
        }
        report += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    // Groups needing approval
    if (results.requestSent > 0) {
        report += `\n*⏳ AWAITING APPROVAL (${results.requestSent}):*\n`;
        report += `━━━━━━━━━━━━━━━━━━\n`;
        results.details
            .filter(d => d.status === 'request_sent')
            .slice(0, 10)
            .forEach((d, idx) => {
                report += `${idx + 1}. ${d.groupInfo.name || 'Unknown'}\n`;
            });
        if (results.requestSent > 10) {
            report += `\n... and ${results.requestSent - 10} more\n`;
        }
        report += `━━━━━━━━━━━━━━━━━━\n`;
    }
    
    await sock.sendMessage(chatId, { text: report });
    
    // Save full results to JSON file
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const resultFile = path.join(tempDir, `bulkjoin_${Date.now()}.json`);
    fs.writeFileSync(resultFile, JSON.stringify({
        summary: {
            total: results.total,
            successful: results.successful,
            alreadyIn: results.alreadyIn,
            requestSent: results.requestSent,
            failed: results.failed,
            timeTaken: `${minutes}m ${seconds}s`,
            fileName: fileName,
            timestamp: new Date().toISOString()
        },
        details: results.details
    }, null, 2));
    
    // Send the result file
    await sock.sendMessage(chatId, {
        document: fs.readFileSync(resultFile),
        fileName: `bulkjoin_${Date.now()}.json`,
        mimetype: 'application/json',
        caption: `📄 *Complete Bulk Join Report*\n\n✅ Joined: ${results.successful}\n⏳ Pending: ${results.requestSent}\n❌ Failed: ${results.failed}`
    });
    
    // Clean up temp file
    fs.unlinkSync(resultFile);
    
    await sock.sendMessage(chatId, { 
        text: `✅ *Bulk join process completed!*\n\n` +
              `📊 Final Stats:\n` +
              `• ✅ Joined: ${results.successful}\n` +
              `• ⏭️ Already in: ${results.alreadyIn}\n` +
              `• ⏳ Requests sent: ${results.requestSent}\n` +
              `• ❌ Failed: ${results.failed}\n\n` +
              `📄 JSON report sent above with full details.`
    });
}