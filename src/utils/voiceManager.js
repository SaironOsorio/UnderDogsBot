const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');

// Usar ffmpeg-static si está disponible, sino usar ffmpeg del sistema
let ffmpegPath = 'ffmpeg';
try {
    ffmpegPath = require('ffmpeg-static');
    console.log('✅ Usando ffmpeg-static');
} catch {
    console.log('⚠️ ffmpeg-static no instalado, usando ffmpeg del sistema');
}

function getEnvInt(name, fallback) {
    const rawValue = process.env[name];
    if (!rawValue) return fallback;

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const FFMPEG_SAMPLE_RATE = getEnvInt('FFMPEG_SAMPLE_RATE', 48000);
const FFMPEG_CHANNELS = getEnvInt('FFMPEG_CHANNELS', 2);

const voiceConnections = new Map();

function killAudioProcess(audioProcess) {
    if (!audioProcess || audioProcess.killed) {
        return;
    }

    try {
        audioProcess.kill('SIGKILL');
    } catch (error) {
        console.warn('No se pudo finalizar proceso de audio:', error.message);
    }
}

/**
 * Obtiene la conexión de voz para un servidor
 */
function getVoiceConnection(guildId) {
    return voiceConnections.get(guildId);
}

/**
 * Guarda una conexión de voz
 */
function setVoiceConnection(guildId, connection) {
    voiceConnections.set(guildId, connection);
}

/**
 * Elimina una conexión de voz
 */
function deleteVoiceConnection(guildId) {
    voiceConnections.delete(guildId);
}

/**
 * Conecta el bot a un canal de voz
 */
async function connectToVoiceChannel(channel) {
    try {
        console.log(`🔌 Intentando conectar a canal: ${channel.name} (ID: ${channel.id})`);
        console.log(`🔌 Guild: ${channel.guild.name} (ID: ${channel.guild.id})`);
        
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false,
        });

        console.log('⏳ Esperando estado Ready...');
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        console.log('✅ Conexión establecida');
        return connection;
    } catch (error) {
        console.error('❌ Error conectando al canal de voz:', error);
        console.error('❌ Stack:', error.stack);
        return null;
    }
}

function createPlayerWithResource(connection, resource, guildId, options = {}) {
    const previousVoiceState = voiceConnections.get(guildId);

    if (previousVoiceState?.audioProcess && previousVoiceState.audioProcess !== options.audioProcess) {
        killAudioProcess(previousVoiceState.audioProcess);
    }

    if (previousVoiceState?.player) {
        try {
            previousVoiceState.player.stop(true);
        } catch (error) {
            console.warn('No se pudo detener el reproductor previo:', error.message);
        }
    }

    if (previousVoiceState?.connection && previousVoiceState.connection !== connection) {
        try {
            previousVoiceState.connection.destroy();
        } catch (error) {
            console.warn('No se pudo destruir la conexión previa:', error.message);
        }
    }

    const player = createAudioPlayer();

    player.play(resource);
    connection.subscribe(player);
    setVoiceConnection(guildId, { connection, player, audioProcess: options.audioProcess || null });

    player.on('error', (err) => {
        console.error('Error en reproductor de voz:', err.message);

        const voiceState = voiceConnections.get(guildId);
        if (voiceState?.audioProcess) {
            killAudioProcess(voiceState.audioProcess);
            voiceState.audioProcess = null;
        }
    });

    player.on('stateChange', (oldState, newState) => {
        console.log(`[${guildId}] Player state: ${oldState.status} -> ${newState.status}`);

        if (newState.status === AudioPlayerStatus.Idle) {
            const voiceState = voiceConnections.get(guildId);
            if (voiceState?.audioProcess) {
                killAudioProcess(voiceState.audioProcess);
                voiceState.audioProcess = null;
            }
        }
    });

    return true;
}

/**
 * Reproduce audio en un canal de voz (URL HTTP de radio)
 */
async function playAudio(connection, streamUrl, guildId, metadata = {}) {
    try {
        console.log(`🎵 Intentando reproducir stream: ${streamUrl.substring(0, 60)}...`);
        
        // Para URL HTTP, usar FFmpeg
        if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
            try {
                // Usar FFmpeg para decodificar el stream
                const ffmpeg = spawn(ffmpegPath, [
                    '-reconnect', '1',
                    '-reconnect_streamed', '1',
                    '-reconnect_delay_max', '5',
                    '-i', streamUrl,
                    '-af', 'equalizer=f=60:t=o:w=1.0:g=6,equalizer=f=120:t=o:w=1.0:g=4,equalizer=f=250:t=o:w=1.0:g=-1,equalizer=f=900:t=o:w=1.0:g=-2,equalizer=f=3500:t=o:w=1.2:g=2,equalizer=f=9000:t=o:w=1.2:g=-4,equalizer=f=15000:t=o:w=0.8:g=-6',
                    '-f', 's16le',
                    '-ar', String(FFMPEG_SAMPLE_RATE),
                    '-ac', String(FFMPEG_CHANNELS),
                    'pipe:1'
                ], { 
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 0 // Sin timeout
                });

                let ffmpegStarted = false;

                ffmpeg.stdout.on('data', () => {
                    if (!ffmpegStarted) {
                        ffmpegStarted = true;
                        console.log('✅ FFmpeg stream activo');
                    }
                });

                ffmpeg.stderr.on('data', (data) => {
                    const message = data.toString().trim();
                    const isProgressLine = /size=|time=|bitrate=|speed=/.test(message);
                    if (message && !message.includes('frame=') && !isProgressLine) {
                        console.log(`[FFmpeg] ${message}`);
                    }
                });

                ffmpeg.on('error', (err) => {
                    console.error('❌ Error en FFmpeg:', err.message);
                });

                ffmpeg.on('exit', (code) => {
                    if (code !== 0 && code !== null) {
                        console.error(`⚠️ FFmpeg salió con código ${code}`);
                    }
                });

                const resource = createAudioResource(ffmpeg.stdout, {
                    inputType: 'raw',
                    metadata: { title: metadata.title || 'Radio', ...metadata },
                });

                if (!resource) {
                    ffmpeg.kill();
                    return false;
                }

                return createPlayerWithResource(connection, resource, guildId, { audioProcess: ffmpeg });
                
            } catch (err) {
                console.error('❌ Error procesando HTTP stream:', err.message);
                return false;
            }
        }

        // Para archivos locales o streams ya procesados
        const resource = createAudioResource(streamUrl, {
            metadata: { title: metadata.title || 'Audio', ...metadata },
        });

        if (!resource) {
            return false;
        }

        return createPlayerWithResource(connection, resource, guildId);
    } catch (error) {
        console.error('Error reproduciendo audio:', error);
        return false;
    }
}

/**
 * Reproduce un stream en un canal de voz
 */
async function playStream(connection, audioStream, inputType, guildId, metadata = {}) {
    try {
        const resource = createAudioResource(audioStream, {
            inputType,
            metadata: { title: metadata.title || 'Audio', ...metadata },
        });

        if (!resource) {
            return false;
        }

        return createPlayerWithResource(connection, resource, guildId);
    } catch (error) {
        console.error('Error reproduciendo stream:', error);
        return false;
    }
}

/**
 * Detiene la reproducción en un servidor
 */
function stopPlayback(guildId) {
    const voiceState = voiceConnections.get(guildId);
    if (!voiceState) return false;

    try {
        if (voiceState.audioProcess) {
            killAudioProcess(voiceState.audioProcess);
            voiceState.audioProcess = null;
        }

        voiceState.player.stop(true);
        voiceState.connection.destroy();
        deleteVoiceConnection(guildId);
        return true;
    } catch (error) {
        console.error('Error deteniendo reproducción:', error);
        return false;
    }
}

/**
 * Pausa la reproducción
 */
function pausePlayback(guildId) {
    const voiceState = voiceConnections.get(guildId);
    if (!voiceState || !voiceState.player) return false;

    try {
        voiceState.player.pause();
        return true;
    } catch (error) {
        console.error('Error pausando:', error);
        return false;
    }
}

/**
 * Reanuda la reproducción
 */
function resumePlayback(guildId) {
    const voiceState = voiceConnections.get(guildId);
    if (!voiceState || !voiceState.player) return false;

    try {
        voiceState.player.unpause();
        return true;
    } catch (error) {
        console.error('Error reanudando:', error);
        return false;
    }
}

module.exports = {
    getVoiceConnection,
    setVoiceConnection,
    deleteVoiceConnection,
    connectToVoiceChannel,
    playAudio,
    playStream,
    stopPlayback,
    pausePlayback,
    resumePlayback,
};
