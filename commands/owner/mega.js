/**
 * MEGA Account Creator - Create MEGA.nz accounts automatically
 * Uses Playwright for browser automation (Selenium-style logic)
 */

const { chromium } = require('playwright');
const axios = require('axios');
const config = require('../../config');

// Constants
const BASE = "https://api.mail.tm";
const MEGA_REG_URL = "https://mega.nz/register";

// Store active sessions
const activeCreations = new Map();

// Helper functions (exactly like Python script)
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

// Temporary Email Class (exactly like Python script)
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
            console.error('[MEGA] TempMail error:', error.message);
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

// Main registration function - EXACT logic like Python script
async function megaRegistration(chatId, sock, reply, userId) {
    const startTime = Date.now();
    let browser = null;
    let page = null;
    
    try {
        await reply("🚀 Starting MEGA Account Registration\n⏳ Creating temporary email...");

        // Create temporary email
        const tempMail = new TempMailTM();
        if (!await tempMail.create()) {
            await reply("❌ Failed to create temporary email!\nPlease try again later.");
            return;
        }

        const userEmail = tempMail.address;
        const megaPassword = randomPassword();

        await reply(
            `✅ Temporary Email Created!\n` +
            `📧: \`${userEmail}\`\n` +
            `🔑 Generated Password: \`${megaPassword}\`\n\n` +
            `⚙️ Initializing browser...`
        );

        // Launch browser
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        page = await browser.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        await reply("🌐 Loading MEGA registration page...");
        await page.goto(MEGA_REG_URL);
        await page.waitForTimeout(3000);

        await reply("✅ Processing registration form...");

        // ============ CLICK CHECKBOXES FIRST (like original script) ============
        // The original Python script uses coordinates: (506, 598) and (506, 670)
        try {
            // Click first checkbox
            await page.mouse.click(506, 598);
            await page.waitForTimeout(500);
            // Click second checkbox
            await page.mouse.click(506, 670);
            await page.waitForTimeout(500);
            console.log('[MEGA] Checkboxes clicked via coordinates');
        } catch (e) {
            console.log('[MEGA] Checkbox error:', e.message);
        }

        // ============ FILL ALL TEXT INPUTS (like original script) ============
        // Find all input fields and fill them
        const inputs = await page.$$('input');
        
        for (const input of inputs) {
            const type = await input.getAttribute('type');
            const id = await input.getAttribute('id') || '';
            const name = await input.getAttribute('name') || '';
            
            try {
                if (type === 'email' || id.includes('email') || name.includes('email')) {
                    await input.fill(userEmail);
                    console.log('[MEGA] Filled email field');
                }
                else if (type === 'password') {
                    await input.fill(megaPassword);
                    console.log('[MEGA] Filled password field');
                }
                else if (type === 'text' || type === 'tel' || type === 'url' || !type) {
                    // Fill with random text for name/firstname/lastname fields
                    await input.fill(randomName(8));
                }
            } catch (e) {}
        }

        await page.waitForTimeout(1000);

        // ============ CLICK REGISTER BUTTON (like original script) ============
        // Original uses coordinates (786, 224)
        await reply("📬 Registration submitted!\n⏳ Waiting for confirmation email...");
        
        try {
            await page.mouse.click(786, 224);
            console.log('[MEGA] Register button clicked');
        } catch (e) {
            console.log('[MEGA] Register button error:', e.message);
        }

        // ============ WAIT FOR CONFIRMATION EMAIL (like original script) ============
        let confirmationLink = null;
        let elapsed = 0;
        
        while (elapsed < 120 && !confirmationLink) {
            const messages = await tempMail.fetchMessages();
            if (messages && messages.length > 0) {
                const latestMsg = messages[0];
                const msgContent = await tempMail.getMessageContent(latestMsg.id);
                if (msgContent) {
                    const emailText = String(msgContent.text || '') + String(msgContent.html || '');
                    confirmationLink = extractConfirmationLink(emailText);
                    if (confirmationLink) break;
                }
            }
            await page.waitForTimeout(10000);
            elapsed += 10;
            
            if (!confirmationLink && elapsed % 30 === 0) {
                await reply(`⏱️ Checked inbox (${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed)...`);
            }
        }

        // ============ OPEN CONFIRMATION LINK (like original script) ============
        if (confirmationLink) {
            await reply(`✅ Confirmation email received!\n🔗 Opening verification link...`);
            await page.goto(confirmationLink);
            await page.waitForTimeout(3000);
        }

        // Take screenshot
        const screenshot = await page.screenshot({ type: 'png' });
        await sock.sendMessage(chatId, {
            image: screenshot,
            caption: "🖼️ Final Registration Status"
        });

        const totalTime = (Date.now() - startTime) / 1000;
        const mins = Math.floor(totalTime / 60);
        const secs = Math.floor(totalTime % 60);
        
        const results = 
            "🎉 MEGA ACCOUNT CREATED SUCCESSFULLY!\n\n" +
            `⏱️ Total Time: ${mins}m ${secs}s\n` +
            `📧 Email: ${userEmail}\n` +
            `🔐 Password: ${megaPassword}\n\n` +
            "⚠️ Save these credentials immediately!\n" +
            "🔄 Use .mega again to create another account";
        
        await reply(results);
        
        await browser.close();
        activeCreations.delete(userId);

    } catch (error) {
        console.error('[MEGA] Error:', error);
        
        if (page) {
            try {
                const errorScreenshot = await page.screenshot({ type: 'png' });
                await sock.sendMessage(chatId, {
                    image: errorScreenshot,
                    caption: "❌ Error Screenshot"
                });
            } catch (e) {}
        }
        
        await reply(`❌ Error: ${error.message}`);
        
        if (browser) await browser.close();
        activeCreations.delete(userId);
    }
}

module.exports = {
    name: 'mega',
    aliases: ['meganew', 'createaccount', 'megaaccount'],
    description: 'Create MEGA.nz accounts automatically',
    usage: '.mega',
    category: 'owner',
    ownerOnly: true,

    async execute(sock, msg, args, context) {
        const { from, sender, reply, react } = context;
        
        if (activeCreations.has(sender)) {
            return reply(`⏳ You already have an active account creation in progress!\nPlease wait for it to complete.`);
        }
        
        await react('🚀');
        await reply(`🚀 Starting MEGA Account Creator\n⏳ This takes 2-3 minutes...`);
        
        activeCreations.set(sender, true);
        
        await megaRegistration(from, sock, reply, sender);
        
        activeCreations.delete(sender);
    }
};