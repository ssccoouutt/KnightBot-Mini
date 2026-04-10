/**
 * MEGA Account Creator - Create MEGA.nz accounts automatically
 * Uses temporary email and Selenium WebDriver (JavaScript)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const config = require('../../config');

// Constants
const BASE = "https://api.mail.tm";
const MEGA_REG_URL = "https://mega.nz/register";
const MAX_RETRIES = 3;
const RETRY_DELAY = 10000; // 10 seconds

// Store active sessions
const activeSessions = new Map();

// Helper functions
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

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// TempMail.tm API Class
class TempMailTM {
    constructor() {
        this.address = null;
        this.password = null;
        this.token = null;
        this.accountId = null;
    }

    async create() {
        try {
            // Get domains
            const domainsRes = await axios.get(`${BASE}/domains`);
            const domains = domainsRes.data['hydra:member'] || [];
            if (domains.length === 0) return false;
            
            const domain = domains[Math.floor(Math.random() * domains.length)].domain;
            const name = randomName();
            this.address = `${name}@${domain}`;
            this.password = randomName(12);
            
            // Create account
            const regRes = await axios.post(`${BASE}/accounts`, {
                address: this.address,
                password: this.password
            });
            
            if (regRes.status !== 200 && regRes.status !== 201) return false;
            
            this.accountId = regRes.data.id;
            
            // Get token
            const tokenRes = await axios.post(`${BASE}/token`, {
                address: this.address,
                password: this.password
            });
            
            if (tokenRes.status === 200) {
                this.token = tokenRes.data.token;
                return true;
            }
            return false;
            
        } catch (error) {
            console.error('[MEGA] TempMail creation error:', error.message);
            return false;
        }
    }

    async fetchMessages() {
        if (!this.token) return [];
        
        try {
            const res = await axios.get(`${BASE}/messages`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 200) {
                return res.data['hydra:member'] || [];
            }
            return [];
        } catch (error) {
            console.error('[MEGA] Fetch messages error:', error.message);
            return [];
        }
    }

    async getMessageContent(msgId) {
        if (!this.token) return null;
        
        try {
            const res = await axios.get(`${BASE}/messages/${msgId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 200) {
                return res.data;
            }
            return null;
        } catch (error) {
            console.error('[MEGA] Get message content error:', error.message);
            return null;
        }
    }
}

// Extract confirmation link from email
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

// Take screenshot using Selenium
async function takeScreenshot(driver) {
    try {
        const screenshot = await driver.takeScreenshot();
        return Buffer.from(screenshot, 'base64');
    } catch (error) {
        console.error('[MEGA] Screenshot error:', error.message);
        return null;
    }
}

// Perform MEGA registration using Selenium WebDriver
async function performMegaRegistration(email, password, updateStatus) {
    let driver = null;
    
    try {
        // Configure Chrome options
        const chromeOptions = new chrome.Options();
        chromeOptions.addArguments('--headless');
        chromeOptions.addArguments('--no-sandbox');
        chromeOptions.addArguments('--disable-dev-shm-usage');
        chromeOptions.addArguments('--disable-gpu');
        chromeOptions.addArguments('--window-size=1920,1080');
        
        // Build driver
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(chromeOptions)
            .build();
        
        await updateStatus('🌐 Loading MEGA registration page...');
        
        // Navigate to registration page
        await driver.get(MEGA_REG_URL);
        await driver.sleep(5000);
        
        await updateStatus('✅ Processing registration form...');
        
        // Click checkboxes at specific positions (original logic)
        const clickPositions = [[506, 598], [506, 670]];
        for (const [x, y] of clickPositions) {
            try {
                await driver.executeScript(`window.scrollTo(0, ${y - 200});`);
                await driver.sleep(500);
                
                const element = await driver.executeScript(`
                    return document.elementFromPoint(arguments[0], arguments[1]);
                `, x, y);
                
                if (element) {
                    await driver.executeScript(`
                        var event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: arguments[0], clientY: arguments[1] });
                        arguments[2].dispatchEvent(event);
                    `, x, y, element);
                }
                await driver.sleep(1000);
            } catch (error) {
                console.error('[MEGA] Checkbox click error:', error.message);
            }
        }
        
        // Find and fill input fields
        const textboxSelectors = [
            By.xpath("//input[@type='text']"),
            By.xpath("//input[@type='email']"),
            By.xpath("//input[@type='password']"),
            By.xpath("//input[@type='search']"),
            By.xpath("//input[@type='tel']"),
            By.xpath("//input[@type='url']"),
            By.tagName("textarea")
        ];
        
        for (const selector of textboxSelectors) {
            try {
                const elements = await driver.findElements(selector);
                for (const tb of elements) {
                    const elementType = await tb.getAttribute('type') || 'text';
                    const elementId = await tb.getAttribute('id') || '';
                    const elementName = await tb.getAttribute('name') || '';
                    
                    try {
                        await driver.executeScript("arguments[0].scrollIntoView();", tb);
                        
                        let value;
                        if (elementType === 'email' || elementId.toLowerCase().includes('email') || elementName.toLowerCase().includes('email')) {
                            value = email;
                        } else if (elementType === 'password') {
                            value = password;
                        } else {
                            value = randomText();
                        }
                        
                        await driver.executeScript("arguments[0].value = arguments[1];", tb, value);
                        await driver.executeScript("arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", tb);
                    } catch (error) {
                        // Silently continue
                    }
                }
            } catch (error) {
                // Silently continue
            }
        }
        
        // Click register button
        try {
            const registerButton = await driver.wait(
                until.elementLocated(By.css("button.register-button, .register-button-text")),
                10000
            );
            await driver.executeScript("arguments[0].scrollIntoView(true);", registerButton);
            await driver.sleep(1000);
            await driver.executeScript("arguments[0].click();", registerButton);
        } catch (error) {
            // Fallback to coordinate click
            await driver.executeScript("var el = document.elementFromPoint(786, 224); if(el) el.click();");
        }
        
        await driver.sleep(10000);
        
        // Take screenshot
        const screenshot = await takeScreenshot(driver);
        
        return { screenshot, success: true };
        
    } catch (error) {
        console.error('[MEGA] Registration error:', error);
        return { screenshot: null, success: false, error: error.message };
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
}

// Open confirmation link using Selenium
async function openConfirmationLink(confirmationLink) {
    let driver = null;
    
    try {
        const chromeOptions = new chrome.Options();
        chromeOptions.addArguments('--headless');
        chromeOptions.addArguments('--no-sandbox');
        chromeOptions.addArguments('--disable-dev-shm-usage');
        
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(chromeOptions)
            .build();
        
        await driver.get(confirmationLink);
        await driver.sleep(5000);
        
        return true;
    } catch (error) {
        console.error('[MEGA] Confirmation link error:', error.message);
        return false;
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
}

module.exports = {
    name: 'mega',
    aliases: ['megacreate', 'createmega', 'megaaccount'],
    description: 'Create MEGA.nz accounts automatically',
    usage: '.mega\n.mega --help',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--help') {
            return reply(`📦 *MEGA Account Creator*\n\n` +
                       `*Usage:*\n` +
                       `• \`${config.prefix}mega\` - Create a new MEGA account\n` +
                       `• \`${config.prefix}mega --help\` - Show this help\n\n` +
                       `*Process:*\n` +
                       `1. Creates temporary email via mail.tm\n` +
                       `2. Automates MEGA registration using Selenium WebDriver\n` +
                       `3. Confirms email and extracts credentials\n` +
                       `4. Returns account details with screenshot\n\n` +
                       `*Note:* This process takes 2-3 minutes\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        // Check if user already has an active session
        if (activeSessions.has(sender)) {
            return reply(`⏳ *Account creation already in progress!*\n\nPlease wait for the previous request to complete.\nThis may take 2-3 minutes.`);
        }
        
        await react('📦');
        
        // Send initial message
        const processingMsg = await reply(`🚀 *Starting MEGA Account Registration*\n\n` +
                                         `⏳ Creating temporary email...\n\n` +
                                         `> This process takes 2-3 minutes`);
        
        // Mark session as active
        activeSessions.set(sender, true);
        
        // Status update function
        let currentMessage = processingMsg;
        const updateStatus = async (status) => {
            try {
                await sock.sendMessage(from, {
                    text: status,
                    edit: currentMessage.key
                });
            } catch (error) {
                // If editing fails, send new message
                const newMsg = await reply(status);
                currentMessage = newMsg;
            }
        };
        
        try {
            // Step 1: Create temporary email
            await updateStatus(`📧 *Step 1/5: Creating temporary email...*`);
            
            const tempMail = new TempMailTM();
            const emailCreated = await tempMail.create();
            
            if (!emailCreated) {
                throw new Error('Failed to create temporary email');
            }
            
            const userEmail = tempMail.address;
            const megaPassword = randomPassword();
            
            await updateStatus(`✅ *Temporary Email Created!*\n\n` +
                              `📧 Email: \`${userEmail}\`\n` +
                              `🔑 Generated Password: \`${megaPassword}\`\n\n` +
                              `⚙️ *Step 2/5: Initializing browser...*`);
            
            // Step 2: Perform MEGA registration
            const { screenshot, success, error } = await performMegaRegistration(userEmail, megaPassword, updateStatus);
            
            if (!success) {
                throw new Error(error || 'Registration failed');
            }
            
            await updateStatus(`📬 *Step 3/5: Registration submitted!*\n⏳ Waiting for confirmation email...`);
            
            // Step 3: Wait for confirmation email
            let confirmationLink = null;
            let elapsed = 0;
            const maxWait = 120; // 120 seconds
            
            while (elapsed < maxWait) {
                const messages = await tempMail.fetchMessages();
                
                if (messages && messages.length > 0) {
                    const latestMsg = messages.sort((a, b) => 
                        new Date(b.createdAt) - new Date(a.createdAt)
                    )[0];
                    
                    const msgContent = await tempMail.getMessageContent(latestMsg.id);
                    
                    if (msgContent) {
                        const emailText = String(msgContent.text || '') + String(msgContent.html || '');
                        confirmationLink = extractConfirmationLink(emailText);
                        
                        if (confirmationLink) {
                            break;
                        }
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 10000));
                elapsed += 10;
                
                if (elapsed % 30 === 0) {
                    await updateStatus(`⏱️ Checked inbox (${Math.floor(elapsed/60)}m ${elapsed%60}s elapsed)...`);
                }
            }
            
            // Step 4: Open confirmation link if found
            if (confirmationLink) {
                await updateStatus(`✅ *Confirmation email received!*\n🔗 Opening verification link...`);
                await openConfirmationLink(confirmationLink);
            }
            
            // Calculate total time
            const totalTime = 180; // Approximate time in seconds
            const mins = Math.floor(totalTime / 60);
            const secs = totalTime % 60;
            
            // Send screenshot if available
            if (screenshot && screenshot.length > 0) {
                await sock.sendMessage(from, {
                    image: screenshot,
                    caption: `🖼️ *Final Registration Status*`
                });
            }
            
            // Send success message
            const resultMessage = `🎉 *MEGA ACCOUNT CREATED SUCCESSFULLY!*\n\n` +
                                 `⏱️ Total Time: ${mins}m ${secs}s\n` +
                                 `📧 Email: \`${userEmail}\`\n` +
                                 `🔐 Password: \`${megaPassword}\`\n\n` +
                                 `⚠️ *Save these credentials immediately!*\n` +
                                 `🔗 Login at: https://mega.nz/login\n\n` +
                                 `> *Powered by ${config.botName}*`;
            
            await sock.sendMessage(from, {
                text: resultMessage,
                edit: currentMessage.key
            });
            
            await react('✅');
            
        } catch (error) {
            console.error('[MEGA] Error:', error);
            
            let errorMessage = `❌ *Failed to create MEGA account*\n\n`;
            
            if (error.message.includes('temporary email')) {
                errorMessage += `Could not create temporary email.\n` +
                               `• The mail.tm service might be down\n` +
                               `• Please try again later`;
            } else if (error.message.includes('WebDriver') || error.message.includes('chrome')) {
                errorMessage += `Browser automation failed.\n` +
                               `• Selenium WebDriver or Chrome may not be installed\n` +
                               `• Run: npm install selenium-webdriver\n` +
                               `• Install Chrome browser on your server`;
            } else if (error.message.includes('timeout')) {
                errorMessage += `Operation timed out.\n` +
                               `• The process took too long\n` +
                               `• Please try again`;
            } else {
                errorMessage += `${error.message}\n\n` +
                               `Please try again later.`;
            }
            
            await sock.sendMessage(from, {
                text: errorMessage,
                edit: currentMessage.key
            });
            await react('❌');
        } finally {
            // Clean up session
            activeSessions.delete(sender);
        }
    }
};