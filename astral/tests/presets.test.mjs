import test from 'node:test';
import assert from 'node:assert/strict';
import { modelPreset, samplingSettings } from '../ui/model-presets.js';

test('switching models resets mutable sampling to the independently pinned profile', () => {
    const custom = samplingSettings('angelic-iq4_xs', { topP: 0.9, topK: 75 });
    custom.minP = 0.8;
    const switched = samplingSettings('forgotten-iq4_xs');
    assert.equal(switched.topP, 0.5);
    assert.equal(switched.topK, 40);
    assert.equal(switched.minP, 0);
    assert.notEqual(switched.name, modelPreset('angelic-iq4_xs').name);
    assert.equal(switched.instruction, 'Mistral V3-Tekken');
    assert.equal(modelPreset('angelic-iq4_xs').instruction, 'ChatML');
});

test('sampling overrides clamp invalid ranges and empty fields restore model values', () => {
    const sampling = samplingSettings('forgotten-q4_k_m', {
        topP: '',
        topK: -5,
        minP: 8,
        repetitionPenalty: 'invalid',
    });
    assert.equal(sampling.topP, 0.5);
    assert.equal(sampling.topK, 0);
    assert.equal(sampling.minP, 1);
    assert.equal(sampling.repetitionPenalty, 1.2);
});
