import React, { useEffect, useRef, useState, useId } from 'react';
import { Modal, IconButton , FileButton } from "./components";
import { createRoot } from 'react-dom/client';
import {
    BookOpen,
    MessageCircle,
    Brain,
    Cpu,
    SlidersHorizontal,
    CircleHelp,
    Plus,
    ArrowUpRight,
    ArrowRight,
    ArrowLeft,
    ChevronDown,
    Check,
    X,
    Search,
    Sparkles,
    Download,
    Play,
    Square,
    Upload,
    MoreHorizontal,
    Pencil,
    Copy,
    Trash2,
    RotateCcw,
    Bookmark,
    PanelRightOpen,
    Pin,
    Eye,
    EyeOff,
    FolderOpen,
    ShieldCheck,
    HardDrive,
    LoaderCircle,
    FileDown,
    Settings2,
    Menu,
    Star,
} from 'lucide-react';
import { AppearanceControls, Credits, appearanceStyle, SceneBackground } from './appearance';
import { DraftDialog, ImportWizard } from './character-tools';
import { ProfilesPage, ProfilePreview, profileName } from './profiles';
import { FeaturedCast } from './featured';
import { RuntimeSetup } from './runtimes';
import type { RuntimeStatus } from './types';
import { GroupedModels } from './grouped-models';
import { normalizeAppearance, themeTokens } from '../shared/appearance';
import type { Appearance, ImageAttachment } from './types';
import { request, requestBlob, action, downloadBlob, readFile } from './api';
import { SillyTavernBridge, characterCard } from './bridge';
import { modelPreset } from './model-presets';
import type {
    State,
    Character,
    Conversation,
    Memory,
    Runner,
    Model,
    Hardware,
    Screen,
    Message,
} from './types';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './style.css';
import './v2.css';
import './v3.css';
import './theme.css';

const bridge = new SillyTavernBridge();
window.astralBridge = bridge;
const nav: { id: Screen; title: string; icon: typeof BookOpen }[] = [
    { id: 'characters', title: 'Characters', icon: BookOpen },
    { id: 'chat', title: 'Chats', icon: MessageCircle },
    { id: 'memory', title: 'Memory', icon: Brain },
    { id: 'models', title: 'Models', icon: Cpu },
    { id: 'profiles', title: 'Profiles', icon: BookOpen },
    { id: 'appearance', title: 'Appearance', icon: SlidersHorizontal },
    { id: 'help', title: 'Help', icon: CircleHelp },
];
const bytes = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const date = (n: number) => new Date(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function Text({ value }: { value: string }) {
    return (
        <>
            {value
                .split(/(\*[^*]+\*)/g)
                .map((part, i) =>
                    part.startsWith('*') && part.endsWith('*') ? (
                        <em key={i}>{part.slice(1, -1)}</em>
                    ) : (
                        <React.Fragment key={i}>{part}</React.Fragment>
                    ),
                )}
        </>
    );
}
function Brand() {
    return (
        <span className="brand">
            <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 40 40">
                    <path
                        d="M20 2C22 14 26 18 38 20C26 22 22 26 20 38C18 26 14 22 2 20C14 18 18 14 20 2Z"
                        fill="currentColor"
                    />
                    <circle cx="32" cy="7" r="2" fill="currentColor" />
                </svg>
            </span>
            <span>
                astral<span className="brand-ai">.ai</span>
            </span>
        </span>
    );
}
function App() {
    const [state, setState] = useState<State | null>(null);
    const [ready, setReady] = useState(false);
    const [screen, setScreen] = useState<Screen>('characters');
    const [models, setModels] = useState<Model[]>([]);
    const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
    const [runner, setRunner] = useState<Runner>({
        state: 'stopped',
        url: '',
        modelId: '',
        error: '',
        backend: '',
        log: '',
    });
    const [machine, setMachine] = useState<Hardware | null>(null);
    const [activeId, setActiveId] = useState('');
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState('');
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [editor, setEditor] = useState<Character | null>(null);
    const [welcome, setWelcome] = useState(false);
    const [tutorial, setTutorial] = useState<number | null>(null);
    const [mobileNav, setMobileNav] = useState(false);
    const [confirm, setConfirm] = useState<{
        title: string;
        text: string;
        task: () => Promise<unknown>;
    } | null>(null);
    const [memoryEditor, setMemoryEditor] = useState<Partial<Memory> | null>(null);
    const [checkpoint, setCheckpoint] = useState(false);
    const [showSaves, setShowSaves] = useState(false);
    const [tick, setTick] = useState(0);
    const initialized = useRef(false);
    const [credits, setCredits] = useState(false);
    const [importing, setImporting] = useState(false);
    const [dialogueCreator, setDialogueCreator] = useState(false);
    const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
    useEffect(() => {
        const media = matchMedia('(prefers-color-scheme: dark)');
        const update = () => setSystemDark(media.matches);
        media.addEventListener('change', update);
        return () => { media.removeEventListener('change', update); };
    }, []);
    useEffect(() => {
        if (ready) return window.astralDesktop?.onActivated(() => setToast('Astral is already open.'));
    }, [ready]);
    const backupInput = useRef<HTMLInputElement>(null);
    useEffect(() => { if (state) window.astralDesktop?.libraryReady(); }, [!!state]);
    const reload = async () => {
        const next = await request<State>('/api/astral/state');
        setState(next);
        return next;
    };
    const refreshModels = async () => {
        const next = await request<{ models: Model[]; runner: Runner; runtimes: RuntimeStatus[] }>('/api/astral/models');
        setModels(next.models);
        setRunner(next.runner);
        setRuntimes(next.runtimes || []);
    };
    const run = async (task: () => Promise<unknown>, message = '') => {
        setError('');
        setBusy(true);
        try {
            await task();
            if (message) setToast(message);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const patchQueue = useRef<Promise<unknown>>(Promise.resolve());
    const patchRevision = useRef(0);
    const patch = async (value: Partial<State['settings']>) => {
        const revision = ++patchRevision.current;
        setState((previous) =>
            previous ? { ...previous, settings: { ...previous.settings, ...value } } : previous,
        );
        const pending = patchQueue.current.catch(() => {}).then(async () => {
            await action({ type: 'settings', patch: value });
            if (revision === patchRevision.current) await reload();
        });
        patchQueue.current = pending;
        try { await pending; } catch (error) { if (revision === patchRevision.current) await reload(); throw error; }
    };
    const updateStory = async (chat: Conversation, value: Partial<Conversation>) => {
        setState((previous) =>
            previous
                ? {
                      ...previous,
                      conversations: previous.conversations.map((c) =>
                          c.id === chat.id ? { ...c, ...value } : c,
                      ),
                  }
                : previous,
        );
        try {
            await action({
                type: 'updateConversation',
                mode: chat.mode,
                conversationId: chat.id,
                patch: value,
            });
            await reload();
        } catch (error) {
            await reload();
            throw error;
        }
    };
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        void reload()
            .then((s) => setWelcome(!s.settings.tutorialDone))
            .catch((e) => setError(e.message));
        void refreshModels().catch((e) => setError(e.message));
        void request<Hardware>('/api/astral/hardware')
            .then(setMachine)
            .catch(() => {});
        void bridge
            .init()
            .then(() => setReady(true))
            .catch((e) => setError(e.message));
        const unsub = bridge.subscribe(() => setTick((n) => n + 1));
        return unsub;
    }, []);
    useEffect(() => {
        const timer = setInterval(
            () => {
                void refreshModels().catch(() => {});
            },
            models.some((m) => ['downloading', 'verifying'].includes(m.downloadState ?? '')) ||
                runner.state === 'loading' || runtimes.some(r => ['downloading', 'verifying', 'installing'].includes(r.state))
                ? 1200
                : 4000,
        );
        return () => clearInterval(timer);
    }, [models.some((m) => ['downloading', 'verifying'].includes(m.downloadState ?? '')), runner.state, runtimes.some(r => ['downloading', 'verifying', 'installing'].includes(r.state))]);
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(t);
    }, [toast]);
    const current = state?.conversations.find((c) => c.id === activeId);
    const character = state?.characters.find((c) => c.id === current?.characterId);
    const mode = state?.settings.mode ?? 'normal';
    const characters = state?.characters.filter((c) => c.mode === mode) ?? [];
    const conversations =
        state?.conversations.filter((c) => c.mode === mode).sort((a, b) => b.updatedAt - a.updatedAt) ?? [];
    const navigationVersion = useRef(0);
    const chooseScreen = (id: Screen) => {
        navigationVersion.current++;
        setScreen(id);
        setMobileNav(false);
    };
    const openStory = async (c: Character, chat?: Conversation) => {
        const openingVersion = ++navigationVersion.current;
        if (!ready) throw new Error('The roleplay engine is still starting. Try again in a moment.');
        const story =
            chat ??
            (await action<Conversation>({
                type: 'createConversation',
                mode,
                characterId: c.id,
                userProfileId: state?.settings.defaultUserProfileId || null,
                title: `${c.name} · Chapter ${conversations.filter((x) => x.characterId === c.id).length + 1}`,
            }));
        await bridge.open(c, story, state || undefined);
        setActiveId(story.id);
        await reload();
        if (openingVersion === navigationVersion.current) setScreen('chat');
    };
    const openStoryWithProfile = async (c: Character, profileId: string | null) => {
        const chat = await action<Conversation>({ type: 'createConversation', mode, characterId: c.id, userProfileId: profileId, title: `${c.name} · New chat` });
        await openStory(c, chat);
    };
    const modelAction = async (actionName: string, modelId = '', options?: unknown) => {
        await request('/api/astral/models', {
            action: actionName,
            modelId,
            options,
        });
        await refreshModels();
    };
    const finishTutorial = async () => {
        setWelcome(false);
        setTutorial(null);
        await patch({ tutorialDone: true });
    };
    const saveCharacter = async (c: Character) => {
        await bridge.saveCharacter(c);
        await reload();
        setEditor(null);
        setToast('Character saved.');
    };
    const memoryList =
        state?.memories.filter(
            (m) =>
                current &&
                m.mode === mode &&
                m.characterId === current.characterId &&
                m.userProfileId === current.userProfileId &&
                (m.scope === 'character' || m.conversationId === current.id),
        ) ?? [];
    if (!state)
        return (
            <div className="boot">
                <Brand />
                <p>{error || 'Starting Astral…'}</p>
                {error && (
                    <button className="button" onClick={() => location.reload()}>
                        Try again
                    </button>
                )}
            </div>
        );
    return (
        <div
            className={`app ${mobileNav ? 'nav-open' : ''}`}
            data-screen={screen}
            data-density={state.settings.appearance.density}
            data-background={state.settings.appearance.backgroundMode}
            data-theme={state.settings.appearance.theme === 'system' ? (systemDark ? 'forest' : 'paper') : state.settings.appearance.theme}
            data-effects={state.settings.effects}
            style={
                {
                    ...appearanceStyle(normalizeAppearance(state.settings.appearance) as Appearance, state.settings.fontSize, state.settings.sceneDim, systemDark),
                } as React.CSSProperties
            }
        >
            <aside className="sidebar">
                <a
                    className="brand-link"
                    href="#characters"
                    onClick={(e) => {
                        e.preventDefault();
                        chooseScreen('characters');
                    }}
                    aria-label="Astral home"
                >
                    <Brand />
                </a>
                <div className="workspace-label">
                    <span className="tiny-orbit" /> Local character chat, made simple.
                </div>
                <nav aria-label="Main navigation">
                    {nav.slice(0, 3).map(({ id, title, icon: Icon }) => (
                        <button
                            className={`nav-item ${screen === id ? 'active' : ''}`}
                            key={id}
                            aria-label={title}
                            onClick={() => chooseScreen(id)}
                        >
                            <Icon size={19} />
                            {title}
                            {id === 'chat' && conversations.length > 0 && (
                                <span className="nav-count">{conversations.length}</span>
                            )}
                        </button>
                    ))}
                </nav>
                <div className="sidebar-rule" />
                <div className="nav-caption">Settings</div>
                <nav aria-label="Settings">
                    {nav.slice(3).map(({ id, title, icon: Icon }) => (
                        <button
                            className={`nav-item ${screen === id ? 'active' : ''}`}
                            key={id}
                            aria-label={title}
                            onClick={() => chooseScreen(id)}
                        >
                            <Icon size={19} />
                            {title}
                        </button>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    <button className="connection-card" onClick={() => chooseScreen('models')}>
                        <span
                            className={`status-dot ${runner.state === 'ready' ? 'online' : runner.state === 'loading' ? 'loading' : ''}`}
                        />
                        <span>
                            <strong>
                                {runner.state === 'ready'
                                    ? 'Local model ready'
                                    : runner.state === 'loading'
                                      ? 'Loading your model'
                                      : state.settings.connection.kind !== 'managed'
                                        ? 'External connection'
                                        : 'Connect your first model'}
                            </strong>
                            <small>
                                {runner.state === 'ready'
                                    ? 'Running on your computer'
                                    : 'Start here, then choose a character'}
                            </small>
                        </span>
                        <ArrowUpRight size={15} />
                    </button>
                    <button className="credits-button" onClick={() => setCredits(true)}>Credits</button>
                    <div className="sidebar-footer">
                        <span>Astral.AI</span>
                        <span>
                            v{__ASTRAL_VERSION__}
                        </span>
                    </div>
                </div>
            </aside>
            {mobileNav && (
                <button
                    className="nav-scrim"
                    aria-label="Close navigation"
                    onClick={() => setMobileNav(false)}
                />
            )}
            <main>
                <header className="topbar">
                    <div className="breadcrumb">
                        <IconButton
                            label="Toggle navigation"
                            className="icon-button mobile-menu"
                            onClick={() => setMobileNav(!mobileNav)}
                        >
                            <Menu size={20} />
                        </IconButton>
                        <span>Astral</span>
                        <span className="slash">/</span>
                        <strong>{nav.find((n) => n.id === screen)?.title}</strong>
                    </div>
                    <div className="topbar-right">
                        <span className="private-label">
                            <ShieldCheck size={14} /> Private & local
                        </span>
                    </div>
                </header>
                {error && (
                    <div className="error-banner" role="alert">
                        <span>{error}</span>
                        <IconButton label="Dismiss error" onClick={() => setError('')}>
                            <X size={17} />
                        </IconButton>
                    </div>
                )}
                {screen === 'characters' && (
                    <section className="page library">
                        <div className="page-heading">
                            <div>
                                <div className="eyebrow">THE CAST</div>
                                <h1>Who will you meet today?</h1>
                                <p>Pick a character. Set the scene. See where the conversation goes.</p>
                            </div>
                            <div className="library-create-actions"><button
                                className="button secondary"
                                onClick={() =>
                                    setEditor({
                                        id: '',
                                        name: '',
                                        role: 'Your character',
                                        mode,
                                        color: '#d8b77a',
                                        tags: [],
                                        description: '',
                                        personality: '',
                                        scenario: '',
                                        greeting: '',
                                        systemPrompt: '',
                                        examples: '',
                                        art: '',
                                    })
                                }
                            >
                                <Plus size={17} /> Create character
                            </button>
                            <button className="button secondary" onClick={() => setDialogueCreator(true)} disabled={!ready || busy}><Sparkles size={17} /> Create from dialogue</button></div>
                        </div>
                        <div className="library-profile"><label>Chat as<select value={state.settings.defaultUserProfileId || ''} onChange={e => void run(() => patch({ defaultUserProfileId: e.target.value || null }))}><option value="">No profile</option>{state.profiles.map(p => <option key={p.id} value={p.id}>{p.displayName || 'Unnamed profile'}</option>)}</select></label><button className="text-button" onClick={() => setScreen('profiles')}>Manage profiles</button></div>
                        <FeaturedCast characters={characters} conversations={conversations.filter(c => c.userProfileId === state.settings.defaultUserProfileId)} ready={ready && !busy} playing={state.settings.featuredSlideshow} setPlaying={value => void run(() => patch({ featuredSlideshow: value }))} open={(c, chat) => void run(() => openStory(c, chat))} />
                        <div className="section-heading">
                            <div>
                                <h2>
                                    Character library{' '}
                                    <span className="muted-count">
                                        {characters.length.toString().padStart(2, '0')}
                                    </span>
                                </h2>
                                <p>Start with the cast, or add a character.</p>
                            </div>
                            <div className="library-tools">
                                <label className="search">
                                    <Search size={15} />
                                    <input
                                        aria-label="Search characters"
                                        placeholder="Find a character…"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </label>
                                <button
                                    className="text-button"
                                    onClick={() => setImporting(true)}
                                    disabled={!ready}
                                >
                                    <Upload size={15} /> Import character
                                </button>
                            </div>
                        </div>
                        <div className="character-grid">
                            {characters
                                .filter((c) =>
                                    `${c.name} ${c.tags.join(' ')} ${c.role}`
                                        .toLowerCase()
                                        .includes(query.toLowerCase()),
                                )
                                .map((c) => (
                                    <article className="character-card" key={c.id}>
                                        <button
                                            className="card-image"
                                            onClick={() =>
                                                void run(() =>
                                                    openStory(
                                                        c,
                                                        conversations.find((x) => x.characterId === c.id && x.userProfileId === state.settings.defaultUserProfileId),
                                                    ),
                                                )
                                            }
                                            disabled={!ready || busy}
                                            aria-label={`Start a story with ${c.name}`}
                                        >
                                            <Art character={c} />
                                            <span className="card-role">{c.role}</span>
                                            <span className="card-enter">
                                                <ArrowUpRight size={18} />
                                            </span>
                                        </button>
                                        <div className="card-body">
                                            <div className="card-name">
                                                <h3>
                                                    {c.name}
                                                </h3>
                                                <IconButton
                                                    label={`Edit ${c.name}`}
                                                    onClick={() => setEditor(c)}
                                                >
                                                    <MoreHorizontal size={19} />
                                                </IconButton>
                                            </div>
                                            <p>{c.description}</p>
                                            <div className="tags">
                                                {c.tags.slice(0, 2).map((t) => (
                                                    <span key={t}>{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </article>
                                ))}
                        </div>
                        {!characters.length && (
                            <div className="empty">
                                <BookOpen />
                                <h2>No characters yet</h2>
                                <p>Create a character or import a SillyTavern card.</p>
                            </div>
                        )}
                        <div className="library-footnote">
                            <Sparkles size={14} />
                            <span>
                                Every character is a starting point. Change their world, their personality, or
                                make someone entirely your own.
                            </span>
                            <button className="text-button" onClick={() => setTutorial(0)}>
                                Show me around <ArrowRight size={14} />
                            </button>
                        </div>
                    </section>
                )}
                {screen === 'chat' &&
                    (!current || !character ? (
                        <section className="page">
                            <PageTitle
                                eyebrow=""
                                title="Chats"
                                description="Continue a chat or start a new one."
                            />
                            <div className="story-list">
                                {conversations.map((chat) => {
                                    const c = state.characters.find((c) => c.id === chat.characterId)!;
                                    return (
                                        <button
                                            className="story-row"
                                            key={chat.id}
                                            onClick={() => void run(() => openStory(c, chat))}
                                            disabled={busy || !ready}
                                        >
                                            <span className="story-thumb">
                                                <Art character={c} />
                                            </span>
                                            <span>
                                                <strong>{chat.title}</strong>
                                                <small>
                                                    {c.name} · {profileName(state, chat.userProfileId)} · {date(chat.updatedAt)}
                                                </small>
                                            </span>
                                            <ArrowUpRight size={19} />
                                        </button>
                                    );
                                })}
                            </div>
                            {!conversations.length && (
                                <div className="empty">
                                    <MessageCircle />
                                    <h2>No chats yet</h2>
                                    <p>Choose a character to start a conversation.</p>
                                    <button className="button" onClick={() => setScreen('characters')}>
                                        Meet the characters <ArrowRight size={16} />
                                    </button>
                                </div>
                            )}
                        </section>
                    ) : (
                        <ChatScene
                            character={character}
                            conversation={current}
                            onProfileChange={profileId => void run(() => openStoryWithProfile(character, profileId))}
                            onSharingChange={value => void run(() => updateStory(current, { shareProfile: value }))}
                            messages={bridge.messages}
                            generating={bridge.generating}
                            remembering={bridge.remembering}
                            busy={busy}
                            state={state}
                            runner={runner}
                            onSend={(text, attachments) =>
                                void run(async () => {
                                    await bridge.send(text, state, runner, false, attachments);
                                    const s = await reload();
                                    const chat = s.conversations.find((c) => c.id === activeId)!;
                                    bridge.remember(s, chat, () => void reload());
                                })
                            }
                            onRegenerate={() =>
                                void run(async () => {
                                    await bridge.send('', state, runner, true);
                                    await reload();
                                })
                            }
                            onStop={() => bridge.stop()}
                            onMemory={() => setScreen('memory')}
                            onSave={() => setCheckpoint(true)}
                            onSaves={() => setShowSaves(true)}
                            onEdit={(i, text) => void run(() => bridge.editMessage(i, text))}
                            onDelete={(i) =>
                                setConfirm({
                                    title: 'Delete this message?',
                                    text: 'This removes the message from the saved conversation.',
                                    task: () => bridge.deleteMessage(i),
                                })
                            }
                            onNew={() => void run(() => openStory(character))}
                            onBack={() => {
                                setActiveId('');
                                setScreen('chat');
                            }}
                        />
                    ))}
                {screen === 'memory' && (
                    <section className="page">
                        <PageTitle
                            eyebrow=""
                            title="Memory"
                            description="Review saved facts and summaries for each chat."
                        />
                        <StorySelect
                            conversations={conversations}
                            value={activeId}
                            onSelect={(chat) =>
                                void run(() =>
                                    openStory(
                                        state.characters.find((c) => c.id === chat.characterId)!,
                                        chat,
                                    ).then(() => setScreen('memory')),
                                )
                            }
                        />
                        {current ? (
                            <>
                                <div className="memory-controls">
                                    <Toggle
                                        checked={current.memoryEnabled}
                                        onChange={(v) =>
                                            void run(() => updateStory(current, { memoryEnabled: v }))
                                        }
                                        label="Use memory in this story"
                                        description="When off, neither facts nor the story summary enter the prompt."
                                    />
                                    <Toggle
                                        checked={state.settings.autoMemory}
                                        onChange={(v) => void run(() => patch({ autoMemory: v }))}
                                        label="Remember automatically"
                                        description="Updates between replies using your current model."
                                    />
                                </div>
                                <div className="section-heading">
                                    <div>
                                        <h2>
                                            Remembered facts{' '}
                                            <span className="muted-count">{memoryList.length}</span>
                                        </h2>
                                        <p>
                                            Character facts follow this character within your profile. Story facts stay in this chat.
                                        </p>
                                    </div>
                                    <button
                                        className="button secondary"
                                        onClick={() =>
                                            setMemoryEditor({
                                                scope: 'character',
                                                text: '',
                                                enabled: true,
                                                pinned: false,
                                            })
                                        }
                                    >
                                        <Plus size={16} /> Add memory
                                    </button>
                                </div>
                                <div className="memory-grid">
                                    {memoryList.map((m) => (
                                        <article
                                            className={`memory-card ${!m.enabled ? 'disabled-memory' : ''}`}
                                            key={m.id}
                                        >
                                            <div className="memory-meta">
                                                <span>
                                                    {m.pinned && <Pin size={12} />}{' '}
                                                    {m.scope === 'character'
                                                        ? 'About the character'
                                                        : 'This story'}{' '}
                                                    ·{' '}
                                                    {m.source === 'automatic'
                                                        ? 'Remembered'
                                                        : 'Written by you'}
                                                </span>
                                                <IconButton
                                                    label="Edit memory"
                                                    onClick={() => setMemoryEditor(m)}
                                                >
                                                    <Pencil size={15} />
                                                </IconButton>
                                            </div>
                                            <p>{m.text}</p>
                                            <div className="memory-actions">
                                                <button
                                                    className="text-button"
                                                    onClick={() =>
                                                        void run(async () => {
                                                            await action({
                                                                type: 'saveMemory',
                                                                mode,
                                                                conversationId: current.id,
                                                                memory: { ...m, pinned: !m.pinned },
                                                            });
                                                            await reload();
                                                        })
                                                    }
                                                >
                                                    <Pin size={13} />
                                                    {m.pinned ? 'Pinned' : 'Pin'}
                                                </button>
                                                <button
                                                    className="text-button"
                                                    onClick={() =>
                                                        void run(async () => {
                                                            await action({
                                                                type: 'saveMemory',
                                                                mode,
                                                                conversationId: current.id,
                                                                memory: { ...m, enabled: !m.enabled },
                                                            });
                                                            await reload();
                                                        })
                                                    }
                                                >
                                                    {m.enabled ? <Eye size={13} /> : <EyeOff size={13} />}{' '}
                                                    {m.enabled ? 'In use' : 'Paused'}
                                                </button>
                                                <IconButton
                                                    label="Delete memory"
                                                    onClick={() =>
                                                        setConfirm({
                                                            title: 'Forget this memory?',
                                                            text: 'It will be removed from future prompts and excluded from automatic memory suggestions.',
                                                            task: async () => {
                                                                await bridge.cancelBackground();
                                                                await action({
                                                                    type: 'deleteMemory',
                                                                    mode,
                                                                    conversationId: current.id,
                                                                    memoryId: m.id,
                                                                });
                                                                await reload();
                                                            },
                                                        })
                                                    }
                                                >
                                                    <Trash2 size={14} />
                                                </IconButton>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                                {!memoryList.length && (
                                    <div className="empty compact">
                                        <Brain />
                                        <h3>No memories yet.</h3>
                                        <p>
                                            Add a fact here, or turn on automatic memory to save details from your chats.
                                        </p>
                                    </div>
                                )}
                                <SummaryEditor
                                    conversation={current}
                                    onSave={(summary) =>
                                        void run(async () => {
                                            await bridge.cancelBackground();
                                            await action({
                                                type: 'updateConversation',
                                                mode,
                                                conversationId: current.id,
                                                patch: { summary },
                                            });
                                            await reload();
                                        }, 'Summary saved.')
                                    }
                                    onToggle={(value) =>
                                        void run(() => updateStory(current, { summaryEnabled: value }))
                                    }
                                />
                                <details className="advanced">
                                    <summary>
                                        <Settings2 size={16} /> Advanced memory settings{' '}
                                        <ChevronDown size={16} />
                                    </summary>
                                    <label>
                                        Memory budget: {state.settings.memoryBudget} tokens
                                        <input
                                            type="range"
                                            min="128"
                                            max="2048"
                                            step="128"
                                            value={state.settings.memoryBudget}
                                            onChange={(e) =>
                                                void run(() =>
                                                    patch({ memoryBudget: Number(e.target.value) }),
                                                )
                                            }
                                        />
                                    </label>
                                    <p>
                                        Pinned facts take priority. Memory shares the model's context with
                                        your conversation.
                                    </p>
                                </details>
                            </>
                        ) : (
                            <div className="empty">
                                <Brain />
                                <h2>Choose a story to look back on.</h2>
                                <p>Memory belongs to a character and a conversation.</p>
                            </div>
                        )}
                    </section>
                )}
                {screen === 'models' && (
                    <ModelsPage
                        models={models}
                        runtimes={runtimes}
                        refresh={refreshModels}
                        runner={runner}
                        machine={machine}
                        state={state}
                        busy={busy}
                        run={run}
                        patch={patch}
                        act={modelAction}
                    />
                )}
                {screen === 'profiles' && <ProfilesPage state={state} bridge={bridge} reload={reload} patch={patch} run={run} />}
                {screen === 'appearance' && (
                    <section className="page settings-page">
                        <PageTitle
                            eyebrow=""
                            title="Appearance"
                            description="Choose colors, fonts, and how your chats look."
                        />
                        <AppearanceControls value={state.settings.appearance} preview={appearance => setState(previous => previous ? { ...previous, settings: { ...previous.settings, appearance } } : previous)} save={appearance => patch({ appearance })} />
                        <div className="settings-section">
                            <h2>Text & effects</h2>
                            <label>
                                Dialogue size <span>{state.settings.fontSize}px</span>
                                <input
                                    type="range"
                                    min="14"
                                    max="28"
                                    value={state.settings.fontSize}
                                    onChange={(e) =>
                                        setState({
                                            ...state,
                                            settings: {
                                                ...state.settings,
                                                fontSize: Number(e.target.value),
                                            },
                                        })
                                    }
                                    onPointerUp={(e) =>
                                        void run(() => patch({ fontSize: Number(e.currentTarget.value) }))
                                    }
                                    onKeyUp={(e) =>
                                        void run(() => patch({ fontSize: Number(e.currentTarget.value) }))
                                    }
                                />
                            </label>
                            <label>
                                Background dimming <span>{state.settings.sceneDim}%</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="80"
                                    value={state.settings.sceneDim}
                                    onChange={(e) =>
                                        setState({
                                            ...state,
                                            settings: {
                                                ...state.settings,
                                                sceneDim: Number(e.target.value),
                                            },
                                        })
                                    }
                                    onPointerUp={(e) =>
                                        void run(() => patch({ sceneDim: Number(e.currentTarget.value) }))
                                    }
                                    onKeyUp={(e) =>
                                        void run(() => patch({ sceneDim: Number(e.currentTarget.value) }))
                                    }
                                />
                            </label>
                            <label>
                                Visual effects
                                <select
                                    value={state.settings.effects}
                                    onChange={(e) =>
                                        void run(() =>
                                            patch({
                                                effects: e.target.value as State['settings']['effects'],
                                            }),
                                        )
                                    }
                                >
                                    <option value="off">Off · save GPU resources</option>
                                    <option value="subtle">Subtle · still art & soft transitions</option>
                                    <option value="full">Full · ambient shaders & liquid surfaces</option>
                                </select>
                            </label>
                            <p>
                                Animations respect your system's reduced-motion preference and pause during
                                generation.
                            </p>
                            <button
                                className="text-button"
                                onClick={() =>
                                    void run(() => patch({ fontSize: 18, sceneDim: 25, effects: 'subtle' }))
                                }
                            >
                                <RotateCcw size={15} /> Reset appearance
                            </button>
                        </div>
                        <div className="settings-section">
                            <h2>Backups</h2>
                            <p>
                                Back up characters, conversations, memories, and settings. Model downloads
                                stay separate.
                            </p>
                            <div className="button-row">
                                <a className="button secondary" href="/api/astral/backup-zip" download="Astral-backup.astral.zip">
                                    <FileDown size={16} /> Export backup
                                </a>
                                <button
                                    className="button secondary"
                                    onClick={() => backupInput.current?.click()}
                                >
                                    <Upload size={16} /> Restore backup
                                </button>
                                {window.astralDesktop && (
                                    <button
                                        className="text-button"
                                        onClick={() => void window.astralDesktop?.openDataFolder()}
                                    >
                                        <FolderOpen size={16} /> Open data folder
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>
                )}
                {screen === 'help' && (
                    <section className="page help-page">
                        <PageTitle
                            eyebrow=""
                            title="Help"
                            description="Set up a model, start a chat, or get help with a problem."
                        />
                        <div className="guide-intro">
                            <div>
                                <h2>Start your first chat</h2>
                                <p>
                                    We'll check your computer, help you choose a model, and introduce you to
                                    your first character.
                                </p>
                                <button className="button" onClick={() => setTutorial(0)}>
                                    Take the guided tour <ArrowRight size={16} />
                                </button>
                            </div>
                            <span className="guide-orbit">
                                <Sparkles size={46} />
                            </span>
                        </div>
                        {[
                            [
                                'What is a local model?',
                                'A model is the part that writes the replies. It runs on your computer, so after downloading it you can chat without sending messages to a cloud service. Larger models need more RAM and GPU memory.',
                            ],
                            [
                                'Which model should I choose?',
                                'Start with the recommendation shown in Models for your graphics memory and system RAM. The model manager suggests settings for your hardware; you can also link a GGUF file or connect a local runner.',
                            ],
                            [
                                'How do I use LM Studio or KoboldCpp?',
                                'Enable the local server in your runner. In Models, open “Connect an existing runner”, choose the API type, enter its local URL, and test it. For OpenAI-compatible servers, select the loaded model ID.',
                            ],
                            [
                                'How are replies guided?',
                                'Included characters use non-explicit story prompts. You can edit their personalities, scenes, and instructions. Local models can still produce unexpected content; prompts are not a guaranteed content filter.',
                            ],
                            [
                                'Why is a reply slow, or why did loading fail?',
                                'A 12B model needs several gigabytes for weights plus extra memory for context. Close other GPU-heavy apps, choose IQ4_XS, reduce context or GPU layers, or use a smaller imported model. CPU mode works more slowly. Models → Advanced shows runner diagnostics.',
                            ],
                            [
                                'Can I change a character?',
                                'Yes. Open the three-dot button on their card to edit their personality, setting, greeting, prompts, or artwork. Duplicate a character to keep the original. JSON and PNG character cards work with SillyTavern.',
                            ],
                            [
                                'Where are my conversations?',
                                'The desktop app stores them in your Windows application data folder, outside the installation. Use Appearance → Export backup before moving computers. Models are deliberately excluded from portable backups.',
                            ],
                            [
                                'What happens when I delete a memory?',
                                'That memory is excluded from future prompts and blocked from automatic suggestions. The original conversation remains until you edit or delete its messages. Summaries are separate and can also be edited or disabled.',
                            ],
                        ].map(([title, body]) => (
                            <details className="faq" key={title}>
                                <summary>
                                    {title}
                                    <Plus size={17} />
                                </summary>
                                <p>{body}</p>
                            </details>
                        ))}
                        <div className="help-footer">
                            <Brand />
                            <p>Built on SillyTavern · AGPL-3.0 · Astral.AI {__ASTRAL_VERSION__}</p>
                            <p>
                                Original AI-generated character artwork. Bundled local inference by llama.cpp.
                                This build is unsigned.
                            </p>
                            <a href="/?legacy" className="text-button">
                                Open the original SillyTavern interface <ArrowUpRight size={14} />
                            </a>
                        </div>
                    </section>
                )}
            </main>
            <input
                hidden
                ref={backupInput}
                type="file"
                accept=".json,.zip"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                        setConfirm({
                            title: 'Restore this backup?',
                            text: 'This replaces Astral settings, characters, and story metadata. Existing files are retained, and your current settings receive a recovery copy.',
                            task: async () => {
                                await bridge.cancelBackground();
                                if (bridge.generating) throw new Error('Stop generation before restoring.');
                                if (f.name.toLowerCase().endsWith('.zip')) { const form = new FormData(); form.append('file', f); await request('/api/astral/restore-zip', form); }
                                else await request('/api/astral/restore', JSON.parse(await f.text()));
                                location.reload();
                            },
                        });
                    e.target.value = '';
                }}
            />
            {toast && (
                <div className="toast" role="status">
                    <Check size={16} />
                    {toast}
                </div>
            )}
            {busy && (
                <div className="busy-indicator" role="status">
                    <LoaderCircle size={15} className="spin" />
                    {bridge.generating ? 'Writing a reply…' : 'Just a moment…'}
                </div>
            )}
            {editor && (
                <CharacterEditor
                    character={editor}
                    state={state}
                    runner={runner}
                    close={() => setEditor(null)}
                    save={(c) => void run(() => saveCharacter(c))}
                    busy={busy}
                    duplicate={() =>
                        setEditor({
                            ...editor,
                            id: '',
                            avatar: undefined,
                            name: `${editor.name} (copy)`,
                        })
                    }
                    remove={() =>
                        setConfirm({
                            title: `Remove ${editor.name}?`,
                            text: 'Their conversations and memories will be removed from Astral. Export a backup first if you want to keep them.',
                            task: async () => {
                                await action({
                                    type: 'deleteCharacter',
                                    mode,
                                    characterId: editor.id,
                                });
                                if (editor.avatar)
                                    await request('/api/characters/delete', {
                                        avatar_url: editor.avatar,
                                        delete_chats: true,
                                    });
                                await reload();
                                setEditor(null);
                                if (character?.id === editor.id) {
                                    bridge.active = null;
                                    setActiveId('');
                                }
                            },
                        })
                    }
                />
            )}
            {credits && <Credits close={() => setCredits(false)} />}
            {importing && <ImportWizard bridge={bridge} close={() => setImporting(false)} imported={async () => { await reload(); setToast('Character imported.'); }} fromDialogue={() => setDialogueCreator(true)} pasteDefinition={definition => setEditor({ id: '', name: '', role: 'Character', mode: 'normal', color: '#d8b77a', tags: [], description: '', personality: '', scenario: '', greeting: '', examples: '', systemPrompt: definition, art: '' })} />}
            {dialogueCreator && <DraftDialog state={state} runner={runner} bridge={bridge} kind="dialogue" close={() => setDialogueCreator(false)} apply={draft => setEditor({ id: '', name: '', role: 'Character', mode: 'normal', color: '#d8b77a', tags: [], description: '', personality: '', scenario: '', greeting: '', examples: '', systemPrompt: '', art: '', ...draft })} />}
            {welcome && (
                <Modal title="Make room for a new story." close={() => void run(finishTutorial)}>
                    <div className="welcome-art">
                        <img src="/astral/art/v4/hina.png" alt="Hina, the painter" />
                    </div>
                    <p>
                        Choose a model, pick a character, and start a chat. The guided setup will help you get started.
                    </p>
                    <div className="welcome-points">
                        <span>
                            <Cpu size={17} /> Your own local models
                        </span>
                        <span>
                            <Brain size={17} /> Memories you can edit
                        </span>
                        <span>
                            <BookOpen size={17} /> Characters you can make your own
                        </span>
                    </div>
                    <div className="modal-actions">
                        <button className="text-button" onClick={() => void run(finishTutorial)}>
                            I'll explore first
                        </button>
                        <button
                            className="button"
                            onClick={() => {
                                setWelcome(false);
                                setTutorial(0);
                            }}
                        >
                            Let's begin <ArrowRight size={17} />
                        </button>
                    </div>
                </Modal>
            )}
            {tutorial !== null && (
                <Tutorial
                    step={tutorial}
                    machine={machine}
                    runner={runner}
                    current={current}
                    messages={bridge.messages.length}
                    next={() => (tutorial >= 5 ? void run(finishTutorial) : setTutorial(tutorial + 1))}
                    back={() => setTutorial(Math.max(0, tutorial - 1))}
                    skip={() => void run(finishTutorial)}
                    go={setScreen}
                />
            )}
            {confirm && (
                <Modal title={confirm.title} close={() => setConfirm(null)}>
                    <p>{confirm.text}</p>
                    <div className="modal-actions">
                        <button className="button secondary" onClick={() => setConfirm(null)}>
                            Cancel
                        </button>
                        <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                                void run(async () => {
                                    await confirm.task();
                                    setConfirm(null);
                                })
                            }
                        >
                            Confirm
                        </button>
                    </div>
                </Modal>
            )}
            {memoryEditor && current && (
                <Modal
                    title={memoryEditor.id ? 'Edit a memory' : 'Add a memory'}
                    close={() => setMemoryEditor(null)}
                >
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void run(async () => {
                                await bridge.cancelBackground();
                                await action({
                                    type: 'saveMemory',
                                    mode,
                                    conversationId: current.id,
                                    memory: memoryEditor,
                                });
                                await reload();
                                setMemoryEditor(null);
                            });
                        }}
                    >
                        <label>
                            Memory
                            <textarea
                                required
                                rows={4}
                                maxLength={2000}
                                value={memoryEditor.text}
                                onChange={(e) => setMemoryEditor({ ...memoryEditor, text: e.target.value })}
                            />
                        </label>
                        <label>
                            Remember in
                            <select
                                value={memoryEditor.scope}
                                onChange={(e) =>
                                    setMemoryEditor({
                                        ...memoryEditor,
                                        scope: e.target.value as Memory['scope'],
                                    })
                                }
                            >
                                <option value="character">All stories with this character</option>
                                <option value="story">Only this story</option>
                            </select>
                        </label>
                        <Toggle
                            label="Pin this memory"
                            description="Pinned facts take priority within the memory budget."
                            checked={!!memoryEditor.pinned}
                            onChange={(v) => setMemoryEditor({ ...memoryEditor, pinned: v })}
                        />
                        <div className="modal-actions">
                            <button className="button" type="submit" disabled={busy}>
                                Save memory
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
            {checkpoint && current && (
                <Modal title="Create a save point" close={() => setCheckpoint(false)}>
                    <p>
                        A save point lets you return to this part of the conversation and its story summary.
                        Shared character memories remain current.
                    </p>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const name = new FormData(e.currentTarget).get('name');
                            void run(async () => {
                                await bridge.cancelBackground();
                                await action({
                                    type: 'checkpoint',
                                    mode,
                                    conversationId: current.id,
                                    name,
                                    messages: bridge.messages,
                                });
                                await reload();
                                setCheckpoint(false);
                            }, 'Save point created.');
                        }}
                    >
                        <label>
                            Save point name
                            <input
                                name="name"
                                required
                                defaultValue={`Chapter · ${date(Date.now())}`}
                                maxLength={100}
                            />
                        </label>
                        <div className="modal-actions">
                            <button className="button" disabled={busy || bridge.generating}>
                                Create save point <Bookmark size={16} />
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
            {showSaves && current && (
                <Modal title="Save points" close={() => setShowSaves(false)}>
                    {state.checkpoints
                        .filter((cp) => cp.conversationId === current.id)
                        .map((cp) => (
                            <button
                                className="save-row"
                                key={cp.id}
                                onClick={() =>
                                    setConfirm({
                                        title: `Return to ${cp.name}?`,
                                        text: 'The current conversation and summary will return to this save point. Export a backup to keep later messages.',
                                        task: async () => {
                                            await bridge.cancelBackground();
                                            const result = await action({
                                                type: 'restoreCheckpoint',
                                                mode,
                                                conversationId: current.id,
                                                checkpointId: cp.id,
                                            });
                                            await bridge.restore(result.messages);
                                            await reload();
                                            setShowSaves(false);
                                        },
                                    })
                                }
                            >
                                <Bookmark size={18} />
                                <span>
                                    <strong>{cp.name}</strong>
                                    <small>
                                        {date(cp.createdAt)} · {cp.messages.length} messages
                                    </small>
                                </span>
                                <RotateCcw size={16} />
                            </button>
                        ))}
                    {!state.checkpoints.some((cp) => cp.conversationId === current.id) && (
                        <p>No save points yet. Use the bookmark button in your story to create one.</p>
                    )}
                </Modal>
            )}
            {state.settings.effects === 'full' && (
                <React.Suspense fallback={null}>
                    <Effects active={!bridge.generating && !bridge.remembering && !bridge.drafting} screen={screen} palette={themeTokens(state.settings.appearance, systemDark)} />
                </React.Suspense>
            )}
        </div>
    );
}
const Effects = React.lazy(() => import('./effects'));
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return (
        <div className="page-heading">
            <div>
                <div className="eyebrow">{eyebrow}</div>
                <h1>{title}</h1>
                <p>{description}</p>
            </div>
        </div>
    );
}
function Art({ character }: { character: Character }) {
    return character.art ? (
        <img
            className={character.art.startsWith('/astral/art/') ? 'portrait-art' : 'custom-art'}
            src={character.art}
            alt={`${character.name}, ${character.role.toLowerCase()}`}
            loading="lazy"
        />
    ) : (
        <div className="art-fallback" style={{ background: character.color }}>
            <span>{character.name.slice(0, 1)}</span>
        </div>
    );
}
function Toggle({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="toggle-row">
            <span>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
            </span>
            <input
                type="checkbox"
                role="switch"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
        </label>
    );
}
function StorySelect({
    conversations,
    value,
    onSelect,
}: {
    conversations: Conversation[];
    value: string;
    onSelect: (chat: Conversation) => void;
}) {
    return (
        <label className="story-select">
            Your story
            <select
                value={value}
                onChange={(e) => {
                    const c = conversations.find((c) => c.id === e.target.value);
                    if (c) onSelect(c);
                }}
            >
                <option value="">Choose a conversation…</option>
                {conversations.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.title}
                    </option>
                ))}
            </select>
        </label>
    );
}
function SummaryEditor({
    conversation,
    onSave,
    onToggle,
}: {
    conversation: Conversation;
    onSave: (text: string) => void;
    onToggle: (value: boolean) => void;
}) {
    const [text, setText] = useState(conversation.summary);
    useEffect(() => setText(conversation.summary), [conversation.id, conversation.summary]);
    return (
        <div className="settings-section">
            <div className="section-heading">
                <div>
                    <h2>The story so far</h2>
                    <p>Edit the summary the model uses to follow this chat.</p>
                </div>
                <Toggle label="Include in memory" checked={conversation.summaryEnabled} onChange={onToggle} />
            </div>
            <textarea
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="As the conversation grows, a short story summary will appear here."
                aria-label="Story summary"
            />
            <div className="button-row">
                <button className="button secondary" onClick={() => onSave(text)}>
                    Save summary
                </button>
                <button
                    className="text-button"
                    onClick={() => {
                        setText('');
                        onSave('');
                    }}
                >
                    Clear summary
                </button>
            </div>
        </div>
    );
}
function ChatScene({
    character,
    conversation,
    messages,
    generating,
    remembering,
    busy,
    onSend,
    onRegenerate,
    onStop,
    onMemory,
    onSave,
    onSaves,
    onEdit,
    onDelete,
    onNew,
    onBack,
    state,
    runner,
    onProfileChange,
    onSharingChange,
}: {
    onProfileChange: (profileId: string | null) => void;
    onSharingChange: (value: boolean) => void;
    state: State;
    runner: Runner;
    character: Character;
    conversation: Conversation;
    messages: Message[];
    generating: boolean;
    remembering: boolean;
    busy: boolean;
    onSend: (text: string, attachments: ImageAttachment[]) => void;
    onRegenerate: () => void;
    onStop: () => void;
    onMemory: () => void;
    onSave: () => void;
    onSaves: () => void;
    onEdit: (i: number, text: string) => void;
    onDelete: (i: number) => void;
    onNew: () => void;
    onBack: () => void;
}) {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
    const [imageError, setImageError] = useState('');
    const [uploadingImages, setUploadingImages] = useState(false);
    const imageInput = useRef<HTMLInputElement>(null);
    const imageSupport = bridge.supportsImages(state, runner);
    const [transcript, setTranscript] = useState(false);
    const [editing, setEditing] = useState<{ i: number; text: string } | null>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const pendingSend = useRef<{ text: string; count: number; images: string[] } | null>(null);
    const last = [...messages].reverse().find((m) => !m.is_user && !m.is_system);
    const submit = () => {
        if ((!input.trim() && !attachments.length) || generating || busy || uploadingImages || (attachments.length > 0 && !imageSupport)) return;
        const text = input.trim();
        pendingSend.current = { text, count: messages.length, images: attachments.map(a => a.url) };
        onSend(text, attachments);
    };
    useEffect(() => {
        const pending = pendingSend.current;
        if (pending && messages.length > pending.count && messages.some(m => m.is_user && m.mes === pending.text && pending.images.every(url => (m.extra?.media as ImageAttachment[] | undefined)?.some(a => a.url === url)))) {
            setInput(''); setAttachments([]); pendingSend.current = null;
        }
    }, [messages]);
    useEffect(() => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [messages.length, last?.mes]);
    return (
        <div className={`chat-scene ${transcript ? 'with-transcript' : ''}`}>
            <SceneBackground character={character} />
            <div className="scene-art">
                <Art character={character} />
            </div>
            <div className="scene-shade" />
            <div className="scene-header">
                <div className="scene-person">
                    <IconButton label="All stories" onClick={onBack}>
                        <ArrowLeft size={19} />
                    </IconButton>
                    <div>
                        <h1>
                            {character.name}
                            <span>{character.role}</span>
                        </h1>
                        <span>{conversation.title}</span>
                    </div>
                </div>
                <div className="scene-actions">
                    <IconButton label="Open memory" onClick={onMemory}>
                        <Brain size={19} />
                    </IconButton>
                    <IconButton label="Create save point" onClick={onSave} disabled={generating}>
                        <Bookmark size={19} />
                    </IconButton>
                    <IconButton label="View save points" onClick={onSaves}>
                        <RotateCcw size={19} />
                    </IconButton>
                    <IconButton label="New conversation" onClick={onNew} disabled={busy}>
                        <Plus size={19} />
                    </IconButton>
                    <IconButton
                        label={transcript ? 'Hide transcript' : 'Show transcript'}
                        aria-pressed={transcript}
                        onClick={() => setTranscript(!transcript)}
                    >
                        <PanelRightOpen size={19} />
                    </IconButton>
                </div>
            </div>
            <div className="chat-profile-bar"><label>Chat as<select aria-label="Chat profile" value={conversation.userProfileId || ''} disabled={busy || generating} onChange={e => onProfileChange(e.target.value || null)}><option value="">No profile</option>{state.profiles.map(p => <option key={p.id} value={p.id}>{p.displayName || 'Unnamed profile'}</option>)}{conversation.userProfileId && !state.profiles.some(p => p.id === conversation.userProfileId) && <option value={conversation.userProfileId}>Deleted profile</option>}</select></label><label className="share-profile"><input type="checkbox" checked={conversation.shareProfile} disabled={busy || generating || !state.profiles.some(p => p.id === conversation.userProfileId)} onChange={e => onSharingChange(e.target.checked)} /> Share profile with AI</label><details><summary>What the AI sees</summary><ProfilePreview state={state} chat={conversation} bridge={bridge} /></details><span>Changing profiles starts a new chat.</span></div>
            {transcript && (
                <aside className="transcript" aria-label="Conversation transcript">
                    <div className="transcript-heading">
                        <h2>Your conversation</h2>
                        <IconButton label="Close transcript" onClick={() => setTranscript(false)}>
                            <X size={17} />
                        </IconButton>
                    </div>
                    <div className="transcript-messages" ref={scroll}>
                        {messages
                            .filter((m) => !m.is_system)
                            .map((m, _) => {
                                const i = messages.indexOf(m);
                                return (
                                    <article
                                        className={`transcript-message ${m.is_user ? 'from-user' : ''}`}
                                        key={`${i}-${m.send_date ?? ''}`}
                                    >
                                        <div className="message-heading">
                                            <strong>{m.name}</strong>
                                            <div>
                                                <IconButton
                                                    label={`Edit message ${i + 1}`}
                                                    onClick={() => setEditing({ i, text: m.mes })}
                                                    disabled={generating}
                                                >
                                                    <Pencil size={12} />
                                                </IconButton>
                                                <IconButton
                                                    label={`Delete message ${i + 1}`}
                                                    onClick={() => onDelete(i)}
                                                    disabled={generating}
                                                >
                                                    <Trash2 size={12} />
                                                </IconButton>
                                            </div>
                                        </div>
                                        {editing?.i === i ? (
                                            <>
                                                <textarea
                                                    aria-label="Edit message"
                                                    rows={5}
                                                    value={editing.text}
                                                    onChange={(e) => setEditing({ i, text: e.target.value })}
                                                />
                                                <div className="button-row">
                                                    <button
                                                        className="text-button"
                                                        onClick={() => {
                                                            onEdit(i, editing.text);
                                                            setEditing(null);
                                                        }}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        className="text-button"
                                                        onClick={() => setEditing(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <p>
                                                <Text value={m.mes} />
                                        <MediaImages media={m.extra?.media as ImageAttachment[] | undefined} />
                                            </p>
                                        )}
                                    </article>
                                );
                            })}
                    </div>
                </aside>
            )}
            <div className="dialogue-area">
                <div className="scene-location">
                    <span /> {character.scenario.split('. ')[0]}
                </div>
                <div className="dialogue-panel">
                    <div className="dialogue-heading">
                        <div>
                            <span className="character-dot" style={{ background: character.color }} />
                            <strong>{character.name}</strong>
                            <span className="dialogue-role">
                                {generating
                                    ? 'Writing…'
                                    : remembering
                                      ? 'Remembering this moment…'
                                      : character.role}
                            </span>
                        </div>
                        <button
                            className="text-button"
                            onClick={onRegenerate}
                            disabled={busy || messages.length < 2}
                            title="Generate another version of the last reply"
                        >
                            <RotateCcw size={14} /> Another take
                        </button>
                    </div>
                    <div className="speech" role="log" aria-live={generating ? 'off' : 'polite'}>
                        <Text value={last?.mes || character.greeting} />
                        {generating && <span className="typing-caret" />}
                    </div>
                    <MediaImages media={attachments} remove={index => setAttachments(previous => previous.filter((_, i) => i !== index))} />
                    {imageError && <p className="inline-error" role="alert">{imageError}</p>}
                    {!imageSupport && messages.some(m => Array.isArray(m.extra?.media) && m.extra.media.length) && <p className="image-note">This model reads text only. Earlier pictures remain saved, but are not sent to this model.</p>}
                    <div className="attachment-actions"><button type="button" className="text-button" onClick={() => imageInput.current?.click()} disabled={!imageSupport || generating || uploadingImages || attachments.length >= 4} title={imageSupport ? 'Attach up to four images' : 'Choose a vision model, or enable verified image support for your external server in Models.'}><Upload size={15} /> {uploadingImages ? 'Preparing images…' : 'Add image'}</button>{!imageSupport && <span>Selected model reads text only.</span>}</div>
                    <input type="file" hidden ref={imageInput} accept="image/png,image/jpeg,image/webp" multiple onChange={e => {
                        const files = Array.from(e.target.files || []); e.target.value = '';
                        if (files.length + attachments.length > 4) { setImageError('Attach no more than four images per message.'); return; }
                        setUploadingImages(true); setImageError('');
                        void (async () => { const next: ImageAttachment[] = []; for (const f of files) { if (f.size > 10 * 1024 ** 2) throw new Error('Choose images under 10 MB.'); next.push(await request('/api/astral/assets', { data: await readFile(f), title: f.name })); } setAttachments(previous => [...previous, ...next]); })().catch(error => setImageError(error.message)).finally(() => setUploadingImages(false));
                    }} />
                    <form
                        className="composer"
                        onSubmit={(e) => {
                            e.preventDefault();
                            submit();
                        }}
                    >
                        <textarea
                            aria-label={`Message ${character.name}`}
                            placeholder={`Say something to ${character.name}…`}
                            value={input}
                            rows={1}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                        />
                        {generating ? (
                            <IconButton label="Stop reply" className="send-button" onClick={onStop}>
                                <Square size={17} />
                            </IconButton>
                        ) : (
                            <button
                                className="send-button"
                                type="submit"
                                disabled={(!input.trim() && !attachments.length) || busy || uploadingImages || (attachments.length > 0 && !imageSupport)}
                                aria-label="Send message"
                            >
                                <ArrowRight size={21} />
                            </button>
                        )}
                    </form>
                    <div className="composer-footer">
                        <span>
                            <ShieldCheck size={11} /> Just between you and {character.name}
                        </span>
                        <span>
                            Enter to send <i>·</i> Shift + Enter for a new line
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
function MediaImages({ media, remove }: { media?: ImageAttachment[]; remove?: (index: number) => void }) {
    const [zoom, setZoom] = useState<ImageAttachment | null>(null);
    return <>{!!media?.length && <div className="media-images">{media.filter(a => a.type === 'image').map((image, index) => <div key={image.url + index}><button type="button" onClick={() => setZoom(image)} aria-label={'View ' + image.title}><img src={image.url} alt={image.title || 'Attached image'} /></button>{remove && <button type="button" aria-label={'Remove image ' + (index + 1)} onClick={() => remove(index)}><X size={14} /></button>}</div>)}</div>}{zoom && <Modal title={zoom.title || 'Image'} close={() => setZoom(null)} wide><img className="image-lightbox" src={zoom.url} alt={zoom.title || 'Attached image'} /></Modal>}</>;
}
function ModelsPage({
    runtimes,
    refresh,
    models,
    runner,
    machine,
    state,
    busy,
    run,
    patch,
    act,
}: {
    models: Model[];
    runtimes: RuntimeStatus[];
    refresh: () => Promise<unknown>;
    runner: Runner;
    machine: Hardware | null;
    state: State;
    busy: boolean;
    run: (task: () => Promise<unknown>, message?: string) => Promise<void>;
    patch: (p: Partial<State['settings']>) => Promise<void>;
    act: (action: string, id?: string, options?: unknown) => Promise<void>;
}) {
    const [connection, setConnection] = useState(state.settings.connection);
    const [connectionResult, setConnectionResult] = useState('');
    const [testedVision, setTestedVision] = useState(state.settings.connection.vision ? JSON.stringify([state.settings.connection.url, state.settings.connection.model]) : '');
    const [modelNames, setModelNames] = useState<string[]>([]);
    const [layers, setLayers] = useState(machine?.recommendation.gpuLayers ?? 0);
    const [context, setContext] = useState(4096);
    useEffect(() => {
        if (machine) {
            setLayers(machine.recommendation.gpuLayers);
            setContext(machine.recommendation.context);
        }
    }, [machine]);
    const importModel = () =>
        void run(async () => {
            if (!window.astralDesktop)
                throw new Error(
                    'GGUF file linking is available in the desktop app. In the browser, connect an existing local runner below.',
                );
            const file = await window.astralDesktop.selectModel();
            if (file) {
                await request('/api/astral/models', { action: 'import', path: file });
                await act('stop');
            }
        });
    return (
        <section className="page models-page">
            <div className="page-heading">
                <div>
                    <div className="eyebrow">LOCAL MODELS</div>
                    <h1>Models</h1>
                    <p>Download a local model, bring your own, or connect one you already use.</p>
                </div>
                <button className="button secondary" onClick={importModel}>
                    <Upload size={16} /> Link a GGUF file
                </button>
            </div>
            <RuntimeSetup runtimes={runtimes} machine={machine} cpu={layers === 0} useCPU={() => setLayers(0)} useGPU={() => setLayers(99)} refresh={refresh} run={run} />
            <div className="hardware-panel">
                <div className="hardware-icon">
                    <Cpu size={26} />
                </div>
                <div>
                    <h2>
                        {machine?.gpu?.name ??
                            (machine ? 'CPU inference available' : 'Checking your computer…')}
                    </h2>
                    <p>
                        {machine
                            ? `${machine.totalGiB} GB RAM${machine.gpu ? ` · ${Math.round(machine.gpu.totalMiB / 1024)} GB dedicated VRAM` : ''} · ${machine.threads} CPU threads`
                            : 'Detecting memory and acceleration.'}
                    </p>
                </div>
                <span className="hardware-badge">
                    <ShieldCheck size={13} /> On this computer
                </span>
                {machine && <p className="hardware-note">{machine.recommendation.note}</p>}
            </div>
            <div className={`runner-panel ${runner.state === 'error' ? 'runner-error' : ''}`}>
                <span
                    className={`status-dot ${runner.state === 'ready' ? 'online' : runner.state === 'loading' ? 'loading' : ''}`}
                />
                <div>
                    <strong>
                        {runner.state === 'ready'
                            ? `${models.find((m) => m.id === runner.modelId)?.name ?? 'Model'} is ready`
                            : runner.state === 'loading'
                              ? 'Loading your model into memory…'
                              : runner.state === 'error'
                                ? 'The model needs a little help'
                                : 'No model is running yet'}
                    </strong>
                    <p>
                        {runner.error ||
                            (runner.state === 'ready'
                                ? `${runner.backend.toUpperCase()} · ${runner.url}`
                                : 'Choose a model below. Only one model runs at a time.')}
                    </p>
                </div>
                {['ready', 'loading'].includes(runner.state) && (
                    <button className="button secondary small" onClick={() => void run(() => act('stop'))}>
                        <Square size={14} /> Stop
                    </button>
                )}
            </div>
            <div className="section-heading">
                <div>
                    <h2>Recommended models</h2>
                    <p>Optional downloads. Recommendations account for your graphics memory and RAM; actual fit is checked at load time.</p>
                </div>
                <span className="subtle-label">GGUF · VERIFIED DOWNLOADS</span>
            </div>
            <div className="model-list">
                <GroupedModels models={models} runningId={runner.modelId} preferredId={state.settings.connection.preferredModelId}>{(model, versionSelector) => (
                    <article className={`model-card ${model.recommended ? 'recommended' : ''}`} key={model.id}>
                        <div className="model-header">
                            <div className="model-symbol">
                                <Cpu size={21} />
                            </div>
                            <div>
                                {model.recommended && <span className="recommendation-label">Recommended for this computer</span>}<h3>{model.name}</h3>
                                <p>{model.description}</p>
                            </div>
                            <span className="quant-tag">{model.quant}{model.capabilities?.vision ? ' · Images' : ' · Text'}</span>
                        </div>
                        {versionSelector}
                        <div className="model-bottom">
                            <div className="model-details">
                                <span>
                                    <HardDrive size={13} />
                                    {bytes(model.bytes)}
                                </span>
                                <span>
                                    {model.ready ? (
                                        <>
                                            <Check size={13} /> On your computer
                                        </>
                                    ) : model.downloaded > 0 ? (
                                        `${bytes(model.downloaded)} downloaded`
                                    ) : (
                                        'Separate model download'
                                    )}
                                </span>
                            </div>
                            <div className="button-row">
                                {model.ready ? (
                                    <>
                                        {model.imported && <button className="text-button" disabled={busy || (runner.modelId === model.id && runner.state !== 'stopped')} onClick={() => void run(async () => {
                                            if (!window.astralDesktop) throw new Error('Use the desktop app to link a projector.');
                                            const file = await window.astralDesktop.selectModel();
                                            if (file) { await request('/api/astral/models', { action: 'projector', modelId: model.id, path: file }); await act('stop'); }
                                        })}>Link vision projector</button>}
                                        <button
                                            className="text-button danger"
                                            disabled={
                                                runner.modelId === model.id && runner.state !== 'stopped'
                                            }
                                            onClick={() => void run(() => act('remove', model.id))}
                                        >
                                            Remove
                                        </button>
                                        <button
                                            className="button secondary small"
                                            disabled={
                                                busy ||
                                                runner.state === 'loading' ||
                                                (runner.state === 'ready' && runner.modelId === model.id)
                                            }
                                            onClick={() =>
                                                void run(async () => {
                                                    await bridge.cancelBackground();
                                                    await bridge.cancelDraft();
                                                    const backend = layers > 0 ? machine?.gpu?.backend || 'cuda' : 'cpu';
                                                    if (!runtimes.some(r => r.backend === backend && r.state === 'ready')) throw new Error('Install GPU support above, or choose Use CPU before loading this model.');
                                                    if (bridge.generating)
                                                        throw new Error(
                                                            'Stop the current reply before switching models.',
                                                        );
                                                    await patch({
                                                        connection: {
                                                            ...state.settings.connection,
                                                            kind: 'managed',
                                                            context, preferredModelId: model.id, useModelPreset: true,
                                                        },
                                                    });
                                                    await act('start', model.id, {
                                                        gpuLayers: layers,
                                                        context,
                                                    });
                                                })
                                            }
                                        >
                                            {runner.modelId === model.id && runner.state === 'ready' ? (
                                                <Check size={14} />
                                            ) : (
                                                <Play size={14} />
                                            )}{' '}
                                            {runner.modelId === model.id && runner.state === 'ready'
                                                ? 'Running'
                                                : 'Load model'}
                                        </button>
                                    </>
                                ) : ['downloading', 'verifying'].includes(model.downloadState ?? '') ? (
                                    <button
                                        className="button secondary small"
                                        onClick={() => void run(() => act('pause', model.id))}
                                        disabled={model.downloadState === 'verifying'}
                                    >
                                        {model.downloadState === 'verifying' ? (
                                            <>
                                                <LoaderCircle size={14} className="spin" />
                                                Verifying…
                                            </>
                                        ) : (
                                            <>
                                                <Square size={13} /> Pause
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="button secondary small"
                                            disabled={busy}
                                            onClick={() => void run(() => act('download', model.id))}
                                        >
                                            <Download size={14} />
                                            {model.downloaded ? 'Resume download' : 'Download'}
                                        </button>
                                        {model.downloaded > 0 && (
                                            <IconButton
                                                label="Discard partial download"
                                                onClick={() => void run(() => act('remove', model.id))}
                                            >
                                                <Trash2 size={14} />
                                            </IconButton>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        {['downloading', 'verifying'].includes(model.downloadState ?? '') && (
                            <div className="download-progress">
                                <progress max={model.bytes} value={model.downloaded} />
                                <span>
                                    {Math.min(100, (model.downloaded / model.bytes) * 100).toFixed(0)}% ·{' '}
                                    {bytes(model.downloaded)} of {bytes(model.bytes)}
                                </span>
                            </div>
                        )}
                        <details className="model-files"><summary>Files & storage location</summary><p>{model.storagePath || 'Linked file remains in its original location.'}</p>{model.projector && <p>Vision file: {model.projector.filename} · {bytes(model.projector.bytes)}</p>}</details>
                        {model.error && (
                            <p className="inline-error" role="alert">
                                {model.error}
                            </p>
                        )}
                    </article>
                )}</GroupedModels>
            </div>
            <details className="advanced">
                <summary>
                    <Settings2 size={16} /> Advanced runner settings <ChevronDown size={16} />
                </summary>
                <div className="two-fields">
                    <label>
                        GPU layers: {layers}
                        <input
                            type="range"
                            min="0"
                            max="99"
                            step="1"
                            value={layers}
                            onChange={(e) => setLayers(Number(e.target.value))}
                        />
                        <small>Choose 0 for CPU. Lower this if GPU memory runs out.</small>
                    </label>
                    <label>
                        Context window
                        <select value={context} onChange={(e) => setContext(Number(e.target.value))}>
                            {[2048, 4096, 8192, 16384, 32768].map((n) => (
                                <option value={n} key={n}>
                                    {n.toLocaleString()} tokens
                                </option>
                            ))}
                        </select>
                        <small>More context requires more memory. Applied on the next model load.</small>
                    </label>
                </div>
                <label>
                    Runner diagnostics
                    <textarea
                        readOnly
                        rows={7}
                        value={runner.log || 'Runner output appears here after you load a model.'}
                    />
                </label>
            </details>
            <details
                className="advanced external-connection"
                open={state.settings.connection.kind !== 'managed'}
            >
                <summary>
                    <ArrowUpRight size={16} /> Connect an existing runner <ChevronDown size={16} />
                </summary>
                <p>
                    Use a local server such as LM Studio, llama.cpp, or KoboldCpp. Enable its API before
                    connecting.
                </p>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                            const result = await request('/api/astral/test-connection', connection);
                            setTestedVision(result.visionVerified ? JSON.stringify([connection.url, connection.model || result.models[0]]) : '');
                            setModelNames(result.models);
                            setConnectionResult(
                                result.visionVerified ? 'Connection successful. The server accepted an image request. Save to enable uploads.' : 'Connection successful. Choose a model if needed, then save.',
                            );
                            if (!connection.model && result.models[0])
                                setConnection({ ...connection, model: result.models[0] });
                        });
                    }}
                >
                    <div className="two-fields">
                        <label>
                            Connection type
                            <select
                                value={connection.kind}
                                onChange={(e) =>
                                    setConnection({
                                        ...connection,
                                        kind: e.target.value as typeof connection.kind,
                                    })
                                }
                            >
                                <option value="openai">OpenAI-compatible local server</option>
                                <option value="koboldcpp">KoboldCpp</option>
                            </select>
                        </label>
                        <label>
                            Local server URL
                            <input
                                required
                                value={connection.url}
                                placeholder="http://127.0.0.1:1234/v1"
                                onChange={(e) =>
                                    setConnection({
                                        ...connection,
                                        kind: connection.kind === 'managed' ? 'openai' : connection.kind,
                                        url: e.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                    {connection.kind !== 'koboldcpp' && (
                        <label>
                            Loaded model ID
                            <input
                                list="local-models"
                                value={connection.model}
                                onChange={(e) => setConnection({ ...connection, model: e.target.value })}
                                placeholder="Test the connection to discover models"
                            />
                            <datalist id="local-models">
                                {modelNames.map((m) => (
                                    <option key={m} value={m} />
                                ))}
                            </datalist>
                        </label>
                    )}
                    {connection.kind !== 'koboldcpp' && <label className="toggle-row"><span><strong>Image support</strong><small>Enable only for a local vision server you have tested. Text-only models cannot see images.</small></span><input type="checkbox" checked={!!connection.vision} onChange={e => setConnection({ ...connection, vision: e.target.checked })} /></label>}
                    <div className="button-row">
                        <button className="button secondary" disabled={busy} type="submit">
                            Test connection
                        </button>
                        <button
                            className="button"
                            type="button"
                            disabled={!connection.url || busy || (!!connection.vision && testedVision !== JSON.stringify([connection.url, connection.model]))}
                            onClick={() =>
                                void run(
                                    () =>
                                        patch({
                                            connection: {
                                                ...connection,
                                                kind:
                                                    connection.kind === 'managed'
                                                        ? 'openai'
                                                        : connection.kind,
                                            },
                                        }),
                                    'Connection saved.',
                                )
                            }
                        >
                            Use this connection
                        </button>
                        <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                                void run(
                                    () =>
                                        patch({
                                            connection: {
                                                ...state.settings.connection,
                                                kind: 'managed',
                                            },
                                        }),
                                    'Using the built-in runner.',
                                )
                            }
                        >
                            Use built-in runner
                        </button>
                    </div>
                    {connectionResult && (
                        <p className="success-note" role="status">
                            <Check size={14} />
                            {connectionResult}
                        </p>
                    )}
                </form>
            </details>
            <details className="advanced">
                <summary>
                    <SlidersHorizontal size={16} /> Generation & instruction settings{' '}
                    <ChevronDown size={16} />
                </summary>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void run(
                            () =>
                                patch({
                                    connection: {
                                        ...state.settings.connection,
                                        temperature: Number(data.get('temperature')),
                                        useModelPreset: false,
                                        maxTokens: Number(data.get('tokens')),
                                        template: String(data.get('template')),
                                        sampling: Object.fromEntries(
                                            ['topP', 'topK', 'minP', 'repetitionPenalty'].map((key) => [
                                                key,
                                                data.get(key) === '' ? undefined : Number(data.get(key)),
                                            ]),
                                        ),
                                    },
                                }),
                            'Generation settings saved.',
                        );
                    }}
                >
                    <div className="two-fields">
                        <label>
                            Creativity (temperature)
                            <input
                                name="temperature"
                                type="number"
                                min="0"
                                max="2"
                                step="0.05"
                                defaultValue={state.settings.connection.temperature}
                            />
                        </label>
                        <label>
                            Maximum reply tokens
                            <input
                                name="tokens"
                                type="number"
                                min="64"
                                max="4096"
                                step="64"
                                defaultValue={state.settings.connection.maxTokens}
                            />
                        </label>
                    </div>
                    <label>
                        Instruction template
                        <select name="template" defaultValue={state.settings.connection.template}>
                            <option value="auto">Automatic · use the model's metadata</option>
                            <option value="ChatML">ChatML</option>
                            <option value="Mistral V3-Tekken">Mistral V3-Tekken</option>
                            <option value="Mistral V2 & V3">Mistral V2 & V3</option>
                            <option value="Alpaca">Alpaca</option>
                        </select>
                    </label>
                    <p>
                        {modelPreset(state.settings.connection.kind === 'managed' ? runner.modelId : '').name}
                        . Leave sampling fields empty to use this model's preset.
                    </p>
                    <div className="two-fields">
                        {(
                            [
                                ['topP', 'Top P', 0, 1, 0.05],
                                ['topK', 'Top K', 0, 1000, 1],
                                ['minP', 'Min P', 0, 1, 0.01],
                                ['repetitionPenalty', 'Repetition penalty', 1, 2, 0.05],
                            ] as const
                        ).map(([key, label, min, max, step]) => (
                            <label key={`${key}-${state.settings.connection.sampling?.[key] ?? 'auto'}`}>
                                {label}
                                <input
                                    name={key}
                                    type="number"
                                    min={min}
                                    max={max}
                                    step={step}
                                    placeholder={String(modelPreset(runner.modelId)[key])}
                                    defaultValue={state.settings.connection.sampling?.[key] ?? ''}
                                />
                            </label>
                        ))}
                    </div>
                    <p>
                        Wrong templates can cause strange replies. OpenAI-compatible servers apply their own
                        template; character-specific settings override global sampling. Top K, Min P, and
                        repetition penalty apply to the built-in runner and KoboldCpp.
                    </p>
                    <button className="button secondary" disabled={busy}>
                        Save generation settings
                    </button>
                    <button
                        type="button"
                        className="button quiet"
                        disabled={busy}
                        onClick={() =>
                            void run(
                                () => patch({ connection: { ...state.settings.connection, sampling: {}, useModelPreset: true } }),
                                'Model sampling preset restored.',
                            )
                        }
                    >
                        Reset sampling to model preset
                    </button>
                </form>
            </details>
        </section>
    );
}
function CharacterEditor({
    character,
    state,
    runner,
    close,
    save,
    busy,
    duplicate,
    remove,
}: {
    character: Character;
    state: State;
    runner: Runner;
    close: () => void;
    save: (c: Character) => void;
    busy: boolean;
    duplicate: () => void;
    remove: () => void;
}) {
    const [c, set] = useState(character);
    const [draftKind, setDraftKind] = useState<'instructions' | 'profile' | null>(null);
    const [artError, setArtError] = useState('');
    useEffect(() => set(character), [character]);
    const field = (key: keyof Character, value: unknown) => set({ ...c, [key]: value });
    const [exporting, setExporting] = useState(false);
    const exportPNG = async () => {
        setExporting(true);
        try {
            downloadBlob(await bridge.exportPNG(c), `${c.name}.png`);
        } catch (e) {
            setArtError((e as Error).message);
        } finally {
            setExporting(false);
        }
    };
    return (
        <Modal
            title={c.id ? `Edit ${character.name}` : 'New character'}
            close={close}
            wide
        >
            <div className="button-row"><button className="button secondary" disabled={busy || bridge.generating} onClick={() => setDraftKind('profile')}><Sparkles size={16} /> Draft profile</button></div>
            {draftKind && <DraftDialog state={state} runner={runner} character={c} bridge={bridge} kind={draftKind} close={() => setDraftKind(null)} apply={draft => set({ ...c, ...draft })} />}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    save(c);
                }}
            >
                <div className="editor-top">
                    <div className="editor-art">
                        <Art character={c} />
                        <FileButton className="art-upload" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    if (f.size > 8 * 1024 ** 2) {
                                        setArtError('Choose an image under 8 MB.');
                                        return;
                                    }
                                    void readFile(f).then(data => request('/api/astral/assets', { data, title: c.name })).then(asset => { field('art', asset.url); setArtError(''); }).catch(error => setArtError(error.message));
                                }}>
                            <Upload size={14} /> Change artwork
                            
                        </FileButton>
                    </div>
                    <div>
                        <div className="two-fields">
                            <label>
                                Name
                                <input
                                    required
                                    value={c.name}
                                    maxLength={60}
                                    onChange={(e) => field('name', e.target.value)}
                                />
                            </label>
                        </div>
                        <label>
                            Role
                            <input
                                value={c.role}
                                maxLength={80}
                                onChange={(e) => field('role', e.target.value)}
                                placeholder="The artist, the explorer…"
                            />
                        </label>
                        <label>
                            Short introduction
                            <textarea
                                rows={2}
                                value={c.description}
                                onChange={(e) => field('description', e.target.value)}
                            />
                        </label>
                    </div>
                </div>
                {artError && <p className="inline-error">{artError}</p>}
                <label>
                    Personality
                    <textarea
                        rows={3}
                        value={c.personality}
                        onChange={(e) => field('personality', e.target.value)}
                        placeholder="Their temperament, ambitions, habits, and boundaries."
                    />
                </label>
                <label>
                    Setting & scenario
                    <textarea
                        rows={2}
                        value={c.scenario}
                        onChange={(e) => field('scenario', e.target.value)}
                    />
                </label>
                <label>
                    First message
                    <textarea
                        rows={4}
                        value={c.greeting}
                        onChange={(e) => field('greeting', e.target.value)}
                        placeholder="The first words when a new story begins."
                    />
                </label>
                <div className="two-fields">
                    <label>
                        Tags (comma-separated)
                        <input
                            value={c.tags.join(', ')}
                            onChange={(e) =>
                                field(
                                    'tags',
                                    e.target.value.split(',').map((t) => t.trim()),
                                )
                            }
                        />
                    </label>
                    <label>
                        Character accent
                        <input
                            type="color"
                            value={c.color}
                            onChange={(e) => field('color', e.target.value)}
                        />
                    </label>
                </div>
                <details className="advanced">
                    <summary>
                        <Settings2 size={16} /> Prompts & advanced settings <ChevronDown size={16} />
                    </summary>
                    <label>
                        Character instructions <button type="button" className="text-button" onClick={() => setDraftKind('instructions')}>Generate instructions</button>
                        <textarea
                            rows={4}
                            value={c.systemPrompt}
                            onChange={(e) => field('systemPrompt', e.target.value)}
                        />
                    </label>
                    <label>
                        Example dialogue
                        <textarea
                            rows={4}
                            value={c.examples}
                            onChange={(e) => field('examples', e.target.value)}
                        />
                    </label>
                    <p>
                        Use {'{{user}}'} and {'{{char}}'} for names. Existing conversations keep their first
                        message; other edits apply on the next reply.
                    </p>
                    <div className="two-fields">
                        <label>
                            Creativity override
                            <input
                                type="number"
                                min="0"
                                max="2"
                                step="0.05"
                                value={c.overrides?.temperature ?? 0.8}
                                onChange={(e) =>
                                    field('overrides', {
                                        temperature: Number(e.target.value),
                                        maxTokens: c.overrides?.maxTokens ?? 384,
                                    })
                                }
                            />
                        </label>
                        <label>
                            Reply token override
                            <input
                                type="number"
                                min="64"
                                max="4096"
                                step="64"
                                value={c.overrides?.maxTokens ?? 384}
                                onChange={(e) =>
                                    field('overrides', {
                                        maxTokens: Number(e.target.value),
                                        temperature: c.overrides?.temperature ?? 0.8,
                                    })
                                }
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        className="text-button"
                        onClick={() => field('overrides', undefined)}
                    >
                        <RotateCcw size={14} /> Use global generation settings
                    </button>
                </details>
                <div className="modal-actions editor-actions">
                    <div>
                        {c.id && (
                            <>
                                <button type="button" className="text-button" onClick={duplicate}>
                                    <Copy size={15} /> Duplicate
                                </button>
                                <button type="button" className="text-button danger" onClick={remove}>
                                    <Trash2 size={15} /> Delete
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            className="text-button"
                            onClick={async () =>
                                downloadBlob(
                                    await bridge.exportJSON(c),
                                    `${c.name || 'character'}.json`,
                                )
                            }
                        >
                            <Download size={15} /> Export JSON
                        </button>
                        <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText([`Name: ${c.name}`, `Role: ${c.role}`, `Description: ${c.description}`, `Personality: ${c.personality}`, `Scenario: ${c.scenario}`, `Greeting: ${c.greeting}`, `Examples: ${c.examples}`, `Instructions: ${c.systemPrompt}`].join('\n\n')).then(() => setArtError('Character definition copied.')).catch(error => setArtError(error.message))}><Copy size={15} /> Copy definition</button>
                        {c.id && (
                            <button
                                type="button"
                                className="text-button"
                                disabled={exporting}
                                onClick={() => void exportPNG()}
                            >
                                <Download size={15} />
                                {exporting ? 'Exporting…' : 'Export PNG'}
                            </button>
                        )}
                    </div>
                    <button className="button" type="submit" disabled={busy}>
                        Save character <Check size={16} />
                    </button>
                </div>
            </form>
        </Modal>
    );
}
function Tutorial({
    step,
    machine,
    runner,
    current,
    messages,
    next,
    back,
    skip,
    go,
}: {
    step: number;
    machine: Hardware | null;
    runner: Runner;
    current?: Conversation;
    messages: number;
    next: () => void;
    back: () => void;
    skip: () => void;
    go: (s: Screen) => void;
}) {
    const content = [
        {
            title: 'First, meet your computer.',
            body: machine
                ? `${machine.totalGiB} GB RAM${machine.gpu ? ` and ${Math.round(machine.gpu.totalMiB / 1024)} GB GPU memory` : ''}. ${machine.recommendation.note}`
                : 'Checking your hardware. Models need room in RAM and, when available, GPU memory.',
            action: 'See my hardware',
            screen: 'models',
        },
        {
            title: 'Choose the imagination.',
            body: 'In Models, start with the recommendation for your computer, or link a GGUF file you already own. Downloads are optional, and you can pause or resume them.',
            action: 'Choose a model',
            screen: 'models',
        },
        {
            title: 'Bring your model to life.',
            body:
                runner.state === 'ready'
                    ? 'Your model is ready. You can move on to your first character.'
                    : 'Once downloaded, select Load model. Wait for the ready indicator. Already use LM Studio? Test and save its local connection instead.',
            action: 'Open model setup',
            screen: 'models',
        },
        {
            title: 'Every story starts with someone.',
            body: current
                ? 'You have a story open. Their greeting sets the scene; what happens next is up to you.'
                : 'Open Characters and choose someone. Meet them as written, or edit their card to change the story.',
            action: 'Meet the characters',
            screen: 'characters',
        },
        {
            title: 'Say the first thing.',
            body:
                messages > 1
                    ? 'Your conversation is underway. Try Another take for a different reply, or open the transcript to edit a message.'
                    : 'Type a greeting or an action in the dialogue box. Enter sends your message; Shift + Enter adds a line. You can stop a reply at any time.',
            action: 'Open your story',
            screen: 'chat',
        },
        {
            title: 'Keep the things that matter.',
            body: 'After a few replies, Astral summarizes your story and remembers facts. Open Memory to edit, pin, pause, or delete them. Bookmark a moment to return to it later.',
            action: 'Explore memory',
            screen: 'memory',
        },
    ][step];
    return (
        <aside className="tutorial" aria-label="Getting started guide">
            <div className="tutorial-top">
                <span>YOUR FIRST STORY</span>
                <button className="text-button" onClick={skip}>
                    Skip guide <X size={12} />
                </button>
            </div>
            <div className="tutorial-progress">
                {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className={i <= step ? 'done' : ''} />
                ))}
            </div>
            <h2>{content.title}</h2>
            <p>{content.body}</p>
            <button className="text-button" onClick={() => go(content.screen as Screen)}>
                {content.action}
                <ArrowUpRight size={14} />
            </button>
            <div className="tutorial-bottom">
                <span>{step + 1} of 6</span>
                <div>
                    {step > 0 && (
                        <IconButton label="Previous tutorial step" onClick={back}>
                            <ArrowLeft size={16} />
                        </IconButton>
                    )}
                    <button className="button small" onClick={next}>
                        {step === 5 ? 'Make yourself at home' : 'Next'}
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </aside>
    );
}

const host = document.getElementById('astral-root')!;
createRoot(host.shadowRoot!.getElementById('astral-app')!).render(<App />);
