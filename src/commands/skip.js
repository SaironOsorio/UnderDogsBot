const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');
const { cleanTitle } = require('../music/format');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Salta la canción actual')
        .addIntegerOption((option) => option
            .setName('cantidad')
            .setDescription('Cuántas canciones saltar')
            .setMinValue(1)
            .setMaxValue(100)),

    async execute(interaction) {
        const queue = await requireControl(interaction);
        if (!queue) return;
        const count = interaction.options.getInteger('cantidad') || 1;
        const title = queue.current.title;
        queue.skip(count);
        const text = count > 1 ? `⏭️ Salté ${count} canciones.` : `⏭️ Salté **${cleanTitle(title)}**.`;
        await interaction.reply({ embeds: [ui.successEmbed(text)] });
    },
};
