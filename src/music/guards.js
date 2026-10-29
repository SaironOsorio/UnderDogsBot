const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const manager = require('./manager');
const { errorEmbed } = require('./ui');

async function deny(interaction, text) {
    const payload = { embeds: [errorEmbed(text)], flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
    } else {
        await interaction.reply(payload);
    }
    return null;
}

function memberVoiceChannel(interaction) {
    return interaction.member?.voice?.channel ?? null;
}

async function requireJoinableVoice(interaction) {
    if (!interaction.inGuild()) return deny(interaction, 'Este comando solo funciona en servidores.');
    const channel = memberVoiceChannel(interaction);
    if (!channel) return deny(interaction, 'Debes estar en un canal de voz.');

    const me = interaction.guild.members.me;
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
        return deny(interaction, `No tengo permiso para conectarme o hablar en <#${channel.id}>.`);
    }

    const queue = manager.get(interaction.guildId);
    if (queue?.voiceChannelId && queue.voiceChannelId !== channel.id && queue.current) {
        return deny(interaction, `Ya estoy sonando en <#${queue.voiceChannelId}>. Únete allí o usa \`/stop\` primero.`);
    }

    return channel;
}

async function requireControl(interaction, { needsTrack = true } = {}) {
    if (!interaction.inGuild()) return deny(interaction, 'Este comando solo funciona en servidores.');
    const queue = manager.get(interaction.guildId);
    if (!queue) return deny(interaction, 'No estoy reproduciendo nada.');
    if (needsTrack && !queue.current) return deny(interaction, 'No hay ninguna canción sonando ahora.');

    const channel = memberVoiceChannel(interaction);
    if (!channel || channel.id !== queue.voiceChannelId) {
        return deny(interaction, `Debes estar en <#${queue.voiceChannelId}> para controlar la música.`);
    }

    return queue;
}

module.exports = {
    deny,
    requireJoinableVoice,
    requireControl,
};
