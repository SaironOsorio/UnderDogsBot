const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { Client, Collection, REST, Routes, GatewayIntentBits, MessageFlags } = require('discord.js');
const { checkRateLimit } = require('./utils/rateLimiter');
const manager = require('./music/manager');
const presence = require('./music/presence');
const { handleButton } = require('./music/buttons');
const { YTDLP_PATH, FFMPEG_PATH } = require('./music/binaries');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const COMMAND_SCOPE = (process.env.COMMAND_SCOPE || (GUILD_ID ? 'guild' : 'global')).toLowerCase();

if (!TOKEN) throw new Error('Token no configurado. Revisa el archivo .env');
if (!CLIENT_ID) throw new Error('CLIENT_ID no configurado. Agrega DISCORD_CLIENT_ID en el .env');

const HEAVY_COMMANDS = new Set(['play', 'radio']);
const RATE_LIMITS = {
    commandUser: { limit: 8, windowMs: 15_000 },
    commandGuild: { limit: 30, windowMs: 15_000 },
    heavyUser: { limit: 5, windowMs: 20_000 },
    heavyGuild: { limit: 12, windowMs: 20_000 },
    buttonUser: { limit: 10, windowMs: 10_000 },
};

const LOCK_PATH = path.join(__dirname, '../bot.pid');

function ensureSingleInstance() {
    try {
        if (fs.existsSync(LOCK_PATH)) {
            const pid = Number.parseInt(fs.readFileSync(LOCK_PATH, 'utf-8'), 10);
            if (!Number.isNaN(pid) && pid !== process.pid) {
                try {
                    process.kill(pid, 0);
                    console.error(`❌ Ya hay una instancia corriendo (PID ${pid}). Salgo.`);
                    process.exit(1);
                } catch {}
            }
        }
        fs.writeFileSync(LOCK_PATH, String(process.pid));
    } catch (error) {
        console.error('No pude crear el lock de instancia única:', error);
    }
}

function shutdown(code = 0) {
    try {
        manager.destroyAll();
    } catch {}
    try {
        fs.unlinkSync(LOCK_PATH);
    } catch {}
    process.exit(code);
}

ensureSingleInstance();
process.on('exit', () => { try { fs.unlinkSync(LOCK_PATH); } catch {} });
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('unhandledRejection', (reason) => console.error('❌ Promesa rechazada sin manejar:', reason));
process.on('uncaughtException', (error) => console.error('❌ Excepción no capturada:', error));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((name) => name.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (!command?.data || typeof command.execute !== 'function') {
        console.warn(`⚠️ ${file} no exporta data/execute, lo ignoro.`);
        continue;
    }
    client.commands.set(command.data.name, command);
}
console.log(`✅ Comandos cargados: ${[...client.commands.keys()].join(', ')}`);

async function registerSlashCommands() {
    const body = client.commands.map((command) => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const globalRoute = Routes.applicationCommands(CLIENT_ID);
    const guildRoute = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : null;

    if (COMMAND_SCOPE === 'guild' && guildRoute) {
        try {
            await rest.put(guildRoute, { body });
            console.log(`✅ Slash commands registrados en guild ${GUILD_ID}`);
            await rest.put(globalRoute, { body: [] });
            console.log('🧹 Slash commands globales limpiados para evitar duplicados.');
            return;
        } catch (error) {
            if (error?.status === 403 || error?.code === 50001) {
                console.warn('⚠️ Sin acceso para registrar comandos en el guild. Intento global...');
            } else {
                console.error('Error registrando slash commands (guild):', error);
            }
        }
    }

    if (COMMAND_SCOPE === 'guild' && !guildRoute) {
        console.warn('⚠️ COMMAND_SCOPE=guild pero no hay DISCORD_GUILD_ID. Uso registro global.');
    }

    try {
        await rest.put(globalRoute, { body });
        console.log('✅ Slash commands registrados (global).');
        if (COMMAND_SCOPE === 'both' && guildRoute) {
            await rest.put(guildRoute, { body });
            console.log(`✅ Slash commands también registrados en guild ${GUILD_ID}.`);
        }
    } catch (error) {
        console.error('Error registrando slash commands (global):', error);
    }
}

function humanListeners(interaction) {
    const queue = manager.get(interaction.guildId);
    const channel = queue?.voiceChannelId ? interaction.guild?.channels.cache.get(queue.voiceChannelId) : null;
    return channel?.members ? channel.members.filter((member) => !member.user.bot).size : 0;
}

function scalePolicy(policy, listeners) {
    if (listeners >= 8) return { limit: Math.ceil(policy.limit * 2.2), windowMs: policy.windowMs };
    if (listeners >= 4) return { limit: Math.ceil(policy.limit * 1.6), windowMs: policy.windowMs };
    return policy;
}

async function replyEphemeral(interaction, content) {
    const payload = { content, flags: MessageFlags.Ephemeral };
    try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
    } catch (error) {
        console.error('No pude responder a la interacción:', error.message);
    }
}

function rateLimitMessage(retryAfterMs) {
    return `⏳ Demasiadas solicitudes. Espera ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s e inténtalo de nuevo.`;
}

function isLimited(interaction) {
    const guildKey = interaction.guildId || 'dm';
    const userId = interaction.user.id;
    const heavy = HEAVY_COMMANDS.has(interaction.commandName);
    const listeners = humanListeners(interaction);
    const userPolicy = scalePolicy(heavy ? RATE_LIMITS.heavyUser : RATE_LIMITS.commandUser, listeners);
    const guildPolicy = scalePolicy(heavy ? RATE_LIMITS.heavyGuild : RATE_LIMITS.commandGuild, listeners);

    const userCheck = checkRateLimit(`cmd:user:${interaction.commandName}:${guildKey}:${userId}`, userPolicy.limit, userPolicy.windowMs);
    if (userCheck.limited) return userCheck.retryAfterMs;
    const guildCheck = checkRateLimit(`cmd:guild:${interaction.commandName}:${guildKey}`, guildPolicy.limit, guildPolicy.windowMs);
    if (guildCheck.limited) return guildCheck.retryAfterMs;
    return 0;
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command?.autocomplete) return;
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            if (error?.code !== 10062) console.warn('Error en autocompletado:', error.message);
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        const retryAfter = isLimited(interaction);
        if (retryAfter) return replyEphemeral(interaction, rateLimitMessage(retryAfter));

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error ejecutando /${interaction.commandName}:`, error);
            await replyEphemeral(interaction, '❌ Hubo un error ejecutando ese comando.');
        }
        return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        if (!interaction.customId.startsWith('music:') && !interaction.customId.startsWith('queue:')) return;

        const check = checkRateLimit(
            `btn:${interaction.guildId || 'dm'}:${interaction.user.id}`,
            RATE_LIMITS.buttonUser.limit,
            RATE_LIMITS.buttonUser.windowMs,
        );
        if (check.limited) return replyEphemeral(interaction, rateLimitMessage(check.retryAfterMs));

        try {
            await handleButton(interaction);
        } catch (error) {
            console.error('Error manejando botón:', error);
            await replyEphemeral(interaction, '❌ Error al procesar el botón.');
        }
    }
});

client.on('voiceStateUpdate', (oldState, newState) => manager.handleVoiceStateUpdate(oldState, newState));
client.on('error', (error) => console.error('❌ Error del cliente Discord:', error));
client.on('warn', (warning) => console.warn('⚠️ Advertencia del cliente Discord:', warning));

client.once('clientReady', () => {
    console.log(`✅ Bot conectado como: ${client.user.tag}`);
    presence.init(client);
});

async function initializeLibsodium() {
    try {
        const sodium = require('libsodium-wrappers');
        await sodium.ready;
        console.log('✅ Libsodium listo');
    } catch (error) {
        console.error('❌ Error inicializando libsodium:', error.message);
    }
}

async function startBot() {
    console.log(`🎵 yt-dlp: ${YTDLP_PATH}`);
    console.log(`🎵 ffmpeg: ${FFMPEG_PATH}`);
    await initializeLibsodium();
    await registerSlashCommands();
    await client.login(TOKEN);
}

startBot().catch((error) => {
    console.error('❌ Error fatal iniciando bot:', error);
    process.exit(1);
});
