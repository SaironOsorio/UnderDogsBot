const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');

module.exports = {
    data: new SlashCommandBuilder().setName('stop').setDescription('Detiene la música, vacía la cola y me saca del canal'),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        queue.destroy('stop');
        await interaction.reply({ embeds: [ui.successEmbed('⏹️ Paré esa vuelta.')] });
    },
};
