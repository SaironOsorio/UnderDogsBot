const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'help',
    description: 'Muestra los comandos del bot',
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📻 Comandos Disponibles')
            .setDescription('Comandos del bot de radio')
            .addFields(
                { name: '/help', value: 'Muestra esta ayuda', inline: false },
                { name: '/emisoras', value: 'Lista las emisoras de radio disponibles', inline: false },
                { name: '/radio <nombre>', value: 'Reproduce una emisora de radio', inline: false }
            )
            .setFooter({ text: 'Usa /help para más información' });

        await interaction.reply({ embeds: [embed], flags: 64 }); // flags: 64 = ephemeral
    },
};
