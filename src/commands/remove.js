const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');
const { cleanTitle } = require('../music/format');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Quita una canción de la cola')
        .addIntegerOption((option) => option
            .setName('posicion')
            .setDescription('Número en /queue')
            .setRequired(true)
            .setMinValue(1)),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        const track = queue.remove(interaction.options.getInteger('posicion', true));
        if (!track) {
            return interaction.reply({ embeds: [ui.errorEmbed('No hay ninguna canción en esa posición.')], flags: 64 });
        }
        await interaction.reply({ embeds: [ui.successEmbed(`🗑️ Quité **${cleanTitle(track.title)}** de la cola.`)] });
    },
};
