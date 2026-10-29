const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');

module.exports = {
    data: new SlashCommandBuilder().setName('pause').setDescription('Pausa la música'),

    async execute(interaction) {
        const queue = await requireControl(interaction);
        if (!queue) return;
        if (!queue.pause()) {
            const reason = queue.isPaused ? 'Ya está en pausa.' : 'La canción todavía está cargando, intenta en un segundo.';
            return interaction.reply({ embeds: [ui.errorEmbed(reason)], flags: 64 });
        }
        await interaction.reply({ embeds: [ui.successEmbed('⏸️ Música en pausa. Usa `/resume` para seguir.')] });
    },
};
