const { getDetails } = require('spotify-url-info')(fetch);

const SPOTIFY_RE = /^(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/i;
const SPOTIFY_URI_RE = /^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/i;
const SHORT_RE = /^(?:https?:\/\/)?spotify\.link\//i;
const MAX_TRACKS = Number.parseInt(process.env.MAX_PLAYLIST_SIZE || '100', 10);

function isSpotify(input) {
    return SPOTIFY_RE.test(input) || SPOTIFY_URI_RE.test(input) || SHORT_RE.test(input);
}

async function expandShortLink(url) {
    const response = await fetch(url.startsWith('http') ? url : `https://${url}`, { redirect: 'follow' });
    if (SPOTIFY_RE.test(response.url)) return response.url;
    const html = await response.text();
    const match = html.match(/https:\/\/open\.spotify\.com\/(?:track|album|playlist|artist)\/[A-Za-z0-9]+/);
    if (!match) throw new Error('No pude abrir ese enlace corto de Spotify.');
    return match[0];
}

async function parseSpotify(input) {
    let value = input.trim();
    if (SHORT_RE.test(value)) value = await expandShortLink(value);
    const match = value.match(SPOTIFY_RE) || value.match(SPOTIFY_URI_RE);
    if (!match) throw new Error('Enlace de Spotify no válido.');
    return { type: match[1].toLowerCase(), id: match[2] };
}

let tokenCache = { value: null, expiresAt: 0 };

function hasApiCredentials() {
    return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getToken() {
    if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
    const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`Spotify rechazó las credenciales (${response.status}).`);
    const data = await response.json();
    tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return tokenCache.value;
}

async function api(path) {
    const token = await getToken();
    const url = path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Spotify API ${response.status}`);
    return response.json();
}

function apiTrack(track, fallbackImage) {
    if (!track || track.is_local || !track.name) return null;
    const artists = (track.artists || []).map((artist) => artist.name).join(', ');
    return {
        title: track.name,
        author: artists || 'Desconocido',
        duration: track.duration_ms || 0,
        displayUrl: track.external_urls?.spotify,
        thumbnail: track.album?.images?.[0]?.url || fallbackImage || null,
        query: `${artists} - ${track.name}`,
        source: 'spotify',
    };
}

async function collectPages(firstPage, mapItem) {
    const items = [];
    let page = firstPage;
    while (page && items.length < MAX_TRACKS) {
        for (const item of page.items || []) {
            const track = mapItem(item);
            if (track) items.push(track);
            if (items.length >= MAX_TRACKS) break;
        }
        page = page.next && items.length < MAX_TRACKS ? await api(page.next) : null;
    }
    return items;
}

async function resolveWithApi({ type, id }) {
    if (type === 'track') {
        const track = await api(`/tracks/${id}`);
        return { tracks: [apiTrack(track)].filter(Boolean), playlist: null };
    }
    if (type === 'album') {
        const album = await api(`/albums/${id}`);
        const image = album.images?.[0]?.url;
        const tracks = await collectPages(album.tracks, (item) => apiTrack({ ...item, album }, image));
        return { tracks, playlist: { title: album.name, url: album.external_urls?.spotify, thumbnail: image } };
    }
    if (type === 'playlist') {
        const playlist = await api(`/playlists/${id}`);
        const image = playlist.images?.[0]?.url;
        const tracks = await collectPages(playlist.tracks, (item) => apiTrack(item.track, image));
        return { tracks, playlist: { title: playlist.name, url: playlist.external_urls?.spotify, thumbnail: image } };
    }
    const artist = await api(`/artists/${id}`);
    const top = await api(`/artists/${id}/top-tracks?market=${process.env.SPOTIFY_MARKET || 'CO'}`);
    const tracks = (top.tracks || []).map((track) => apiTrack(track)).filter(Boolean);
    return { tracks, playlist: { title: `Top de ${artist.name}`, url: artist.external_urls?.spotify, thumbnail: artist.images?.[0]?.url } };
}

async function resolveWithEmbed({ type, id }) {
    const url = `https://open.spotify.com/${type}/${id}`;
    const { preview, tracks } = await getDetails(url);
    const mapped = tracks.slice(0, MAX_TRACKS).filter((track) => track.name).map((track) => ({
        title: track.name,
        author: track.artist || preview.artist || 'Desconocido',
        duration: track.duration || 0,
        displayUrl: track.uri ? `https://open.spotify.com/track/${track.uri.split(':').pop()}` : url,
        thumbnail: preview.image || null,
        query: `${track.artist || ''} - ${track.name}`.trim(),
        source: 'spotify',
    }));
    const playlist = type === 'track' ? null : { title: preview.title, url, thumbnail: preview.image };
    return { tracks: mapped, playlist };
}

async function resolveSpotify(input) {
    const parsed = await parseSpotify(input);
    if (hasApiCredentials()) {
        try {
            return await resolveWithApi(parsed);
        } catch (error) {
            console.warn('Spotify API falló, uso el embed público:', error.message);
        }
    }
    return resolveWithEmbed(parsed);
}

module.exports = {
    isSpotify,
    parseSpotify,
    resolveSpotify,
};
