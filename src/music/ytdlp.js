const { spawn } = require('child_process');
const { FFMPEG_PATH, YTDLP_PATH } = require('./binaries');

function baseArgs() {
    const args = ['--no-warnings', '--no-progress', '--ignore-config'];
    const runtime = process.env.YTDLP_JS_RUNTIME ?? `node:${process.execPath}`;
    if (runtime) args.push('--js-runtimes', runtime);
    if (process.env.YTDLP_COOKIES) args.push('--cookies', process.env.YTDLP_COOKIES);
    if (FFMPEG_PATH !== 'ffmpeg') args.push('--ffmpeg-location', FFMPEG_PATH);
    return args;
}

function lastErrorLine(text) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const errorLine = [...lines].reverse().find((line) => line.startsWith('ERROR'));
    return (errorLine || lines.at(-1) || '').replace(/^ERROR:\s*/, '').slice(0, 300);
}

function runJson(extraArgs, timeoutMs = 45_000) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, [...baseArgs(), '-J', ...extraArgs], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('yt-dlp tardó demasiado en responder.'));
        }, timeoutMs);

        proc.stdout.on('data', (chunk) => { stdout += chunk; });
        proc.stderr.on('data', (chunk) => { stderr += chunk; });
        proc.on('error', (error) => {
            clearTimeout(timer);
            reject(error.code === 'ENOENT'
                ? new Error('yt-dlp no está instalado. Ejecuta "npm run setup" en el servidor.')
                : error);
        });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) return reject(new Error(lastErrorLine(stderr) || `yt-dlp salió con código ${code}`));
            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(new Error('Respuesta inválida de yt-dlp.'));
            }
        });
    });
}

function spawnAudioStream(url, { live = false } = {}) {
    const args = [
        ...baseArgs(),
        '--quiet',
        '--no-playlist',
        '-f', live ? 'bestaudio/best' : 'bestaudio[acodec=opus]/bestaudio/best',
        '--http-chunk-size', '10M',
        '-o', '-',
        url,
    ];
    return spawn(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

module.exports = {
    runJson,
    spawnAudioStream,
    lastErrorLine,
};
