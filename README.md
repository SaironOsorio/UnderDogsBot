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
| `/eq [modo]` | Modo de sonido: Carro, Camión (ETS/ATS), Picó o Plano. |
| `/loop modo` | Repetir canción, cola o nada. |
| `/queue [pagina]`, `/nowplaying` | Ver la cola y el panel con botones. |
| `/shuffle`, `/remove`, `/move`, `/clear` | Manejo de la cola. |

Cada canción abre un panel con botones (pausar/reanudar, saltar, detener, repetir, mezclar, volumen, ver la cola) y un menú para el modo de sonido. Solo quien está en el mismo canal de voz que el bot puede usarlos.

## Fuentes

- **YouTube y SoundCloud**: canciones, playlists y búsqueda por nombre, vía yt-dlp.
- **Spotify**: canciones, álbumes, playlists y artistas. Spotify no permite reproducir su audio, así que el bot lee los nombres y busca cada canción en YouTube justo antes de tocarla. Sin credenciales usa el reproductor público de Spotify (playlists de hasta ~100 canciones). Con `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` usa la API oficial para canciones y álbumes (álbumes completos, más datos). Las playlists y artistas siempre van por el reproductor público, porque desde 2026 la API en modo desarrollo no deja leer playlists ajenas ni el top de un artista. La cuenta dueña de la app de Spotify necesita Premium.
- **Radios y streams**: cualquier URL de audio directa (`.mp3`, `.aac`, `.m3u8`…).

## Modos de sonido

Todo lo que suena pasa por un ecualizador. Por defecto es **Carro**, para que se escuche como el radio de un carro. Se cambia con `/eq` o con el menú del panel, se aplica al instante sin reiniciar la canción y queda guardado por servidor en `data/guild-settings.json`.

| Modo | Sonido |
| --- | --- |
| Carro | Bajos con cuerpo, medios suaves, agudos sin chillar |
| Camión (ETS/ATS) | Radio dentro de la cabina de un tráiler: agudos apagados, cabina que retumba, eco corto y estéreo angosto |
| Picó | Bajo pesado y brillo arriba |
| Plano | Sin ecualización |

Los presets están en `src/music/equalizer.js`; agregar uno nuevo es sumar una entrada con sus filtros de ffmpeg.

## YouTube bloquea al bot ("Sign in to confirm you're not a bot")

YouTube pide esa verificación sobre todo cuando el bot corre en un hosting o VPS. La solución es darle a yt-dlp las cookies de una cuenta de YouTube.

1. Usa una cuenta de Google secundaria, no la principal: YouTube puede limitar o suspender cuentas que usa un bot.
2. Abre una ventana privada / de incógnito e inicia sesión en YouTube con esa cuenta.
3. En esa misma pestaña ve a `https://www.youtube.com/robots.txt`.
4. Exporta las cookies de `youtube.com` con la extensión **Get cookies.txt LOCALLY** (Chrome) o **cookies.txt** (Firefox). No uses "Get cookies.txt" sin "LOCALLY": está reportada como malware.
5. Cierra la ventana privada sin cerrar sesión. Si vuelves a abrir esa sesión en el navegador, YouTube rota las cookies y las exportadas dejan de servir.
6. Sube el archivo al servidor, por ejemplo como `cookies/youtube.txt`, y en el `.env` pon `YTDLP_COOKIES=cookies/youtube.txt`.
7. Corre `npm run check`: la línea `Cookies:` debe decir `OK`.

Si el bot corre en tu propio PC, en vez del archivo puedes usar `YTDLP_COOKIES_FROM_BROWSER=firefox` (con la sesión iniciada en Firefox). Con Chrome en Windows esto suele fallar; usa el archivo.

El archivo de cookies no se sube al repo (`cookies/` está en el `.gitignore`). El bot nunca lo modifica: cada descarga trabaja con una copia temporal.

Mientras YouTube esté bloqueando, el bot no se queda callado: busca la misma canción en SoundCloud y avisa en el chat. Durante 15 minutos (`YOUTUBE_BLOCK_COOLDOWN_MS`) va directo a SoundCloud para no hacer esperar a nadie. Las canciones que solo existen en YouTube no van a sonar hasta que pongas las cookies.

Si con cookies sigue fallando, actualiza yt-dlp con `npm run setup`. Como último recurso, el proveedor de PO tokens [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) puede ayudar; sus argumentos se pasan con `YTDLP_EXTRA_ARGS`.

## Estado "Escuchando"

Mientras suena algo, la presencia del bot muestra "Escuchando *canción — artista*". Si el bot tiene el permiso **Establecer estado del canal de voz**, también pone la canción como estado del canal. Se desactiva con `VOICE_CHANNEL_STATUS=false`.

## Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | | Obligatorias |
| `DISCORD_GUILD_ID`, `COMMAND_SCOPE` | | `guild`, `global` o `both` |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | | Opcionales, API de Spotify |
| `YTDLP_PATH`, `FFMPEG_PATH` | `bin/yt-dlp`, ffmpeg-static | Rutas a los binarios |
| `YTDLP_COOKIES` | | Archivo cookies.txt de YouTube (ruta absoluta o relativa al proyecto) |
| `YTDLP_COOKIES_FROM_BROWSER` | | Leer cookies del navegador (`firefox`), solo si el bot corre en tu PC |
| `YTDLP_EXTRA_ARGS` | | Argumentos extra para yt-dlp |
| `YOUTUBE_BLOCK_COOLDOWN_MS` | `900000` | Cuánto tiempo usar SoundCloud tras un bloqueo de YouTube |
| `YTDLP_JS_RUNTIME` | `node:<ruta de node>` | Runtime JS que yt-dlp usa para YouTube |
| `DEFAULT_VOLUME` | `80` | Volumen inicial |
| `MAX_PLAYLIST_SIZE` | `100` | Máximo de canciones por playlist |
| `EQ_PRESET` | `carro` | Modo de sonido por defecto: `carro`, `camion`, `pico` o `plano` |
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

## Créditos

- **Sairon Osorio**: creador del bot.
- **Miller Angel Ferrer Diaz**: colaborador (YouTube, SoundCloud, Spotify, cola y panel de controles, modos de sonido, estado "Escuchando").
