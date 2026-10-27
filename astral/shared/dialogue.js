export function parseDialogue(source) {
    let input = source;
    if (typeof input === 'string') {
        const text = input.trim();
        if (!text) return [];
        try { input = JSON.parse(text); } catch {
            const lines = text.split(/\r?\n/).filter(Boolean);
            try { input = lines.map(line => JSON.parse(line)); } catch {
                const result = [];
                for (const line of lines) {
                    const match = line.match(/^([^:\n]{1,60}):\s*(.+)$/);
                    if (match) result.push({ id: String(result.length), speaker: match[1].trim(), text: match[2] });
                    else if (result.length) result.at(-1).text += '\n' + line;
                    else result.push({ id: '0', speaker: 'Speaker', text: line });
                }
                return result;
            }
        }
    }
    if (!Array.isArray(input)) {
        input = input.messages ?? input.chat ?? input.turns ?? input.msgs ?? input.histories?.flatMap(h => h.msgs || h.messages || []) ?? [];
    }
    return input.map((m, index) => {
        let text = m.mes ?? m.text ?? m.content ?? m.candidates?.[0]?.raw_content ?? m.message?.content ?? '';
        if (Array.isArray(text)) text = text.filter(x => x.type === 'text').map(x => x.text).join('\n');
        const author = m.speaker ?? m.name ?? m.author?.name ?? m.author?.role ?? m.author ?? m.src?.user?.username ?? m.role ?? (m.is_user ? 'You' : 'Character');
        return { id: String(index), speaker: typeof author === 'string' ? author : 'Speaker', text: typeof text === 'string' ? text : '' };
    }).filter(m => m.text.trim());
}
