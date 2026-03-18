/**
 * Session Manager - Handles multi-step conversations
 * Stores temporary user sessions for commands that need multiple inputs
 */

// Session store (in-memory)
const sessions = new Map();

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;

/**
 * Generate session key (per user per chat)
 */
function getSessionKey(userId, chatId) {
    return `${userId}:${chatId}`;
}

/**
 * Create a new session
 */
function createSession(userId, chatId, command, data = {}) {
    const key = getSessionKey(userId, chatId);
    const session = {
        id: `${key}_${Date.now()}`,
        userId,
        chatId,
        command,
        data,
        step: 1,
        lastActivity: Date.now(),
        pendingMessages: [] // Store bot message IDs waiting for response
    };
    
    sessions.set(key, session);
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
    
    // Keep only last 5 pending messages
    if (session.pendingMessages.length > 5) {
        session.pendingMessages.shift();
    }
    
    session.lastActivity = Date.now();
    return session;
}

/**
 * Find session by replied message ID and user ID
 * This ensures only the user who started the session can reply to it
 */
function findSessionByRepliedMessage(messageId, userId) {
    for (const [key, session] of sessions.entries()) {
        // Check if this message belongs to this user's session
        if (session.userId !== userId) continue;
        
        const found = session.pendingMessages.find(p => p.messageId === messageId);
        if (found) {
            return {
                session,
                pendingInfo: found
            };
        }
    }
    return null;
}

/**
 * Get current session for a specific user in a chat
 */
function getSession(userId, chatId) {
    const key = getSessionKey(userId, chatId);
    const session = sessions.get(key);
    
    if (!session) return null;
    
    // Check if expired
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        sessions.delete(key);
        return null;
    }
    
    session.lastActivity = Date.now();
    return session;
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
    return session;
}

/**
 * Clear session for a specific user in a chat
 */
function clearSession(userId, chatId) {
    const key = getSessionKey(userId, chatId);
    sessions.delete(key);
}

/**
 * Check if user has active session in a chat
 */
function hasActiveSession(userId, chatId) {
    return getSession(userId, chatId) !== null;
}

module.exports = {
    createSession,
    getSession,
    updateSession,
    clearSession,
    hasActiveSession,
    addPendingMessage,
    findSessionByRepliedMessage
};
