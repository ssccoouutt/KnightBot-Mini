/**
 * JID/LID Mapping Utilities
 * Handles LID (Linked ID) to Phone Number conversion and vice versa
 */

const fs = require('fs');
const path = require('path');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const config = require('../config');

// LID mapping cache
const lidMappingCache = new Map();

/**
 * Normalize JID to just the number part
 * @param {string} jid - The JID to normalize
 * @returns {string|null} - Normalized number or null
 */
const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  
  if (jid.includes(':')) {
    return jid.split(':')[0];
  }
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
};

/**
 * Get LID mapping value from session files
 * @param {string} user - User identifier
 * @param {string} direction - 'pnToLid' or 'lidToPn'
 * @returns {string|null} - Mapped value or null
 */
const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    return lidMappingCache.get(cacheKey);
  }
  
  const sessionPath = path.join(__dirname, '..', config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  
  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
  
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch (error) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

/**
 * Normalize JID handling LID conversion
 * Converts between LID format and regular JID format
 * @param {string} jid - The JID to normalize
 * @returns {string} - Normalized JID
 */
const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    }
    
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    
    if (server === 'hosted') {
      return jidEncode(user, 'hosted');
    }
    return jidEncode(user, 's.whatsapp.net');
  } catch (error) {
    return jid;
  }
};

/**
 * Build comparable JID variants (PN + LID) for matching
 * @param {string} jid - The JID to build variants for
 * @returns {string[]} - Array of JID variants
 */
const buildComparableIds = (jid) => {
  if (!jid) return [];
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return [normalizeJidWithLid(jid)].filter(Boolean);
    }
    
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    variants.add(jidEncode(decoded.user, normalizedServer));
    
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) {
        const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
        variants.add(jidEncode(lidUser, lidServer));
      }
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) {
        const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        variants.add(jidEncode(pnUser, pnServer));
      }
    }
    
    return Array.from(variants);
  } catch (error) {
    return [jid];
  }
};

/**
 * Find participant by either PN JID or LID JID
 * @param {Array} participants - Array of group participants
 * @param {string|string[]} userIds - User ID(s) to find
 * @returns {object|null} - Found participant or null
 */
const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  
  if (!targets.length) return null;
  
  return participants.find(participant => {
    if (!participant) return false;
    
    const participantIds = [
      participant.id,
      participant.lid,
      participant.userJid
    ]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

/**
 * Clear the LID mapping cache
 */
const clearLidCache = () => {
  lidMappingCache.clear();
};

/**
 * Get cache stats for debugging
 */
const getCacheStats = () => {
  return {
    size: lidMappingCache.size,
    keys: Array.from(lidMappingCache.keys())
  };
};

module.exports = {
  normalizeJid,
  normalizeJidWithLid,
  buildComparableIds,
  findParticipant,
  getLidMappingValue,
  clearLidCache,
  getCacheStats
};
