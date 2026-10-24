const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');

module.exports = {
    data: new SlashCommandBuilder().setName('resume').setDescription('Reanuda la música'),

    async execute(interaction) {
        const queue = await requireControl(interaction);
        if (!queue) return;
        if (!queue.resume()) {
            return interaction.reply({ embeds: [ui.errorEmbed('La música no está pausada.')], flags: 64 });
        }
        await interaction.reply({ embeds: [ui.successEmbed('▶️ Seguimos.')] });
    },
};
