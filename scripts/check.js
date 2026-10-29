const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { YTDLP_PATH, FFMPEG_PATH } = require('../src/music/binaries');
const { cookieStatus, spawnYtDlp, lastErrorLine, AUDIO_FORMAT } = require('../src/music/ytdlp');

const TEST_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

function version(binary, args) {
    try {
        return execFileSync(binary, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n')[0].trim();
    } catch (error) {
        return `NO DISPONIBLE (${error.code || error.message})`;
    }
}

function runYtDlp(args, timeoutMs) {
    return new Promise((resolve) => {
        const proc = spawnYtDlp(args);
        let output = '';
        const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
        proc.stdout.on('data', (chunk) => { output += chunk; });
        proc.stderr.on('data', (chunk) => { output += chunk; });
        proc.on('error', (error) => { clearTimeout(timer); resolve({ code: -1, output: error.message }); });
        proc.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
    });
}

function line(output, re) {
    return output.split('\n').find((text) => re.test(text))?.replace(/^\[debug\]\s*/, '').trim();
}

async function main() {
    const commandsPath = path.join(__dirname, '../src/commands');
    const names = [];
    for (const file of fs.readdirSync(commandsPath).filter((name) => name.endsWith('.js'))) {
        const command = require(path.join(commandsPath, file));
        command.data.toJSON();
        names.push(command.data.name);
    }

    const cookies = cookieStatus();
    const debug = await runYtDlp(['-v', '--simulate'], 30_000);
    const found = line(debug.output, /JS runtimes:/);
    const runtimes = found || 'no se pudo leer (¿yt-dlp instalado?)';
    const runtimeOk = Boolean(found) && !/JS runtimes:\s*none/i.test(found);

    console.log(`Node:     ${process.version}`);
    console.log(`yt-dlp:   ${version(YTDLP_PATH, ['--version'])} (${YTDLP_PATH})`);
    console.log(`JS:       ${runtimeOk ? 'OK, ' : 'ATENCIÓN, '}${runtimes}`);
    console.log(`ffmpeg:   ${version(FFMPEG_PATH, ['-version'])}`);
    console.log(`Cookies:  ${cookies.ok ? 'OK, ' : 'ATENCIÓN, '}${cookies.text}`);
    console.log(`Spotify:  ${process.env.SPOTIFY_CLIENT_ID ? 'API oficial' : 'embed público (sin credenciales)'}`);
    console.log(`Comandos: ${names.join(', ')}`);

    if (!runtimeOk) {
        console.log('\n⚠️  yt-dlp no tiene runtime de JavaScript: YouTube va a fallar con "Requested format is not available".');
        console.log('   Borra YTDLP_JS_RUNTIME del .env (o pon YTDLP_JS_RUNTIME=node:<ruta a node>) y corre "npm run setup".');
    }

    if (!process.argv.includes('--youtube')) {
        console.log('\nPrueba real contra YouTube: npm run check -- --youtube');
        return;
    }

    console.log(`\nProbando YouTube con ${TEST_VIDEO} ...`);
    const test = await runYtDlp(['-v', '--simulate', '--no-playlist', '-f', AUDIO_FORMAT, '--print', 'format_id', TEST_VIDEO], 90_000);
    const solver = line(test.output, /Solving JS challenges using|\[jsc/i);
    if (solver) console.log(`  ${solver}`);
    if (test.code === 0) {
        console.log(`  OK: YouTube entrega audio (formato ${test.output.trim().split('\n').pop()}).`);
    } else {
        console.log(`  FALLA: ${lastErrorLine(test.output)}`);
        const imagesOnly = /only images are available/i.test(test.output);
        if (imagesOnly) console.log('  YouTube solo entregó imágenes: el reto de JavaScript no se resolvió o la cuenta/IP está restringida.');
        console.log('  Copia todo lo de arriba si necesitas ayuda para revisarlo.');
        process.exitCode = 1;
    }
}

main();
