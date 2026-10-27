// Separate, versioned profiles keep model switching independent of legacy UI state.
// Both recommended models passed real chat checks with these balanced values.
const profiles = {
    angelic: {
        name: 'Angelic Eclipse · balanced v1',
        instruction: 'ChatML',
        topP: 0.5,
        topK: 40,
        minP: 0,
        repetitionPenalty: 1.2,
    },
    forgotten: {
        name: 'Forgotten Safeword · balanced v1',
        instruction: 'Mistral V3-Tekken',
        topP: 0.5,
        topK: 40,
        minP: 0,
        repetitionPenalty: 1.2,
    },
    local: {
        name: 'Local model · balanced v1',
        instruction: null,
        topP: 0.5,
        topK: 40,
        minP: 0,
        repetitionPenalty: 1.2,
    },
};

export function modelPreset(modelId = '') {
    const key = modelId.startsWith('angelic-')
        ? 'angelic'
        : modelId.startsWith('forgotten-')
          ? 'forgotten'
          : 'local';
    return { ...profiles[key] };
}

export function samplingSettings(modelId = '', overrides = {}) {
    const preset = modelPreset(modelId);
    for (const [key, min, max] of [
        ['topP', 0, 1],
        ['topK', 0, 1000],
        ['minP', 0, 1],
        ['repetitionPenalty', 1, 2],
    ]) {
        const value = overrides[key];
        if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
            preset[key] = Math.max(Number(min), Math.min(Number(max), Number(value)));
        }
    }
    preset.topK = Math.round(preset.topK);
    return preset;
}
