const { ActivityType } = require('discord.js');
const { statusText, truncate } = require('./format');

const IDLE_ACTIVITIES = [
    { name: '/play para poner música', type: ActivityType.Listening },
    { name: 'Olímpica Stereo', type: ActivityType.Listening },
    { name: 'Tropicana', type: ActivityType.Listening },
    { name: 'tus pedidos · /help', type: ActivityType.Listening },
];
const VOICE_STATUS_ENABLED = (process.env.VOICE_CHANNEL_STATUS || 'true').toLowerCase() !== 'false';

let client = null;
let idleIndex = 0;
let voiceStatusWarned = false;
const active = new Map();

function init(discordClient) {
    client = discordClient;
    apply();
    setInterval(() => {
        if (!active.size) {
            idleIndex = (idleIndex + 1) % IDLE_ACTIVITIES.length;
            apply();
        }
    }, 60_000).unref();
}

function apply() {
    if (!client?.user) return;
    const latest = [...active.values()].sort((a, b) => b.at - a.at)[0];

    if (latest) {
        const prefix = latest.paused ? '⏸ ' : '';
        client.user.setPresence({
            status: 'online',
            activities: [{ name: truncate(`${prefix}${statusText(latest.track)}`, 128), type: ActivityType.Listening }],
        });
        return;
    }

    const idle = IDLE_ACTIVITIES[idleIndex];
    client.user.setPresence({ status: 'online', activities: [{ name: idle.name, type: idle.type }] });
}

async function setVoiceStatus(channelId, text) {
    if (!VOICE_STATUS_ENABLED || !client || !channelId) return;
    try {
        await client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: truncate(text, 500) } });
    } catch (error) {
        if (!voiceStatusWarned) {
            voiceStatusWarned = true;
            console.warn('No pude cambiar el estado del canal de voz (falta el permiso "Establecer estado del canal de voz"):', error.message);
        }
    }
}

function setTrack(queue, track) {
    active.set(queue.guildId, { track, at: Date.now(), paused: false });
    apply();
    void setVoiceStatus(queue.voiceChannelId, `🎶 ${statusText(track)}`);
}

function setPaused(queue, paused) {
    const entry = active.get(queue.guildId);
    if (!entry || entry.paused === paused) return;
    entry.paused = paused;
    apply();
}

function clear(queue, channelId = queue.voiceChannelId) {
    const had = active.delete(queue.guildId);
    if (had) apply();
    void setVoiceStatus(channelId, '');
}

module.exports = { init, setTrack, setPaused, clear };
