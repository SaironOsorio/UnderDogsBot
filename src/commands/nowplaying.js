const { SlashCommandBuilder } = require('discord.js');
const manager = require('../music/manager');
const ui = require('../music/ui');

module.exports = {
    data: new SlashCommandBuilder().setName('nowplaying').setDescription('Muestra lo que está sonando con los controles'),

    async execute(interaction) {
        const queue = manager.get(interaction.guildId);
        if (!queue?.current) {
            return interaction.reply({ embeds: [ui.errorEmbed('No hay nada sonando.')], flags: 64 });
        }

        const previous = queue.panelMessage;
        await interaction.reply({ embeds: [ui.nowPlayingEmbed(queue)], components: ui.controlRows(queue) });
        queue.panelMessage = await interaction.fetchReply();
        if (previous && previous.id !== queue.panelMessage.id) await previous.delete().catch(() => {});
    },
};
