const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { YTDLP_PATH, FFMPEG_PATH } = require('../src/music/binaries');
const { cookieStatus } = require('../src/music/ytdlp');

function version(binary, args) {
    try {
        return execFileSync(binary, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n')[0].trim();
    } catch (error) {
        return `NO DISPONIBLE (${error.code || error.message})`;
    }
}

const commandsPath = path.join(__dirname, '../src/commands');
const names = [];
for (const file of fs.readdirSync(commandsPath).filter((name) => name.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    command.data.toJSON();
    names.push(command.data.name);
}

console.log(`Node:     ${process.version}`);
console.log(`yt-dlp:   ${version(YTDLP_PATH, ['--version'])} (${YTDLP_PATH})`);
console.log(`ffmpeg:   ${version(FFMPEG_PATH, ['-version'])}`);
const cookies = cookieStatus();
console.log(`Cookies:  ${cookies.ok ? 'OK, ' : 'ATENCIÓN, '}${cookies.text}`);
console.log(`Spotify:  ${process.env.SPOTIFY_CLIENT_ID ? 'API oficial' : 'embed público (sin credenciales)'}`);
console.log(`Comandos: ${names.join(', ')}`);
