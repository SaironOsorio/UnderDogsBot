const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { FFMPEG_PATH, YTDLP_PATH } = require('./binaries');

const ROOT = path.join(__dirname, '../..');
const BOT_CHECK_RE = /not a bot|sign in to confirm|confirm your age|LOGIN_REQUIRED/i;
const BLOCK_COOLDOWN_MS = Number.parseInt(process.env.YOUTUBE_BLOCK_COOLDOWN_MS || '900000', 10);

let youtubeBlockedUntil = 0;
let cookieWarningShown = false;

function cookiesPath() {
    const value = (process.env.YTDLP_COOKIES || '').trim();
    if (!value) return null;
    return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function cookieStatus() {
    const file = cookiesPath();
    if (file) {
        if (!fs.existsSync(file)) return { ok: false, text: `YTDLP_COOKIES apunta a ${file}, pero ese archivo no existe` };
        const head = fs.readFileSync(file, 'utf-8').slice(0, 200);
        if (!/# (Netscape )?HTTP Cookie File/i.test(head)) return { ok: false, text: `${file} no tiene formato Netscape (debe empezar con "# Netscape HTTP Cookie File")` };
        if (!/youtube\.com/i.test(fs.readFileSync(file, 'utf-8'))) return { ok: false, text: `${file} no tiene cookies de youtube.com` };
        return { ok: true, text: `archivo ${file}` };
    }
    if (process.env.YTDLP_COOKIES_FROM_BROWSER) return { ok: true, text: `navegador ${process.env.YTDLP_COOKIES_FROM_BROWSER}` };
    return { ok: false, text: 'sin cookies' };
}

function prepareCookies() {
    const file = cookiesPath();
    if (file && fs.existsSync(file)) {
        const copy = path.join(os.tmpdir(), `udb-cookies-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
        fs.copyFileSync(file, copy);
        return { args: ['--cookies', copy], cleanup: () => fs.rm(copy, { force: true }, () => {}) };
    }
    if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
        return { args: ['--cookies-from-browser', process.env.YTDLP_COOKIES_FROM_BROWSER], cleanup: () => {} };
    }
    return { args: [], cleanup: () => {} };
}

function extraArgs() {
    const raw = (process.env.YTDLP_EXTRA_ARGS || '').trim();
    return raw ? raw.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, '')) : [];
}

function baseArgs() {
    const args = ['--no-warnings', '--no-progress', '--ignore-config'];
    const runtime = process.env.YTDLP_JS_RUNTIME ?? `node:${process.execPath}`;
    if (runtime) args.push('--js-runtimes', runtime);
    if (FFMPEG_PATH !== 'ffmpeg') args.push('--ffmpeg-location', FFMPEG_PATH);
    args.push(...extraArgs());
    return args;
}

function spawnYtDlp(args) {
    const cookies = prepareCookies();
    const proc = spawn(YTDLP_PATH, [...baseArgs(), ...cookies.args, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('close', cookies.cleanup);
    proc.on('error', cookies.cleanup);
    return proc;
}

function lastErrorLine(text) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const errorLine = [...lines].reverse().find((line) => line.startsWith('ERROR'));
    return (errorLine || lines.at(-1) || '').replace(/^ERROR:\s*/, '').slice(0, 300);
}

function isBotCheck(message) {
    return BOT_CHECK_RE.test(String(message || ''));
}

function markYouTubeBlocked() {
    youtubeBlockedUntil = Date.now() + BLOCK_COOLDOWN_MS;
    if (!cookieWarningShown) {
        cookieWarningShown = true;
        const status = cookieStatus();
        console.warn(`⚠️ YouTube está pidiendo verificación ("confirm you're not a bot"). Cookies: ${status.text}.`);
        console.warn('   Configura YTDLP_COOKIES con un cookies.txt de YouTube (ver README, sección "YouTube bloquea al bot").');
        console.warn(`   Mientras tanto uso SoundCloud como respaldo durante ${Math.round(BLOCK_COOLDOWN_MS / 60000)} min.`);
    }
}

function isYouTubeBlocked() {
    return Date.now() < youtubeBlockedUntil;
}

function friendlyError(message) {
    return isBotCheck(message)
        ? 'YouTube bloqueó la descarga ("confirma que no eres un bot"). El dueño del bot debe configurar las cookies de YouTube.'
        : message;
}

function runJson(args, timeoutMs = 45_000) {
    return new Promise((resolve, reject) => {
        const proc = spawnYtDlp(['-J', ...args]);
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
            if (code !== 0) {
                const message = lastErrorLine(stderr) || `yt-dlp salió con código ${code}`;
                if (isBotCheck(message)) markYouTubeBlocked();
                const error = new Error(friendlyError(message));
                error.botCheck = isBotCheck(message);
                return reject(error);
            }
            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(new Error('Respuesta inválida de yt-dlp.'));
            }
        });
    });
}

function spawnAudioStream(url, { live = false } = {}) {
    return spawnYtDlp([
        '--quiet',
        '--no-playlist',
        '-f', live ? 'bestaudio/best' : 'bestaudio[acodec=opus]/bestaudio/best',
        '--http-chunk-size', '10M',
        '-o', '-',
        url,
    ]);
}

module.exports = {
    runJson,
    spawnAudioStream,
    lastErrorLine,
    isBotCheck,
    markYouTubeBlocked,
    isYouTubeBlocked,
    friendlyError,
    cookieStatus,
};
