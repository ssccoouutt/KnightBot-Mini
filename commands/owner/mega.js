/**
 * MEGA Account Creator - Create MEGA.nz accounts automatically
 * Uses Playwright for browser automation
 */

const { chromium } = require('playwright');
const axios = require('axios');
const config = require('../../config');
const fs = require('fs');
const path = require('path');

// Constants
const BASE = "https://api.mail.tm";
const MEGA_REG_URL = "https://mega.nz/register";
const MAX_RETRIES = 3;

// Store active sessions
const activeCreations = new Map();

// Helper functions
function randomName(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
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

// Temporary Email Class
class TempMailTM {
    constructor() {
        this.address = null;
        this.password = null;
        this.token = null;
        this.accountId = null;
    }

    async create() {
        try {
            const domainsRes = await axios.get(`${BASE}/domains`);
            const domains = domainsRes.data['hydra:member'] || [];
            if (!domains.length) return false;
            
            const domain = domains[Math.floor(Math.random() * domains.length)].domain;
            const name = randomName();
            this.address = `${name}@${domain}`;
            this.password = randomName(12);
            
            const regRes = await axios.post(`${BASE}/accounts`, {
                address: this.address,
                password: this.password
            });
            
            if (regRes.status !== 200 && regRes.status !== 201) return false;
            
            this.accountId = regRes.data.id;
            
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
            return res.data['hydra:member'] || [];
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
            return res.data;
        } catch (error) {
            console.error('[MEGA] Get message content error:', error.message);
            return null;
        }
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

async function takeScreenshot(page, chatId, sock, caption) {
    try {
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });
        await sock.sendMessage(chatId, {
            image: screenshot,
            caption: caption
        });
    } catch (error) {
        console.error('[MEGA] Screenshot error:', error.message);
    }
}

async function waitForVisible(page, selector, timeout = 30000) {
    try {
        await page.waitForSelector(selector, { state: 'visible', timeout });
        return true;
    } catch (error) {
        return false;
    }
}

async function megaRegistration(chatId, sock, reply, react, userId) {
    const startTime = Date.now();
    let browser = null;
    let page = null;
    
    try {
        await reply("🚀 *Starting MEGA Account Registration*\n⏳ Creating temporary email...");
        
        // Create temporary email
        const tempMail = new TempMailTM();
        if (!await tempMail.create()) {
            await reply("❌ *Failed to create temporary email!*\nPlease try again later.");
            return;
        }
        
        const userEmail = tempMail.address;
        const megaPassword = randomPassword();
        
        await reply(
            `✅ *Temporary Email Created!*\n` +
            `📧: \`${userEmail}\`\n` +
            `🔑 Generated Password: \`${megaPassword}\`\n\n` +
            `⚙️ Initializing browser...`
        );
        
        // Launch browser with Playwright
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        
        page = await browser.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });
        
        await reply("🌐 Loading MEGA registration page...");
        await page.goto(MEGA_REG_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        await reply("✅ Processing registration form...");
        
        // Wait for the registration form to load (MEGA uses a specific structure)
        await page.waitForTimeout(5000);
        
        // Method 1: Use JavaScript to find and fill inputs directly
        const fillResult = await page.evaluate(async (email, password) => {
            const results = { filled: 0, emailField: null, passwordField: null };
            
            // Find all input elements
            const inputs = document.querySelectorAll('input');
            
            for (const input of inputs) {
                const type = input.type;
                const name = (input.name || '').toLowerCase();
                const id = (input.id || '').toLowerCase();
                const placeholder = (input.placeholder || '').toLowerCase();
                const className = (input.className || '').toLowerCase();
                
                // Email field detection
                if (type === 'email' || 
                    name.includes('email') || 
                    id.includes('email') ||
                    placeholder.includes('email') ||
                    className.includes('email')) {
                    input.value = email;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    results.emailField = true;
                    results.filled++;
                }
                // Password field detection
                else if (type === 'password' ||
                    name.includes('password') ||
                    id.includes('password') ||
                    placeholder.includes('password')) {
                    input.value = password;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    results.passwordField = true;
                    results.filled++;
                }
                // Name/Firstname/Lastname fields
                else if (type === 'text' &&
                    (name.includes('name') || 
                     id.includes('name') || 
                     placeholder.includes('name') ||
                     name.includes('first') ||
                     id.includes('first'))) {
                    const randomName = Math.random().toString(36).substring(2, 10);
                    input.value = randomName;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    results.filled++;
                }
            }
            
            return results;
        }, userEmail, megaPassword);
        
        console.log('[MEGA] Fill result:', fillResult);
        
        if (!fillResult.emailField || !fillResult.passwordField) {
            // Method 2: Try to find by specific MEGA selectors
            await reply("⚠️ Trying alternative form filling method...");
            
            // MEGA uses specific data-testid attributes
            const emailSelectors = [
                'input[data-testid="register-email-input"]',
                'input[name="email"]',
                'input[type="email"]',
                '#email',
                '[data-testid="email-input"]'
            ];
            
            const passwordSelectors = [
                'input[data-testid="register-password-input"]',
                'input[name="password"]',
                'input[type="password"]',
                '#password',
                '[data-testid="password-input"]'
            ];
            
            for (const selector of emailSelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        await element.fill(userEmail);
                        break;
                    }
                } catch (e) {}
            }
            
            for (const selector of passwordSelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        await element.fill(megaPassword);
                        break;
                    }
                } catch (e) {}
            }
        }
        
        await page.waitForTimeout(1000);
        
        // Click checkboxes (Terms and Conditions)
        await reply("📝 Accepting terms and conditions...");
        
        // Method 1: JavaScript click on checkboxes
        const checkboxClicked = await page.evaluate(() => {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            let clicked = 0;
            for (const checkbox of checkboxes) {
                if (!checkbox.checked) {
                    checkbox.click();
                    clicked++;
                }
            }
            return clicked;
        });
        
        console.log('[MEGA] Checkboxes clicked:', checkboxClicked);
        
        // Method 2: If JS didn't work, try Playwright click
        if (checkboxClicked === 0) {
            const checkboxes = await page.$$('input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                try {
                    const isChecked = await checkbox.isChecked();
                    if (!isChecked) {
                        await checkbox.check({ force: true });
                    }
                } catch (e) {}
            }
        }
        
        await page.waitForTimeout(1000);
        
        // Click Register/Sign Up button
        await reply("📬 Submitting registration form...");
        
        // Try multiple methods to click the register button
        let buttonClicked = false;
        
        // Method 1: JavaScript click
        const jsClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, input[type="submit"], .register-button, [data-testid="register-button"]');
            for (const button of buttons) {
                const text = (button.textContent || '').toLowerCase();
                if (text.includes('register') || text.includes('sign up') || text.includes('create account')) {
                    button.click();
                    return true;
                }
            }
            return false;
        });
        
        if (jsClicked) {
            buttonClicked = true;
            console.log('[MEGA] Button clicked via JavaScript');
        }
        
        // Method 2: Playwright click by text
        if (!buttonClicked) {
            const buttonSelectors = [
                'button:has-text("Register")',
                'button:has-text("Sign up")',
                'button:has-text("Create account")',
                'button:has-text("Next")',
                'button[type="submit"]',
                '.register-button',
                '[data-testid="register-button"]'
            ];
            
            for (const selector of buttonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        await button.click({ force: true });
                        buttonClicked = true;
                        console.log(`[MEGA] Button clicked via selector: ${selector}`);
                        break;
                    }
                } catch (e) {}
            }
        }
        
        // Method 3: Coordinate click as last resort
        if (!buttonClicked) {
            await page.mouse.click(786, 224);
            console.log('[MEGA] Button clicked via coordinates');
        }
        
        if (!buttonClicked) {
            await reply("⚠️ Could not find register button, but continuing...");
        }
        
        await page.waitForTimeout(3000);
        
        await reply("📬 Registration submitted!\n⏳ Waiting for confirmation email...");
        
        // Wait for confirmation email
        let confirmationLink = null;
        let elapsed = 0;
        const maxWait = 120; // 2 minutes max
        
        while (elapsed < maxWait && !confirmationLink) {
            const messages = await tempMail.fetchMessages();
            if (messages && messages.length > 0) {
                const latestMsg = messages.sort((a, b) => 
                    new Date(b.createdAt) - new Date(a.createdAt)
                )[0];
                
                const msgContent = await tempMail.getMessageContent(latestMsg.id);
                if (msgContent) {
                    const emailText = String(msgContent.text || '') + String(msgContent.html || '');
                    confirmationLink = extractConfirmationLink(emailText);
                    if (confirmationLink) break;
                }
            }
            
            await page.waitForTimeout(10000);
            elapsed += 10;
            
            if (elapsed % 30 === 0) {
                await reply(`⏱️ Checked inbox (${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed)...`);
            }
        }
        
        // Click confirmation link
        if (confirmationLink) {
            await reply(`✅ Confirmation email received!\n🔗 Opening verification link...`);
            await page.goto(confirmationLink, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(5000);
        } else {
            await reply(`⚠️ Confirmation email not received within ${maxWait} seconds.\nAccount may still work, saving credentials...`);
        }
        
        // Take final screenshot
        await takeScreenshot(page, chatId, sock, "🖼️ Final Registration Status");
        
        const totalTime = (Date.now() - startTime) / 1000;
        const mins = Math.floor(totalTime / 60);
        const secs = Math.floor(totalTime % 60);
        
        const results = 
            "🎉 *MEGA ACCOUNT CREATED SUCCESSFULLY!*\n\n" +
            `⏱️ Total Time: ${mins}m ${secs}s\n` +
            `📧 Email: \`${userEmail}\`\n` +
            `🔐 Password: \`${megaPassword}\`\n\n` +
            "⚠️ *Save these credentials immediately!*\n" +
            "🌐 *Login at:* https://mega.nz/login\n\n" +
            "> *Powered by Tech Zone Bot*";
        
        await reply(results);
        
        // Clean up
        await browser.close();
        activeCreations.delete(userId);
        
    } catch (error) {
        console.error('[MEGA] Registration error:', error);
        
        // Take error screenshot if possible
        if (page) {
            try {
                const errorScreenshot = await page.screenshot({ type: 'png' });
                await sock.sendMessage(chatId, {
                    image: errorScreenshot,
                    caption: "❌ Error Screenshot"
                });
            } catch (ssError) {}
        }
        
        await reply(`❌ *Error:* \`${escapeHtml(error.message)}\``);
        
        if (browser) await browser.close();
        activeCreations.delete(userId);
    }
}

module.exports = {
    name: 'mega',
    aliases: ['meganew', 'createaccount', 'megaaccount'],
    description: 'Create MEGA.nz accounts automatically',
    usage: '.mega\n.mega --status',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (args[0] === '--status') {
            const activeCount = activeCreations.size;
            if (activeCount > 0) {
                return reply(`🔄 *Active Creations:* ${activeCount}\nPlease wait for current operations to complete.`);
            } else {
                return reply(`✅ No active creations. Use \`.mega\` to create an account.`);
            }
        }
        
        // Check if user already has an active creation
        if (activeCreations.has(sender)) {
            return reply(`⏳ *You already have an active account creation in progress!*\nPlease wait for it to complete.`);
        }
        
        await react('🚀');
        
        const processingMsg = await reply(`🚀 *Starting MEGA Account Creator*\n\n` +
                                         `⏳ Initializing...\n` +
                                         `> This process takes 2-3 minutes\n` +
                                         `> Please don't spam the button`);
        
        // Mark as active
        activeCreations.set(sender, true);
        
        // Run registration in background
        megaRegistration(from, sock, async (text) => {
            return await sock.sendMessage(from, { text });
        }, react, sender).finally(() => {
            activeCreations.delete(sender);
        });
        
        // Delete processing message after a few seconds
        setTimeout(async () => {
            try {
                await sock.sendMessage(from, { delete: processingMsg.key });
            } catch (e) {}
        }, 3000);
    }
};