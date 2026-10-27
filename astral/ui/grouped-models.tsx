import React, { useState } from 'react';
import { groupModels } from '../shared/model-families';
import type { Model } from './types';
export function GroupedModels({ models, runningId, preferredId, children }: { models: Model[]; runningId: string; preferredId?: string; children: (model: Model, selector: React.ReactNode) => React.ReactNode }) {
    const [selected, setSelected] = useState<Record<string, string>>({});
    return <>{groupModels(models, runningId, preferredId).map(family => {
        const model = family.versions.find(m => m.id === selected[family.id]) || family.versions.find(m => m.id === runningId) || family.versions.find(m => m.id === preferredId) || family.versions.find(m => m.recommended) || family.versions[0];
        const selector = family.versions.length > 1 ? <details className="model-versions"><summary>File version · {model.quant}</summary><p>These are different file versions of the same model. Smaller files use less memory; larger files retain more precision.</p><label>Choose a version<select aria-label={`${model.name} file version`} value={model.id} onChange={e => setSelected({ ...selected, [family.id]: e.target.value })}>{family.versions.map(m => <option value={m.id} key={m.id}>{m.quant} · {(m.bytes / 1024 ** 3).toFixed(1)} GB{m.recommended ? ' · Recommended' : ''}{m.ready ? ' · Installed' : ''}</option>)}</select></label></details> : null;
        return <React.Fragment key={family.id}>{children(model, selector)}</React.Fragment>;
    })}</>;
}
