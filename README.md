# UnderDogsBot

Bot de música para Discord con YouTube, SoundCloud, Spotify y radios en vivo.

## Instalación

```bash
npm install
cp .env.example .env
npm run check
npm start
```

`npm install` descarga yt-dlp en `bin/` automáticamente. Si falla, ejecuta `npm run setup` o instala yt-dlp a mano y pon su ruta en `YTDLP_PATH`. Conviene repetir `npm run setup` cada cierto tiempo, porque YouTube cambia seguido y yt-dlp se actualiza para seguirle el paso.

`npm run check` muestra si yt-dlp, ffmpeg y los comandos cargan bien.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `/play consulta [fuente] [siguiente]` | Busca o reproduce un enlace. Autocompleta mientras escribes. |
| `/radio nombre` | Pone una emisora en vivo. La cola queda guardada detrás. |
| `/emisoras` | Lista las emisoras de `src/config/radios.json`. |
| `/pause`, `/resume`, `/skip [cantidad]`, `/stop` | Controles básicos. |
| `/volume [nivel]` | Volumen de 0 a 150. |
| `/loop modo` | Repetir canción, cola o nada. |
| `/queue [pagina]`, `/nowplaying` | Ver la cola y el panel con botones. |
| `/shuffle`, `/remove`, `/move`, `/clear` | Manejo de la cola. |

Cada canción abre un panel con botones: pausar/reanudar, saltar, detener, repetir, mezclar, volumen y ver la cola. Solo quien está en el mismo canal de voz que el bot puede usarlos.

## Fuentes

- **YouTube y SoundCloud**: canciones, playlists y búsqueda por nombre, vía yt-dlp.
- **Spotify**: canciones, álbumes, playlists y artistas. Spotify no permite reproducir su audio, así que el bot lee los nombres y busca cada canción en YouTube justo antes de tocarla. Sin credenciales usa el reproductor público de Spotify (playlists de hasta ~100 canciones). Con `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` usa la API oficial.
- **Radios y streams**: cualquier URL de audio directa (`.mp3`, `.aac`, `.m3u8`…).

## Estado "Escuchando"

Mientras suena algo, la presencia del bot muestra "Escuchando *canción — artista*". Si el bot tiene el permiso **Establecer estado del canal de voz**, también pone la canción como estado del canal. Se desactiva con `VOICE_CHANNEL_STATUS=false`.

## Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | | Obligatorias |
| `DISCORD_GUILD_ID`, `COMMAND_SCOPE` | | `guild`, `global` o `both` |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | | Opcionales, API de Spotify |
| `YTDLP_PATH`, `FFMPEG_PATH` | `bin/yt-dlp`, ffmpeg-static | Rutas a los binarios |
| `YTDLP_COOKIES` | | Archivo de cookies si YouTube pide "confirmar que no eres un bot" |
| `YTDLP_JS_RUNTIME` | `node:<ruta de node>` | Runtime JS que yt-dlp usa para YouTube |
| `DEFAULT_VOLUME` | `80` | Volumen inicial |
| `MAX_PLAYLIST_SIZE` | `100` | Máximo de canciones por playlist |
| `RADIO_EQ` | `true` | Ecualizador para las radios |
| `AUTO_DISCONNECT_MS` | `90000` | Salir si el canal queda sin gente |
| `QUEUE_END_LEAVE_MS` | `180000` | Salir cuando se acaba la cola |
| `PANEL_REFRESH_MS` | `30000` | Cada cuánto se actualiza la barra de progreso (0 la apaga) |

## Emisoras

`src/config/radios.json` acepta el formato simple (`"nombre": "url"`) o con más datos:

```json
{
  "olimpica": { "name": "Olímpica Stereo", "url": "https://...", "image": "https://..." }
}
```
