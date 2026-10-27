import React, { useEffect, useState } from 'react';
import { Plus, Copy, Trash2, Check, Eye } from 'lucide-react';
import { Modal } from './components';
import { action } from './api';
import { profileContext } from '../shared/personas';
import type { State, UserProfile, Conversation } from './types';
import type { SillyTavernBridge } from './bridge';

export const profileName = (state: State, id: string | null) => state.profiles.find(p => p.id === id)?.displayName || (id ? 'Deleted profile' : 'No profile');
export function ProfilePreview({ state, chat, bridge }: { state: State; chat?: Conversation; bridge: SillyTavernBridge }) {
    const [preview, setPreview] = useState({ text: '', omitted: [] as string[] });
    const profile = state.profiles.find(p => p.id === (chat ? chat.userProfileId : state.settings.defaultUserProfileId));
    useEffect(() => {
        let alive = true;
        void profileContext(chat?.shareProfile === false ? undefined : profile, (text: string) => bridge.tokenizer ? bridge.tokenizer.getTokenCountAsync(text, 0) : Math.ceil(text.length / 2)).then(result => { if (alive) setPreview(result); });
        return () => { alive = false; };
    }, [profile, chat?.shareProfile, bridge]);
    return <div className="profile-preview"><p>This is the profile information included with your next message. Chats and memory have their own settings.</p><pre>{preview.text || 'No profile information will be sent.'}</pre>{!!preview.omitted.length && <p>{preview.omitted.length} field(s) exceed the 512-token profile budget. Shorten your introduction or facts to include them.</p>}</div>;
}
export function ProfilesPage({ state, bridge, reload, patch, run }: { state: State; bridge: SillyTavernBridge; reload: () => Promise<unknown>; patch: (patch: Partial<State['settings']>) => Promise<unknown>; run: (task: () => Promise<unknown>, message?: string) => Promise<unknown> }) {
    const [editing, setEditing] = useState<UserProfile | null>(null);
    const [deleting, setDeleting] = useState<UserProfile | null>(null);
    const blank = (): UserProfile => ({ id: '', displayName: '', age: null, gender: '', pronouns: '', about: '', facts: [] });
    return <section className="page profiles-page"><div className="page-heading"><div><h1>Profiles</h1><p>Choose who you are in each chat. Keep real details, fictional personas, or a bit of both.</p></div><button className="button" onClick={() => setEditing(blank())}><Plus size={16} /> New profile</button></div>
        <p>Each profile has separate chats and memories. All fields are optional. Profiles stay on this computer and are included in backups.</p>
        <div className="profile-grid">{state.profiles.map(profile => <article className="settings-section" key={profile.id}><h2>{profile.displayName || 'Unnamed profile'}</h2><p>{profile.about || 'Add a few details to introduce yourself.'}</p>{profile.id === state.settings.defaultUserProfileId && <span className="recommendation-label">Default for new chats</span>}<div className="button-row"><button className="button secondary" onClick={() => setEditing(structuredClone(profile))}>Edit profile</button><button className="text-button" onClick={() => setEditing({ ...structuredClone(profile), id: '', displayName: `${profile.displayName || 'Profile'} copy` })}><Copy size={15} /> Duplicate</button>{profile.id !== state.settings.defaultUserProfileId && <button className="text-button" onClick={() => void run(() => patch({ defaultUserProfileId: profile.id }), 'Default profile updated.')}><Check size={15} /> Make default</button>}<button className="text-button danger" onClick={() => setDeleting(profile)}><Trash2 size={15} /> Delete</button></div></article>)}</div>
        {!state.profiles.length && <div className="empty"><h2>No profiles yet</h2><p>You can chat as “You”, or create a profile when you’re ready.</p></div>}
        {editing && <Modal title={editing.id ? 'Edit profile' : 'New profile'} close={() => setEditing(null)} wide><form onSubmit={event => { event.preventDefault(); void run(async () => { await action({ type: 'saveProfile', profile: editing }); await reload(); setEditing(null); }, 'Profile saved.'); }}>
            <div className="two-fields"><label>Display name<input maxLength={80} value={editing.displayName} onChange={e => setEditing({ ...editing, displayName: e.target.value })} placeholder="You" /></label><label>Age (optional)<input type="number" min={0} max={125} value={editing.age ?? ''} onChange={e => setEditing({ ...editing, age: e.target.value === '' ? null : Number(e.target.value) })} /></label></div>
            <div className="two-fields"><label>Gender (optional)<input maxLength={80} value={editing.gender} onChange={e => setEditing({ ...editing, gender: e.target.value })} /></label><label>Pronouns (optional)<input maxLength={80} value={editing.pronouns} onChange={e => setEditing({ ...editing, pronouns: e.target.value })} placeholder="e.g. they/them" /></label></div>
            <label>A little about you<textarea rows={4} maxLength={1200} value={editing.about} onChange={e => setEditing({ ...editing, about: e.target.value })} placeholder="What would you like characters to know?" /></label>
            <h3>Facts you want to share</h3><p>Switch individual facts off without deleting them.</p>
            {editing.facts.map((fact, index) => <div className="profile-fact" key={fact.id}><input type="checkbox" aria-label={`Share fact ${index + 1}`} checked={fact.enabled} onChange={e => setEditing({ ...editing, facts: editing.facts.map((f, i) => i === index ? { ...f, enabled: e.target.checked } : f) })} /><input aria-label={`Fact ${index + 1}`} maxLength={300} value={fact.text} onChange={e => setEditing({ ...editing, facts: editing.facts.map((f, i) => i === index ? { ...f, text: e.target.value } : f) })} /><button className="icon-button" type="button" aria-label={`Remove fact ${index + 1}`} onClick={() => setEditing({ ...editing, facts: editing.facts.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></div>)}
            <button className="text-button" type="button" disabled={editing.facts.length >= 24} onClick={() => setEditing({ ...editing, facts: [...editing.facts, { id: crypto.randomUUID(), text: '', enabled: true }] })}><Plus size={15} /> Add fact</button>
            <details><summary><Eye size={15} /> Preview profile information</summary><ProfilePreview state={{ ...state, profiles: [editing], settings: { ...state.settings, defaultUserProfileId: editing.id } }} bridge={bridge} /></details>
            <p>Edits apply to future messages in chats using this profile. Information already in a chat’s history stays there.</p><div className="modal-actions"><button className="button" type="submit">Save profile</button></div>
        </form></Modal>}
        {deleting && <Modal title="Delete this profile?" close={() => setDeleting(null)}><p>This removes its profile fields and remembered facts. Its existing chats remain available under “Deleted profile”; their messages are not erased or reassigned.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>Cancel</button><button className="button" onClick={() => void run(async () => { await action({ type: 'deleteProfile', profileId: deleting.id }); await reload(); setDeleting(null); }, 'Profile deleted.')}>Delete profile</button></div></Modal>}
    </section>;
}
