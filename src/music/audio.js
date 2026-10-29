const { spawn } = require('child_process');
const { FFMPEG_PATH } = require('./binaries');
const { spawnAudioStream, lastErrorLine, isYouTubeSystemFailure, markYouTubeBlocked } = require('./ytdlp');
const { presetFilter } = require('./equalizer');

const SAMPLE_RATE = Number.parseInt(process.env.FFMPEG_SAMPLE_RATE || '48000', 10);
const CHANNELS = Number.parseInt(process.env.FFMPEG_CHANNELS || '2', 10);

function safeKill(proc) {
    if (!proc || proc.exitCode !== null || proc.killed) return;
    try {
        proc.kill('SIGKILL');
    } catch {}
}

function createPipeline(track, { eq, seekMs = 0 } = {}) {
    const usesDirectInput = track.source === 'radio' || track.source === 'direct';
    const ffArgs = ['-hide_banner', '-loglevel', 'error'];
    let ytdlp = null;
    let ytdlpErrors = '';
    let killed = false;

    if (usesDirectInput) {
        ffArgs.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', track.url);
    } else {
        ytdlp = spawnAudioStream(track.url, { live: track.isLive });
        ffArgs.push('-i', 'pipe:0');
    }

    if (seekMs > 0 && !track.isLive) ffArgs.push('-ss', (seekMs / 1000).toFixed(2));
    const filter = presetFilter(eq);
    if (filter) ffArgs.push('-af', filter);
    ffArgs.push('-vn', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), 'pipe:1');

    const ffmpeg = spawn(FFMPEG_PATH, ffArgs, { stdio: [ytdlp ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let ffmpegErrors = '';
    const closed = (proc) => new Promise((resolve) => {
        if (!proc) return resolve();
        proc.once('close', resolve);
        proc.once('error', resolve);
    });
    const done = Promise.all([closed(ffmpeg), closed(ytdlp)]);

    ffmpeg.stderr.on('data', (chunk) => { ffmpegErrors = (ffmpegErrors + chunk).slice(-2000); });
    ffmpeg.on('error', (error) => {
        track.failed = error.code === 'ENOENT' ? 'ffmpeg no está instalado.' : error.message;
    });
    ffmpeg.on('close', (code) => {
        if (!killed && code && !track.failed) track.failed = lastErrorLine(ffmpegErrors) || `ffmpeg salió con código ${code}`;
    });

    if (ytdlp) {
        ytdlp.stdout.on('error', () => {});
        ffmpeg.stdin.on('error', () => {});
        ytdlp.stdout.pipe(ffmpeg.stdin);
        ytdlp.stderr.on('data', (chunk) => { ytdlpErrors = (ytdlpErrors + chunk).slice(-2000); });
        ytdlp.on('error', (error) => {
            track.failed = error.code === 'ENOENT' ? 'yt-dlp no está instalado. Ejecuta "npm run setup".' : error.message;
        });
        ytdlp.on('close', (code) => {
            if (killed || !code) return;
            const message = lastErrorLine(ytdlpErrors) || `yt-dlp salió con código ${code}`;
            track.failed = message;
            track.youtubeFailed = true;
            if (isYouTubeSystemFailure(message)) {
                track.botCheck = true;
                markYouTubeBlocked(message);
            }
        });
    }

    return {
        output: ffmpeg.stdout,
        done,
        kill() {
            killed = true;
            safeKill(ytdlp);
            safeKill(ffmpeg);
        },
    };
}

module.exports = { createPipeline };
