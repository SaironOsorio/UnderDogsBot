const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const { RADIOS } = require('../utils/config');
const { connectToVoiceChannel, playAudio, playStream, getVoiceConnection, pausePlayback, resumePlayback, stopPlayback } = require('../utils/voiceManager');

function isSoundCloudUrl(url) {
    return /^https?:\/\/(?:on\.)?soundcloud\.com\//i.test(url);
}

const soundCloudQueues = new Map();

function getSoundCloudQueue(guildId) {
    if (!soundCloudQueues.has(guildId)) {
        soundCloudQueues.set(guildId, []);
    }

    return soundCloudQueues.get(guildId);
}

let soundCloudAuthPromise;
async function ensureSoundCloudAuthorization() {
    if (!soundCloudAuthPromise) {
        soundCloudAuthPromise = (async () => {
            let clientId = (process.env.SOUNDCLOUD_CLIENT_ID || '').trim();

            if (!clientId) {
                clientId = await play.getFreeClientID();
                console.log('✅ SoundCloud autorizado con client_id automático');
            } else {
                console.log('✅ SoundCloud autorizado con SOUNDCLOUD_CLIENT_ID');
            }

            await play.setToken({
                soundcloud: { client_id: clientId },
            });
        })();
    }

    return soundCloudAuthPromise;
}

async function playNextSoundCloudInQueue(guildId) {
    const queue = soundCloudQueues.get(guildId);
    if (!queue || queue.length === 0) {
        return;
    }

    const voiceState = getVoiceConnection(guildId);
    if (!voiceState?.connection) {
        soundCloudQueues.delete(guildId);
        return;
    }

    const nextUrl = queue.shift();

    try {
        await ensureSoundCloudAuthorization();
        const streamData = await play.stream(nextUrl);
        const success = await playStream(voiceState.connection, streamData.stream, streamData.type, guildId, {
            title: 'SoundCloud',
            url: nextUrl,
        });

        if (!success) {
            console.warn(`[${guildId}] No se pudo reproducir track en cola de SoundCloud.`);
            await playNextSoundCloudInQueue(guildId);
            return;
        }

        const updatedVoiceState = getVoiceConnection(guildId);
        updatedVoiceState?.player?.once(AudioPlayerStatus.Idle, () => {
            void playNextSoundCloudInQueue(guildId);
        });
    } catch (error) {
        console.error(`[${guildId}] Error reproduciendo track en cola de SoundCloud:`, error.message);
        await playNextSoundCloudInQueue(guildId);
    }
}

function createSoundCloudControlsRow(guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sc_pause_${guildId}`)
            .setLabel('⏸️ Pausar')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`sc_resume_${guildId}`)
            .setLabel('▶️ Reanudar')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`sc_skip_${guildId}`)
            .setLabel('⏭️ Siguiente')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`sc_stop_${guildId}`)
            .setLabel('⏹️ Detener')
            .setStyle(ButtonStyle.Danger),
    );
}

function createSoundCloudEmbed(title, queueLength = 0) {
    const embed = new EmbedBuilder()
        .setColor('#FF7700')
        .setTitle('🎧 Reproduciendo SoundCloud')
        .setDescription(`**${title}**`)
        .addFields({
            name: 'Cola',
            value: `${queueLength} pista(s) en espera`,
            inline: true,
        })
        .setTimestamp();

    return embed;
}

function createRadioEmbed(radioName) {
    return new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📻 Reproduciendo Emisora')
        .setDescription(`**${radioName}**`)
        .setFooter({ text: 'Emisora en vivo - Pausar, Reanudar, Detener disponibles' })
        .setTimestamp();
}

module.exports = {
    name: 'radio',
    description: 'Reproduce una emisora o URL de SoundCloud',
    options: [
        {
            name: 'nombre',
            description: 'Nombre de la emisora',
            type: 3, // STRING
            required: false,
            choices: Object.keys(RADIOS).slice(0, 25).map((name) => ({ name, value: name })),
        },
        {
            name: 'url',
            description: 'URL de SoundCloud',
            type: 3, // STRING
            required: false,
        },
    ],
    
    async execute(interaction) {
        // DEFER INMEDIATAMENTE para evitar timeout
        await interaction.deferReply();

        const emisoraRaw = interaction.options.getString('nombre');
        const soundCloudUrl = interaction.options.getString('url');
        const emisora = emisoraRaw ? emisoraRaw.toLowerCase() : null;

        if (!emisora && !soundCloudUrl) {
            return interaction.editReply({ 
                content: '❌ Debes indicar una emisora o una URL de SoundCloud.'
            });
        }

        if (soundCloudUrl && !isSoundCloudUrl(soundCloudUrl)) {
            return interaction.editReply({
                content: '❌ La URL no es de SoundCloud. Usa un enlace válido de soundcloud.com.'
            });
        }

        if (emisora && !RADIOS[emisora]) {
            return interaction.editReply({
                content: '❌ Esa emisora no existe. Usa /emisoras para ver las disponibles.'
            });
        }

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.editReply({ 
                content: '❌ Debes estar en un canal de voz para usar este comando.'
            });
        }

        const currentState = getVoiceConnection(interaction.guildId);
        const userChannelId = voiceChannel.id;
        const botChannelId = currentState?.connection?.joinConfig?.channelId;
        const playerStatus = currentState?.player?.state?.status;
        const isActivePlayback = Boolean(playerStatus && playerStatus !== AudioPlayerStatus.Idle);

        if (
            currentState &&
            currentState.player?.state?.status === AudioPlayerStatus.Playing &&
            botChannelId &&
            botChannelId !== userChannelId
        ) {
            console.log(`Bloqueado cambio desde otro canal. Guild ${interaction.guildId} bot=${botChannelId} user=${userChannelId}`);
            return interaction.editReply({ 
                content: '⚠️ Ya estoy reproduciendo en otro canal de voz. Usa /stop desde ese canal o únete allí.'
            });
        }

        // Si es URL de SoundCloud y ya se está reproduciendo en este canal, encolar en vez de cortar.
        if (soundCloudUrl && isActivePlayback) {
            const queue = getSoundCloudQueue(interaction.guildId);
            queue.push(soundCloudUrl);
            const queueEmbed = createSoundCloudEmbed('🔜 Próxima en la cola', queue.length);
            const controlsRow = createSoundCloudControlsRow(interaction.guildId);

            return interaction.editReply({
                embeds: [queueEmbed],
                components: [controlsRow],
            });
        }

        // Si está sonando y pidieron emisora, detener para cambiar.
        if (!soundCloudUrl && isActivePlayback) {
            currentState.player.stop();
            soundCloudQueues.delete(interaction.guildId);
        }

        try {
            const connection = await connectToVoiceChannel(voiceChannel);
            if (!connection) {
                return interaction.editReply('❌ No pude conectarme al canal de voz.');
            }

            let success = false;
            let title = '';

            if (soundCloudUrl) {
                await ensureSoundCloudAuthorization();
                const streamData = await play.stream(soundCloudUrl);
                success = await playStream(connection, streamData.stream, streamData.type, interaction.guildId, {
                    title: 'SoundCloud',
                    url: soundCloudUrl,
                });
                title = '🎧 SoundCloud';

                if (success) {
                    const voiceState = getVoiceConnection(interaction.guildId);
                    voiceState?.player?.once(AudioPlayerStatus.Idle, () => {
                        void playNextSoundCloudInQueue(interaction.guildId);
                    });
                    const embed = createSoundCloudEmbed(title);
                    const controlsRow = createSoundCloudControlsRow(interaction.guildId);
                    interaction.editReply({
                        embeds: [embed],
                        components: [controlsRow],
                    });
                    return;
                }
            } else {
                const streamUrl = RADIOS[emisora];
                success = await playAudio(connection, streamUrl, interaction.guildId, {
                    title: `Emisora: ${emisora}`,
                });
                title = `📻 ${emisora.toUpperCase()}`;
                if (success) {
                    const embed = createRadioEmbed(title);
                    interaction.editReply({
                        embeds: [embed],
                    });
                    return;
                }
            }

            interaction.editReply('❌ No pude reproducir el audio. Revisa la emisora o URL e intenta de nuevo.');
        } catch (error) {
            console.error('Error en comando /radio:', error);
            interaction.editReply('❌ Ocurrió un error al intentar reproducir.');
        }
    },
};
