const { MessageFlags } = require('discord.js');
const manager = require('./manager');
const ui = require('./ui');
const { LOOP_LABELS } = require('./format');
const { presetLabel } = require('./equalizer');
const { requireControl } = require('./guards');

const VOLUME_STEP = 10;

async function handleMusicButton(interaction) {
    const action = interaction.customId.split(':')[1];

    if (action === 'queue') {
        const queue = manager.get(interaction.guildId);
        if (!queue) {
            return interaction.reply({ embeds: [ui.errorEmbed('No estoy reproduciendo nada.')], flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ ...ui.queueView(queue, 1), flags: MessageFlags.Ephemeral });
    }

    const queue = await requireControl(interaction, { needsTrack: action !== 'stop' });
    if (!queue) {
        if (!manager.get(interaction.guildId) && interaction.message?.editable) {
            await interaction.message.edit({ components: [] }).catch(() => {});
        }
        return;
    }

    const user = `<@${interaction.user.id}>`;
    let notice = null;

    switch (action) {
        case 'toggle':
            queue.togglePause();
            break;
        case 'skip':
            if (queue.current.isLive && !queue.tracks.length) {
                return interaction.reply({ embeds: [ui.errorEmbed('No hay nada en cola después de la emisora.')], flags: MessageFlags.Ephemeral });
            }
            notice = `⏭️ ${user} saltó **${queue.current.title}**`;
            queue.skip();
            break;
        case 'stop':
            queue.panelMessage = null;
            await interaction.update({ embeds: [ui.finishedEmbed(`⏹️ ${user} detuvo la música.`)], components: [] });
            queue.destroy('stop');
            return;
        case 'eq':
            queue.setEq(interaction.values?.[0]);
            notice = `🎛️ ${user} cambió el sonido a **${presetLabel(queue.eq)}**`;
            break;
        case 'loop':
            if (queue.current.isLive) return interaction.deferUpdate();
            queue.cycleLoop();
            break;
        case 'shuffle':
            if (queue.tracks.length < 2) {
                return interaction.reply({ embeds: [ui.errorEmbed('Necesito al menos 2 canciones en cola para mezclar.')], flags: MessageFlags.Ephemeral });
            }
            queue.shuffle();
            notice = `🔀 ${user} mezcló la cola.`;
            break;
        case 'voldown':
            queue.setVolume(queue.volume - VOLUME_STEP);
            break;
        case 'volup':
            queue.setVolume(queue.volume + VOLUME_STEP);
            break;
        default:
            return;
    }

    if (action === 'skip') {
        await interaction.update({ components: ui.controlRows(queue, true) });
    } else {
        queue.panelMessage = interaction.message;
        await interaction.update({ embeds: [ui.nowPlayingEmbed(queue)], components: ui.controlRows(queue) });
    }

    if (action === 'loop') notice = `🔁 Repetir: **${LOOP_LABELS[queue.loop]}**`;
    if (notice) await interaction.followUp({ content: notice, allowedMentions: { parse: [] } }).catch(() => {});
}

async function handleQueueButton(interaction) {
    const page = Number.parseInt(interaction.customId.split(':')[2], 10) || 1;
    const queue = manager.get(interaction.guildId);
    if (!queue) {
        return interaction.update({ embeds: [ui.idleEmbed('No estoy reproduciendo nada.')], components: [] });
    }
    return interaction.update(ui.queueView(queue, page));
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith('music:')) return handleMusicButton(interaction);
    if (interaction.customId.startsWith('queue:page:')) return handleQueueButton(interaction);
    return null;
}

module.exports = { handleButton };
