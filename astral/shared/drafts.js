export const DRAFT_FIELDS = ['name', 'role', 'description', 'personality', 'scenario', 'greeting', 'examples', 'systemPrompt'];
export function draftSchema(kind) {
    const fields = kind === 'instructions' ? ['systemPrompt'] : kind === 'notes' ? ['notes'] : DRAFT_FIELDS;
    const properties = Object.fromEntries(fields.map(k => [k, { type: 'string' }]));
    if (kind === 'profile' || kind === 'dialogue') properties.tags = { type: 'array', items: { type: 'string' } };
    return { name: 'AstralDraft', strict: true, value: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
export function parseDraft(text, kind) {
    let value;
    try { value = JSON.parse(String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1)); } catch { throw new Error('The model did not return a valid draft. Your existing fields were not changed. Try again.'); }
    const fields = Object.keys(draftSchema(kind).value.properties);
    for (const key of fields) {
        if (key === 'tags') {
            if (!Array.isArray(value.tags) || value.tags.some(x => typeof x !== 'string')) throw new Error('The model returned invalid tags. Try again.');
            value.tags = value.tags.slice(0, 8).map(x => x.slice(0, 40));
        } else if (typeof value[key] !== 'string' || value[key].length > 24000) throw new Error(`The model returned an invalid ${key} field. Try again.`);
    }
    if (fields.includes('name') && !value.name.trim()) throw new Error('The model did not give the character a name. Try again.');
    return Object.fromEntries(fields.map(key => [key, value[key]]));
}
export function literalSource(text) { return String(text).replaceAll('{{', '{ {').replaceAll('<|think|>', '[thinking token]'); }
