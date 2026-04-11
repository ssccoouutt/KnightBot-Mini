// utils/autoReact.js
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config.js');
const SETTINGS_PATH = path.join(__dirname, '../database/autoreact_settings.json');

// Default emojis
const DEFAULT_EMOJIS = ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'];
const DEFAULT_COMMAND_EMOJI = '⏳';

function load() {
    try {
        // Clear require cache to get fresh config
        delete require.cache[require.resolve('../config.js')];
        const config = require('../config.js');
        
        return {
            enabled: config.autoReact || false,
            mode: config.autoReactMode || 'bot',
            inPrivate: config.autoReactInPrivate !== undefined ? config.autoReactInPrivate : true,
            inGroups: config.autoReactInGroups !== undefined ? config.autoReactInGroups : true,
            specificGroups: config.autoReactSpecificGroups || [],
            emojis: config.autoReactEmojis || DEFAULT_EMOJIS,
            commandEmoji: config.autoReactCommandEmoji || DEFAULT_COMMAND_EMOJI
        };
    } catch {
        return {
            enabled: false,
            mode: 'bot',
            inPrivate: true,
            inGroups: true,
            specificGroups: [],
            emojis: DEFAULT_EMOJIS,
            commandEmoji: DEFAULT_COMMAND_EMOJI
        };
    }
}

function save(data) {
    try {
        const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
        
        let updatedContent = configContent;
        
        // Update autoReact value
        updatedContent = updatedContent.replace(
            /autoReact:\s*(true|false)/,
            `autoReact: ${data.enabled}`
        );
        
        // Update or add autoReactMode
        if (configContent.includes('autoReactMode:')) {
            updatedContent = updatedContent.replace(
                /autoReactMode:\s*['"]\w+['"]/,
                `autoReactMode: '${data.mode}'`
            );
        } else {
            updatedContent = updatedContent.replace(
                /(autoReact:\s*(?:true|false),?)/,
                `$1\n    autoReactMode: '${data.mode}',`
            );
        }
        
        // Update autoReactInPrivate
        if (configContent.includes('autoReactInPrivate:')) {
            updatedContent = updatedContent.replace(
                /autoReactInPrivate:\s*(true|false)/,
                `autoReactInPrivate: ${data.inPrivate}`
            );
        } else {
            updatedContent = updatedContent.replace(
                /(autoReactMode:\s*['"]\w+['"],?)/,
                `$1\n    autoReactInPrivate: ${data.inPrivate},`
            );
        }
        
        // Update autoReactInGroups
        if (configContent.includes('autoReactInGroups:')) {
            updatedContent = updatedContent.replace(
                /autoReactInGroups:\s*(true|false)/,
                `autoReactInGroups: ${data.inGroups}`
            );
        } else {
            updatedContent = updatedContent.replace(
                /(autoReactInPrivate:\s*(?:true|false),?)/,
                `$1\n    autoReactInGroups: ${data.inGroups},`
            );
        }
        
        // Update autoReactSpecificGroups
        const groupsStr = JSON.stringify(data.specificGroups);
        if (configContent.includes('autoReactSpecificGroups:')) {
            updatedContent = updatedContent.replace(
                /autoReactSpecificGroups:\s*\[[^\]]*\]/,
                `autoReactSpecificGroups: ${groupsStr}`
            );
        } else {
            updatedContent = updatedContent.replace(
                /(autoReactInGroups:\s*(?:true|false),?)/,
                `$1\n    autoReactSpecificGroups: ${groupsStr},`
            );
        }
        
        // Update autoReactEmojis
        const emojisStr = JSON.stringify(data.emojis);
        if (configContent.includes('autoReactEmojis:')) {
            updatedContent = updatedContent.replace(
                /autoReactEmojis:\s*\[[^\]]*\]/,
                `autoReactEmojis: ${emojisStr}`
            );
        } else {
            updatedContent = updatedContent.replace(
                /(autoReactSpecificGroups:\s*\[[^\]]*\],?)/,
                `$1\n    autoReactEmojis: ${emojisStr},`
            );
        }
        
        // Update autoReactCommandEmoji
        if (configContent.includes('autoReactCommandEmoji:')) {
            updatedContent = updatedContent.replace(
                /autoReactCommandEmoji:\s*['"][^'"]*['"]/,
                `autoReactCommandEmoji: '${data.commandEmoji}'`
            );
        } else {
            updatedContent = updatedContent.replace(
                /(autoReactEmojis:\s*\[[^\]]*\],?)/,
                `$1\n    autoReactCommandEmoji: '${data.commandEmoji}',`
            );
        }
        
        fs.writeFileSync(CONFIG_PATH, updatedContent, 'utf8');
        
        // Clear cache so next require gets updated values
        delete require.cache[require.resolve('../config.js')];
        
        // Save settings to database for persistence
        saveSettingsToFile(data);
        
    } catch (err) {
        console.error('[autoReact] save error:', err);
    }
}

function saveSettingsToFile(data) {
    try {
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[autoReact] save to file error:', err);
    }
}

function loadSettingsFromFile() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }
    } catch (err) {
        console.error('[autoReact] load from file error:', err);
    }
    return null;
}

function shouldReact(jid, isGroup, settings) {
    if (!settings.enabled) return false;
    
    if (!isGroup && settings.inPrivate) {
        return true;
    }
    
    if (isGroup && settings.inGroups) {
        if (settings.specificGroups && settings.specificGroups.length > 0) {
            return settings.specificGroups.includes(jid);
        }
        return true;
    }
    
    return false;
}

module.exports = { 
    load, 
    save, 
    shouldReact,
    DEFAULT_EMOJIS,
    DEFAULT_COMMAND_EMOJI
};
