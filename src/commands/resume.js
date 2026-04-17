const { resumePlayback } = require('../utils/voiceManager');

module.exports = {
    name: 'resume',
    description: 'Reanuda la reproducción',
    
    async execute(interaction) {
        const success = resumePlayback(interaction.guildId);

        if (!success) {
            return interaction.reply({ 
                content: '❌ No hay nada pausado.', 
                flags: 64 
            });
        }

        await interaction.reply('▶️ Reanudado.');
    },
};
