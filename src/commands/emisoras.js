const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { RADIOS } = require('../utils/config');

module.exports = {
    data: new SlashCommandBuilder().setName('emisoras').setDescription('Lista las emisoras disponibles'),

    async execute(interaction) {
        const list = Object.values(RADIOS).map((radio) => `• **${radio.name}**`).join('\n');
        const embed = new EmbedBuilder()
            .setColor(0x2b90d9)
            .setTitle('📻 Emisoras disponibles')
            .setDescription(list || 'No hay emisoras configuradas.')
            .setFooter({ text: 'Usa /radio para sintonizar una' });
        await interaction.reply({ embeds: [embed], flags: 64 });
    },
};
