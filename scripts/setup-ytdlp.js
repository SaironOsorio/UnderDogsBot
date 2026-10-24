const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '../bin');
const BASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

function assetName() {
    if (process.platform === 'win32') return 'yt-dlp.exe';
    if (process.platform === 'darwin') return 'yt-dlp_macos';
    if (process.platform === 'linux') return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
    throw new Error(`Plataforma no soportada: ${process.platform}`);
}

async function main() {
    if (process.env.YTDLP_PATH) {
        console.log(`YTDLP_PATH ya está definido (${process.env.YTDLP_PATH}), no descargo nada.`);
        return;
    }

    const target = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    const url = `${BASE_URL}/${assetName()}`;
    fs.mkdirSync(BIN_DIR, { recursive: true });

    console.log(`Descargando ${url} ...`);
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Descarga fallida: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    const temp = `${target}.download`;
    fs.writeFileSync(temp, buffer);
    fs.chmodSync(temp, 0o755);
    fs.renameSync(temp, target);

    const version = execFileSync(target, ['--version']).toString().trim();
    console.log(`yt-dlp ${version} instalado en ${target}`);
}

main().catch((error) => {
    console.error('No pude instalar yt-dlp:', error.message);
    console.error('Puedes instalarlo a mano y definir YTDLP_PATH en el .env.');
    process.exit(process.env.npm_lifecycle_event === 'postinstall' ? 0 : 1);
});
