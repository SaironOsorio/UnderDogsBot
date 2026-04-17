const fs = require('fs');
const path = require('path');

// Cargar emisoras desde radios.json
const radiosPath = path.join(__dirname, '../config/radios.json');
const RADIOS = JSON.parse(fs.readFileSync(radiosPath, 'utf-8'));

// Generar opciones para slash command (máximo 25)
const RADIO_CHOICES = Object.keys(RADIOS).slice(0, 25).map((name) => ({ name, value: name }));

module.exports = {
    RADIOS,
    RADIO_CHOICES,
};
