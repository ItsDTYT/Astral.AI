export type Mode = 'normal';
export type Screen = 'characters' | 'chat' | 'memory' | 'models' | 'appearance' | 'profiles' | 'help';
export interface Character {
    id: string;
    name: string;
    sourceCard?: Record<string, any>;
    role: string;
    mode: Mode;
    color: string;
    tags: string[];
    description: string;
    personality: string;
    scenario: string;
    greeting: string;
    systemPrompt: string;
    examples: string;
    art: string;
    avatar?: string;
    artVersion?: string;
    artNeedsSync?: boolean;
    overrides?: { temperature: number; maxTokens: number };
}
export interface Conversation {
    userProfileId: string | null;
    shareProfile: boolean;
    id: string;
    characterId: string;
    mode: Mode;
    fileName: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    summary: string;
    summaryEnabled: boolean;
    memoryEnabled: boolean;
    memoryCursor: number;
}
export interface Memory {
    userProfileId: string | null;
    id: string;
    characterId: string;
    conversationId: string;
    mode: Mode;
    scope: 'character' | 'story';
    text: string;
    pinned: boolean;
    enabled: boolean;
    source: string;
}
export interface Message {
    name: string;
    mes: string;
    is_user: boolean;
    is_system?: boolean;
    send_date?: string;
    extra?: Record<string, unknown> & { media?: ImageAttachment[]; media_display?: string };
    [key: string]: unknown;
}
export interface Checkpoint {
    id: string;
    conversationId: string;
    name: string;
    createdAt: number;
    messages: Message[];
    summary: string;
    memoryCursor: number;
}
export interface Connection {
    kind: 'managed' | 'openai' | 'koboldcpp';
    url: string;
    model: string;
    template: string;
    temperature: number;
    maxTokens: number;
    context: number;
    sampling?: { topP?: number; topK?: number; minP?: number; repetitionPenalty?: number };
    vision?: boolean;
    preferredModelId?: string;
    useModelPreset?: boolean;
}
export interface Settings {
    defaultUserProfileId: string | null;
    featuredSlideshow: boolean;
    mode: Mode;
    tutorialDone: boolean;
    effects: 'off' | 'subtle' | 'full';
    appearance: Appearance;
    fontSize: number;
    sceneDim: number;
    userName: string;
    autoMemory: boolean;
    memoryBudget: number;
    connection: Connection;
}
export interface State {
    profiles: UserProfile[];
    deletedProfileIds: string[];
    version: number;
    characters: Character[];
    conversations: Conversation[];
    memories: Memory[];
    checkpoints: Checkpoint[];
    tombstones: { characterId: string; mode: Mode; normalized: string; userProfileId: string | null }[];
    settings: Settings;
}
export interface UserProfile {
    id: string;
    displayName: string;
    age: number | null;
    gender: string;
    pronouns: string;
    about: string;
    facts: { id: string; text: string; enabled: boolean }[];
}
export interface Model {
    id: string;
    name: string;
    filename: string;
    bytes: number;
    quant: string;
    description: string;
    template?: string;
    ready: boolean;
    downloaded: number;
    imported?: boolean;
    downloadState?: string;
    error?: string;
    protocol?: 'chat' | 'completion';
    context?: number;
    generation?: { temperature: number; topP: number; topK: number; minP: number; repetitionPenalty: number };
    capabilities?: { vision: boolean };
    projector?: { filename: string; bytes: number };
    recommended?: boolean;
    weightBytes?: number;
    storagePath?: string;
}
export interface Runner {
    context?: number;
    generation?: { temperature: number; topP: number; topK: number; minP: number; repetitionPenalty: number };
    state: 'stopped' | 'loading' | 'ready' | 'error';
    url: string;
    modelId: string;
    error: string;
    backend: string;
    log: string;
    capabilities?: { vision: boolean };
    protocol?: 'chat' | 'completion';
}
export interface GenerationStatus {
    phase: 'idle' | 'chat' | 'memory' | 'draft';
    label: string;
    cancellable: boolean;
}
export interface Hardware {
    cpu: string;
    threads: number;
    totalGiB: number;
    freeGiB: number;
    gpu: { name: string; totalMiB: number; freeMiB: number; backend?: string } | null;
    gpus?: { name: string; totalMiB: number; freeMiB: number; backend: string; integrated?: boolean }[];
    recommendation: {
        quant: string;
        context: number;
        gpuLayers: number;
        note: string;
        modelId?: string;
        estimated?: boolean;
    };
}
export interface RuntimeStatus {
    backend: 'cpu' | 'cuda' | 'vulkan';
    version: string;
    state: 'missing' | 'ready' | 'downloading' | 'verifying' | 'installing' | 'paused' | 'error';
    downloaded: number;
    total: number;
    error?: string;
}
export interface Desktop {
    libraryReady(): void;
    selectModel(): Promise<string | null>;
    openDataFolder(): Promise<void>;
    version(): Promise<string>;
    openExternal(url: string): Promise<void>;
    onActivated(listener: () => void): () => void;
}
export interface Appearance {
    version: number; theme: string; accent: string; background: string; uiFont: string; dialogueFont: string;
    uiScale: number; density: string; backgroundMode: string; backgroundImage: string; blur: number;
}
export interface ImageAttachment { url: string; type: 'image'; title: string; width?: number; height?: number }
export interface ThemeTokens {
    label: string; dark: boolean; background: string; surface: string; raised: string;
    text: string; muted: string; accent: string; accentInk: string; line: string;
    hover: string; pressed: string; lineStrong: string; focus: string; accentText: string; disabled: string;
    danger: string; dangerSurface: string; dangerLine: string; success: string;
    overlay: string; shadow: string; effectPrimary: string; effectSecondary: string; effectAccent: string;
}
export type CharacterDraft = Pick<Character, 'name' | 'role' | 'description' | 'personality' | 'scenario' | 'greeting' | 'examples' | 'systemPrompt' | 'tags'>;
export interface DialogueLine { id: string; speaker: string; text: string }
declare global {
    interface Window {
        astralDesktop?: Desktop;
        astralBridge: import('./bridge').SillyTavernBridge;
    }
}
