const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'guild-settings.json');

let cache = null;
let saveTimer = null;
let dirty = false;

function load() {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch {
        cache = {};
    }
    return cache;
}

function flush() {
    if (!dirty) return;
    dirty = false;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(cache, null, 2));
        fs.renameSync(`${FILE}.tmp`, FILE);
    } catch (error) {
        console.warn('No pude guardar la configuración de servidores:', error.message);
    }
}

function get(guildId, key, fallback) {
    const value = load()[guildId]?.[key];
    return value === undefined ? fallback : value;
}

function set(guildId, key, value) {
    const data = load();
    data[guildId] = { ...data[guildId], [key]: value };
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
    saveTimer.unref?.();
}

process.on('exit', flush);

module.exports = { get, set };
