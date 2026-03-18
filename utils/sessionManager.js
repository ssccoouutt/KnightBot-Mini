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
 * Generate session key (per user per chat)
 */
function getSessionKey(userId, chatId) {
    return `${userId}:${chatId}`;
}

/**
 * Get latest session key for a user in a chat
 */
function getLatestSessionKey(userId, chatId) {
    return `${userId}:${chatId}:latest`;
}

/**
 * Create a new session
 */
function createSession(userId, chatId, command, data = {}) {
    const key = getSessionKey(userId, chatId);
    const latestKey = getLatestSessionKey(userId, chatId);
    
    const session = {
        id: `${key}_${Date.now()}`,
        userId,
        chatId,
        command,
        data,
        step: 1,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        pendingMessages: [] // Store bot message IDs waiting for response
    };
    
    sessions.set(key, session);
    
    // Update latest session
    latestSessionMap.set(latestKey, {
        sessionKey: key,
        timestamp: Date.now()
    });
    
    return session;
}

/**
 * Add a pending bot message to session
 */
function addPendingMessage(userId, chatId, messageId, command) {
    const key = getSessionKey(userId, chatId);
    const session = sessions.get(key);
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
    
    // Update latest activity timestamp
    const latestKey = getLatestSessionKey(userId, chatId);
    latestSessionMap.set(latestKey, {
        sessionKey: key,
        timestamp: Date.now()
    });
    
    return session;
}

/**
 * Find session by replied message ID
 */
function findSessionByRepliedMessage(messageId, userId) {
    console.log(`🔍 Searching for session with pending message: ${messageId} for user ${userId}`);
    
    for (const [key, session] of sessions.entries()) {
        // Only check sessions belonging to this user
        if (session.userId !== userId) continue;
        
        console.log(`   Checking session ${session.command} with ${session.pendingMessages?.length || 0} pending messages`);
        
        if (session.pendingMessages && Array.isArray(session.pendingMessages)) {
            const found = session.pendingMessages.find(p => p && p.messageId === messageId);
            if (found) {
                console.log(`✅ Found match in session: ${session.command}`);
                return {
                    session,
                    pendingInfo: found
                };
            }
        }
    }
    
    console.log(`❌ No session found for message ID ${messageId}`);
    return null;
}

/**
 * Get the latest active session for a user
 */
function getLatestSession(userId, chatId) {
    const latestKey = getLatestSessionKey(userId, chatId);
    const latest = latestSessionMap.get(latestKey);
    
    if (!latest) return null;
    
    const session = sessions.get(latest.sessionKey);
    if (!session) {
        latestSessionMap.delete(latestKey);
        return null;
    }
    
    // Check if expired
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        sessions.delete(latest.sessionKey);
        latestSessionMap.delete(latestKey);
        return null;
    }
    
    return session;
}

/**
 * Get all sessions for a user (for debugging)
 */
function getUserSessions(userId, chatId) {
    const userSessions = [];
    for (const [key, session] of sessions.entries()) {
        if (session.userId === userId && session.chatId === chatId) {
            userSessions.push(session);
        }
    }
    return userSessions;
}

/**
 * Update session data
 */
function updateSession(userId, chatId, data) {
    const key = getSessionKey(userId, chatId);
    const session = sessions.get(key);
    if (!session) return null;
    
    session.data = { ...session.data, ...data };
    session.step++;
    session.lastActivity = Date.now();
    
    // Update latest activity timestamp
    const latestKey = getLatestSessionKey(userId, chatId);
    latestSessionMap.set(latestKey, {
        sessionKey: key,
        timestamp: Date.now()
    });
    
    return session;
}

/**
 * Clear session
 */
function clearSession(userId, chatId) {
    const key = getSessionKey(userId, chatId);
    sessions.delete(key);
    
    // Check if this was the latest session
    const latestKey = getLatestSessionKey(userId, chatId);
    const latest = latestSessionMap.get(latestKey);
    if (latest && latest.sessionKey === key) {
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
 * Check if a specific session is still active (not expired)
 */
function isSessionActive(userId, chatId) {
    const key = getSessionKey(userId, chatId);
    const session = sessions.get(key);
    
    if (!session) return false;
    
    // Check if expired
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        sessions.delete(key);
        
        // Clean up latest session if this was it
        const latestKey = getLatestSessionKey(userId, chatId);
        const latest = latestSessionMap.get(latestKey);
        if (latest && latest.sessionKey === key) {
            latestSessionMap.delete(latestKey);
        }
        
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
    hasActiveSession,
    isSessionActive
};
