import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { SceneBackground } from './appearance';
import type { Character, Conversation } from './types';
function shuffled(ids: string[], excluded?: string) {
    const values = ids.filter(id => id !== excluded);
    for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
    return values;
}
export function FeaturedCast({ characters, conversations, ready, playing, setPlaying, open }: { characters: Character[]; conversations: Conversation[]; ready: boolean; playing: boolean; setPlaying: (value: boolean) => void; open: (character: Character, chat?: Conversation) => void }) {
    const eligible = characters.filter(c => c.art).length ? characters.filter(c => c.art) : characters;
    const ids = eligible.map(c => c.id).join('|');
    const [current, setCurrent] = useState(() => eligible[Math.floor(Math.random() * eligible.length)]?.id);
    const [hover, setHover] = useState(false), [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(document.hidden), [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
    const bag = useRef<string[]>([]);
    const character = eligible.find(c => c.id === current) || eligible[0];
    useEffect(() => { bag.current = []; }, [ids]);
    useEffect(() => {
        const media = matchMedia('(prefers-reduced-motion: reduce)'); const motion = () => setReduced(media.matches); const visibility = () => setHidden(document.hidden);
        media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
        return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    useEffect(() => {
        if (!playing || reduced || hidden || hover || focused || eligible.length < 2) return;
        const timer = setInterval(() => {
            if (document.querySelector('#astral-root')?.shadowRoot?.querySelector('[role="dialog"]')) return;
            if (!bag.current.length) bag.current = shuffled(eligible.map(c => c.id), character?.id);
            const next = bag.current.shift(); if (next) setCurrent(next);
        }, 12000);
        return () => clearInterval(timer);
    }, [playing, reduced, hidden, hover, focused, character?.id, ids]);
    if (!character) return null;
    const index = eligible.indexOf(character), chat = conversations.find(c => c.characterId === character.id);
    const move = (direction: number) => { bag.current = []; setPlaying(false); setCurrent(eligible[(index + direction + eligible.length) % eligible.length].id); };
    return <article className="featured featured-v3" aria-label="Featured characters" aria-roledescription="carousel" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
        <SceneBackground character={character} />
        <div className="featured-image"><img className={character.art.startsWith('/astral/art/') ? 'portrait-art' : 'custom-art'} src={character.art} alt={`${character.name}, ${character.role}`} fetchPriority="high" /></div>
        <div className="featured-content"><p className="featured-role">{character.role}</p><h2>{character.name}</h2><p className="featured-description">{character.description.slice(0, 220)}{character.description.length > 220 ? '…' : ''}</p><button className="button" disabled={!ready} onClick={() => open(character, chat)}>{chat ? `Continue with ${character.name}` : `Meet ${character.name}`}<ArrowRight size={16} /></button></div>
        <div className="slideshow-controls"><button className="icon-button" aria-label="Previous character" onClick={() => move(-1)}><ArrowLeft size={17} /></button><span>{index + 1} / {eligible.length}</span><button className="icon-button" aria-label="Next character" onClick={() => move(1)}><ArrowRight size={17} /></button>{!reduced && <button className="icon-button" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>}</div>
    </article>;
}
