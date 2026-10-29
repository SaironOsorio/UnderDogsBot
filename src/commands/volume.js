const { SlashCommandBuilder } = require('discord.js');
const ui = require('../music/ui');
const { requireControl } = require('../music/guards');
const { MAX_VOLUME } = require('../music/GuildQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Cambia o muestra el volumen')
        .addIntegerOption((option) => option
            .setName('nivel')
            .setDescription(`Volumen de 0 a ${MAX_VOLUME}`)
            .setMinValue(0)
            .setMaxValue(MAX_VOLUME)),

    async execute(interaction) {
        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        const level = interaction.options.getInteger('nivel');
        if (level === null) {
            return interaction.reply({ embeds: [ui.successEmbed(`🔊 Volumen actual: **${queue.volume}%**`)], flags: 64 });
        }
        const volume = queue.setVolume(level);
        await interaction.reply({ embeds: [ui.successEmbed(`🔊 Volumen en **${volume}%**`)] });
    },
};
