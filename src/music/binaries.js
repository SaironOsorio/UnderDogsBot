const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '../../bin');

function resolveFfmpeg() {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    try {
        const staticPath = require('ffmpeg-static');
        if (staticPath && fs.existsSync(staticPath)) return staticPath;
    } catch {}
    return 'ffmpeg';
}

function resolveYtDlp() {
    if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
    const local = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    if (fs.existsSync(local)) return local;
    return 'yt-dlp';
}

module.exports = {
    BIN_DIR,
    FFMPEG_PATH: resolveFfmpeg(),
    YTDLP_PATH: resolveYtDlp(),
};
