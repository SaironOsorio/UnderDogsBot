const { SlashCommandBuilder } = require('discord.js');
const manager = require('../music/manager');
const ui = require('../music/ui');
const { resolve, detectSource } = require('../music/resolver');
const { requireJoinableVoice } = require('../music/guards');
const { truncate } = require('../music/format');

const SUGGEST_TIMEOUT_MS = 1_500;

async function fetchSuggestions(query) {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=es&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS) });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.[1]) ? data[1] : [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce una canción o playlist de YouTube, SoundCloud o Spotify')
        .addStringOption((option) => option
            .setName('consulta')
            .setDescription('Nombre de la canción o enlace (YouTube, SoundCloud, Spotify)')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption((option) => option
            .setName('fuente')
            .setDescription('Dónde buscar si escribes un nombre (por defecto YouTube)')
            .addChoices(
                { name: 'YouTube', value: 'youtube' },
                { name: 'SoundCloud', value: 'soundcloud' },
            ))
        .addBooleanOption((option) => option
            .setName('siguiente')
            .setDescription('Ponerla de primera en la cola')),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().trim();
        if (!focused) return interaction.respond([]);

        if (detectSource(focused) !== 'search') {
            return interaction.respond(focused.length <= 100 ? [{ name: 'Reproducir este enlace', value: focused }] : []);
        }

        try {
            const suggestions = await fetchSuggestions(focused);
            const choices = [focused, ...suggestions.filter((item) => item.toLowerCase() !== focused.toLowerCase())]
                .slice(0, 10)
                .map((item) => ({ name: truncate(item, 100), value: truncate(item, 100) }));
            await interaction.respond(choices);
        } catch {
            await interaction.respond([{ name: truncate(focused, 100), value: truncate(focused, 100) }]).catch(() => {});
        }
    },

    async execute(interaction) {
        const channel = await requireJoinableVoice(interaction);
        if (!channel) return;

        await interaction.deferReply();

        const query = interaction.options.getString('consulta', true);
        const source = interaction.options.getString('fuente') || 'youtube';
        const playNext = interaction.options.getBoolean('siguiente') || false;

        let result;
        try {
            result = await resolve(query, { source, requestedBy: interaction.user });
        } catch (error) {
            console.error('Error resolviendo /play:', error);
            return interaction.editReply({ embeds: [ui.errorEmbed(`No pude cargar eso: ${error.message}`)] });
        }

        if (!result.tracks.length) {
            return interaction.editReply({ embeds: [ui.errorEmbed('No encontré resultados para esa búsqueda.')] });
        }

        const queue = manager.getOrCreate(interaction.guild);
        queue.textChannel = interaction.channel;

        try {
            await queue.connect(channel);
        } catch (error) {
            if (!queue.current) queue.destroy('disconnected');
            return interaction.editReply({ embeds: [ui.errorEmbed(error.message)] });
        }

        const wasLive = queue.current?.isLive;
        const startedNow = wasLive || (!queue.current && !queue.loading);
        queue.add(result.tracks, { next: playNext || wasLive });
        const position = playNext || wasLive ? 1 : queue.tracks.length - result.tracks.length + 1;

        await interaction.editReply({ embeds: [ui.addedEmbed(result, { position, startedNow })] });

        if (wasLive) queue.skip();
        else void queue.start();
    },
};
