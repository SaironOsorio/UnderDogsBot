const { SlashCommandBuilder } = require('discord.js');
const manager = require('../music/manager');
const ui = require('../music/ui');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la cola de reproducción')
        .addIntegerOption((option) => option.setName('pagina').setDescription('Página').setMinValue(1)),

    async execute(interaction) {
        const queue = manager.get(interaction.guildId);
        if (!queue) {
            return interaction.reply({ embeds: [ui.errorEmbed('No estoy reproduciendo nada.')], flags: 64 });
        }
        await interaction.reply(ui.queueView(queue, interaction.options.getInteger('pagina') || 1));
    },
};
