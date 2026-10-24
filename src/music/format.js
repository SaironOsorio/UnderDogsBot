const { escapeMarkdown } = require('discord.js');

const SOURCES = {
    youtube: { label: 'YouTube', color: 0xff0033, emoji: '▶️' },
    soundcloud: { label: 'SoundCloud', color: 0xff5500, emoji: '☁️' },
    spotify: { label: 'Spotify', color: 0x1db954, emoji: '🟢' },
    radio: { label: 'Radio', color: 0x2b90d9, emoji: '📻' },
    direct: { label: 'Stream', color: 0x5865f2, emoji: '🔗' },
    web: { label: 'Web', color: 0x5865f2, emoji: '🔗' },
};

const LOOP_LABELS = {
    off: 'Desactivado',
    track: 'Canción',
    queue: 'Cola',
};

function sourceInfo(source) {
    return SOURCES[source] || SOURCES.web;
}

function formatDuration(ms) {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

function trackDuration(track) {
    if (track.isLive) return 'En vivo';
    return track.duration ? formatDuration(track.duration) : '--:--';
}

function truncate(text, max) {
    const value = String(text ?? '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function cleanTitle(text, max = 70) {
    return escapeMarkdown(truncate(text, max)).replace(/[[\]]/g, '');
}

function trackLink(track, max = 70) {
    const title = cleanTitle(track.title, max);
    const url = track.displayUrl || track.url;
    return url && /^https?:\/\//.test(url) ? `[${title}](${url})` : title;
}

function progressBar(elapsed, total, size = 16) {
    if (!total) return '';
    const ratio = Math.min(1, Math.max(0, elapsed / total));
    const position = Math.min(size - 1, Math.round(ratio * (size - 1)));
    return `${'▬'.repeat(position)}🔘${'▬'.repeat(size - 1 - position)}`;
}

function statusText(track) {
    return truncate(track.author && track.source !== 'radio' ? `${track.title} — ${track.author}` : track.title, 120);
}

module.exports = {
    LOOP_LABELS,
    sourceInfo,
    formatDuration,
    trackDuration,
    truncate,
    cleanTitle,
    trackLink,
    progressBar,
    statusText,
};
