const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { PRESETS, presetLabel } = require('./equalizer');
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

function botAvatar(queue) {
    return queue?.guild?.client?.user?.displayAvatarURL?.() ?? null;
}

function nowPlayingEmbed(queue) {
    const track = queue.current;
    if (!track) return idleEmbed('No hay nada reproduciéndose.');

    const info = sourceInfo(track.source);
    const isRadio = track.source === 'radio';
    const via = track.fallbackFrom ? ' (respaldo, YouTube bloqueado)' : '';
    const header = queue.isPaused ? 'En pausa' : isRadio ? 'Radio en vivo' : `Reproduciendo · ${info.label}${via}`;
    const elapsed = queue.elapsedMs;
    const timeline = track.isLive
        ? '🔴 **EN VIVO**'
        : `${progressBar(elapsed, track.duration)}\n\`${formatDuration(elapsed)} / ${trackDuration(track)}\``;

    const fields = [];
    if (!isRadio) fields.push({ name: '🎤 Artista', value: cleanTitle(track.author || 'Desconocido', 60), inline: true });
    if (queue.voiceChannelId) fields.push({ name: '🔊 Canal', value: `<#${queue.voiceChannelId}>`, inline: true });
    fields.push({ name: '👤 Pedido por', value: requesterText(track), inline: true });
    fields.push({ name: '🔈 Volumen', value: `${queue.volume}%`, inline: true });
    fields.push({ name: '🎛️ Sonido', value: presetLabel(queue.eq), inline: true });
    if (!track.isLive) fields.push({ name: '🔁 Repetir', value: LOOP_LABELS[queue.loop], inline: true });
    fields.push({ name: '📋 En cola', value: queueSummary(queue), inline: true });

    const avatar = botAvatar(queue);
    const embed = new EmbedBuilder()
        .setColor(queue.isPaused ? COLORS.idle : info.color)
        .setAuthor({ name: header, iconURL: avatar || undefined })
        .setDescription(`### ${trackLink(track, 80)}\n${timeline}`)
        .addFields(fields)
        .setTimestamp(track.startedAt || Date.now());

    const thumbnail = track.thumbnail || avatar;
    if (thumbnail) embed.setThumbnail(thumbnail);
    const next = queue.tracks[0];
    embed.setFooter({ text: next ? `Siguiente: ${next.title}`.slice(0, 200) : 'Usa los botones para controlar la reproducción' });
    return embed;
}

function queueSummary(queue) {
    if (!queue.tracks.length) return 'Vacía';
    const duration = queue.pendingDurationMs;
    return `${queue.tracks.length} · ${duration ? formatDuration(duration) : '--:--'}`;
}

function button(id, emoji, style, disabled, label) {
    const built = new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(style).setDisabled(disabled);
    return label ? built.setLabel(label) : built;
}

function controlRows(queue, disabled = false) {
    const paused = queue?.isPaused;
    const loop = queue?.loop || 'off';
    const live = Boolean(queue?.current?.isLive);
    const hasNext = Boolean(queue?.tracks?.length);

    const playback = [
        button('music:toggle', paused ? '▶️' : '⏸️', paused ? ButtonStyle.Success : ButtonStyle.Primary, disabled, paused ? 'Reanudar' : 'Pausar'),
    ];
    if (!live || hasNext) {
        playback.push(button('music:skip', '⏭️', ButtonStyle.Secondary, disabled, live ? 'Volver a la cola' : 'Saltar'));
    }
    playback.push(button('music:stop', '⏹️', ButtonStyle.Danger, disabled, 'Detener'));

    const extras = [];
    if (!live) {
        extras.push(
            button('music:loop', loop === 'track' ? '🔂' : '🔁', loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success, disabled, `Repetir: ${LOOP_LABELS[loop]}`),
            button('music:shuffle', '🔀', ButtonStyle.Secondary, disabled),
        );
    }
    extras.push(
        button('music:voldown', '🔉', ButtonStyle.Secondary, disabled),
        button('music:volup', '🔊', ButtonStyle.Secondary, disabled),
        button('music:queue', '📜', ButtonStyle.Secondary, disabled, 'Cola'),
    );

    return [
        new ActionRowBuilder().addComponents(playback),
        new ActionRowBuilder().addComponents(extras),
        eqRow(queue, disabled),
    ];
}

function eqRow(queue, disabled = false) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('music:eq')
        .setPlaceholder('Modo de sonido')
        .setDisabled(disabled)
        .addOptions(Object.entries(PRESETS).map(([value, preset]) => ({
            label: preset.label,
            value,
            description: preset.description.slice(0, 100),
            emoji: preset.emoji,
            default: queue?.eq === value,
        })));
    return new ActionRowBuilder().addComponents(menu);
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
