const { runJson } = require('./ytdlp');
const { isSpotify, resolveSpotify } = require('./spotify');

const MAX_PLAYLIST_SIZE = Number.parseInt(process.env.MAX_PLAYLIST_SIZE || '100', 10);
const YOUTUBE_RE = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i;
const SOUNDCLOUD_RE = /^(?:https?:\/\/)?(?:www\.|m\.|on\.)?soundcloud\.com\//i;
const URL_RE = /^https?:\/\//i;
const DIRECT_AUDIO_RE = /\.(mp3|aac|ogg|opus|flac|wav|m4a|m3u8|pls)(?:[?#]|$)/i;

function detectSource(input) {
    if (isSpotify(input)) return 'spotify';
    if (YOUTUBE_RE.test(input)) return 'youtube';
    if (SOUNDCLOUD_RE.test(input)) return 'soundcloud';
    if (URL_RE.test(input)) return DIRECT_AUDIO_RE.test(input) ? 'direct' : 'web';
    return 'search';
}

function isYouTubePlaylistUrl(input) {
    try {
        const url = new URL(input.startsWith('http') ? input : `https://${input}`);
        const list = url.searchParams.get('list');
        return Boolean(list) && url.pathname === '/playlist' && !list.startsWith('RD');
    } catch {
        return false;
    }
}

function titleFromUrl(url) {
    try {
        const slug = new URL(url).pathname.split('/').filter(Boolean).pop() || url;
        return decodeURIComponent(slug).replace(/[-_]+/g, ' ');
    } catch {
        return url;
    }
}

function pickThumbnail(info) {
    if (info.thumbnail) return info.thumbnail;
    const thumbnails = info.thumbnails || [];
    return thumbnails.length ? thumbnails[thumbnails.length - 1].url : null;
}

function entryUrl(entry, source) {
    if (entry.webpage_url) return entry.webpage_url;
    if (entry.url && URL_RE.test(entry.url)) return entry.url;
    if (source === 'youtube' && entry.id) return `https://www.youtube.com/watch?v=${entry.id}`;
    return entry.url || null;
}

function trackFromInfo(info, source) {
    const url = entryUrl(info, source);
    const isLive = info.is_live === true || info.live_status === 'is_live';
    return {
        title: info.title || info.track || titleFromUrl(url),
        author: info.artist || info.uploader || info.channel || info.creator || 'Desconocido',
        duration: !isLive && info.duration ? Math.round(info.duration * 1000) : 0,
        url,
        displayUrl: url,
        thumbnail: pickThumbnail(info),
        isLive,
        source,
        needsInfo: !info.title || (!info.duration && !isLive),
    };
}

function sourceFromExtractor(info, fallback) {
    const key = String(info.extractor_key || info.ie_key || '').toLowerCase();
    if (key.includes('youtube')) return 'youtube';
    if (key.includes('soundcloud')) return 'soundcloud';
    return fallback;
}

async function resolveWithYtDlp(url, source) {
    const playlistMode = source === 'soundcloud' ? /\/sets\/|\/albums|\/tracks$|\/likes$/i.test(url) : isYouTubePlaylistUrl(url);
    const args = playlistMode
        ? ['--flat-playlist', '--playlist-end', String(MAX_PLAYLIST_SIZE), url]
        : ['--no-playlist', url];
    const info = await runJson(args);

    if (info._type === 'playlist' && Array.isArray(info.entries)) {
        const tracks = info.entries
            .filter(Boolean)
            .filter((entry) => !['[Private video]', '[Deleted video]'].includes(entry.title))
            .map((entry) => trackFromInfo(entry, sourceFromExtractor(entry, source)))
            .filter((track) => track.url);
        return {
            tracks,
            playlist: {
                title: info.title || 'Playlist',
                url: info.webpage_url || url,
                thumbnail: pickThumbnail(info) || tracks[0]?.thumbnail || null,
            },
        };
    }

    return { tracks: [trackFromInfo(info, sourceFromExtractor(info, source))], playlist: null };
}

async function search(query, source = 'youtube') {
    const prefix = source === 'soundcloud' ? 'scsearch1:' : 'ytsearch1:';
    const args = source === 'soundcloud' ? [`${prefix}${query}`] : ['--flat-playlist', `${prefix}${query}`];
    const info = await runJson(args);
    const entry = info.entries?.find(Boolean);
    if (!entry) return null;
    return trackFromInfo(entry, source);
}

function directTrack(url) {
    return {
        title: titleFromUrl(url),
        author: 'Stream directo',
        duration: 0,
        url,
        displayUrl: url,
        thumbnail: null,
        isLive: true,
        source: 'direct',
    };
}

async function resolve(input, { source = 'youtube', requestedBy = null } = {}) {
    const query = input.trim();
    const type = detectSource(query);
    let result;

    if (type === 'spotify') {
        result = await resolveSpotify(query);
    } else if (type === 'youtube' || type === 'soundcloud') {
        result = await resolveWithYtDlp(query, type);
    } else if (type === 'direct') {
        result = { tracks: [directTrack(query)], playlist: null };
    } else if (type === 'web') {
        try {
            result = await resolveWithYtDlp(query, 'web');
        } catch {
            result = { tracks: [directTrack(query)], playlist: null };
        }
    } else {
        const track = await search(query, source);
        result = { tracks: track ? [track] : [], playlist: null };
    }

    for (const track of result.tracks) {
        track.requestedBy = requestedBy;
    }
    return result;
}

async function ensurePlayable(track) {
    if (!track.url && track.query) {
        const found = await search(`${track.query} audio`, 'youtube');
        if (!found) throw new Error(`No encontré "${track.query}" en YouTube.`);
        track.url = found.url;
        if (!track.duration) track.duration = found.duration;
        if (!track.thumbnail) track.thumbnail = found.thumbnail;
    }

    if (track.needsInfo && track.url && track.source !== 'direct') {
        try {
            const info = await runJson(['--no-playlist', track.url], 30_000);
            Object.assign(track, trackFromInfo(info, track.source), { requestedBy: track.requestedBy });
        } catch (error) {
            console.warn(`No pude completar la info de ${track.url}:`, error.message);
        }
        track.needsInfo = false;
    }

    if (!track.url) throw new Error('La pista no tiene una fuente reproducible.');
    return track;
}

module.exports = {
    detectSource,
    isYouTubePlaylistUrl,
    resolve,
    search,
    ensurePlayable,
};
