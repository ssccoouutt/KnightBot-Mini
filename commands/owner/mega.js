/**
 * MEGA Account Creator - Create mega.nz accounts automatically
 * Uses Playwright for browser automation
 */

const axios = require('axios');
const { chromium } = require('playwright');
const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const fs = require('fs');
const path = require('path');

// Store active processes
const activeProcesses = new Map();

module.exports = {
    name: 'mega',
    aliases: ['meganew', 'createmega', 'megacreate'],
    description: 'Create new MEGA.nz accounts automatically',
    usage: '.mega\n.mega --status\n.mega --stop',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--status') {
            const process = activeProcesses.get(sender);
            if (process && process.running) {
                return reply(`🟢 *MEGA Account Creation in Progress*\n\n` +
                           `📝 *Prompt:* ${process.prompt || 'N/A'}\n` +
                           `⏱️ *Started:* ${new Date(process.startTime).toLocaleString()}\n` +
                           `📊 *Status:* ${process.status || 'Running...'}`);
            } else {
                return reply(`🟡 *No active MEGA account creation*\n\nUse \`.mega\` to start a new one.`);
            }
        }
        
        if (args[0] === '--stop') {
            const process = activeProcesses.get(sender);
            if (process && process.running) {
                process.running = false;
                activeProcesses.delete(sender);
                return reply(`🛑 *MEGA Account Creation Stopped*\n\nThe process has been terminated.`);
            } else {
                return reply(`🟡 *No active process to stop.*`);
            }
        }
        
        // Start new account creation
        if (activeProcesses.has(sender) && activeProcesses.get(sender).running) {
            return reply(`⚠️ *Already creating an account!*\n\nPlease wait for the current process to complete or use \`.mega --stop\` to cancel.`);
        }
        
        await react('🚀');
        
        // Send initial message
        const processingMsg = await reply(`🚀 *Starting MEGA Account Creation...*\n\n` +
                                         `⏳ Creating temporary email...\n\n` +
                                         `> This process takes 2-3 minutes`);
        
        // Start the creation process
        const process = {
            running: true,
            startTime: Date.now(),
            prompt: 'MEGA Account',
            status: 'Starting...',
            msgKey: processingMsg.key
        };
        activeProcesses.set(sender, process);
        
        // Run in background
        megaRegistration(sock, from, sender, processingMsg, process).finally(() => {
            activeProcesses.delete(sender);
        });
    }
};

// ==================== HELPER FUNCTIONS ====================

function randomName(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function randomText(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function randomPassword(length = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function createTempMail() {
    const BASE = "https://api.mail.tm";
    
    try {
        // Get domains
        const domainsRes = await axios.get(`${BASE}/domains`);
        const domains = domainsRes.data['hydra:member'] || [];
        
        if (!domains.length) return null;
        
        const domain = domains[Math.floor(Math.random() * domains.length)].domain;
        const name = randomName();
        const address = `${name}@${domain}`;
        const password = randomName(12);
        
        // Create account
        const regRes = await axios.post(`${BASE}/accounts`, {
            address: address,
            password: password
        });
        
        if (regRes.status !== 200 && regRes.status !== 201) return null;
        
        const accountId = regRes.data.id;
        
        // Get token
        const tokenRes = await axios.post(`${BASE}/token`, {
            address: address,
            password: password
        });
        
        if (tokenRes.status !== 200) return null;
        
        return {
            address: address,
            password: password,
            token: tokenRes.data.token,
            accountId: accountId
        };
        
    } catch (error) {
        console.error('[MEGA] TempMail creation error:', error.message);
        return null;
    }
}

async function fetchMessages(token) {
    const BASE = "https://api.mail.tm";
    
    try {
        const res = await axios.get(`${BASE}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.data['hydra:member'] || [];
    } catch (error) {
        console.error('[MEGA] Fetch messages error:', error.message);
        return [];
    }
}

async function getMessageContent(token, msgId) {
    const BASE = "https://api.mail.tm";
    
    try {
        const res = await axios.get(`${BASE}/messages/${msgId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.data;
    } catch (error) {
        console.error('[MEGA] Get message content error:', error.message);
        return null;
    }
}

function extractConfirmationLink(text) {
    const patterns = [
        /https:\/\/mega\.nz\/[^\s\n\r<>"']+/,
        /https:\/\/mega\.co\.nz\/[^\s\n\r<>"']+/,
        /http:\/\/mega\.nz\/[^\s\n\r<>"']+/
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0];
    }
    return null;
}

async function updateStatus(sock, from, msgKey, process, text) {
    if (!process.running) return;
    
    try {
        process.status = text;
        await sock.sendMessage(from, { text: text, edit: msgKey });
    } catch (error) {
        console.error('[MEGA] Status update error:', error.message);
    }
}

async function megaRegistration(sock, from, sender, processingMsg, process) {
    let browser = null;
    let context = null;
    let page = null;
    
    try {
        // Step 1: Create temporary email
        await updateStatus(sock, from, processingMsg.key, process, 
            `🚀 *Starting MEGA Account Creation...*\n\n⏳ Creating temporary email...`);
        
        const tempMail = await createTempMail();
        if (!tempMail) {
            await updateStatus(sock, from, processingMsg.key, process,
                `❌ *Failed to create temporary email!*\n\nPlease try again later.`);
            return;
        }
        
        const userEmail = tempMail.address;
        const megaPassword = randomPassword();
        
        await updateStatus(sock, from, processingMsg.key, process,
            `✅ *Temporary Email Created!*\n\n` +
            `📧 Email: \`${userEmail}\`\n` +
            `🔑 Password: \`${megaPassword}\`\n\n` +
            `⚙️ Initializing browser...`);
        
        // Step 2: Launch browser
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        page = await context.newPage();
        
        await updateStatus(sock, from, processingMsg.key, process,
            `🌐 *Loading MEGA registration page...*`);
        
        // Step 3: Navigate to MEGA registration
        await page.goto('https://mega.nz/register', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        
        await updateStatus(sock, from, processingMsg.key, process,
            `✅ *Processing registration form...*`);
        
        // Step 4: Click checkboxes using coordinates (same as original)
        const clickPositions = [[506, 598], [506, 670]];
        for (const [x, y] of clickPositions) {
            try {
                await page.evaluate(([clickX, clickY]) => {
                    window.scrollTo(0, clickY - 200);
                    setTimeout(() => {
                        const element = document.elementFromPoint(clickX, clickY);
                        if (element) {
                            const event = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                clientX: clickX,
                                clientY: clickY
                            });
                            element.dispatchEvent(event);
                        }
                    }, 500);
                }, [x, y]);
                await page.waitForTimeout(1000);
            } catch (error) {
                console.error(`[MEGA] Checkbox click error at (${x},${y}):`, error.message);
            }
        }
        
        // Step 5: Fill input fields
        const inputSelectors = [
            'input[type="text"]',
            'input[type="email"]',
            'input[type="password"]',
            'input[type="search"]',
            'input[type="tel"]',
            'input[type="url"]',
            'textarea'
        ];
        
        for (const selector of inputSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const elementType = await element.getAttribute('type') || 'text';
                    const elementId = await element.getAttribute('id') || '';
                    const elementName = await element.getAttribute('name') || '';
                    
                    await element.scrollIntoViewIfNeeded();
                    
                    let value;
                    if (elementType === 'email' || elementId.toLowerCase().includes('email') || elementName.toLowerCase().includes('email')) {
                        value = userEmail;
                    } else if (elementType === 'password') {
                        value = megaPassword;
                    } else {
                        value = randomText();
                    }
                    
                    await element.fill(value);
                    await element.dispatchEvent('input', { bubbles: true });
                }
            } catch (error) {
                // Silently continue
            }
        }
        
        // Step 6: Click register button
        await updateStatus(sock, from, processingMsg.key, process,
            `📬 *Registration submitted!*\n⏳ Waiting for confirmation email...`);
        
        try {
            // Try CSS selector first
            const registerButton = await page.$('button.register-button, .register-button-text');
            if (registerButton) {
                await registerButton.scrollIntoViewIfNeeded();
                await page.waitForTimeout(1000);
                await registerButton.click();
            } else {
                // Fallback to coordinate click
                await page.evaluate(() => {
                    const el = document.elementFromPoint(786, 224);
                    if (el) el.click();
                });
            }
        } catch (error) {
            console.error('[MEGA] Register button click error:', error.message);
            // Fallback coordinate
            await page.evaluate(() => {
                const el = document.elementFromPoint(786, 224);
                if (el) el.click();
            });
        }
        
        // Step 7: Wait for confirmation email
        let confirmationLink = null;
        let elapsed = 0;
        
        while (elapsed < 120 && process.running) {
            const messages = await fetchMessages(tempMail.token);
            
            if (messages && messages.length > 0) {
                const latestMsg = messages.sort((a, b) => 
                    new Date(b.createdAt) - new Date(a.createdAt)
                )[0];
                
                const msgContent = await getMessageContent(tempMail.token, latestMsg.id);
                if (msgContent) {
                    const emailText = (msgContent.text || '') + (msgContent.html || '');
                    confirmationLink = extractConfirmationLink(emailText);
                    if (confirmationLink) break;
                }
            }
            
            await page.waitForTimeout(10000);
            elapsed += 10;
            
            if (process.running) {
                await updateStatus(sock, from, processingMsg.key, process,
                    `📬 *Registration submitted!*\n⏳ Waiting for confirmation email... (${elapsed / 60}m ${elapsed % 60}s elapsed)`);
            }
        }
        
        // Step 8: Open confirmation link
        if (confirmationLink && process.running) {
            await updateStatus(sock, from, processingMsg.key, process,
                `✅ *Confirmation email received!*\n🔗 Opening verification link...`);
            await page.goto(confirmationLink, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(3000);
        }
        
        // Step 9: Take screenshot
        let screenshot = null;
        try {
            screenshot = await page.screenshot({ type: 'png', fullPage: false });
        } catch (error) {
            console.error('[MEGA] Screenshot error:', error.message);
        }
        
        const totalTime = (Date.now() - process.startTime) / 1000;
        const mins = Math.floor(totalTime / 60);
        const secs = Math.floor(totalTime % 60);
        
        // Step 10: Send results
        const resultMessage = `🎉 *MEGA ACCOUNT CREATED SUCCESSFULLY!*\n\n` +
                             `⏱️ *Total Time:* ${mins}m ${secs}s\n` +
                             `📧 *Email:* \`${userEmail}\`\n` +
                             `🔐 *Password:* \`${megaPassword}\`\n\n` +
                             `⚠️ *Save these credentials immediately!*\n\n` +
                             `> *Powered by ${config.botName}*`;
        
        // Send screenshot if available
        if (screenshot) {
            await sock.sendMessage(from, {
                image: screenshot,
                caption: resultMessage
            });
        } else {
            await sock.sendMessage(from, { text: resultMessage });
        }
        
        // Update processing message
        await updateStatus(sock, from, processingMsg.key, process,
            `✅ *Account Creation Complete!*\n\n` +
            `📧 Email: \`${userEmail}\`\n` +
            `🔐 Password: \`${megaPassword}\`\n\n` +
            `💡 Use \`.mega\` to create another account`);
        
    } catch (error) {
        console.error('[MEGA] Registration error:', error);
        
        let errorMessage = `❌ *MEGA Account Creation Failed*\n\n`;
        
        if (error.message.includes('Timeout')) {
            errorMessage += `⏰ Timeout error. The registration took too long.\nPlease try again.`;
        } else if (error.message.includes('net::ERR')) {
            errorMessage += `🌐 Network error. Please check your connection.\nTry again in a few moments.`;
        } else {
            errorMessage += `${error.message}\n\nPlease try again later.`;
        }
        
        await updateStatus(sock, from, processingMsg.key, process, errorMessage);
        
        // Try to take error screenshot
        if (page) {
            try {
                const errorScreenshot = await page.screenshot({ type: 'png' });
                await sock.sendMessage(from, {
                    image: errorScreenshot,
                    caption: `❌ Error Screenshot\n\n${error.message}`
                });
            } catch (ssError) {
                // Ignore screenshot error
            }
        }
        
    } finally {
        // Cleanup
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}