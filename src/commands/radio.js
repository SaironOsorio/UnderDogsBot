const { SlashCommandBuilder } = require('discord.js');
const manager = require('../music/manager');
const ui = require('../music/ui');
const { RADIOS, RADIO_CHOICES } = require('../utils/config');
const { requireJoinableVoice } = require('../music/guards');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Pone una emisora en vivo')
        .addStringOption((option) => option
            .setName('nombre')
            .setDescription('Emisora')
            .setRequired(true)
            .addChoices(...RADIO_CHOICES)),

    async execute(interaction) {
        const key = interaction.options.getString('nombre', true);
        const radio = RADIOS[key];
        if (!radio) {
            return interaction.reply({ embeds: [ui.errorEmbed('Esa emisora no existe. Usa `/emisoras` para ver la lista.')], flags: 64 });
        }

        const channel = await requireJoinableVoice(interaction);
        if (!channel) return;

        await interaction.deferReply();

        const queue = manager.getOrCreate(interaction.guild);
        queue.textChannel = interaction.channel;

        try {
            await queue.connect(channel);
        } catch (error) {
            if (!queue.current) queue.destroy('disconnected');
            return interaction.editReply({ embeds: [ui.errorEmbed(error.message)] });
        }

        const track = {
            title: radio.name,
            author: 'Radio en vivo',
            duration: 0,
            url: radio.url,
            displayUrl: null,
            thumbnail: radio.image || null,
            isLive: true,
            source: 'radio',
            requestedBy: interaction.user,
        };

        const replacing = Boolean(queue.current);
        queue.add([track], { next: true });
        if (replacing) queue.skip();
        else void queue.start();

        const pending = queue.tracks.length;
        const note = pending > 0 ? `\nLa cola sigue guardada (${pending}). Usa \`/skip\` para volver a ella.` : '';
        await interaction.editReply({ embeds: [ui.successEmbed(`📻 Sintonizando **${radio.name}**${note}`)] });
    },
};
