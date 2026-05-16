/**
 * DOS Command - Stress test a URL with multiple requests
 * EXACTLY matching the Python script behavior with session persistence
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

// Create a session instance that persists cookies (like Python's requests.get)
const createSession = () => {
    const session = axios.create({
        timeout: 2000,
        validateStatus: () => true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        }
    });
    return session;
};

module.exports = {
    name: 'dos',
    aliases: ['stress', 'loadtest'],
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
                       `• \`${config.prefix}dos <url>\` - Test with defaults (10000 requests, 500 threads)\n` +
                       `• \`${config.prefix}dos <url> <requests> <threads>\` - Custom test\n` +
                       `• \`${config.prefix}dos --stop\` - Stop running test\n\n` +
                       `*Examples:*\n` +
                       `• \`${config.prefix}dos http://localhost:5000\`\n` +
                       `• \`${config.prefix}dos https://your-server.com 5000 250\`\n\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        let url = args[0];
        let totalRequests = 100;   // Using your test values
        let threads = 5;           // Using your test values
        
        // Parse parameters
        if (args[1] && !isNaN(parseInt(args[1]))) {
            totalRequests = parseInt(args[1]);
        }
        
        if (args[2] && !isNaN(parseInt(args[2]))) {
            threads = parseInt(args[2]);
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
        
        // Clear any existing sessions
        const existingSessions = sessionManager.getUserSessions(sender, from);
        for (const sess of existingSessions) {
            if (sess.command === 'dos') {
                sessionManager.clearSession(sess.id);
            }
        }
        
        // Create main session
        const session = sessionManager.createSession(sender, from, 'dos', {
            url: url,
            totalRequests: totalRequests,
            threads: threads,
            step: 'confirming'
        });
        
        const sessionId = session.id.split(':').pop();
        
        // Send confirmation buttons
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
                { id: `dos_${sessionId}_confirm`, text: '⚠️ I CONFIRM - PROCEED' },
                { id: `dos_${sessionId}_cancel`, text: '❌ Cancel' }
            ],
            aimode: FORCE_AI_MODE
        }, { quoted: msg });
        
        sessionManager.addPendingMessage(sender, from, confirmMsg.key.id, 'dos');
    },
    
    async handleSession(sock, msg, session, context) {
        const { from, sender, reply, react, isButtonClick } = context;
        
        if (session.command !== 'dos') return true;
        
        if (isButtonClick) {
            let buttonId = null;
            let buttonText = null;
            
            if (msg.message?.buttonsResponseMessage) {
                buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                buttonText = msg.message.buttonsResponseMessage.selectedDisplayText;
                console.log('[DOS] Button click:', buttonId, buttonText);
            } else if (msg.message?.interactiveResponseMessage) {
                const interactive = msg.message.interactiveResponseMessage;
                if (interactive.nativeFlowResponseMessage) {
                    try {
                        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                        buttonId = params.id;
                        buttonText = params.display_text;
                        console.log('[DOS] Interactive button:', buttonId, buttonText);
                    } catch (e) {}
                }
            } else if (msg.message?.templateButtonReplyMessage) {
                buttonId = msg.message.templateButtonReplyMessage.selectedId;
                buttonText = msg.message.templateButtonReplyMessage.selectedDisplayText;
                console.log('[DOS] Template button:', buttonId, buttonText);
            }
            
            if (!buttonId) return true;
            
            // Handle Cancel
            if (buttonId.includes('_cancel')) {
                sessionManager.clearSession(session.id);
                await reply(`❌ Test cancelled.`);
                return true;
            }
            
            // Handle Confirm
            if (buttonId.includes('_confirm')) {
                const { url, totalRequests, threads } = session.data;
                sessionManager.clearSession(session.id);
                
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
    
    // Create a shared session for this test (cookies persist across requests like Python)
    const sharedSession = createSession();
    
    // Store test info for stopping
    activeTests.set(sender, {
        stop: false,
        url: targetUrl,
        totalRequests: totalRequests
    });
    
    console.log(`[DOS] Starting Stress Test on: ${targetUrl}`);
    console.log(`[DOS] Config: ${totalRequests} requests across ${threads} threads.`);
    
    const statusMsg = await reply(`⚠️ *STRESS TEST STARTED*\n\n` +
                                 `🎯 Target: \`${targetUrl}\`\n` +
                                 `📊 Total Requests: ${totalRequests}\n` +
                                 `🔧 Concurrent Threads: ${threads}\n` +
                                 `⏳ Progress: 0/${totalRequests} (0%)\n\n` +
                                 `Use \`.dos --stop\` to stop the test.`);
    
    // Calculate requests per thread (EXACTLY like Python script)
    const requestsPerThread = Math.floor(totalRequests / threads);
    const remainingRequests = totalRequests - (requestsPerThread * threads);
    
    // Run threads concurrently (EXACTLY like Python script using threading)
    const runThread = async (threadId, requestCount) => {
        for (let i = 0; i < requestCount; i++) {
            // Check if test should stop
            if (activeTests.get(sender)?.stop) {
                isStopped = true;
                break;
            }
            
            try {
                // Use the shared session to maintain cookies (like Python's requests.get)
                const response = await sharedSession.get(targetUrl);
                successCount++;
            } catch (error) {
                failureCount++;
            }
            
            completedRequests++;
            
            // Update progress (every 10 requests or at completion)
            if (completedRequests % 10 === 0 || completedRequests === totalRequests) {
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
        }
    };
    
    // Create and run all threads concurrently (EXACTLY like Python)
    const threadPromises = [];
    for (let i = 0; i < threads; i++) {
        let count = requestsPerThread;
        if (i < remainingRequests) count++;
        threadPromises.push(runThread(i, count));
    }
    
    // Wait for all threads to finish (EXACTLY like Python's thread.join())
    await Promise.all(threadPromises);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const requestsPerSecond = (totalRequests / duration).toFixed(2);
    
    // Clean up
    activeTests.delete(sender);
    
    // Send final results (EXACT format like Python)
    let resultText;
    if (isStopped) {
        resultText = `🛑 *STRESS TEST STOPPED*\n\n` +
                    `--- RESULTS ---\n` +
                    `Total Time: ${duration.toFixed(2)} seconds\n` +
                    `Successful Requests: ${successCount}\n` +
                    `Failed Requests: ${failureCount}\n` +
                    `Requests Per Second: ${requestsPerSecond}\n\n` +
                    `⚠️ Test was stopped by user.`;
    } else {
        resultText = `✅ *STRESS TEST COMPLETED*\n\n` +
                    `--- RESULTS ---\n` +
                    `Total Time: ${duration.toFixed(2)} seconds\n` +
                    `Successful Requests: ${successCount}\n` +
                    `Failed Requests: ${failureCount}\n` +
                    `Requests Per Second: ${requestsPerSecond}\n\n` +
                    `> *Powered by ${config.botName}*`;
    }
    
    console.log(`[DOS] --- RESULTS ---`);
    console.log(`[DOS] Total Time: ${duration.toFixed(2)} seconds`);
    console.log(`[DOS] Successful Requests: ${successCount}`);
    console.log(`[DOS] Failed Requests: ${failureCount}`);
    console.log(`[DOS] Requests Per Second: ${requestsPerSecond}`);
    
    await sock.sendMessage(chatId, {
        text: resultText,
        edit: statusMsg.key
    });
    
    await react(isStopped ? '🛑' : '✅');
}