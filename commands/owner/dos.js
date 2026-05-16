/**
 * DOS Command - Stress test a URL with multiple requests
 * EXACTLY matching the Python script behavior with proper redirect handling
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

// Track error types
const errorTypes = new Map();

// Create a session instance that persists cookies and handles redirects
const createSession = () => {
    // Create a cookie jar for persistent cookies
    const cookieJar = {};
    
    const session = axios.create({
        timeout: 30000,
        maxRedirects: 0,  // Don't auto-follow redirects - we'll handle manually
        validateStatus: () => true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
    });
    
    // Add response interceptor to handle cookies
    session.interceptors.response.use((response) => {
        // Store cookies from response
        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
            for (const cookie of setCookie) {
                const cookieMatch = cookie.match(/^([^=]+)=([^;]+)/);
                if (cookieMatch) {
                    cookieJar[cookieMatch[1]] = cookieMatch[2];
                }
            }
        }
        return response;
    });
    
    // Add request interceptor to send cookies
    session.interceptors.request.use((config) => {
        if (Object.keys(cookieJar).length > 0) {
            const cookieString = Object.entries(cookieJar)
                .map(([key, value]) => `${key}=${value}`)
                .join('; ');
            config.headers['Cookie'] = cookieString;
        }
        return config;
    });
    
    return session;
};

// Follow redirects manually (like Python's requests)
async function followRedirects(session, url, maxRedirects = 10) {
    let currentUrl = url;
    let redirectCount = 0;
    
    while (redirectCount < maxRedirects) {
        const response = await session.get(currentUrl);
        
        // Check if it's a redirect (3xx status code)
        if (response.status >= 300 && response.status < 400) {
            const redirectLocation = response.headers.location;
            if (!redirectLocation) {
                return response;
            }
            
            // Handle relative redirects
            if (redirectLocation.startsWith('/')) {
                const urlObj = new URL(currentUrl);
                currentUrl = `${urlObj.protocol}//${urlObj.host}${redirectLocation}`;
            } else {
                currentUrl = redirectLocation;
            }
            
            redirectCount++;
            continue;
        }
        
        return response;
    }
    
    return null;
}

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
        let totalRequests = 10000;
        let threads = 500;
        
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
    
    // Reset error tracking
    errorTypes.clear();
    
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
    
    // Calculate requests per thread
    const requestsPerThread = Math.floor(totalRequests / threads);
    const remainingRequests = totalRequests - (requestsPerThread * threads);
    
    // Run threads concurrently
    const runThread = async (threadId, requestCount) => {
        // Each thread gets its own session (like Python's per-thread requests)
        const threadSession = createSession();
        
        for (let i = 0; i < requestCount; i++) {
            // Check if test should stop
            if (activeTests.get(sender)?.stop) {
                isStopped = true;
                break;
            }
            
            try {
                // Follow redirects manually (like Python's requests)
                const finalResponse = await followRedirects(threadSession, targetUrl);
                
                if (finalResponse && finalResponse.status === 200) {
                    successCount++;
                } else {
                    failureCount++;
                    const status = finalResponse?.status || 'unknown';
                    errorTypes.set(`HTTP ${status}`, (errorTypes.get(`HTTP ${status}`) || 0) + 1);
                    
                    // Log first few errors
                    if (failureCount <= 5) {
                        console.log(`[DOS] Error #${failureCount}: HTTP ${status}`);
                    }
                }
            } catch (error) {
                failureCount++;
                let errorType = error.code || error.message;
                errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
                
                // Log first few errors for debugging
                if (failureCount <= 5) {
                    console.log(`[DOS] Error #${failureCount}:`, error.message);
                }
            }
            
            completedRequests++;
            
            // Update progress
            if (completedRequests % 100 === 0 || completedRequests === totalRequests) {
                const percent = ((completedRequests / totalRequests) * 100).toFixed(1);
                
                // Create error summary for progress update
                let errorSummary = '';
                if (errorTypes.size > 0) {
                    const topErrors = Array.from(errorTypes.entries()).slice(0, 3);
                    errorSummary = '\n\n⚠️ *Top Errors:*\n';
                    for (const [errType, count] of topErrors) {
                        errorSummary += `• ${errType}: ${count}\n`;
                    }
                }
                
                try {
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *STRESS TEST RUNNING*\n\n` +
                              `🎯 Target: \`${targetUrl}\`\n` +
                              `📊 Progress: ${completedRequests}/${totalRequests} (${percent}%)\n` +
                              `✅ Success: ${successCount}\n` +
                              `❌ Failed: ${failureCount}\n` +
                              `${errorSummary}\n` +
                              `Use \`.dos --stop\` to stop the test.`,
                        edit: statusMsg.key
                    });
                } catch (e) {}
            }
        }
    };
    
    // Create and run all threads concurrently
    const threadPromises = [];
    for (let i = 0; i < threads; i++) {
        let count = requestsPerThread;
        if (i < remainingRequests) count++;
        threadPromises.push(runThread(i, count));
    }
    
    // Wait for all threads to finish
    await Promise.all(threadPromises);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const requestsPerSecond = (totalRequests / duration).toFixed(2);
    
    // Clean up
    activeTests.delete(sender);
    
    // Build error details
    let errorDetails = '';
    if (errorTypes.size > 0) {
        errorDetails = '\n\n*Error Breakdown:*\n';
        for (const [errType, count] of errorTypes.entries()) {
            errorDetails += `• ${errType}: ${count} times\n`;
        }
    }
    
    // Send final results
    let resultText;
    if (isStopped) {
        resultText = `🛑 *STRESS TEST STOPPED*\n\n` +
                    `--- RESULTS ---\n` +
                    `Total Time: ${duration.toFixed(2)} seconds\n` +
                    `Successful Requests: ${successCount}\n` +
                    `Failed Requests: ${failureCount}\n` +
                    `Requests Per Second: ${requestsPerSecond}\n` +
                    `${errorDetails}\n` +
                    `⚠️ Test was stopped by user.`;
    } else {
        resultText = `✅ *STRESS TEST COMPLETED*\n\n` +
                    `--- RESULTS ---\n` +
                    `Total Time: ${duration.toFixed(2)} seconds\n` +
                    `Successful Requests: ${successCount}\n` +
                    `Failed Requests: ${failureCount}\n` +
                    `Requests Per Second: ${requestsPerSecond}\n` +
                    `${errorDetails}\n\n` +
                    `> *Powered by ${config.botName}*`;
    }
    
    console.log(`[DOS] --- RESULTS ---`);
    console.log(`[DOS] Total Time: ${duration.toFixed(2)} seconds`);
    console.log(`[DOS] Successful Requests: ${successCount}`);
    console.log(`[DOS] Failed Requests: ${failureCount}`);
    console.log(`[DOS] Requests Per Second: ${requestsPerSecond}`);
    console.log(`[DOS] Error Types:`, Object.fromEntries(errorTypes));
    
    await sock.sendMessage(chatId, {
        text: resultText,
        edit: statusMsg.key
    });
    
    await react(isStopped ? '🛑' : '✅');
}