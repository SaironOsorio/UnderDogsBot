const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const SECTIONS = [
    ['Reproducir', ['play', 'radio', 'emisoras']],
    ['Controles', ['pause', 'resume', 'skip', 'stop', 'volume', 'eq', 'loop']],
    ['Cola', ['queue', 'nowplaying', 'shuffle', 'remove', 'move', 'clear']],
];

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Muestra los comandos del bot'),

    async execute(interaction) {
        const commands = interaction.client.commands;
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Comandos de UnderDogs')
            .setDescription('Acepta nombres de canciones y enlaces de YouTube, SoundCloud y Spotify (canciones, álbumes y playlists).');

        for (const [title, names] of SECTIONS) {
            const lines = names
                .filter((name) => commands.has(name))
                .map((name) => `\`/${name}\` ${commands.get(name).data.description}`);
            if (lines.length) embed.addFields({ name: title, value: lines.join('\n') });
        }

        embed.setFooter({ text: 'El panel de "Reproduciendo ahora" tiene botones para pausar, saltar, repetir y más.' });
        await interaction.reply({ embeds: [embed], flags: 64 });
    },
};
