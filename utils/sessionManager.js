/**
 * Session Manager - Handles multi-step conversations
 * Stores temporary user sessions for commands that need multiple inputs
 */

// Session store (in-memory)
const sessions = new Map();

// Track latest session per user per chat
const latestSessionMap = new Map();

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;

/**
 * Generate a unique session ID
 */
function generateSessionId(userId, chatId) {
    return `${userId}:${chatId}:${Date.now()}:${Math.random().toString(36).substring(7)}`;
}

/**
 * Create a new session (does NOT delete old ones)
 */
function createSession(userId, chatId, command, data = {}) {
    const sessionId = generateSessionId(userId, chatId);
    const latestKey = `${userId}:${chatId}:latest`;
    
    const session = {
        id: sessionId,
        userId,
        chatId,
        command,
        data,
        step: 1,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        pendingMessages: [] // Store bot message IDs waiting for response
    };
    
    sessions.set(sessionId, session);
    
    // Update latest session
    latestSessionMap.set(latestKey, {
        sessionId: sessionId,
        timestamp: Date.now()
    });
    
    console.log(`✅ Created session ${sessionId} for ${userId} in ${chatId} (command: ${command})`);
    return session;
}

/**
 * Add a pending bot message to session
 */
function addPendingMessage(userId, chatId, messageId, command) {
    // Find the latest session for this user
    const latestKey = `${userId}:${chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    
    if (!latest) return null;
    
    const session = sessions.get(latest.sessionId);
    if (!session) return null;
    
    session.pendingMessages.push({
        messageId,
        command,
        timestamp: Date.now()
    });
    
    // Keep only last 10 pending messages
    if (session.pendingMessages.length > 10) {
        session.pendingMessages.shift();
    }
    
    session.lastActivity = Date.now();
    
    // Update latest timestamp
    latestSessionMap.set(latestKey, {
        sessionId: latest.sessionId,
        timestamp: Date.now()
    });
    
    return session;
}

/**
 * Find session by replied message ID - searches ALL sessions
 */
function findSessionByRepliedMessage(messageId, userId) {
    console.log(`🔍 Searching ALL sessions for pending message: ${messageId} for user ${userId}`);
    
    let foundSessions = [];
    
    for (const [sessionId, session] of sessions.entries()) {
        // Only check sessions belonging to this user
        if (session.userId !== userId) continue;
        
        if (session.pendingMessages && Array.isArray(session.pendingMessages)) {
            const found = session.pendingMessages.find(p => p && p.messageId === messageId);
            if (found) {
                console.log(`✅ Found match in session: ${session.command} (${sessionId})`);
                foundSessions.push({
                    session,
                    pendingInfo: found
                });
            }
        }
    }
    
    if (foundSessions.length > 0) {
        // Return the most recent one
        return foundSessions.sort((a, b) => b.session.lastActivity - a.session.lastActivity)[0];
    }
    
    console.log(`❌ No session found for message ID ${messageId}`);
    return null;
}

/**
 * Get the latest active session for a user
 */
function getLatestSession(userId, chatId) {
    const latestKey = `${userId}:${chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    
    if (!latest) return null;
    
    const session = sessions.get(latest.sessionId);
    if (!session) {
        latestSessionMap.delete(latestKey);
        return null;
    }
    
    // Check if expired
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        sessions.delete(latest.sessionId);
        latestSessionMap.delete(latestKey);
        return null;
    }
    
    return session;
}

/**
 * Get all active sessions for a user
 */
function getUserSessions(userId, chatId) {
    const userSessions = [];
    for (const [sessionId, session] of sessions.entries()) {
        if (session.userId === userId && session.chatId === chatId) {
            // Check if expired
            if (Date.now() - session.lastActivity <= SESSION_TIMEOUT) {
                userSessions.push(session);
            } else {
                // Clean up expired session
                sessions.delete(sessionId);
            }
        }
    }
    return userSessions;
}

/**
 * Update session data
 */
function updateSession(userId, chatId, data) {
    const latestKey = `${userId}:${chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    
    if (!latest) return null;
    
    const session = sessions.get(latest.sessionId);
    if (!session) {
        latestSessionMap.delete(latestKey);
        return null;
    }
    
    session.data = { ...session.data, ...data };
    session.step++;
    session.lastActivity = Date.now();
    
    // Update latest timestamp
    latestSessionMap.set(latestKey, {
        sessionId: latest.sessionId,
        timestamp: Date.now()
    });
    
    return session;
}

/**
 * Clear a specific session
 */
function clearSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    sessions.delete(sessionId);
    
    // Check if this was the latest session
    const latestKey = `${session.userId}:${session.chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    if (latest && latest.sessionId === sessionId) {
        latestSessionMap.delete(latestKey);
        
        // Set new latest session if any exist
        const userSessions = getUserSessions(session.userId, session.chatId);
        if (userSessions.length > 0) {
            const newLatest = userSessions.sort((a, b) => b.lastActivity - a.lastActivity)[0];
            latestSessionMap.set(latestKey, {
                sessionId: newLatest.id,
                timestamp: newLatest.lastActivity
            });
        }
    }
}

/**
 * Clear latest session for a user
 */
function clearLatestSession(userId, chatId) {
    const latestKey = `${userId}:${chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    
    if (latest) {
        sessions.delete(latest.sessionId);
        latestSessionMap.delete(latestKey);
    }
}

/**
 * Check if user has any active session
 */
function hasActiveSession(userId, chatId) {
    return getLatestSession(userId, chatId) !== null;
}

/**
 * Check if a specific session is still active
 */
function isSessionActive(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        sessions.delete(sessionId);
        return false;
    }
    
    return true;
}

module.exports = {
    createSession,
    addPendingMessage,
    findSessionByRepliedMessage,
    getLatestSession,
    getUserSessions,
    updateSession,
    clearSession,
    clearLatestSession,
    hasActiveSession,
    isSessionActive
};
