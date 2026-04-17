const { stopPlayback } = require('../utils/voiceManager');

module.exports = {
    name: 'stop',
    description: 'Detiene la reproducción y desconecta',
    
    async execute(interaction) {
        const success = stopPlayback(interaction.guildId);

        if (!success) {
            return interaction.reply({ 
                content: '❌ No estoy reproduciendo nada.', 
                flags: 64 
            });
        }

        await interaction.reply('⏹️ Paré esa vuelta.');
    },
};
