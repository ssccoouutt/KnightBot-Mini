/**
 * DOS Command - Stress test a URL with multiple requests
 * WARNING: Only use on your own servers or with permission!
 */

const axios = require('axios');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const giftedBtns = require('gifted-btns');
const { sendButtons } = giftedBtns;

const FORCE_AI_MODE = true;

// Store active test sessions
const activeTests = new Map();

module.exports = {
    name: 'dos',
    aliases: ['stress', 'loadtest', 'attack'],
    category: 'owner',
    description: '⚠️ WARNING: Stress test a URL with multiple requests. USE ONLY ON YOUR OWN SERVERS!',
    usage: '.dos <url> [requests] [threads]\n.dos http://localhost:5000 10000 500\n.dos --stop',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        // Check if user wants to stop a running test
        if (args[0] === '--stop') {
            if (activeTests.has(sender)) {
                const test = activeTests.get(sender);
                test.stop = true;
                await reply(`🛑 *Stopping stress test...*\n\nPlease wait for current requests to complete.`);
                setTimeout(() => {
                    activeTests.delete(sender);
                }, 5000);
                return;
            } else {
                return reply(`❌ No active stress test found for your session.`);
            }
        }
        
        if (args.length === 0 || args[0] === '--help') {
            return reply(`⚠️ *STRESS TEST COMMAND - WARNING!*\n\n` +
                       `*⚠️ ONLY USE ON YOUR OWN SERVERS OR WITH PERMISSION!*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}dos <url>\` - Test with defaults (1000 requests, 100 threads)\n` +
                       `• \`${config.prefix}dos <url> <requests> <threads>\` - Custom test\n` +
                       `• \`${config.prefix}dos --stop\` - Stop running test\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}dos http://localhost:5000\`\n` +
                       `• \`${config.prefix}dos https://your-server.com 5000 250\`\n\n` +
                       `*Parameters:*\n` +
                       `• \`url\` - Target URL (required)\n` +
                       `• \`requests\` - Total requests (default: 1000)\n` +
                       `• \`threads\` - Concurrent threads (default: 100)\n\n` +
                       `*⚠️ WARNING:* This can overwhelm servers! Use responsibly!\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        let url = args[0];
        let totalRequests = 10000;
        let threads = 500;
        
        // Parse parameters
        if (args[1] && !isNaN(parseInt(args[1]))) {
            totalRequests = parseInt(args[1]);
            if (totalRequests < 10) totalRequests = 10;
            if (totalRequests > 50000) totalRequests = 50000;
        }
        
        if (args[2] && !isNaN(parseInt(args[2]))) {
            threads = parseInt(args[2]);
            if (threads < 1) threads = 1;
            if (threads > 1000) threads = 1000;
        }
        
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }
        
        // Check if there's already a running test
        if (activeTests.has(sender)) {
            return reply(`⚠️ *Test already running!*\n\nUse \`${config.prefix}dos --stop\` to stop it first.`);
        }
        
        await react('⚠️');
        
        // Confirm with user about the risk
        const confirmMsg = await sendButtons(sock, from, {
            text: `⚠️ *WARNING: STRESS TEST*\n\n` +
                  `Target: \`${url}\`\n` +
                  `Total Requests: ${totalRequests}\n` +
                  `Concurrent Threads: ${threads}\n\n` +
                  `⚠️ *This will send ${totalRequests} requests to the target!*\n\n` +
                  `*Confirm you have permission to test this URL.*\n\n` +
                  `Only proceed if this is YOUR own server!`,
            footer: '⚠️ WARNING',
            buttons: [
                { id: 'dos_confirm', text: '⚠️ I CONFIRM - PROCEED' },
                { id: 'dos_cancel', text: '❌ Cancel' }
            ],
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, confirmMsg.key.id, 'dos_confirm');
        
        // Store test parameters for confirmation
        sessionManager.createSession(sender, from, 'dos_confirm', {
            url: url,
            totalRequests: totalRequests,
            threads: threads,
            step: 'confirming'
        });
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command === 'dos_confirm' && isButtonClick) {
            let buttonId = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
            }
            
            if (buttonId === 'dos_cancel') {
                sessionManager.clearSession(session.id);
                await reply(`❌ Test cancelled.`);
                return true;
            }
            
            if (buttonId === 'dos_confirm') {
                sessionManager.clearSession(session.id);
                
                const { url, totalRequests, threads } = session.data;
                
                // Start the stress test
                await startStressTest(sock, from, sender, reply, react, url, totalRequests, threads);
                return true;
            }
        }
        
        return true;
    }
};

async function startStressTest(sock, chatId, sender, reply, react, targetUrl, totalRequests, threads) {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    let isStopped = false;
    let completedRequests = 0;
    
    // Store test info for stopping
    activeTests.set(sender, {
        stop: false,
        url: targetUrl,
        totalRequests: totalRequests
    });
    
    const statusMsg = await reply(`⚠️ *STRESS TEST STARTED*\n\n` +
                                 `🎯 Target: \`${targetUrl}\`\n` +
                                 `📊 Total Requests: ${totalRequests}\n` +
                                 `🔧 Concurrent Threads: ${threads}\n` +
                                 `⏳ Progress: 0/${totalRequests} (0%)\n\n` +
                                 `Use \`.dos --stop\` to stop the test.`);
    
    // Calculate requests per thread
    const requestsPerThread = Math.floor(totalRequests / threads);
    const remainingRequests = totalRequests - (requestsPerThread * threads);
    
    // Create an array of promises for concurrent execution
    const runThread = async (threadId, requestCount) => {
        for (let i = 0; i < requestCount; i++) {
            // Check if test should stop
            if (activeTests.get(sender)?.stop) {
                isStopped = true;
                break;
            }
            
            try {
                const response = await axios.get(targetUrl, {
                    timeout: 10000,
                    validateStatus: () => true // Don't throw on any status
                });
                successCount++;
            } catch (error) {
                failureCount++;
            }
            
            completedRequests++;
            
            // Update progress every 50 requests or at completion
            if (completedRequests % 50 === 0 || completedRequests === totalRequests) {
                const percent = ((completedRequests / totalRequests) * 100).toFixed(1);
                try {
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *STRESS TEST RUNNING*\n\n` +
                              `🎯 Target: \`${targetUrl}\`\n` +
                              `📊 Progress: ${completedRequests}/${totalRequests} (${percent}%)\n` +
                              `✅ Success: ${successCount}\n` +
                              `❌ Failed: ${failureCount}\n\n` +
                              `Use \`.dos --stop\` to stop the test.`,
                        edit: statusMsg.key
                    });
                } catch (e) {}
            }
            
            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    
    // Create and run threads (using Promise.all for concurrency)
    const threadPromises = [];
    for (let i = 0; i < threads; i++) {
        let count = requestsPerThread;
        if (i < remainingRequests) count++;
        threadPromises.push(runThread(i, count));
    }
    
    await Promise.all(threadPromises);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const requestsPerSecond = (totalRequests / duration).toFixed(2);
    
    // Clean up
    activeTests.delete(sender);
    
    // Send final result
    let resultText;
    if (isStopped) {
        resultText = `🛑 *STRESS TEST STOPPED*\n\n` +
                    `🎯 Target: \`${targetUrl}\`\n` +
                    `📊 Completed: ${completedRequests}/${totalRequests}\n` +
                    `✅ Success: ${successCount}\n` +
                    `❌ Failed: ${failureCount}\n` +
                    `⏱️ Time: ${duration.toFixed(2)}s\n` +
                    `📈 Rate: ${requestsPerSecond} req/s\n\n` +
                    `⚠️ Test was stopped by user.`;
    } else {
        resultText = `✅ *STRESS TEST COMPLETED*\n\n` +
                    `🎯 Target: \`${targetUrl}\`\n` +
                    `📊 Total Requests: ${totalRequests}\n` +
                    `✅ Successful: ${successCount}\n` +
                    `❌ Failed: ${failureCount}\n` +
                    `⏱️ Time: ${duration.toFixed(2)}s\n` +
                    `📈 Rate: ${requestsPerSecond} req/s\n` +
                    `📊 Success Rate: ${((successCount / totalRequests) * 100).toFixed(2)}%\n\n` +
                    `> *Powered by ${config.botName}*`;
    }
    
    await sock.sendMessage(chatId, {
        text: resultText,
        edit: statusMsg.key
    });
    
    await react(isStopped ? '🛑' : '✅');
}
