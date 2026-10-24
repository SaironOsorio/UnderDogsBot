const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');

module.exports = {
    data: new SlashCommandBuilder().setName('clear').setDescription('Vacía la cola sin parar la canción actual'),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        const count = queue.clear();
        await interaction.reply({ embeds: [ui.successEmbed(`🧹 Quité ${count} canción(es) de la cola.`)] });
    },
};
