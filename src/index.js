const { Client, Collection, REST, Routes, ActivityType } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function loadVoiceManager() {
    const candidates = [
        path.join(__dirname, 'utils', 'voiceManager'),
        path.join(process.cwd(), 'src', 'utils', 'voiceManager'),
        path.join(process.cwd(), 'utils', 'voiceManager'),
    ];

    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (error) {
            if (error?.code !== 'MODULE_NOT_FOUND') {
                throw error;
            }
        }
    }

    throw new Error('No se pudo cargar voiceManager. Verifica el entrypoint del servidor (MAIN_FILE) y la carpeta src/.');
}

const { pausePlayback, resumePlayback, stopPlayback, getVoiceConnection } = loadVoiceManager();

// Inicializar tweetnacl para encriptación
try {
    const nacl = require('tweetnacl');
    console.log('✅ TweetNaCl inicializado correctamente');
} catch (err) {
    console.warn('Advertencia: TweetNaCl no disponible, usando cifrado por defecto');
}

// Inicializar libsodium de forma síncrona ANTES de crear el cliente
async function initializeLibsodium() {
    try {
        const sodium = require('libsodium-wrappers');
        await sodium.ready;
        console.log('✅ Libsodium inicializado correctamente (necesario para voice)');
        return true;
    } catch (err) {
        console.error('❌ Error inicializando libsodium:', err.message);
        return false;
    }
}

// ========== CONFIGURACIÓN INICIAL ==========
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
    throw new Error('Token no configurado. Revisa el archivo .env');
}

if (!CLIENT_ID) {
    throw new Error('CLIENT_ID no configurado. Agrega DISCORD_CLIENT_ID en el .env');
}

// Evitar doble instancia del bot
const LOCK_PATH = path.join(__dirname, '../bot.pid');
function ensureSingleInstance() {
    try {
        if (fs.existsSync(LOCK_PATH)) {
            const pid = parseInt(fs.readFileSync(LOCK_PATH, 'utf-8'), 10);
            if (!Number.isNaN(pid)) {
                try {
                    process.kill(pid, 0);
                    console.error(`❌ Ya hay una instancia corriendo (PID ${pid}). Salgo.`);
                    process.exit(1);
                } catch (_) {
                    // Proceso muerto, sobreescribir lock
                }
            }
        }
        fs.writeFileSync(LOCK_PATH, String(process.pid));
        process.on('exit', () => {
            try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
        });
        process.on('SIGINT', () => { try { fs.unlinkSync(LOCK_PATH); } catch (_) {} process.exit(0); });
        process.on('SIGTERM', () => { try { fs.unlinkSync(LOCK_PATH); } catch (_) {} process.exit(0); });
    } catch (err) {
        console.error('No pude crear el lock de instancia única:', err);
    }
}

ensureSingleInstance();

// ========== CONFIGURACIÓN DE DISCORD ==========
const client = new Client({
    intents: ['Guilds', 'GuildVoiceStates', 'DirectMessages']
});

client.commands = new Collection();

// Inicializar discord-player DESPUÉS de crear el cliente
const player = new Player(client);

// Cargar extractores por defecto
(async () => {
    try {
        await player.extractors.loadMulti(DefaultExtractors);
        console.log('✅ Extractores de discord-player cargados correctamente');
    } catch (error) {
        console.error('❌ Error cargando extractores:', error);
    }
})();

// Requerido por discord-player v7
player.events.on('error', (queue, error) => {
    console.error(`❌ Error en la cola (${queue?.guild?.id ?? 'sin guild'}):`, error.message);
});

player.events.on('playerError', (queue, error) => {
    console.error(`❌ Error del reproductor (${queue?.guild?.id ?? 'sin guild'}):`, error.message);
});

// Guardar referencia del player en el cliente para acceso desde comandos
client.player = player;

client.on('error', (error) => {
    console.error('❌ Error del cliente Discord:', error);
});

client.on('warn', (warning) => {
    console.warn('⚠️ Advertencia del cliente Discord:', warning);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promesa rechazada sin manejar:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada:', error);
});

// ========== CARGAR COMANDOS ==========
const commandsPath = path.join(__dirname, 'commands');
const allowedCommands = new Set(['radio', 'emisoras', 'help']);
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'))
    .filter(file => allowedCommands.has(path.basename(file, '.js')));

const commands = [];
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.name, command);
    commands.push(command);
    console.log(`✅ Comando cargado: ${command.name}`);
}

// ========== REGISTRAR SLASH COMMANDS ==========
async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const globalRoute = Routes.applicationCommands(CLIENT_ID);

    if (GUILD_ID) {
        const guildRoute = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);
        try {
            await rest.put(guildRoute, { body: commands });
            console.log(`✅ Slash commands registrados en guild ${GUILD_ID}`);
        } catch (err) {
            if (err?.status === 403 || err?.code === 50001) {
                console.warn('⚠️ Sin acceso para registrar comandos en el guild. Intento global...');
            } else {
                console.error('Error registrando slash commands (guild):', err);
            }
        }
    }

    // Mantener también el registro global sincronizado para evitar comandos desactualizados
    try {
        await rest.put(globalRoute, { body: commands });
        console.log('✅ Slash commands registrados (global). Propagación puede tardar hasta 1 hora.');
    } catch (err) {
        console.error('Error registrando slash commands (global):', err);
    }
}

registerSlashCommands().catch((err) => console.error('Error en registerSlashCommands:', err));

// ========== EVENTOS DEL BOT ==========
client.once('ready', () => {
    console.log(`✅ Bot conectado como: ${client.user.tag}`);
    const activities = [
        { name: 'Escuchando Olimpica Stereo', type: ActivityType.Listening },
        { name: 'Escuchando Tropicana', type: ActivityType.Listening },
        { name: 'Jhostin es Marica', type: ActivityType.Watching },
        { name: 'Monda pa su Jopo', type: ActivityType.Playing },
    ];

    const setRandomActivity = () => {
        const choice = activities[Math.floor(Math.random() * activities.length)];
        client.user.setPresence({
            activities: [{ name: choice.name, type: choice.type }],
            status: 'online'
        });
    };

    setRandomActivity();
    setInterval(setRandomActivity, 60_000);
    
    // Discord Player v7 crea las colas (nodes) bajo demanda
    console.log('✅ Player listo. Las colas se crearán al reproducir.');
});

// Manejar interacciones (slash commands y botones)
client.on('interactionCreate', async (interaction) => {
    // Manejar slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`Comando no encontrado: ${interaction.commandName}`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error ejecutando comando ${interaction.commandName}:`, error);
            const reply = { content: '❌ Hubo un error ejecutando ese comando.', flags: 64 };
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch (err) {
                console.error('Error respondiendo a interacción fallida:', err.message);
            }
        }
        return;
    }

    // Manejar botones de SoundCloud
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (!customId.startsWith('sc_')) {
            return;
        }

        await interaction.deferUpdate();
        const guildId = interaction.guildId;
        const voiceState = getVoiceConnection(guildId);

        if (!voiceState) {
            await interaction.followUp({ content: '❌ No hay reproducción activa.', flags: 64 });
            return;
        }

        const action = customId.split('_')[1];

        try {
            if (action === 'pause') {
                pausePlayback(guildId);
                await interaction.followUp({ content: '⏸️ Reproducción pausada.', flags: 64 });
            } else if (action === 'resume') {
                resumePlayback(guildId);
                await interaction.followUp({ content: '▶️ Reproducción reanudada.', flags: 64 });
            } else if (action === 'skip') {
                voiceState.player.stop();
                await interaction.followUp({ content: '⏭️ Saltando a la siguiente.', flags: 64 });
            } else if (action === 'stop') {
                stopPlayback(guildId);
                await interaction.followUp({ content: '⏹️ Reproducción detenida.', flags: 64 });
            }
        } catch (error) {
            console.error('Error manejando botón:', error);
            await interaction.followUp({ content: '❌ Error al procesar el botón.', flags: 64 });
        }
    }
});

// ========== INICIAR BOT ==========
async function startBot() {
    console.log('⏳ Inicializando libsodium para voice...');
    const libsodiumOk = await initializeLibsodium();
    
    if (!libsodiumOk) {
        console.error('❌ No se pudo inicializar libsodium. El voice podría no funcionar.');
    }
    
    // Dar tiempo a que libsodium se estabilice
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('📱 Conectando bot a Discord...');
    try {
        const loginResult = await client.login(TOKEN);
        console.log('✅ Login de Discord completado:', Boolean(loginResult));
    } catch (error) {
        console.error('❌ Error en client.login(TOKEN):', error);
        throw error;
    }
}

startBot().catch(err => {
    console.error('❌ Error fatal iniciando bot:', err);
    process.exit(1);
});
