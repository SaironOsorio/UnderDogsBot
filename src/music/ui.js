const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    LOOP_LABELS,
    sourceInfo,
    formatDuration,
    trackDuration,
    cleanTitle,
    trackLink,
    progressBar,
} = require('./format');

const QUEUE_PAGE_SIZE = 10;
const COLORS = { ok: 0x57f287, error: 0xed4245, info: 0x5865f2, idle: 0x2b2d31 };

function requesterText(track) {
    return track.requestedBy ? `<@${track.requestedBy.id}>` : 'Desconocido';
}

function nowPlayingEmbed(queue) {
    const track = queue.current;
    if (!track) return idleEmbed('No hay nada reproduciéndose.');

    const info = sourceInfo(track.source);
    const header = queue.isPaused ? 'En pausa' : 'Reproduciendo ahora';
    const elapsed = queue.elapsedMs;
    const timeline = track.isLive
        ? '🔴 **EN VIVO**'
        : `${progressBar(elapsed, track.duration)}\n\`${formatDuration(elapsed)} / ${trackDuration(track)}\``;

    const embed = new EmbedBuilder()
        .setColor(queue.isPaused ? COLORS.idle : info.color)
        .setAuthor({ name: `${header} · ${info.label}` })
        .setDescription(`### ${trackLink(track, 80)}\n${timeline}`)
        .addFields(
            { name: 'Artista', value: cleanTitle(track.author || 'Desconocido', 60), inline: true },
            { name: 'Pedido por', value: requesterText(track), inline: true },
            { name: 'Volumen', value: `${queue.volume}%`, inline: true },
            { name: 'Repetir', value: LOOP_LABELS[queue.loop], inline: true },
            { name: 'En cola', value: queueSummary(queue), inline: true },
        );

    if (track.thumbnail) embed.setThumbnail(track.thumbnail);
    const next = queue.tracks[0];
    embed.setFooter({ text: next ? `Siguiente: ${next.title}`.slice(0, 200) : 'No hay más canciones en cola' });
    return embed;
}

function queueSummary(queue) {
    if (!queue.tracks.length) return 'Vacía';
    const duration = queue.pendingDurationMs;
    return `${queue.tracks.length} · ${duration ? formatDuration(duration) : '--:--'}`;
}

function controlRows(queue, disabled = false) {
    const paused = queue?.isPaused;
    const loop = queue?.loop || 'off';

    const playback = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music:toggle')
            .setEmoji(paused ? '▶️' : '⏸️')
            .setLabel(paused ? 'Reanudar' : 'Pausar')
            .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('music:skip')
            .setEmoji('⏭️')
            .setLabel('Saltar')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('music:stop')
            .setEmoji('⏹️')
            .setLabel('Detener')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );

    const extras = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music:loop')
            .setEmoji(loop === 'track' ? '🔂' : '🔁')
            .setLabel(`Repetir: ${LOOP_LABELS[loop]}`)
            .setStyle(loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('music:shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('music:voldown')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('music:volup')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('music:queue')
            .setEmoji('📜')
            .setLabel('Cola')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
    );

    return [playback, extras];
}

function queueEmbed(queue, page = 1) {
    const totalPages = Math.max(1, Math.ceil(queue.tracks.length / QUEUE_PAGE_SIZE));
    const current = Math.min(Math.max(1, page), totalPages);
    const start = (current - 1) * QUEUE_PAGE_SIZE;
    const lines = queue.tracks
        .slice(start, start + QUEUE_PAGE_SIZE)
        .map((track, index) => `\`${start + index + 1}.\` ${trackLink(track, 55)} · \`${trackDuration(track)}\``);

    const nowLine = queue.current
        ? `**Sonando:** ${trackLink(queue.current, 60)} · \`${trackDuration(queue.current)}\``
        : '**Sonando:** nada';

    const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('Cola de reproducción')
        .setDescription(`${nowLine}\n\n${lines.length ? lines.join('\n') : 'La cola está vacía. Usa `/play` para agregar canciones.'}`)
        .setFooter({
            text: `Página ${current}/${totalPages} · ${queue.tracks.length} canción(es) · ${formatDuration(queue.pendingDurationMs)} · Repetir: ${LOOP_LABELS[queue.loop]}`,
        });

    return { embed, page: current, totalPages };
}

function queuePageRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`queue:page:${page - 1}`)
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`queue:page:${page}`)
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`queue:page:${page + 1}`)
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
    );
}

function queueView(queue, page = 1) {
    const { embed, page: current, totalPages } = queueEmbed(queue, page);
    const components = totalPages > 1 ? [queuePageRow(current, totalPages)] : [];
    return { embeds: [embed], components };
}

function addedEmbed({ tracks, playlist }, { position, startedNow }) {
    const first = tracks[0];
    const info = sourceInfo(first.source);
    const embed = new EmbedBuilder().setColor(info.color);

    if (playlist && tracks.length > 1) {
        const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
        embed
            .setAuthor({ name: `Playlist añadida · ${info.label}` })
            .setDescription(`### ${trackLink({ title: playlist.title, displayUrl: playlist.url }, 80)}`)
            .addFields(
                { name: 'Canciones', value: String(tracks.length), inline: true },
                { name: 'Duración', value: total ? formatDuration(total) : '--:--', inline: true },
            );
        if (playlist.thumbnail) embed.setThumbnail(playlist.thumbnail);
        return embed;
    }

    embed
        .setAuthor({ name: `${startedNow ? 'Reproduciendo' : 'Añadida a la cola'} · ${info.label}` })
        .setDescription(`### ${trackLink(first, 80)}`)
        .addFields(
            { name: 'Artista', value: cleanTitle(first.author || 'Desconocido', 60), inline: true },
            { name: 'Duración', value: trackDuration(first), inline: true },
        );
    if (!startedNow) embed.addFields({ name: 'Posición', value: String(position), inline: true });
    if (first.thumbnail) embed.setThumbnail(first.thumbnail);
    return embed;
}

function finishedEmbed(text) {
    return new EmbedBuilder().setColor(COLORS.idle).setDescription(text);
}

function idleEmbed(text) {
    return new EmbedBuilder().setColor(COLORS.idle).setDescription(text);
}

function errorEmbed(text) {
    return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${text}`);
}

function successEmbed(text) {
    return new EmbedBuilder().setColor(COLORS.ok).setDescription(text);
}

module.exports = {
    nowPlayingEmbed,
    controlRows,
    queueView,
    addedEmbed,
    finishedEmbed,
    idleEmbed,
    errorEmbed,
    successEmbed,
};
