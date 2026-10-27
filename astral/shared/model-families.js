export function groupModels(models, runningId = '', preferredId = '') {
    const families = new Map();
    const filePath = model => String(model.storagePath || model.path || '').replaceAll('\\', '/').toLowerCase();
    for (const model of models) {
        const canonical = models.find(m => !m.imported && (m.id === model.canonicalModelId || (model.sha256 && m.sha256 === model.sha256) || (filePath(model) && filePath(m) === filePath(model))));
        const family = canonical?.repo || model.familyId || model.repo || (filePath(model) ? `file:${filePath(model)}` : `import:${model.id}`);
        if (!families.has(family)) families.set(family, []);
        families.get(family).push({ ...model, viewFileKey: canonical?.sha256 || model.sha256 || model.canonicalModelId || filePath(model) || model.id });
    }
    return [...families].map(([id, entries]) => {
        const files = new Map();
        for (const model of entries) {
            const key = model.viewFileKey;
            const versions = files.get(key) || []; versions.push(model); files.set(key, versions);
        }
        const versions = [...files.values()].map(copies => {
            const model = copies.find(m => m.id === runningId) || copies.find(m => m.id === preferredId) || copies.find(m => m.ready && m.recommended) || copies.find(m => m.ready) || copies.find(m => m.recommended) || copies[0];
            return { ...model, recommended: copies.some(m => m.recommended), aliases: copies.filter(m => m.id !== model.id) };
        });
        return { id, versions, recommended: versions.some(m => m.recommended) };
    }).sort((a, b) => Number(b.recommended) - Number(a.recommended));
}
