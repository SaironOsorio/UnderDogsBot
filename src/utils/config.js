const fs = require('fs');
const path = require('path');

const radiosPath = path.join(__dirname, '../config/radios.json');
const rawRadios = JSON.parse(fs.readFileSync(radiosPath, 'utf-8'));

function displayName(key) {
    return key.charAt(0).toUpperCase() + key.slice(1);
}

const RADIOS = Object.fromEntries(
    Object.entries(rawRadios).map(([key, value]) => {
        const entry = typeof value === 'string' ? { url: value } : value;
        return [key.toLowerCase(), { name: entry.name || displayName(key), url: entry.url, image: entry.image || null }];
    }),
);

const RADIO_CHOICES = Object.entries(RADIOS)
    .slice(0, 25)
    .map(([value, radio]) => ({ name: radio.name, value }));

module.exports = {
    RADIOS,
    RADIO_CHOICES,
};
