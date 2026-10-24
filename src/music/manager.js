const { GuildQueue } = require('./GuildQueue');
const presence = require('./presence');
const ui = require('./ui');
const { cleanTitle } = require('./format');

const AUTO_DISCONNECT_MS = Number.parseInt(process.env.AUTO_DISCONNECT_MS || '90000', 10);
const QUEUE_END_LEAVE_MS = Number.parseInt(process.env.QUEUE_END_LEAVE_MS || '180000', 10);
const PANEL_REFRESH_MS = Number.parseInt(process.env.PANEL_REFRESH_MS || '30000', 10);

const queues = new Map();
const timers = new Map();

function timerKey(guildId, kind) {
    return `${guildId}:${kind}`;
}

function clearTimer(guildId, kind) {
    const key = timerKey(guildId, kind);
    const timer = timers.get(key);
    if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
        timers.delete(key);
    }
}

function setTimer(guildId, kind, fn, ms, repeat = false) {
    clearTimer(guildId, kind);
    if (!ms || ms <= 0) return;
    const timer = repeat ? setInterval(fn, ms) : setTimeout(() => { timers.delete(timerKey(guildId, kind)); fn(); }, ms);
    timer.unref?.();
    timers.set(timerKey(guildId, kind), timer);
}

function clearAllTimers(guildId) {
    for (const kind of ['leave', 'alone', 'panel', 'panelEdit']) clearTimer(guildId, kind);
}

async function sendToText(queue, payload) {
    if (!queue.textChannel?.send) return null;
    try {
        return await queue.textChannel.send(payload);
    } catch (error) {
        console.warn(`[${queue.guildId}] No pude enviar mensaje al canal de texto:`, error.message);
        return null;
    }
}

async function retirePanel(queue, embed) {
    const message = queue.panelMessage;
    queue.panelMessage = null;
    if (!message) return;
    try {
        if (embed) await message.edit({ embeds: [embed], components: [] });
        else await message.delete();
    } catch {}
}

async function sendPanel(queue) {
    await retirePanel(queue);
    queue.panelMessage = await sendToText(queue, {
        embeds: [ui.nowPlayingEmbed(queue)],
        components: ui.controlRows(queue),
    });
}

async function refreshPanel(queue) {
    if (!queue.panelMessage || !queue.current) return;
    try {
        await queue.panelMessage.edit({
            embeds: [ui.nowPlayingEmbed(queue)],
            components: ui.controlRows(queue),
        });
    } catch {
        queue.panelMessage = null;
    }
}

function schedulePanelRefresh(queue) {
    setTimer(queue.guildId, 'panelEdit', () => void refreshPanel(queue), 1_000);
}

function attach(queue) {
    queue.on('trackStart', (track) => {
        clearTimer(queue.guildId, 'leave');
        presence.setTrack(queue, track);
        void sendPanel(queue);
        setTimer(queue.guildId, 'panel', () => {
            if (queue.current && !queue.isPaused && !queue.current.isLive) void refreshPanel(queue);
        }, PANEL_REFRESH_MS, true);
    });

    queue.on('trackError', (track, error) => {
        console.warn(`[${queue.guildId}] Error con "${track?.title}":`, error?.message);
        void sendToText(queue, {
            embeds: [ui.errorEmbed(`No pude reproducir **${cleanTitle(track?.title || 'la pista')}**: ${error?.message || 'error desconocido'}`)],
        });
    });

    queue.on('stateUpdate', () => {
        presence.setPaused(queue, queue.isPaused);
        schedulePanelRefresh(queue);
    });

    queue.on('queueUpdate', () => schedulePanelRefresh(queue));

    queue.on('queueEnd', () => {
        clearTimer(queue.guildId, 'panel');
        presence.clear(queue);
        void retirePanel(queue, ui.finishedEmbed('Se acabó la cola. Usa `/play` para seguir con la música.'));
        setTimer(queue.guildId, 'leave', () => {
            if (!queue.current && !queue.loading) queue.destroy('idle');
        }, QUEUE_END_LEAVE_MS);
    });

    queue.on('destroy', (reason) => {
        clearAllTimers(queue.guildId);
        presence.clear(queue);
        const text = {
            stop: 'Reproducción detenida.',
            idle: 'Me salí del canal por inactividad.',
            alone: 'Me salí porque no quedó nadie en el canal.',
            disconnected: 'Me desconectaron del canal de voz.',
        }[reason] || 'Reproducción finalizada.';
        void retirePanel(queue, ui.finishedEmbed(text));
        if (queues.get(queue.guildId) === queue) queues.delete(queue.guildId);
        queue.removeAllListeners();
    });
}

function get(guildId) {
    const queue = queues.get(guildId);
    return queue && !queue.destroyed ? queue : null;
}

function getOrCreate(guild) {
    let queue = get(guild.id);
    if (!queue) {
        queue = new GuildQueue(guild);
        attach(queue);
        queues.set(guild.id, queue);
    }
    return queue;
}

function humansInChannel(guild, channelId) {
    const channel = guild?.channels?.cache?.get(channelId);
    return channel?.members ? channel.members.filter((member) => !member.user.bot).size : 0;
}

function checkAlone(guild) {
    const queue = get(guild.id);
    if (!queue) return;
    const channelId = queue.voiceChannelId;
    if (!channelId) return;

    if (humansInChannel(guild, channelId) > 0) {
        clearTimer(guild.id, 'alone');
        return;
    }

    if (timers.has(timerKey(guild.id, 'alone'))) return;
    setTimer(guild.id, 'alone', () => {
        const current = get(guild.id);
        if (current && humansInChannel(guild, current.voiceChannelId) === 0) current.destroy('alone');
    }, AUTO_DISCONNECT_MS);
}

function handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const botId = guild.client.user?.id;

    if (newState.id === botId && oldState.channelId && !newState.channelId) {
        get(guild.id)?.destroy('disconnected');
        return;
    }

    checkAlone(guild);
}

function destroyAll() {
    for (const queue of queues.values()) queue.destroy('stop');
}

module.exports = {
    get,
    getOrCreate,
    refreshPanel,
    handleVoiceStateUpdate,
    destroyAll,
};
