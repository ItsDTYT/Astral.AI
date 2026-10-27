import React, { useState } from 'react';
import { Download, Square, Cpu, Check } from 'lucide-react';
import { request } from './api';
import type { RuntimeStatus, Hardware } from './types';
export function RuntimeSetup({ runtimes, machine, cpu, useCPU, useGPU, refresh, run }: { runtimes: RuntimeStatus[]; machine: Hardware | null; cpu: boolean; useCPU: () => void; useGPU: () => void; refresh: () => Promise<unknown>; run: (task: () => Promise<unknown>, message?: string) => Promise<unknown> }) {
    const [other, setOther] = useState(false);
    const preferred = machine?.gpu?.backend || 'cuda';
    const action = async (action: string, backend: string) => { await request('/api/astral/runtimes', { action, backend }); await refresh(); };
    return <div className="settings-section runtime-setup"><h2>Run models on this computer</h2><p>CPU support is included. GPU support is a separate, one-time download and stays installed between app updates.</p><div className="button-row"><span><Check size={15} /> CPU available</span><button className="button secondary small" onClick={useCPU}>{cpu ? 'Using CPU for the next load' : 'Use CPU for the next load'}</button></div>
        {runtimes.filter(r => r.backend !== 'cpu' && (r.backend === preferred || other)).map(runtime => <div className="runtime-row" key={runtime.backend}><div><strong>{runtime.backend === 'cuda' ? 'NVIDIA CUDA' : 'AMD / Intel Vulkan'} support</strong><p>{runtime.version} · {(runtime.total / 1024 ** 2).toFixed(0)} MB download{runtime.backend === preferred && machine?.gpu ? ' · Matches your graphics card' : ''}</p></div>
            {runtime.state === 'ready' ? <span><Check size={15} /> Installed{cpu && runtime.backend === preferred && <button className="text-button" onClick={useGPU}>Use GPU for the next load</button>}</span> : ['downloading', 'verifying', 'installing'].includes(runtime.state) ? <><progress max={runtime.total || 1} value={runtime.downloaded} aria-label={`${runtime.backend} download progress`} /><span>{runtime.state === 'downloading' ? `${Math.round(runtime.downloaded / (runtime.total || 1) * 100)}%` : runtime.state === 'verifying' ? 'Checking download…' : 'Installing…'}</span><button className="text-button" disabled={runtime.state === 'installing'} onClick={() => void run(() => action('pause', runtime.backend))}><Square size={14} /> Pause</button></> : <button className="button secondary small" onClick={() => void run(() => action('download', runtime.backend))}><Download size={15} /> {runtime.state === 'paused' ? 'Resume' : 'Install GPU support'}</button>}
            {runtime.error && <p className="inline-error" role="alert">{runtime.error}<button className="text-button" onClick={() => void run(() => action('discard', runtime.backend))}>Reset download</button></p>}
        </div>)}<button className="text-button" onClick={() => setOther(!other)}><Cpu size={15} /> {other ? 'Hide other GPU options' : 'Other GPU options'}</button>
    </div>;
}
