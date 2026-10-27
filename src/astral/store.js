import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sync as atomicWrite } from 'write-file-atomic';
import { normalizeAppearance } from '../../astral/shared/appearance.js';
import { migratePersonas, normalizeProfile, profileForChat } from '../../astral/shared/personas.js';

export const MODES = new Set(['normal']);
export const id = () => crypto.randomUUID();
export function assert(condition, message, status = 400) {
    if (!condition) throw Object.assign(new Error(message), { status });
}
export function cleanText(value, max = 24000) {
    return String(value ?? '').slice(0, max);
}
export function normalizeFact(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '');
}
export function initialState(characters) {
    return migratePersonas({
        version: 2,
        characters: structuredClone(characters),
        starterIds: characters.map(c => c.id),
        conversations: [],
        memories: [],
        tombstones: [],
        checkpoints: [],
        settings: {
            mode: 'normal',
            tutorialDone: false,
            effects: 'subtle',
            appearance: normalizeAppearance(),
            fontSize: 18,
            sceneDim: 25,
            userName: 'You',
            autoMemory: true,
            memoryBudget: 768,
            connection: {
                kind: 'managed',
                url: '',
                model: '',
                template: 'auto',
                temperature: 0.8,
                maxTokens: 384,
                context: 4096,
            },
        },
    });
}
export function validateState(state) {
    assert(
        [1, 2, 3].includes(state?.version) &&
            Array.isArray(state.characters) &&
            Array.isArray(state.conversations) &&
            Array.isArray(state.memories) &&
            Array.isArray(state.checkpoints) &&
            Array.isArray(state.tombstones),
        'Unsupported or damaged Astral backup.',
    );
    assert(
        state.settings && typeof state.settings === 'object',
        'Missing settings.',
    );
    assert(
        state.settings.mode === 'normal',
        'Only standard stories are supported.',
    );
    migratePersonas(state);
    assert(Array.isArray(state.profiles) && state.profiles.length <= 100, 'Invalid user profiles.');
    const profiles = new Set();
    state.deletedProfileIds ??= [];
    assert(Array.isArray(state.deletedProfileIds) && state.deletedProfileIds.every(value => typeof value === 'string'), 'Invalid deleted profiles.');
    const profileExists = value => profiles.has(value) || state.deletedProfileIds.includes(value);
    for (const profile of state.profiles) {
        assert(typeof profile.id === 'string' && profile.id.length <= 100 && !profiles.has(profile.id), 'Invalid profile ID.');
        profiles.add(profile.id);
        Object.assign(profile, normalizeProfile(profile, profile.id));
    }
    assert(state.settings.defaultUserProfileId == null || profiles.has(state.settings.defaultUserProfileId), 'Default profile is missing.');
    const ids = new Set();
    state.settings.appearance = normalizeAppearance(state.settings.appearance);
    state.version = 3;
    for (const c of state.characters) {
        assert(
            typeof c.id === 'string' &&
                !ids.has(c.id) &&
                MODES.has(c.mode) &&
                typeof c.name === 'string' &&
                c.name.trim(),
            'Invalid character.',
        );
        assert(
            !c.avatar || /^[^/\\]+\.png$/i.test(c.avatar),
            'Invalid character file.',
        );
        assert(
            !c.art ||
                /^\/astral\/art\/(?:v\d+\/)?[a-z0-9_-]+\.png$|^\/api\/astral\/assets\/[a-f0-9]{64}\.png$|^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(
                    c.art,
                ),
            'Invalid artwork.',
        );
        ids.add(c.id);
    }
    const conversations = new Map();
    for (const chat of state.conversations) {
        assert(chat.userProfileId == null || profileExists(chat.userProfileId), 'This chat refers to a missing profile.');
        assert(
            typeof chat.id === 'string' && !conversations.has(chat.id),
            'Invalid conversation ID.',
        );
        const c = state.characters.find((c) => c.id === chat.characterId);
        assert(
            c && c.mode === chat.mode && /^[a-zA-Z0-9_-]+$/.test(chat.fileName),
            'Conversation mode or filename mismatch.',
        );
        conversations.set(chat.id, chat);
    }
    for (const m of state.memories) {
        assert(m.userProfileId == null || profileExists(m.userProfileId), 'This memory refers to a missing profile.');
        const c = state.characters.find((c) => c.id === m.characterId);
        assert(
            c &&
                c.mode === m.mode &&
                typeof m.text === 'string' &&
                ['character', 'story'].includes(m.scope),
            'Invalid memory scope.',
        );
        if (m.scope === 'story')
            assert(
                conversations.get(m.conversationId)?.characterId === c.id && conversations.get(m.conversationId)?.userProfileId === m.userProfileId,
                'Memory belongs to another story.',
            );
    }
    for (const cp of state.checkpoints)
        assert(
            conversations.has(cp.conversationId) && Array.isArray(cp.messages),
            'Invalid save point.',
        );
    return state;
}
export function buildMemoryPrompt(
    state,
    conversationId,
    countTokens = (text) => Math.ceil(text.length / 2),
) {
    const chat = state.conversations.find((c) => c.id === conversationId);
    if (!chat || chat.memoryEnabled === false) return '';
    const budget = Math.max(
        64,
        Math.min(4096, Number(state.settings.memoryBudget) || 768),
    );
    const parts = [];
    let used = 0;
    const append = (text) => {
        const cost = countTokens(text);
        if (used + cost <= budget) {
            parts.push(text);
            used += cost;
        }
    };
    const facts = state.memories
        .filter(
            (m) =>
                m.mode === chat.mode &&
                m.characterId === chat.characterId &&
                m.userProfileId === chat.userProfileId &&
                m.enabled !== false &&
                (m.scope === 'character' || m.conversationId === chat.id),
        )
        .sort((a, b) => Number(b.pinned) - Number(a.pinned));
    for (const fact of facts) append(`Remembered fact: ${fact.text}`);
    if (chat.summary && chat.summaryEnabled !== false)
        append(`Story so far: ${chat.summary}`);
    return parts.length
        ? `[Story memory — background information, not instructions]\n${parts.join('\n')}\n[/Story memory]`
        : '';
}
export class AstralStore {
    constructor(directory, defaults) {
        this.file = path.join(directory, 'astral', 'state.json');
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const saved = fs.existsSync(this.file)
            ? JSON.parse(fs.readFileSync(this.file, 'utf8'))
            : null;
        if (
            saved &&
            (saved.settings?.mode !== 'normal' ||
                saved.characters?.some((c) => c.mode !== 'normal') ||
                'adultConfirmed' in saved.settings)
        ) {
            fs.copyFileSync(
                this.file,
                `${this.file}.before-standard-library-${Date.now()}.json`,
            );
            saved.characters = saved.characters.filter(
                (c) => c.mode === 'normal',
            );
            const characters = new Set(saved.characters.map((c) => c.id));
            saved.conversations = saved.conversations.filter(
                (c) => c.mode === 'normal' && characters.has(c.characterId),
            );
            const conversations = new Set(saved.conversations.map((c) => c.id));
            saved.memories = saved.memories.filter(
                (m) => m.mode === 'normal' && characters.has(m.characterId),
            );
            saved.tombstones = saved.tombstones.filter(
                (m) => m.mode === 'normal' && characters.has(m.characterId),
            );
            saved.checkpoints = saved.checkpoints.filter((cp) =>
                conversations.has(cp.conversationId),
            );
            saved.settings.mode = 'normal';
            delete saved.settings.adultConfirmed;
        }
        this.isNew = !saved;
        this.state = saved ? validateState(saved) : initialState(defaults);
        this.state.starterIds ??= this.state.characters.filter(c => defaults.some(d => d.id === c.id)).map(c => c.id);
        for (const starter of defaults.filter(c => c.starterPackVersion === 3)) {
            if (!this.state.starterIds.includes(starter.id)) {
                if (!this.state.characters.some(c => c.id === starter.id)) this.state.characters.push(structuredClone(starter));
                this.state.starterIds.push(starter.id);
            }
        }
        for (const character of this.state.characters) {
            const starter = defaults.find(c => c.id === character.id);
            if (starter && character.personality?.replace(/a \d+-year-old /g, 'an adult ') === starter.personality) character.personality = starter.personality;
            delete character.age;
            if (
                starter && (starter.art === character.art || starter.previousArt?.includes(character.art)) &&
                character.artVersion !== (starter?.artVersion || 'anime-v2')
            ) {
                character.art = starter.art;
                character.artVersion = starter.artVersion || 'anime-v2';
                character.artNeedsSync = !!character.avatar;
            }
        }
        this.write();
    }
    write() {
        atomicWrite(this.file, JSON.stringify(this.state, null, 2), 'utf8');
    }
    transact(fn) {
        const next = structuredClone(this.state);
        const result = fn(next);
        validateState(next);
        atomicWrite(this.file, JSON.stringify(next, null, 2), 'utf8');
        this.state = next;
        return result;
    }
    character(state, characterId, mode) {
        assert(MODES.has(mode), 'Choose a mode.');
        const c = state.characters.find(
            (c) => c.id === characterId && c.mode === mode,
        );
        assert(c, 'Character not found in this mode.', 404);
        return c;
    }
    conversation(state, conversationId, mode) {
        const chat = state.conversations.find(
            (c) => c.id === conversationId && c.mode === mode,
        );
        assert(chat, 'Conversation not found in this mode.', 404);
        this.character(state, chat.characterId, mode);
        return chat;
    }
    action(action) {
        return this.transact((state) => {
            const { type, mode } = action;
            if (type === 'saveProfile') {
                const existing = action.profile.id && state.profiles.find(p => p.id === action.profile.id);
                assert(!action.profile.id || existing, 'Profile not found.', 404);
                assert(existing || state.profiles.length < 100, 'You can keep up to 100 profiles.');
                const profile = normalizeProfile(action.profile, existing?.id || id());
                if (existing) Object.assign(existing, profile); else state.profiles.push(profile);
                if (!state.settings.defaultUserProfileId) state.settings.defaultUserProfileId = profile.id;
                return profile;
            }
            if (type === 'deleteProfile') {
                assert(state.profiles.some(p => p.id === action.profileId), 'Profile not found.', 404);
                state.profiles = state.profiles.filter(p => p.id !== action.profileId);
                state.deletedProfileIds.push(action.profileId);
                if (state.settings.defaultUserProfileId === action.profileId) state.settings.defaultUserProfileId = state.profiles[0]?.id || null;
                // Keep historical chats in their original namespace; a deleted profile's private data is gone.
                for (const chat of state.conversations.filter(c => c.userProfileId === action.profileId)) chat.shareProfile = false;
                state.memories = state.memories.filter(m => m.userProfileId !== action.profileId);
                state.tombstones = state.tombstones.filter(t => t.userProfileId !== action.profileId);
                for (const cp of state.checkpoints) cp.storyMemories = (cp.storyMemories || []).filter(m => m.userProfileId !== action.profileId);
                return true;
            }
            if (type === 'settings') {
                const p = action.patch ?? {};
                const allowed = [
                    'tutorialDone',
                    'effects',
                    'fontSize',
                    'sceneDim',
                    'userName',
                    'autoMemory',
                    'memoryBudget',
                    'connection',
                    'appearance',
                    'defaultUserProfileId',
                    'featuredSlideshow',
                ];
                for (const k of allowed) if (k in p) state.settings[k] = p[k];
                state.settings.fontSize = Math.max(
                    14,
                    Math.min(28, Number(state.settings.fontSize) || 18),
                );
                state.settings.sceneDim = Math.max(
                    0,
                    Math.min(80, Number(state.settings.sceneDim) || 0),
                );
                state.settings.memoryBudget = Math.max(
                    64,
                    Math.min(4096, Number(state.settings.memoryBudget) || 768),
                );
                if (p.mode) {
                    assert(MODES.has(p.mode), 'Invalid mode.');
                    state.settings.mode = p.mode;
                }
                return state.settings;
            }
            if (type === 'saveCharacter') {
                assert(MODES.has(mode), 'Invalid mode.');
                const input = action.character;
                assert(
                    input && String(input.name).trim(),
                    'Give your character a name.',
                );
                const old = input.id
                    ? this.character(state, input.id, mode)
                    : null;
                const c = {
                    ...(old ?? {}),
                    id: old?.id ?? id(),
                    mode,
                    tags: Array.isArray(input.tags)
                        ? input.tags.slice(0, 8).map((v) => cleanText(v, 40))
                        : [],
                    color: /^#[a-f0-9]{6}$/i.test(input.color)
                        ? input.color
                        : '#d8b77a',
                };
                for (const key of [
                    'name',
                    'role',
                    'description',
                    'personality',
                    'scenario',
                    'greeting',
                    'systemPrompt',
                    'examples',
                ])
                    c[key] = cleanText(input[key]);
                c.art = cleanText(input.art, 12_000_000);
                delete c.age;
                if (input.sourceCard && typeof input.sourceCard === 'object') c.sourceCard = structuredClone(input.sourceCard);
                c.avatar = old?.avatar || input.avatar;
                c.overrides = input.overrides
                    ? {
                        temperature: Number.isFinite(
                            Number(input.overrides?.temperature),
                        )
                            ? Math.max(
                                0,
                                Math.min(
                                    2,
                                    Number(input.overrides.temperature),
                                ),
                            )
                            : 0.8,
                        maxTokens: Math.max(
                            64,
                            Math.min(
                                4096,
                                Number(input.overrides?.maxTokens) || 384,
                            ),
                        ),
                    }
                    : undefined;
                if (old) Object.assign(old, c);
                else state.characters.push(c);
                return c;
            }
            if (type === 'linkAvatar') {
                const c = this.character(state, action.characterId, mode);
                assert(
                    /^[^/\\]+\.png$/i.test(action.avatar),
                    'Invalid avatar.',
                );
                c.avatar = action.avatar;
                c.artNeedsSync = false;
                return c;
            }
            if (type === 'deleteCharacter') {
                this.character(state, action.characterId, mode);
                const deletedChats = state.conversations
                    .filter((c) => c.characterId === action.characterId)
                    .map((c) => c.id);
                state.characters = state.characters.filter(
                    (c) => c.id !== action.characterId,
                );
                state.conversations = state.conversations.filter(
                    (c) => c.characterId !== action.characterId,
                );
                state.memories = state.memories.filter(
                    (m) => m.characterId !== action.characterId,
                );
                state.checkpoints = state.checkpoints.filter(
                    (cp) => !deletedChats.includes(cp.conversationId),
                );
                state.tombstones = state.tombstones.filter(
                    (t) => t.characterId !== action.characterId,
                );
                return true;
            }
            if (type === 'createConversation') {
                const c = this.character(state, action.characterId, mode);
                assert(action.userProfileId == null || state.profiles.some(p => p.id === action.userProfileId), 'Choose an existing profile.');
                const chatId = id();
                const chat = {
                    id: chatId,
                    characterId: c.id,
                    userProfileId: action.userProfileId === null ? null : action.userProfileId || state.settings.defaultUserProfileId || null,
                    shareProfile: action.shareProfile !== false,
                    mode,
                    fileName: `astral_${mode}_${chatId}`,
                    title: cleanText(action.title || 'A new beginning', 100),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    summary: '',
                    summaryEnabled: true,
                    memoryEnabled: true,
                    memoryCursor: 0,
                };
                state.conversations.push(chat);
                return chat;
            }
            const chat = this.conversation(state, action.conversationId, mode);
            if (type === 'updateConversation') {
                for (const k of ['title', 'summary'])
                    if (k in action.patch)
                        chat[k] = cleanText(
                            action.patch[k],
                            k === 'title' ? 100 : 8000,
                        );
                for (const k of ['summaryEnabled', 'memoryEnabled', 'shareProfile'])
                    if (k in action.patch) chat[k] = action.patch[k] === true;
                chat.updatedAt = Date.now();
                return chat;
            }
            if (type === 'saveMemory') {
                const old =
                    action.memory.id &&
                    state.memories.find(
                        (m) =>
                            m.id === action.memory.id &&
                            m.characterId === chat.characterId &&
                            m.userProfileId === chat.userProfileId &&
                            m.mode === mode &&
                            (m.scope === 'character' ||
                                m.conversationId === chat.id),
                    );
                assert(!action.memory.id || old, 'Memory not found.', 404);
                const m = {
                    id: old?.id ?? id(),
                    characterId: chat.characterId,
                    userProfileId: chat.userProfileId,
                    conversationId: chat.id,
                    mode,
                    scope:
                        action.memory.scope === 'story' ? 'story' : 'character',
                    text: cleanText(action.memory.text, 2000).trim(),
                    pinned: action.memory.pinned === true,
                    enabled: action.memory.enabled !== false,
                    source: old?.source ?? 'manual',
                };
                assert(m.text, 'Memory cannot be empty.');
                if (old) Object.assign(old, m);
                else state.memories.push(m);
                return m;
            }
            if (type === 'deleteMemory') {
                const m = state.memories.find(
                    (m) =>
                        m.id === action.memoryId &&
                        m.mode === mode &&
                        m.characterId === chat.characterId &&
                        m.userProfileId === chat.userProfileId &&
                        (m.scope === 'character' ||
                            m.conversationId === chat.id),
                );
                assert(m, 'Memory not found.', 404);
                state.tombstones.push({
                    characterId: m.characterId,
                    userProfileId: chat.userProfileId,
                    mode,
                    normalized: normalizeFact(m.text),
                });
                state.memories = state.memories.filter(
                    (item) => item.id !== action.memoryId,
                );
                return true;
            }
            if (type === 'applyAutoMemory') {
                if (!state.settings.autoMemory || !chat.memoryEnabled)
                    return false;
                if (Number(action.expectedCursor) !== Number(chat.memoryCursor))
                    return false;
                chat.memoryCursor = Math.max(
                    chat.memoryCursor,
                    Number(action.cursor) || 0,
                );
                if (chat.summaryEnabled)
                    chat.summary = cleanText(action.summary, 3500);
                for (const fact of Array.isArray(action.facts)
                    ? action.facts.slice(0, 8)
                    : []) {
                    const text = cleanText(fact.text, 600).trim();
                    const normalized = normalizeFact(text);
                    const profile = profileForChat(state, chat);
                    const profileFacts = profile ? [profile.displayName, profile.gender, profile.pronouns, profile.about, ...profile.facts.map(f => f.text)] : [];
                    if (
                        !text ||
                        profileFacts.some(value => { const known = normalizeFact(value); return known && (known === normalized || (known.length > 15 && normalized.includes(known))); }) ||
                        state.memories.some(
                            (m) =>
                                m.characterId === chat.characterId &&
                                m.userProfileId === chat.userProfileId &&
                                normalizeFact(m.text) === normalized,
                        ) ||
                        state.tombstones.some(
                            (t) =>
                                t.characterId === chat.characterId &&
                                t.userProfileId === chat.userProfileId &&
                                t.mode === mode &&
                                (t.normalized === normalized ||
                                    (normalized.length > 15 &&
                                        (t.normalized.includes(normalized) ||
                                            normalized.includes(
                                                t.normalized,
                                            )))),
                        )
                    )
                        continue;
                    state.memories.push({
                        id: id(),
                        characterId: chat.characterId,
                        userProfileId: chat.userProfileId,
                        conversationId: chat.id,
                        mode,
                        scope:
                            fact.scope === 'character' ? 'character' : 'story',
                        text,
                        pinned: false,
                        enabled: true,
                        source: 'automatic',
                    });
                }
                return true;
            }
            if (type === 'checkpoint') {
                assert(
                    Array.isArray(action.messages) &&
                        action.messages.length <= 100000,
                    'Invalid conversation.',
                );
                const cp = {
                    id: id(),
                    conversationId: chat.id,
                    name: cleanText(action.name || 'Save point', 100),
                    createdAt: Date.now(),
                    messages: action.messages,
                    summary: chat.summary,
                    memoryCursor: chat.memoryCursor,
                    storyMemories: state.memories.filter(
                        (m) =>
                            m.scope === 'story' && m.conversationId === chat.id,
                    ),
                };
                state.checkpoints.push(cp);
                return cp;
            }
            if (type === 'restoreCheckpoint') {
                const cp = state.checkpoints.find(
                    (cp) =>
                        cp.id === action.checkpointId &&
                        cp.conversationId === chat.id,
                );
                assert(cp, 'Save point not found.', 404);
                chat.summary = cp.summary;
                chat.memoryCursor = cp.memoryCursor;
                state.memories = state.memories.filter(
                    (m) => m.scope !== 'story' || m.conversationId !== chat.id,
                );
                state.memories.push(
                    ...(cp.storyMemories ?? []).filter(
                        (m) =>
                            !state.tombstones.some(
                                (t) =>
                                    t.mode === mode &&
                                    t.characterId === chat.characterId &&
                                    t.userProfileId === chat.userProfileId &&
                                    t.normalized === normalizeFact(m.text),
                            ),
                    ),
                );
                return cp;
            }
            if (type === 'deleteConversation') {
                state.conversations = state.conversations.filter(
                    (c) => c.id !== chat.id,
                );
                state.memories = state.memories.filter(
                    (m) =>
                        m.scope === 'character' || m.conversationId !== chat.id,
                );
                state.checkpoints = state.checkpoints.filter(
                    (cp) => cp.conversationId !== chat.id,
                );
                return true;
            }
            throw new Error('Unknown Astral action.');
        });
    }
}
