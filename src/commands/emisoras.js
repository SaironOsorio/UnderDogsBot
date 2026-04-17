const { EmbedBuilder } = require('discord.js');
const { RADIOS } = require('../utils/config');

module.exports = {
    name: 'emisoras',
    description: 'Lista las emisoras de radio disponibles',
    
    async execute(interaction) {
        const emisorsList = Object.keys(RADIOS)
            .map(name => `• **${name}**`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor('#FF5733')
            .setTitle('📻 Emisoras Disponibles')
            .setDescription(emisorsList)
            .setFooter({ text: 'Usa /radio <nombre> para reproducir' });

        await interaction.reply({ embeds: [embed], flags: 64 });
    },
};
