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
        lastActivity: Date.now()
    };
    
    sessions.set(key, session);
    return session;
}

/**
 * Get current session
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
 * Clear session
 */
function clearSession(userId, chatId) {
    const key = getSessionKey(userId, chatId);
    sessions.delete(key);
}

/**
 * Check if has active session
 */
function hasActiveSession(userId, chatId) {
    return getSession(userId, chatId) !== null;
}

module.exports = {
    createSession,
    getSession,
    updateSession,
    clearSession,
    hasActiveSession
};
