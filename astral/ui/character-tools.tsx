import React, { useEffect, useState } from 'react';
import { Upload, Sparkles, Square, Download } from 'lucide-react';
import { Modal , FileButton } from './components';
import { request, requestBlob, downloadBlob } from './api';
import { parseDialogue } from '../shared/dialogue';
import { DRAFT_FIELDS } from '../shared/drafts';
import type { Character, CharacterDraft, DialogueLine, Runner, State } from './types';
import type { SillyTavernBridge } from './bridge';

const labels: Record<string, string> = { name: 'Name', role: 'Role', description: 'Biography / introduction', personality: 'Personality', scenario: 'Scenario', greeting: 'Greeting', examples: 'Example dialogue', systemPrompt: 'Character instructions', tags: 'Tags' };
export function DraftDialog({ state, runner, bridge, character, kind = 'profile', close, apply }: {
    state: State; runner: Runner; bridge: SillyTavernBridge; character?: Character;
    kind?: 'instructions' | 'profile' | 'dialogue'; close: () => void; apply: (draft: Partial<CharacterDraft>) => void;
}) {
    const [idea, setIdea] = useState('');
    const [text, setText] = useState('');
    const [lines, setLines] = useState<DialogueLine[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [speaker, setSpeaker] = useState('');
    const [sourceTab, setSourceTab] = useState('paste');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState<Partial<CharacterDraft> | null>(null);
    const [status, setStatus] = useState('');
    const [showAll, setShowAll] = useState(false);
    useEffect(() => bridge.subscribe(() => setStatus(bridge.draftLabel)), [bridge]);
    useEffect(() => () => { void bridge.cancelDraft(); }, [bridge]);
    const load = (value: string | unknown) => {
        const parsed = parseDialogue(value) as DialogueLine[];
        if (!parsed.length) throw new Error('No dialogue was found. Use speaker labels such as “Alex: hello”.');
        setLines(parsed); setSelected(new Set(parsed.map(m => m.id))); setSpeaker(parsed[0].speaker); setError('');
    };
    const generate = async () => {
        setBusy(true); setError('');
        try {
            if (kind !== 'dialogue' && !idea.trim() && !character?.name) throw new Error('Describe the character or enter some profile details first.');
            setDraft(await bridge.draft(kind, idea, state, runner, character, lines.filter(m => selected.has(m.id)), speaker));
        } catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
    };
    return <Modal title={kind === 'dialogue' ? 'Create from dialogue' : kind === 'instructions' ? 'Generate instructions' : 'Draft a character profile'} close={close} wide>
        <p>The loaded local model creates an editable draft. Nothing is saved or changed until you apply it.</p>
        {kind === 'dialogue' && !draft && <>
            <div className="tool-tabs"><button className={sourceTab === 'paste' ? 'selected' : ''} onClick={() => setSourceTab('paste')}>Paste or upload</button><button className={sourceTab === 'chat' ? 'selected' : ''} onClick={() => setSourceTab('chat')}>Astral conversations</button></div>
            {sourceTab === 'paste' ? <>
                <label>Dialogue<textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={'Alex: I prefer the quiet corners.\nSam: Even at a party?\nAlex: Especially at a party.'} /></label>
                <div className="button-row"><button className="button secondary" disabled={busy} onClick={() => { try { load(text); } catch (e) { setError((e as Error).message); } }}>Read dialogue</button>
                <FileButton className="button secondary file-label" accept=".txt,.json,.jsonl" onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 8 * 1024 ** 2) { setError('Choose a dialogue file under 8 MB.'); return; } void f.text().then(value => { setText(value); load(value); }).catch(error => setError(error.message)); } e.target.value = ''; }}><Upload size={16} /> Upload TXT / JSON / JSONL</FileButton></div>
            </> : <label>Saved conversation<select defaultValue="" disabled={busy} onChange={e => {
                const chat = state.conversations.find(c => c.id === e.target.value);
                const owner = state.characters.find(c => c.id === chat?.characterId);
                if (!chat || !owner?.avatar) return;
                void request('/api/chats/get', { avatar_url: owner.avatar, file_name: chat.fileName }).then(load).catch(error => setError(error.message));
            }}><option value="" disabled>Choose a conversation</option>{state.conversations.map(chat => <option value={chat.id} key={chat.id}>{state.characters.find(c => c.id === chat.characterId)?.name} · {chat.title}</option>)}</select></label>}
            {!!lines.length && <>
                <label>Whose character profile should we create?<select value={speaker} onChange={e => setSpeaker(e.target.value)}>{[...new Set(lines.map(m => m.speaker))].map(name => <option key={name}>{name}</option>)}</select></label>
                <details className="source-messages"><summary>Select source messages · {selected.size} of {lines.length}</summary>
                    <div className="button-row"><button className="text-button" onClick={() => setSelected(new Set(lines.map(m => m.id)))}>Select all</button><button className="text-button" onClick={() => setSelected(new Set())}>Clear selection</button></div>
                    {lines.slice(0, showAll ? undefined : 100).map(m => <label className="source-line" key={m.id}><input type="checkbox" checked={selected.has(m.id)} onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(m.id); else next.delete(m.id); return next; })} /><span><strong>{m.speaker}</strong><span>{m.text}</span></span></label>)}
                    {!showAll && lines.length > 100 && <button className="text-button" onClick={() => setShowAll(true)}>Show all source messages</button>}
                </details>
            </>}
        </>}
        {!draft && <label>{kind === 'dialogue' ? 'Additional guidance (optional)' : 'What would you like the model to write?'}<textarea rows={3} value={idea} onChange={e => setIdea(e.target.value)} placeholder={kind === 'instructions' ? 'Keep their voice warm, concise, and curious. Never write the user’s actions.' : 'A patient orbital engineer with a dry sense of humor…'} /></label>}
        {draft && <div className="draft-preview"><h3>Review the draft</h3><p>These fields are editable. Applying a draft updates only the fields shown here.</p>{Object.entries(draft).map(([key, value]) => <label key={key}>{labels[key] || key}{key === 'tags' ? <input value={(value as string[]).join(', ')} onChange={e => setDraft({ ...draft, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} /> : <textarea rows={key === 'systemPrompt' || key === 'greeting' ? 4 : 2} value={String(value)} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</label>)}</div>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        {busy && <p role="status">{status || 'Preparing the loaded model…'}</p>}
        {!bridge.openai && <p role="status">Waiting for the chat engine to finish starting…</p>}
        <div className="modal-actions">{busy ? <button className="button secondary" onClick={() => void bridge.cancelDraft()}><Square size={15} /> Cancel generation</button> : draft ? <><button className="button secondary" onClick={() => setDraft(null)}>Revise request</button><button className="button" onClick={() => { apply(draft); close(); }}>Apply draft</button></> : <button className="button" onClick={() => void generate()} disabled={!bridge.openai || (kind === 'dialogue' && (!speaker || !selected.size))}><Sparkles size={16} /> Generate draft</button>}</div>
    </Modal>;
}

export function ImportWizard({ bridge, close, imported, fromDialogue, pasteDefinition }: { bridge: SillyTavernBridge; close: () => void; imported: () => Promise<void>; fromDialogue: () => void; pasteDefinition: (definition: string) => void }) {
    const [tab, setTab] = useState('file');
    const [url, setURL] = useState('');
    const [definition, setDefinition] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<{ card: any; warnings: string[] } | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inspect = async (selected: File) => { setBusy(true); setError(''); try { setFile(selected); setPreview(await bridge.previewCharacter(selected)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
    return <Modal title="Import character" close={close} wide>
        <div className="tool-tabs">{[['file', 'PNG / JSON card'], ['cai', 'Character.AI'], ['url', 'Public link'], ['definition', 'Paste definition']].map(([key, label]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setPreview(null); setError(''); }}>{label}</button>)}</div>
        {(tab === 'file' || tab === 'cai') && <>
            {tab === 'cai' ? <><p>Choose a Character.AI character export in Tavern-compatible JSON/PNG format. Export tools may omit private definitions; Astral cannot recover fields that the export does not contain.</p><p>You can also copy the character’s available definition into the Paste definition tab. For conversation-only exports, use Create from dialogue.</p><button className="text-button" onClick={() => { fromDialogue(); close(); }}>Create from a chat export</button><button className="text-button" onClick={() => void window.astralDesktop?.openExternal('https://support.character.ai/hc/en-us/articles/56967715028891-How-do-I-download-my-data')}>Character.AI export instructions</button></> : <p>Import SillyTavern and compatible Character Card V2/V3 PNG or JSON files. Attribution and additional card fields are preserved.</p>}
            <FileButton className="button secondary file-label" accept=".json,.png" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void inspect(f); e.target.value = ''; }}><Upload size={16} /> Choose character file</FileButton>
        </>}
        {tab === 'url' && <><p>Public character links from Chub, Pygmalion, AICharacterCards, and Perchance are supported. Other sites can use exported files.</p><label>Character URL<input value={url} type="url" onChange={e => setURL(e.target.value)} placeholder="https://chub.ai/characters/…" /></label><button className="button secondary" disabled={busy || !url.trim()} onClick={() => {
            setBusy(true); setError('');
            void requestBlob('/api/astral/import-url', { url }).then(async blob => {
                const candidate = new File([blob], blob.type.includes('json') ? 'character.json' : 'character.png', { type: blob.type });
                await inspect(candidate);
            }).catch(e => setError(e.message)).finally(() => setBusy(false));
        }}>Preview import</button></>}
        {tab === 'definition' && <><label>Available character definition<textarea rows={10} value={definition} onChange={e => setDefinition(e.target.value)} placeholder="Paste the character’s description, personality, greeting, or instructions…" /></label><button className="button" disabled={!definition.trim()} onClick={() => { pasteDefinition(definition); close(); }}>Open in character editor</button></>}
        {preview && <div className="import-preview"><h3>{preview.card.data.name}</h3><p>{preview.card.spec === 'chara_card_v3' ? 'Character Card V3' : 'Character Card V2'}</p>{preview.warnings.map((warning, index) => <p key={index} className="notice">{warning}</p>)}{[['description', 'Description'], ['personality', 'Personality'], ['first_mes', 'Greeting'], ['system_prompt', 'Instructions']].map(([key, label]) => <details key={key}><summary>{label}</summary><pre>{preview.card.data[key] || 'Not included in this export.'}</pre></details>)}<p>Creator: {preview.card.data.creator || 'Not specified'}</p><div className="modal-actions"><button className="button" disabled={busy} onClick={() => {
            if (!file) return; setBusy(true); setError('');
            void bridge.importCharacter(file, 'normal', preview.card).then(imported).then(close).catch(e => setError(e.message)).finally(() => setBusy(false));
        }}>Import reviewed character</button></div></div>}
        {busy && <p role="status">Reading character data…</p>}{error && <p className="inline-error" role="alert">{error}</p>}
    </Modal>;
}
