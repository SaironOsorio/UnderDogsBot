const { pausePlayback } = require('../utils/voiceManager');

module.exports = {
    name: 'pause',
    description: 'Pausa la reproducción',
    
    async execute(interaction) {
        const success = pausePlayback(interaction.guildId);

        if (!success) {
            return interaction.reply({ 
                content: '❌ No hay nada reproduciéndose.', 
                flags: 64 
            });
        }

        await interaction.reply('⏸️ Pausado.');
    },
};
