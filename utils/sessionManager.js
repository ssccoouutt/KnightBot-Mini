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
 * Create a new session (becomes the latest active session)
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
        isActive: true, // New sessions are active
        isFrozen: false, // Not frozen
        pendingMessages: [] // Store bot message IDs waiting for response
    };
    
    sessions.set(sessionId, session);
    
    // Mark all other sessions as frozen (inactive)
    for (const [id, s] of sessions.entries()) {
        if (s.userId === userId && s.chatId === chatId && s.id !== sessionId) {
            s.isActive = false;
            s.isFrozen = true;
            console.log(`❄️ Session ${s.id} frozen (command: ${s.command})`);
        }
    }
    
    // Set as latest session
    latestSessionMap.set(latestKey, {
        sessionId: sessionId,
        timestamp: Date.now()
    });
    
    console.log(`✅ Created ACTIVE session ${sessionId} for ${userId} (command: ${command})`);
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
    
    // Only add to active sessions
    if (!session.isActive) {
        console.log(`⚠️ Cannot add message to frozen session ${session.id}`);
        return null;
    }
    
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
                console.log(`✅ Found match in session: ${session.command} (${sessionId}) - Active: ${session.isActive}, Frozen: ${session.isFrozen}`);
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
 * Activate a specific session (make it the active one, freeze others)
 */
function activateSession(userId, chatId, sessionId) {
    const latestKey = `${userId}:${chatId}:latest`;
    const targetSession = sessions.get(sessionId);
    
    if (!targetSession) return null;
    
    // Mark all other sessions as frozen
    for (const [id, s] of sessions.entries()) {
        if (s.userId === userId && s.chatId === chatId) {
            if (s.id === sessionId) {
                s.isActive = true;
                s.isFrozen = false;
                s.lastActivity = Date.now();
                console.log(`✅ Session ${s.id} activated (command: ${s.command})`);
            } else {
                s.isActive = false;
                s.isFrozen = true;
                console.log(`❄️ Session ${s.id} frozen (command: ${s.command})`);
            }
        }
    }
    
    // Set as latest session
    latestSessionMap.set(latestKey, {
        sessionId: sessionId,
        timestamp: Date.now()
    });
    
    return targetSession;
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
    
    // Check if expired by timeout
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        console.log(`⏰ Session ${session.id} expired due to inactivity`);
        sessions.delete(latest.sessionId);
        latestSessionMap.delete(latestKey);
        return null;
    }
    
    return session;
}

/**
 * Get all active sessions for a user (for debugging)
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
                console.log(`⏰ Session ${sessionId} expired due to inactivity`);
                sessions.delete(sessionId);
            }
        }
    }
    return userSessions;
}

/**
 * Update session data (only for active sessions)
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
    
    // Only update active sessions
    if (!session.isActive) {
        console.log(`⚠️ Cannot update frozen session ${session.id}`);
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
 * Update session activity (without changing step)
 */
function updateSessionActivity(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    
    session.lastActivity = Date.now();
    return session;
}

/**
 * Set a session as the latest (without activating it)
 */
function setAsLatestSession(userId, chatId, sessionId) {
    const latestKey = `${userId}:${chatId}:latest`;
    const session = sessions.get(sessionId);
    
    if (!session) return null;
    
    latestSessionMap.set(latestKey, {
        sessionId: sessionId,
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
    
    const { userId, chatId } = session;
    
    console.log(`🗑️ Clearing session ${sessionId} (command: ${session.command})`);
    sessions.delete(sessionId);
    
    // Check if this was the latest session
    const latestKey = `${userId}:${chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    
    if (latest && latest.sessionId === sessionId) {
        // This was the latest session - remove it from latest map
        latestSessionMap.delete(latestKey);
        
        // DO NOT automatically activate another session
        // Let the user decide which session to continue by replying
        console.log(`📭 No active session remaining for ${userId} - user must start a new command or reply to an old session`);
    }
}

/**
 * Clear latest session for a user
 */
function clearLatestSession(userId, chatId) {
    const latestKey = `${userId}:${chatId}:latest`;
    const latest = latestSessionMap.get(latestKey);
    
    if (latest) {
        clearSession(latest.sessionId);
    }
}

/**
 * Check if user has any active session
 */
function hasActiveSession(userId, chatId) {
    return getLatestSession(userId, chatId) !== null;
}

/**
 * Check if a specific session exists and is not expired
 * This returns true for BOTH active AND frozen sessions that haven't timed out
 */
function isSessionActive(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    
    // Check if expired by timeout (5 minutes of no activity)
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
        console.log(`⏰ Session ${sessionId} expired due to inactivity`);
        sessions.delete(sessionId);
        return false;
    }
    
    // Session exists and is not expired - it's "active" in the sense that it still exists
    // (even if it's frozen)
    return true;
}

/**
 * Check if a session is frozen
 */
function isSessionFrozen(sessionId) {
    const session = sessions.get(sessionId);
    return session ? session.isFrozen : false;
}

/**
 * Check if a session is active (not frozen)
 */
function isSessionCurrentlyActive(sessionId) {
    const session = sessions.get(sessionId);
    return session ? session.isActive : false;
}

module.exports = {
    createSession,
    addPendingMessage,
    findSessionByRepliedMessage,
    activateSession,
    getLatestSession,
    getUserSessions,
    updateSession,
    updateSessionActivity,
    setAsLatestSession,
    clearSession,
    clearLatestSession,
    hasActiveSession,
    isSessionActive,
    isSessionFrozen,
    isSessionCurrentlyActive
};
