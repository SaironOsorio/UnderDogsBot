const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');
const { LOOP_LABELS } = require('../music/format');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Repite la canción o la cola')
        .addStringOption((option) => option
            .setName('modo')
            .setDescription('Qué repetir')
            .setRequired(true)
            .addChoices(
                { name: 'Desactivado', value: 'off' },
                { name: 'Canción actual', value: 'track' },
                { name: 'Toda la cola', value: 'queue' },
            )),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        const mode = queue.setLoop(interaction.options.getString('modo', true));
        await interaction.reply({ embeds: [ui.successEmbed(`🔁 Repetir: **${LOOP_LABELS[mode]}**`)] });
    },
};
