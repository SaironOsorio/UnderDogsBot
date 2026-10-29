const { runJson, isYouTubeBlocked } = require('./ytdlp');
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

async function youtubeOEmbed(url) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return { title: data.title, author: data.author_name, thumbnail: data.thumbnail_url };
    } catch {
        return null;
    }
}

async function resolveBlockedYouTube(url) {
    if (isYouTubePlaylistUrl(url)) return null;
    const meta = await youtubeOEmbed(url);
    if (!meta?.title) return null;
    const fallback = soundCloudFallback({ ...meta, source: 'youtube', url });
    return fallback ? { tracks: [fallback], playlist: null } : null;
}

async function searchWithFallback(query, source) {
    if (source === 'youtube' && isYouTubeBlocked()) return search(query, 'soundcloud');
    try {
        return await search(query, source);
    } catch (error) {
        if (error.botCheck && source === 'youtube') return search(query, 'soundcloud');
        throw error;
    }
}

async function resolve(input, { source = 'youtube', requestedBy = null } = {}) {
    const query = input.trim();
    const type = detectSource(query);
    let result;

    if (type === 'spotify') {
        result = await resolveSpotify(query);
    } else if (type === 'youtube') {
        try {
            result = (isYouTubeBlocked() && await resolveBlockedYouTube(query)) || await resolveWithYtDlp(query, type);
        } catch (error) {
            const fallback = error.botCheck ? await resolveBlockedYouTube(query) : null;
            if (!fallback) throw error;
            result = fallback;
        }
    } else if (type === 'soundcloud') {
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
        const track = await searchWithFallback(query, source);
        result = { tracks: track ? [track] : [], playlist: null };
    }

    for (const track of result.tracks) {
        track.requestedBy = requestedBy;
    }
    return result;
}

const TITLE_NOISE_RE = /[([](?:[^)\]]*?(?:official|oficial|video|v[ií]deo|audio|lyrics?|letra|visualizer|visualiser|en vivo|live|hd|4k|remaster(?:ed)?|explicit)[^)\]]*)[)\]]/gi;

function cleanSearchTitle(title) {
    return String(title || '')
        .replace(TITLE_NOISE_RE, ' ')
        .replace(/\b(?:official|oficial)\s+(?:music\s+)?(?:video|audio)\b/gi, ' ')
        .replace(/\|.*$/, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fallbackQuery(track) {
    if (track.query) return track.query;
    const title = cleanSearchTitle(track.title);
    const author = String(track.author || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
    if (!author || author === 'Desconocido' || / [-–—] /.test(title) || title.toLowerCase().includes(author.toLowerCase())) return title;
    return `${author} - ${title}`;
}

function isYouTubeTrack(track) {
    return track.source === 'youtube' || (track.url && YOUTUBE_RE.test(track.url));
}

function soundCloudFallback(track) {
    if (track.fallbackFrom || track.isLive || (!isYouTubeTrack(track) && !track.query)) return null;
    const query = fallbackQuery(track);
    if (!query) return null;
    return {
        title: track.title,
        author: track.author,
        duration: track.duration,
        thumbnail: track.thumbnail,
        displayUrl: track.displayUrl && !YOUTUBE_RE.test(track.displayUrl) ? track.displayUrl : null,
        url: null,
        query,
        searchSource: 'soundcloud',
        source: 'soundcloud',
        fallbackFrom: 'youtube',
        requestedBy: track.requestedBy,
    };
}

async function ensurePlayable(track) {
    if (isYouTubeBlocked() && !track.fallbackFrom && !track.isLive && (isYouTubeTrack(track) || (!track.url && track.query))) {
        const fallback = soundCloudFallback(track);
        if (fallback) Object.assign(track, fallback);
    }

    if (!track.url && track.query) {
        const searchSource = track.searchSource || 'youtube';
        const found = await search(searchSource === 'youtube' ? `${track.query} audio` : track.query, searchSource);
        if (!found) {
            const where = searchSource === 'soundcloud' ? 'SoundCloud' : 'YouTube';
            throw new Error(`No encontré "${track.query}" en ${where}.`);
        }
        track.url = found.url;
        if (!track.displayUrl) track.displayUrl = found.url;
        if (searchSource === 'soundcloud') {
            track.source = 'soundcloud';
            track.duration = found.duration || track.duration;
            track.thumbnail = found.thumbnail || track.thumbnail;
            track.matchedTitle = found.title;
        } else {
            if (!track.duration) track.duration = found.duration;
            if (!track.thumbnail) track.thumbnail = found.thumbnail;
        }
    }

    if (track.needsInfo && track.url && track.source !== 'direct') {
        try {
            const info = await runJson(['--no-playlist', track.url], 30_000);
            Object.assign(track, trackFromInfo(info, track.source), { requestedBy: track.requestedBy });
        } catch (error) {
            if (error.botCheck) throw error;
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
    soundCloudFallback,
    cleanSearchTitle,
};
