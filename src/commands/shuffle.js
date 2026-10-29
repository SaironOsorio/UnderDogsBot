const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');

module.exports = {
    data: new SlashCommandBuilder().setName('shuffle').setDescription('Mezcla la cola'),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        if (queue.tracks.length < 2) {
            return interaction.reply({ embeds: [ui.errorEmbed('Necesito al menos 2 canciones en cola para mezclar.')], flags: 64 });
        }
        const count = queue.shuffle();
        await interaction.reply({ embeds: [ui.successEmbed(`🔀 Mezclé ${count} canciones.`)] });
    },
};
