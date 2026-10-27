import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';
import { LiquidMetal } from '@paper-design/shaders-react';
import { Container } from './vendor/liquid-glass.js';
import type { Screen, ThemeTokens } from './types';
const Glass: any = Container;

class EffectsBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}
function LiquidNavigation({ palette, screen }: { palette: ThemeTokens; screen: Screen }) {
    useEffect(() => {
        const root = document.querySelector('#astral-root')?.shadowRoot;
        const nav = root?.querySelector<HTMLElement>('.nav-item.active');
        if (!nav) return;
        let glass: any;
            try {
                // A palette-only texture never samples artwork or private conversation content.
                const snapshot = document.createElement('canvas');
                snapshot.width = innerWidth;
                snapshot.height = innerHeight;
                const ctx = snapshot.getContext('2d')!;
                const fill = ctx.createLinearGradient(0, 0, snapshot.width, snapshot.height);
                fill.addColorStop(0, palette.surface);
                fill.addColorStop(.6, palette.raised);
                fill.addColorStop(1, palette.effectAccent);
                ctx.fillStyle = fill;
                ctx.fillRect(0, 0, snapshot.width, snapshot.height);
                Glass.pageSnapshot = snapshot;
                glass = new Glass({
                    borderRadius: 7,
                    type: 'rounded',
                    tintOpacity: 0.08,
                });
                glass.element.classList.add('liquid-navigation');
                nav.style.position = 'relative';
                nav.style.isolation = 'isolate';
                nav.appendChild(glass.element);
                glass.updateSizeFromDOM();
            } catch {
                /* Standard CSS surfaces remain available without WebGL. */
            }
        return () => {
            glass?.destroy();
            Glass.pageSnapshot = null;
        };
    }, [palette.surface, palette.raised, palette.effectAccent, screen]);
    return null;
}
function SceneEffects({ active, screen, palette }: { active: boolean; screen: Screen; palette: ThemeTokens }) {
    const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const [visible, setVisible] = useState(!document.hidden);
    useEffect(() => {
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(media.matches);
        const visibility = () => setVisible(!document.hidden);
        media.addEventListener('change', update);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            media.removeEventListener('change', update);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, []);
    if (!active || reduced || !visible) return null;
    const mark = document.querySelector('#astral-root')?.shadowRoot?.querySelector('.sidebar .brand-mark');
    return (
        <>
            {mark && createPortal(<div className="liquid-emblem" aria-hidden="true">
                <LiquidMetal
                    shape="diamond"
                    colorBack="#00000000"
                    colorTint={palette.accent}
                    speed={0.18}
                    repetition={2}
                    softness={0.25}
                    distortion={0.15}
                    width={33}
                    height={38}
                    maxPixelCount={20000}
                />
            </div>, mark)}
            {screen !== 'chat' && (
                <div className="ambient-effects" aria-hidden="true">
                    <ShaderGradientCanvas pixelDensity={0.5} style={{ width: '100%', height: '100%' }}>
                        <ShaderGradient
                            lightType="3d"
                            type="plane"
                            color1={palette.effectPrimary}
                            color2={palette.effectSecondary}
                            color3={palette.effectAccent}
                            uSpeed={0.12}
                            uStrength={0.6}
                            brightness={palette.dark ? 0.6 : 1}
                            grain="off"
                        />
                    </ShaderGradientCanvas>
                </div>
            )}
            <LiquidNavigation palette={palette} screen={screen} />
        </>
    );
}
export default function Effects(props: { active: boolean; screen: Screen; palette: ThemeTokens }) {
    return (
        <EffectsBoundary>
            <SceneEffects {...props} />
        </EffectsBoundary>
    );
}
