import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';
import zlib from 'zlib';

const router = express.Router();

// Store active sessions to keep them alive
const activeSessions = new Map();

function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

function generateSessionString(credsPath) {
    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        const jsonString = JSON.stringify(creds, null, 0);
        const compressedData = zlib.gzipSync(jsonString);
        const base64Data = compressedData.toString('base64');
        const sessionString = `KnightBot!${base64Data}`;
        const txtPath = credsPath.replace('creds.json', 'session.txt');
        fs.writeFileSync(txtPath, sessionString);
        console.log(`✅ Session string saved to: ${txtPath}`);
        return sessionString;
    } catch (error) {
        console.error('Error generating session string:', error);
        return null;
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session_${Date.now()}`);
    
    // Check if session already exists and is active
    if (activeSessions.has(num)) {
        const session = activeSessions.get(num);
        if (session.socket && session.socket.user) {
            console.log(`✅ Using existing active session for ${num}`);
            return res.send({ code: session.code, existing: true });
        } else {
            // Session exists but not active, clean it up
            activeSessions.delete(num);
        }
    }

    // Remove existing session directory
    await removeFile(dirs);

    // Clean the phone number
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({ error: 'Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK) without + or spaces.' });
        }
        return;
    }
    num = phone.getNumber('e164').replace('+', '');

    let pairingCode = null;
    let pairingTimeout = null;
    let KnightBot = null;

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            });

            // Store session in map
            activeSessions.set(num, {
                socket: KnightBot,
                dirs: dirs,
                startTime: Date.now(),
                code: null
            });

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline, qr } = update;

                if (qr) {
                    console.log(`📱 QR Code received for ${num} (but we're using pair code)`);
                }

                if (connection === 'open') {
                    console.log(`✅ Connected successfully for ${num}!`);
                    
                    // Clear timeout if exists
                    if (pairingTimeout) {
                        clearTimeout(pairingTimeout);
                        pairingTimeout = null;
                    }
                    
                    try {
                        // Wait a bit for the session to fully initialize
                        await delay(2000);
                        
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        
                        // Send creds.json file
                        await KnightBot.sendMessage(userJid, {
                            document: sessionKnight,
                            mimetype: 'application/json',
                            fileName: 'creds.json'
                        });
                        console.log(`📄 Session file sent to ${num}`);

                        // Generate and send session string
                        const sessionString = generateSessionString(dirs + '/creds.json');
                        if (sessionString) {
                            await KnightBot.sendMessage(userJid, {
                                text: `🔐 *Your Session String:*\n\n\`\`\`${sessionString}\`\`\`\n\n_Keep this safe! Do not share with anyone._`
                            });
                            console.log(`🔐 Session string sent to ${num}`);
                        }

                        // Send video guide
                        await KnightBot.sendMessage(userJid, {
                            image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
                            caption: `🎬 *KnightBot MD V2.0 Full Setup Guide!*\n\n🚀 Bug Fixes + New Commands + Fast AI Chat\n📺 Watch Now: https://youtu.be/NjOipI2AoMk`
                        });
                        console.log(`🎬 Video guide sent to ${num}`);

                        // Send warning
                        await KnightBot.sendMessage(userJid, {
                            text: `⚠️ Do not share this file with anybody ⚠️\n 
┌┤✑  Thanks for using Knight Bot
│└────────────┈ ⳹        
│©2025 Mr Unique Hacker 
└─────────────────┈ ⳹\n\n`
                        });
                        console.log(`⚠️ Warning message sent to ${num}`);
                        
                        // Keep session alive for 2 minutes after completion
                        setTimeout(() => {
                            if (activeSessions.has(num)) {
                                console.log(`🧹 Cleaning up session for ${num} after 2 minutes`);
                                const sess = activeSessions.get(num);
                                if (sess.socket) {
                                    try {
                                        sess.socket.end();
                                    } catch (e) {}
                                }
                                activeSessions.delete(num);
                                setTimeout(() => {
                                    removeFile(dirs);
                                }, 5000);
                            }
                        }, 120000);
                        
                    } catch (error) {
                        console.error(`❌ Error sending messages to ${num}:`, error);
                    }
                }

                if (isNewLogin) {
                    console.log(`🔐 New login via pair code for ${num}`);
                }

                if (isOnline) {
                    console.log(`📶 Client is online for ${num}`);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`🔌 Connection closed for ${num}, status: ${statusCode}`);

                    if (statusCode === 401) {
                        console.log(`❌ Logged out for ${num}. Need to generate new pair code.`);
                        activeSessions.delete(num);
                    } else {
                        console.log(`🔁 Connection closed for ${num} - session ended`);
                        // Don't auto-reconnect for pairing sessions to avoid conflicts
                    }
                }
            });

            KnightBot.ev.on('creds.update', saveCreds);

            // Request pairing code if not registered
            if (!KnightBot.authState.creds.registered) {
                // Wait for socket to be ready
                await delay(8000); // Increased wait time for stability
                
                num = num.replace(/[^\d+]/g, '');
                if (num.startsWith('+')) num = num.substring(1);

                try {
                    console.log(`📱 Requesting pairing code for ${num}`);
                    
                    // Request the pairing code
                    let code = await KnightBot.requestPairingCode(num);
                    
                    // Format the code with dashes every 4 digits
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    pairingCode = formattedCode;
                    
                    console.log(`🔑 Pairing code for ${num}: ${pairingCode}`);
                    
                    // Update session with code
                    if (activeSessions.has(num)) {
                        const sess = activeSessions.get(num);
                        sess.code = pairingCode;
                        activeSessions.set(num, sess);
                    }
                    
                    // Send response immediately with the code
                    if (!res.headersSent) {
                        return res.send({ 
                            code: pairingCode,
                            number: num,
                            message: "Enter this code in WhatsApp within 5 minutes"
                        });
                    }
                    
                    // Set timeout for pairing (5 minutes)
                    pairingTimeout = setTimeout(() => {
                        console.log(`⏰ Pairing timeout for ${num} - no connection established within 5 minutes`);
                        if (KnightBot) {
                            try {
                                KnightBot.end();
                            } catch (e) {}
                        }
                        if (activeSessions.has(num)) {
                            activeSessions.delete(num);
                        }
                        setTimeout(() => {
                            removeFile(dirs);
                        }, 5000);
                    }, 300000); // 5 minutes
                    
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) {
                        return res.status(503).send({ 
                            error: 'Failed to get pairing code. Please check your phone number and try again.',
                            details: error.message
                        });
                    }
                }
            } else {
                // Already registered - this shouldn't happen for new pairings
                console.log(`⚠️ Session for ${num} is already registered`);
                if (!res.headersSent) {
                    return res.status(400).send({ 
                        error: 'This number already has an active session. Please use a different number or clear existing session.'
                    });
                }
            }
            
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                return res.status(503).send({ 
                    error: 'Service Unavailable',
                    details: err.message
                });
            }
        }
    }

    await initiateSession();
});

// Cleanup inactive sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [num, session] of activeSessions.entries()) {
        // Remove sessions older than 10 minutes
        if (now - session.startTime > 600000) {
            console.log(`🧹 Cleaning up inactive session for ${num}`);
            if (session.socket) {
                try {
                    session.socket.end();
                } catch (e) {}
            }
            if (session.dirs) {
                setTimeout(() => {
                    removeFile(session.dirs);
                }, 5000);
            }
            activeSessions.delete(num);
        }
    }
}, 60000);

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('SIGTERM received, cleaning up sessions...');
    for (const [num, session] of activeSessions.entries()) {
        if (session.socket) {
            try {
                session.socket.end();
            } catch (e) {}
        }
        if (session.dirs) {
            removeFile(session.dirs);
        }
    }
    activeSessions.clear();
    process.exit(0);
});

export default router;