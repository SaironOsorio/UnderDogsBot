const LIMITER = 'alimiter=limit=0.89:attack=5:release=60:level=disabled';

const PRESETS = {
    carro: {
        label: 'Carro',
        emoji: '🚗',
        description: 'Radio de carro: bajos con cuerpo, medios suaves y agudos sin chillar',
        filter: [
            'equalizer=f=60:t=o:w=1.0:g=6',
            'equalizer=f=120:t=o:w=1.0:g=4',
            'equalizer=f=250:t=o:w=1.0:g=-1',
            'equalizer=f=900:t=o:w=1.0:g=-2',
            'equalizer=f=3500:t=o:w=1.2:g=2',
            'equalizer=f=9000:t=o:w=1.2:g=-4',
            'equalizer=f=15000:t=o:w=0.8:g=-6',
            LIMITER,
        ],
    },
    camion: {
        label: 'Camión (ETS/ATS)',
        emoji: '🚛',
        description: 'Radio dentro de la cabina de un tráiler, como en Euro/American Truck Simulator',
        filter: [
            'highpass=f=55',
            'lowpass=f=6500',
            'equalizer=f=110:t=o:w=1.0:g=5',
            'equalizer=f=320:t=o:w=1.2:g=3',
            'equalizer=f=1200:t=o:w=1.0:g=-2',
            'equalizer=f=3000:t=o:w=1.0:g=1',
            'extrastereo=m=0.55',
            'aecho=0.85:0.5:14|29:0.22|0.12',
            'acompressor=threshold=-20dB:ratio=3:attack=15:release=250:makeup=2',
            LIMITER,
        ],
    },
    pico: {
        label: 'Picó',
        emoji: '🔊',
        description: 'Bajo pesado y brillo arriba, sonido de picó',
        filter: [
            'equalizer=f=45:t=o:w=1.0:g=9',
            'equalizer=f=90:t=o:w=1.0:g=6',
            'equalizer=f=250:t=o:w=1.0:g=-2',
            'equalizer=f=800:t=o:w=1.0:g=-3',
            'equalizer=f=5000:t=o:w=1.2:g=3',
            'equalizer=f=11000:t=o:w=1.0:g=2',
            'acompressor=threshold=-18dB:ratio=4:attack=10:release=200',
            LIMITER,
        ],
    },
    plano: {
        label: 'Plano',
        emoji: '🎧',
        description: 'Sin ecualización, tal como viene la canción',
        filter: [],
    },
};

function legacyDefault() {
    if ((process.env.RADIO_EQ || '').toLowerCase() === 'false') return 'plano';
    return 'carro';
}

const DEFAULT_PRESET = PRESETS[process.env.EQ_PRESET] ? process.env.EQ_PRESET : legacyDefault();

function getPreset(name) {
    return PRESETS[name] || PRESETS[DEFAULT_PRESET];
}

function presetFilter(name) {
    const filters = getPreset(name).filter;
    return filters.length ? filters.join(',') : null;
}

function presetLabel(name) {
    const preset = getPreset(name);
    return `${preset.emoji} ${preset.label}`;
}

const PRESET_CHOICES = Object.entries(PRESETS).map(([value, preset]) => ({ name: preset.label, value }));

module.exports = {
    PRESETS,
    DEFAULT_PRESET,
    PRESET_CHOICES,
    getPreset,
    presetFilter,
    presetLabel,
};
