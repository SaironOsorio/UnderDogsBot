const { EventEmitter } = require('events');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    NoSubscriberBehavior,
    StreamType,
} = require('@discordjs/voice');
const { createPipeline } = require('./audio');
const { ensurePlayable } = require('./resolver');
const { PRESETS, DEFAULT_PRESET } = require('./equalizer');
const settings = require('../utils/settings');

const LOOP_MODES = ['off', 'track', 'queue'];
const MAX_VOLUME = 150;
const DEFAULT_VOLUME = Math.min(MAX_VOLUME, Math.max(0, Number.parseInt(process.env.DEFAULT_VOLUME || '80', 10) || 80));
const MIN_PLAY_MS = 1500;

class GuildQueue extends EventEmitter {
    constructor(guild) {
        super();
        this.guild = guild;
        this.guildId = guild.id;
        this.tracks = [];
        this.history = [];
        this.current = null;
        this.loop = 'off';
        this.volume = DEFAULT_VOLUME;
        this.eq = settings.get(guild.id, 'eq', DEFAULT_PRESET);
        if (!PRESETS[this.eq]) this.eq = DEFAULT_PRESET;
        this.eqPending = false;
        this.seekOffsetMs = 0;
        this.connection = null;
        this.resource = null;
        this.pipeline = null;
        this.textChannel = null;
        this.panelMessage = null;
        this.loading = false;
        this.skipRequested = false;
        this.destroyed = false;

        this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        this.player.on(AudioPlayerStatus.Idle, () => this.handleIdle());
        this.player.on('error', (error) => {
            if (this.current && !this.current.failed) this.current.failed = error.message;
        });
    }

    get voiceChannelId() {
        return this.connection?.joinConfig?.channelId ?? null;
    }

    get isPaused() {
        const status = this.player.state.status;
        return status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused;
    }

    get elapsedMs() {
        return this.resource ? this.seekOffsetMs + this.resource.playbackDuration : 0;
    }

    get pendingDurationMs() {
        return this.tracks.reduce((total, track) => total + (track.isLive ? 0 : track.duration || 0), 0);
    }

    async connect(channel) {
        const alive = this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed;
        if (alive && this.voiceChannelId === channel.id) return;

        if (alive) {
            this.connection.rejoin({ channelId: channel.id, selfDeaf: true, selfMute: false });
            await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
            return;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false,
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                this.destroy('disconnected');
            }
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        } catch {
            connection.destroy();
            throw new Error('No pude conectarme al canal de voz.');
        }

        connection.subscribe(this.player);
        this.connection = connection;
    }

    add(tracks, { next = false } = {}) {
        if (next) this.tracks.unshift(...tracks);
        else this.tracks.push(...tracks);
        this.emit('queueUpdate');
    }

    async start() {
        if (this.current || this.loading || this.destroyed) return;
        await this.playNext();
    }

    async playNext() {
        this.loading = true;
        try {
            while (this.tracks.length && !this.destroyed) {
                const track = this.tracks.shift();
                try {
                    track.failed = null;
                    await ensurePlayable(track);
                    if (this.destroyed) return;

                    this.killPipeline();
                    this.current = track;
                    track.startedAt = Date.now();
                    this.playResource(track, 0);
                    this.emit('trackStart', track);
                    return;
                } catch (error) {
                    this.emit('trackError', track, error);
                }
            }
            if (!this.destroyed) this.emit('queueEnd');
        } finally {
            this.loading = false;
        }
    }

    playResource(track, seekMs) {
        const previous = this.pipeline;
        const pipeline = createPipeline(track, { eq: this.eq, seekMs });
        const resource = createAudioResource(pipeline.output, {
            inputType: StreamType.Raw,
            inlineVolume: true,
            metadata: track,
        });
        resource.volume.setVolume(this.volume / 100);

        this.pipeline = pipeline;
        this.resource = resource;
        this.seekOffsetMs = seekMs;
        this.eqPending = false;
        this.player.play(resource);
        if (previous && previous !== pipeline) previous.kill();
    }

    restartCurrent() {
        const track = this.current;
        if (!track) return false;
        const position = track.isLive ? 0 : this.elapsedMs;
        if (track.duration && position >= track.duration - 1500) return false;
        this.playResource(track, position);
        return true;
    }

    setEq(name) {
        if (!PRESETS[name]) return this.eq;
        const changed = name !== this.eq;
        this.eq = name;
        settings.set(this.guildId, 'eq', name);
        if (changed && this.current) {
            if (this.isPaused) this.eqPending = true;
            else this.restartCurrent();
        }
        this.emit('stateUpdate');
        return this.eq;
    }

    handleIdle() {
        const finished = this.current;
        const playedMs = this.resource?.playbackDuration ?? 0;
        this.seekOffsetMs = 0;
        this.killPipeline();
        this.resource = null;
        this.current = null;
        if (this.destroyed) return;

        if (finished) {
            const skipped = this.skipRequested;
            this.skipRequested = false;

            if (!skipped && playedMs < MIN_PLAY_MS && !finished.failed) {
                finished.failed = 'El audio terminó sin reproducirse.';
            }

            if (finished.failed && !skipped) {
                this.emit('trackError', finished, new Error(finished.failed));
            } else if (!finished.isLive) {
                if (this.loop === 'track' && !skipped) this.tracks.unshift(finished);
                else if (this.loop === 'queue') this.tracks.push(finished);
            }

            this.history.push(finished);
            if (this.history.length > 25) this.history.shift();
            this.emit('trackEnd', finished);
        }

        void this.playNext();
    }

    skip(count = 1) {
        if (!this.current) return false;
        if (count > 1) {
            const removed = this.tracks.splice(0, count - 1);
            if (this.loop === 'queue') this.tracks.push(...removed);
        }
        this.skipRequested = true;
        this.player.stop(true);
        return true;
    }

    pause() {
        if (!this.current || this.isPaused) return false;
        const paused = this.player.pause(true);
        if (paused) this.emit('stateUpdate');
        return paused;
    }

    resume() {
        if (!this.current || !this.isPaused) return false;
        if (this.eqPending) {
            this.restartCurrent();
            this.emit('stateUpdate');
            return true;
        }
        const resumed = this.player.unpause();
        if (resumed) this.emit('stateUpdate');
        return resumed;
    }

    togglePause() {
        return this.isPaused ? this.resume() : this.pause();
    }

    setVolume(volume) {
        this.volume = Math.min(MAX_VOLUME, Math.max(0, Math.round(volume)));
        this.resource?.volume?.setVolume(this.volume / 100);
        this.emit('stateUpdate');
        return this.volume;
    }

    setLoop(mode) {
        this.loop = LOOP_MODES.includes(mode) ? mode : 'off';
        this.emit('stateUpdate');
        return this.loop;
    }

    cycleLoop() {
        const index = LOOP_MODES.indexOf(this.loop);
        return this.setLoop(LOOP_MODES[(index + 1) % LOOP_MODES.length]);
    }

    shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
        this.emit('queueUpdate');
        return this.tracks.length;
    }

    remove(position) {
        if (position < 1 || position > this.tracks.length) return null;
        const [track] = this.tracks.splice(position - 1, 1);
        this.emit('queueUpdate');
        return track;
    }

    move(from, to) {
        if (from < 1 || from > this.tracks.length || to < 1 || to > this.tracks.length) return null;
        const [track] = this.tracks.splice(from - 1, 1);
        this.tracks.splice(to - 1, 0, track);
        this.emit('queueUpdate');
        return track;
    }

    clear() {
        const count = this.tracks.length;
        this.tracks = [];
        this.emit('queueUpdate');
        return count;
    }

    killPipeline() {
        if (this.pipeline) {
            this.pipeline.kill();
            this.pipeline = null;
        }
    }

    destroy(reason = 'stop') {
        if (this.destroyed) return;
        this.destroyed = true;
        this.tracks = [];
        this.killPipeline();
        try {
            this.player.stop(true);
        } catch {}
        try {
            if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                this.connection.destroy();
            }
        } catch {}
        this.current = null;
        this.emit('destroy', reason);
    }
}

module.exports = { GuildQueue, LOOP_MODES, MAX_VOLUME };
