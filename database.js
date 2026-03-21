/**
 * Simple JSON-based Database for Group Settings
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const DB_PATH = path.join(__dirname, 'database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const MODS_DB = path.join(DB_PATH, 'mods.json');
const GROUP_FORWARDING_DB = path.join(DB_PATH, 'group_forwarding.json');

// Initialize database directory
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

// Initialize database files
const initDB = (filePath, defaultData = {}) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

initDB(GROUPS_DB, {});
initDB(USERS_DB, {});
initDB(WARNINGS_DB, {});
initDB(MODS_DB, { moderators: [] });
initDB(GROUP_FORWARDING_DB, {});

// Read database
const readDB = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading database: ${error.message}`);
    return {};
  }
};

// Write database
const writeDB = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing database: ${error.message}`);
    return false;
  }
};

// Group Settings
const getGroupSettings = (groupId) => {
  const groups = readDB(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    writeDB(GROUPS_DB, groups);
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = readDB(GROUPS_DB);
  groups[groupId] = { ...groups[groupId], ...settings };
  return writeDB(GROUPS_DB, groups);
};

// User Data
const getUser = (userId) => {
  const users = readDB(USERS_DB);
  if (!users[userId]) {
    users[userId] = {
      registered: Date.now(),
      premium: false,
      banned: false
    };
    writeDB(USERS_DB, users);
  }
  return users[userId];
};

const updateUser = (userId, data) => {
  const users = readDB(USERS_DB);
  users[userId] = { ...users[userId], ...data };
  return writeDB(USERS_DB, users);
};

// Warnings System
const getWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  return warnings[key] || { count: 0, warnings: [] };
};

const addWarning = (groupId, userId, reason) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (!warnings[key]) {
    warnings[key] = { count: 0, warnings: [] };
  }
  
  warnings[key].count++;
  warnings[key].warnings.push({
    reason,
    date: Date.now()
  });
  
  writeDB(WARNINGS_DB, warnings);
  return warnings[key];
};

const removeWarning = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (warnings[key] && warnings[key].count > 0) {
    warnings[key].count--;
    warnings[key].warnings.pop();
    writeDB(WARNINGS_DB, warnings);
    return true;
  }
  return false;
};

const clearWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  delete warnings[key];
  return writeDB(WARNINGS_DB, warnings);
};

// Moderators System
const getModerators = () => {
  const mods = readDB(MODS_DB);
  return mods.moderators || [];
};

const addModerator = (userId) => {
  const mods = readDB(MODS_DB);
  if (!mods.moderators) mods.moderators = [];
  if (!mods.moderators.includes(userId)) {
    mods.moderators.push(userId);
    return writeDB(MODS_DB, mods);
  }
  return false;
};

const removeModerator = (userId) => {
  const mods = readDB(MODS_DB);
  if (mods.moderators) {
    mods.moderators = mods.moderators.filter(id => id !== userId);
    return writeDB(MODS_DB, mods);
  }
  return false;
};

const isModerator = (userId) => {
  const mods = getModerators();
  return mods.includes(userId);
};

// ===== GROUP FORWARDING SYSTEM =====

// Group forwarding settings storage (cached in memory for performance)
let groupForwardingCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5 seconds cache TTL

// Load group forwarding configs from database
const loadGroupForwardingConfigs = () => {
  const now = Date.now();
  if (groupForwardingCache && (now - lastCacheUpdate) < CACHE_TTL) {
    return groupForwardingCache;
  }
  
  const data = readDB(GROUP_FORWARDING_DB);
  groupForwardingCache = data;
  lastCacheUpdate = now;
  return data;
};

// Save group forwarding configs to database
const saveGroupForwardingConfigs = (data) => {
  const success = writeDB(GROUP_FORWARDING_DB, data);
  if (success) {
    groupForwardingCache = data;
    lastCacheUpdate = Date.now();
  }
  return success;
};

// Set group forwarding configuration
const setGroupForwarding = (sourceGroupId, targetGroupId, enabled = true, forwarderJid = null) => {
  const configs = loadGroupForwardingConfigs();
  
  configs[sourceGroupId] = {
    targetGroupId,
    enabled,
    forwarderJid,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  saveGroupForwardingConfigs(configs);
  return configs[sourceGroupId];
};

// Get group forwarding configuration
const getGroupForwarding = (sourceGroupId) => {
  const configs = loadGroupForwardingConfigs();
  return configs[sourceGroupId] || null;
};

// Remove group forwarding configuration
const removeGroupForwarding = (sourceGroupId) => {
  const configs = loadGroupForwardingConfigs();
  
  if (configs[sourceGroupId]) {
    delete configs[sourceGroupId];
    saveGroupForwardingConfigs(configs);
    return true;
  }
  
  return false;
};

// Toggle group forwarding (enable/disable)
const toggleGroupForwarding = (sourceGroupId, enabled) => {
  const configs = loadGroupForwardingConfigs();
  
  if (configs[sourceGroupId]) {
    configs[sourceGroupId].enabled = enabled;
    configs[sourceGroupId].updatedAt = Date.now();
    saveGroupForwardingConfigs(configs);
    return true;
  }
  
  return false;
};

// Get all active group forwarding configs
const getAllGroupForwardings = () => {
  const configs = loadGroupForwardingConfigs();
  
  return Object.entries(configs)
    .filter(([_, config]) => config.enabled === true)
    .map(([source, config]) => ({
      sourceGroupId: source,
      targetGroupId: config.targetGroupId,
      enabled: config.enabled,
      forwarderJid: config.forwarderJid,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    }));
};

// Get all forwarding configs (including disabled)
const getAllGroupForwardingsIncludingDisabled = () => {
  const configs = loadGroupForwardingConfigs();
  
  return Object.entries(configs).map(([source, config]) => ({
    sourceGroupId: source,
    targetGroupId: config.targetGroupId,
    enabled: config.enabled,
    forwarderJid: config.forwarderJid,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt
  }));
};

// Check if a group has forwarding enabled
const hasGroupForwarding = (sourceGroupId) => {
  const config = getGroupForwarding(sourceGroupId);
  return config !== null && config.enabled === true;
};

// Get target group for source group
const getForwardingTarget = (sourceGroupId) => {
  const config = getGroupForwarding(sourceGroupId);
  return config && config.enabled ? config.targetGroupId : null;
};

// Update forwarding target
const updateForwardingTarget = (sourceGroupId, newTargetGroupId) => {
  const configs = loadGroupForwardingConfigs();
  
  if (configs[sourceGroupId]) {
    configs[sourceGroupId].targetGroupId = newTargetGroupId;
    configs[sourceGroupId].updatedAt = Date.now();
    saveGroupForwardingConfigs(configs);
    return true;
  }
  
  return false;
};

// Clear all forwarding configs (owner only - for cleanup)
const clearAllGroupForwardings = () => {
  saveGroupForwardingConfigs({});
  return true;
};

// Get forwarding statistics
const getForwardingStats = () => {
  const configs = loadGroupForwardingConfigs();
  const total = Object.keys(configs).length;
  const active = Object.values(configs).filter(c => c.enabled).length;
  const disabled = total - active;
  
  return {
    total,
    active,
    disabled,
    configs: Object.entries(configs).map(([source, config]) => ({
      source,
      target: config.targetGroupId,
      enabled: config.enabled,
      age: Date.now() - config.createdAt
    }))
  };
};

// Export all functions
module.exports = {
  // Existing exports
  getGroupSettings,
  updateGroupSettings,
  getUser,
  updateUser,
  getWarnings,
  addWarning,
  removeWarning,
  clearWarnings,
  getModerators,
  addModerator,
  removeModerator,
  isModerator,
  
  // New forwarding exports
  setGroupForwarding,
  getGroupForwarding,
  removeGroupForwarding,
  toggleGroupForwarding,
  getAllGroupForwardings,
  getAllGroupForwardingsIncludingDisabled,
  hasGroupForwarding,
  getForwardingTarget,
  updateForwardingTarget,
  clearAllGroupForwardings,
  getForwardingStats
};
