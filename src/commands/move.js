const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');
const { cleanTitle } = require('../music/format');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Mueve una canción a otra posición de la cola')
        .addIntegerOption((option) => option.setName('desde').setDescription('Posición actual').setRequired(true).setMinValue(1))
        .addIntegerOption((option) => option.setName('hasta').setDescription('Nueva posición').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        const to = interaction.options.getInteger('hasta', true);
        const track = queue.move(interaction.options.getInteger('desde', true), to);
        if (!track) {
            return interaction.reply({ embeds: [ui.errorEmbed('Posiciones fuera de la cola.')], flags: 64 });
        }
        await interaction.reply({ embeds: [ui.successEmbed(`↕️ Moví **${cleanTitle(track.title)}** a la posición ${to}.`)] });
    },
};
