const string = value => typeof value === 'string' ? value : '';
export function decodeCharacter(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a character-card JSON file.');
    const raw = structuredClone(value);
    const d = value.spec ? value.data : (value.character ?? value.character_data ?? value.data?.character ?? value);
    if (!d || !string(d.name || d.char_name).trim()) {
        throw new Error('This file has no character definition. For chat exports, use Create from dialogue.');
    }
    const warnings = [];
    if (!value.spec) warnings.push('Converted a legacy or website export. Review the mapped fields before importing.');
    if (d.definition) warnings.push('The exported definition is preserved in character instructions.');
    const data = {
        ...d,
        name: string(d.name || d.char_name),
        description: string(d.description || d.long_description || d.char_persona),
        personality: string(d.personality),
        scenario: string(d.scenario || d.world_scenario),
        first_mes: string(d.first_mes || d.greeting || d.first_message || d.char_greeting),
        mes_example: string(d.mes_example || d.example_dialogue),
        system_prompt: string(d.system_prompt || d.definition),
        tags: Array.isArray(d.tags) ? d.tags.filter(x => typeof x === 'string') : [],
        extensions: d.extensions && typeof d.extensions === 'object' ? d.extensions : {},
    };
    for (const key of ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt']) {
        if (data[key].length > 24000) throw new Error(`${key} is longer than the editor supports (24,000 characters). Shorten it explicitly before importing; nothing has been imported.`);
    }
    if (!data.description && !data.system_prompt && !data.personality) warnings.push('This export contains little character information. Private definitions cannot be recovered from a public name or link.');
    return { card: { ...raw, spec: value.spec === 'chara_card_v3' ? 'chara_card_v3' : 'chara_card_v2', spec_version: value.spec === 'chara_card_v3' ? '3.0' : '2.0', data }, warnings };
}
export function buildCharacterCard(c) {
    const source = structuredClone(c.sourceCard || {});
    const d = source.data || {};
    const extensions = { ...d.extensions };
    const astral = { ...extensions.astral, version: 2, id: c.id, mode: 'normal', role: c.role, color: c.color, art: c.art, overrides: c.overrides };
    delete astral.age;
    extensions.astral = astral;
    return {
        ...source,
        spec: source.spec === 'chara_card_v3' ? 'chara_card_v3' : 'chara_card_v2',
        spec_version: source.spec === 'chara_card_v3' ? '3.0' : '2.0',
        data: { ...d, name: c.name, description: c.description, personality: c.personality, scenario: c.scenario,
            first_mes: c.greeting, mes_example: c.examples, system_prompt: c.systemPrompt,
            post_history_instructions: d.post_history_instructions || '', creator_notes: d.creator_notes ?? 'Created with Astral.AI.',
            alternate_greetings: d.alternate_greetings || [], tags: c.tags, creator: d.creator ?? 'Astral.AI', character_version: d.character_version || '1.0', extensions },
    };
}
