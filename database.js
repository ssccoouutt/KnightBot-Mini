/**
 * JSON-based Database with Google Drive Sync
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const driveStorage = require('./utils/driveStorage');

const DB_PATH = path.join(__dirname, 'database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const MODS_DB = path.join(DB_PATH, 'mods.json');

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

// ==================== HELPER FUNCTIONS ====================
const isOwner = (sender) => {
  if (!sender) return false;
  const senderNumber = sender.split('@')[0];
  return config.ownerNumber.some(owner => {
    const ownerNumber = owner.includes('@') ? owner.split('@')[0] : owner;
    return ownerNumber === senderNumber;
  });
};

// ==================== GROUP SETTINGS ====================
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

// ==================== USER DATA ====================
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

// ==================== WARNINGS SYSTEM ====================
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

// ==================== MODERATORS SYSTEM ====================
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

// ==================== GROUP FORWARDING SYSTEM ====================

// Get forwarding configuration from Drive
const getGroupForwarding = async (sourceGroupId) => {
  return await driveStorage.getForwardingConfig(sourceGroupId);
};

// Set group forwarding configuration with filters
const setGroupForwarding = async (sourceGroupId, targetGroupId, enabled = true, forwarderJid = null, filters = null) => {
  const configData = {
    targetGroupId,
    enabled,
    forwarderJid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    filters: filters || {
      types: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'poll'],
      onlyWithCaption: false,
      onlyWithoutCaption: false,
      excludeMedia: false,
      excludeText: false
    }
  };
  
  const success = await driveStorage.saveForwardingConfig(sourceGroupId, configData);
  return success ? configData : null;
};

// Remove group forwarding configuration
const removeGroupForwarding = async (sourceGroupId) => {
  return await driveStorage.removeForwardingConfig(sourceGroupId);
};

// Toggle group forwarding
const toggleGroupForwarding = async (sourceGroupId, enabled) => {
  return await driveStorage.toggleForwardingConfig(sourceGroupId, enabled);
};

// Get all active group forwarding configs
const getAllGroupForwardings = async () => {
  const allForwardings = await driveStorage.getAllForwardings();
  return allForwardings.filter(f => f.enabled === true);
};

// Get all forwardings including disabled
const getAllGroupForwardingsIncludingDisabled = async () => {
  return await driveStorage.getAllForwardings();
};

// Check if a group has forwarding enabled
const hasGroupForwarding = async (sourceGroupId) => {
  const configData = await getGroupForwarding(sourceGroupId);
  return configData !== null && configData.enabled === true;
};

// Get target group for source group
const getForwardingTarget = async (sourceGroupId) => {
  const configData = await getGroupForwarding(sourceGroupId);
  return configData && configData.enabled ? configData.targetGroupId : null;
};

// Update forwarding filters
const updateForwardingFilters = async (sourceGroupId, filters) => {
  const configData = await getGroupForwarding(sourceGroupId);
  if (!configData) return false;
  
  configData.filters = { ...configData.filters, ...filters };
  configData.updatedAt = Date.now();
  
  return await driveStorage.saveForwardingConfig(sourceGroupId, configData);
};

// Get forwarding statistics
const getForwardingStats = async () => {
  const forwardings = await driveStorage.getAllForwardings();
  const total = forwardings.length;
  const active = forwardings.filter(f => f.enabled).length;
  const disabled = total - active;
  
  return {
    total,
    active,
    disabled,
    configs: forwardings.map(f => ({
      source: f.sourceGroupId,
      target: f.targetGroupId,
      enabled: f.enabled,
      age: Date.now() - (f.createdAt || Date.now()),
      filters: f.filters
    }))
  };
};

// Load all forwardings on startup
const loadForwardingsOnStart = async () => {
  console.log('\n📤 Loading forwarding configurations from Google Drive...');
  const forwardings = await driveStorage.loadAllForwardings();
  return forwardings;
};

// ==================== USER SUBSCRIPTION SYSTEM ====================

// Check if user is allowed to use bot in self mode
const isUserAllowed = async (userJid) => {
  return await driveStorage.isUserAllowed(userJid);
};

// Add user subscription
const addUserSubscription = async (userJid, subscribedBy) => {
  return await driveStorage.addUser(userJid, subscribedBy);
};

// Remove user subscription
const removeUserSubscription = async (userJid) => {
  return await driveStorage.removeUser(userJid);
};

// Get all subscribed users
const getAllSubscribedUsers = async () => {
  return await driveStorage.getAllUsers();
};

// Get subscribed user count
const getSubscribedUserCount = async () => {
  return await driveStorage.getUserCount();
};

// Check if user can use bot (considering self mode and subscription)
const canUseBot = async (senderJid) => {
  // If self mode is off, everyone can use
  if (!config.selfMode) return true;
  
  // Owner always can use
  if (isOwner(senderJid)) return true;
  
  // Check if user is subscribed
  return await isUserAllowed(senderJid);
};

// Load all users on startup
const loadUsersOnStart = async () => {
  console.log('\n👥 Loading allowed users from Google Drive...');
  const users = await driveStorage.loadAllUsers();
  return users;
};

// ==================== EXPORTS ====================
module.exports = {
  // Group settings
  getGroupSettings,
  updateGroupSettings,
  
  // User data
  getUser,
  updateUser,
  
  // Warnings
  getWarnings,
  addWarning,
  removeWarning,
  clearWarnings,
  
  // Moderators
  getModerators,
  addModerator,
  removeModerator,
  isModerator,
  
  // Forwarding
  getGroupForwarding,
  setGroupForwarding,
  removeGroupForwarding,
  toggleGroupForwarding,
  getAllGroupForwardings,
  getAllGroupForwardingsIncludingDisabled,
  hasGroupForwarding,
  getForwardingTarget,
  updateForwardingFilters,
  getForwardingStats,
  loadForwardingsOnStart,
  
  // User Subscription
  isUserAllowed,
  addUserSubscription,
  removeUserSubscription,
  getAllSubscribedUsers,
  getSubscribedUserCount,
  canUseBot,
  loadUsersOnStart,
  
  // Helper
  isOwner
};
