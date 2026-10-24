const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ui = require('../music/ui');
const manager = require('../music/manager');
const { requireControl } = require('../music/guards');
const { PRESETS, PRESET_CHOICES, DEFAULT_PRESET, presetLabel } = require('../music/equalizer');
const settings = require('../utils/settings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eq')
        .setDescription('Cambia el modo de sonido (carro, camión, picó, plano)')
        .addStringOption((option) => option
            .setName('modo')
            .setDescription('Modo de sonido')
            .addChoices(...PRESET_CHOICES)),

    async execute(interaction) {
        const mode = interaction.options.getString('modo');

        if (!mode) {
            const current = manager.get(interaction.guildId)?.eq || settings.get(interaction.guildId, 'eq', DEFAULT_PRESET);
            const list = Object.entries(PRESETS)
                .map(([key, preset]) => `${key === current ? '▸' : '•'} **${preset.emoji} ${preset.label}**: ${preset.description}`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('Modos de sonido')
                .setDescription(`Actual: **${presetLabel(current)}**\n\n${list}`)
                .setFooter({ text: 'Usa /eq modo:<nombre> o el menú del panel para cambiarlo' });
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (!manager.get(interaction.guildId)) {
            settings.set(interaction.guildId, 'eq', mode);
            return interaction.reply({ embeds: [ui.successEmbed(`🎛️ Sonido en **${presetLabel(mode)}** para la próxima vez que suene algo.`)] });
        }

        const queue = await requireControl(interaction, { needsTrack: false });
        if (!queue) return;
        queue.setEq(mode);
        const note = queue.isPaused ? ' Se aplica al reanudar.' : '';
        await interaction.reply({ embeds: [ui.successEmbed(`🎛️ Sonido en **${presetLabel(queue.eq)}**.${note}`)] });
    },
};
