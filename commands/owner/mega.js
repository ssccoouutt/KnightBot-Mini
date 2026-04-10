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

// Wait for confirmation email (like original Python script)
async function waitForConfirmationEmail(tempMail, maxWaitSeconds = 120) {
    const startTime = Date.now();
    let lastMessageCount = 0;
    
    while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
        try {
            const messages = await tempMail.fetchMessages();
            
            if (messages && messages.length > 0) {
                // Check all messages (not just the first one)
                for (const msg of messages) {
                    const msgContent = await tempMail.getMessageContent(msg.id);
                    if (msgContent) {
                        const emailText = String(msgContent.text || '') + String(msgContent.html || '');
                        const link = extractConfirmationLink(emailText);
                        if (link) {
                            console.log('[MEGA] Confirmation link found!');
                            return link;
                        }
                    }
                }
            }
            
            // Wait 3 seconds before checking again (like original)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error('[MEGA] Error checking email:', error.message);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    return null;
}

// Perform complete MEGA registration
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
        await driver.sleep(3000);
        
        await updateStatus('✅ Processing registration form...');
        
        // Click checkboxes at specific positions (original logic)
        const clickPositions = [[506, 598], [506, 670]];
        for (const [x, y] of clickPositions) {
            try {
                await driver.executeScript(`window.scrollTo(0, ${y - 200});`);
                await driver.sleep(300);
                
                const element = await driver.executeScript(`
                    return document.elementFromPoint(arguments[0], arguments[1]);
                `, x, y);
                
                if (element) {
                    await driver.executeScript(`
                        var event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: arguments[0], clientY: arguments[1] });
                        arguments[2].dispatchEvent(event);
                    `, x, y, element);
                }
                await driver.sleep(500);
            } catch (error) {
                // Silently continue
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
            await driver.sleep(500);
            await driver.executeScript("arguments[0].click();", registerButton);
        } catch (error) {
            // Fallback to coordinate click
            await driver.executeScript("var el = document.elementFromPoint(786, 224); if(el) el.click();");
        }
        
        await driver.sleep(3000);
        
        return driver;
        
    } catch (error) {
        console.error('[MEGA] Registration error:', error);
        if (driver) await driver.quit();
        throw error;
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
                       `*Note:* This process takes 30-60 seconds\n` +
                       `> *Powered by ${config.botName}*`);
        }
        
        // Check if user already has an active session
        if (activeSessions.has(sender)) {
            return reply(`⏳ *Account creation already in progress!*\n\nPlease wait for the previous request to complete.\nThis may take 30-60 seconds.`);
        }
        
        await react('📦');
        
        // Send initial message
        const processingMsg = await reply(`🚀 *Starting MEGA Account Registration*\n\n` +
                                         `⏳ Creating temporary email...\n\n` +
                                         `> This process takes 30-60 seconds`);
        
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
                const newMsg = await reply(status);
                currentMessage = newMsg;
            }
        };
        
        let driver = null;
        
        try {
            // Step 1: Create temporary email
            await updateStatus(`📧 *Step 1/4: Creating temporary email...*`);
            
            const tempMail = new TempMailTM();
            const emailCreated = await tempMail.create();
            
            if (!emailCreated) {
                throw new Error('Failed to create temporary email');
            }
            
            const userEmail = tempMail.address;
            const megaPassword = randomPassword();
            
            await updateStatus(`✅ *Temporary Email Created!*\n\n` +
                              `📧 Email: \`${userEmail}\`\n` +
                              `🔑 Password: \`${megaPassword}\`\n\n` +
                              `⚙️ *Step 2/4: Starting browser automation...*`);
            
            // Step 2: Perform registration
            driver = await performMegaRegistration(userEmail, megaPassword, updateStatus);
            
            await updateStatus(`📬 *Step 3/4: Registration submitted!*\n⏳ Waiting for confirmation email...`);
            
            // Step 3: Wait for confirmation email (check every 3 seconds like original)
            const confirmationLink = await waitForConfirmationEmail(tempMail, 60);
            
            if (!confirmationLink) {
                throw new Error('Confirmation email not received within time limit');
            }
            
            await updateStatus(`✅ *Confirmation email received!*\n🔗 Opening verification link...`);
            
            // Step 4: Open confirmation link in the SAME driver
            await driver.get(confirmationLink);
            await driver.sleep(5000);
            
            // Take final screenshot
            const screenshot = await takeScreenshot(driver);
            
            // Close driver
            await driver.quit();
            driver = null;
            
            // Send screenshot if available
            if (screenshot && screenshot.length > 0) {
                await sock.sendMessage(from, {
                    image: screenshot,
                    caption: `🖼️ *Final Registration Status - Account Confirmed!*`
                });
            }
            
            // Send success message
            const resultMessage = `🎉 *MEGA ACCOUNT CREATED SUCCESSFULLY!*\n\n` +
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
            
            if (driver) {
                try { await driver.quit(); } catch (e) {}
            }
            
            let errorMessage = `❌ *Failed to create MEGA account*\n\n`;
            
            if (error.message.includes('temporary email')) {
                errorMessage += `Could not create temporary email.\n` +
                               `• The mail.tm service might be down\n` +
                               `• Please try again later`;
            } else if (error.message.includes('Confirmation email')) {
                errorMessage += `Confirmation email not received.\n` +
                               `• The email might be delayed\n` +
                               `• Please try again`;
            } else if (error.message.includes('WebDriver') || error.message.includes('chrome')) {
                errorMessage += `Browser automation failed.\n` +
                               `• Selenium WebDriver or Chrome may not be installed\n` +
                               `• Run: npm install selenium-webdriver\n` +
                               `• Install Chrome browser on your server`;
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
            activeSessions.delete(sender);
        }
    }
};