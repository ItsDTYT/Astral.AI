import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';

export function recommend(machine, catalog) {
    const gpu = machine.gpu;
    const reserveMiB = gpu ? Math.max(768, gpu.totalMiB * .1) : 0;
    const available = gpu ? Math.max(0, Math.min(gpu.totalMiB, gpu.freeMiB ?? gpu.totalMiB) - reserveMiB) : 0;
    const tier = gpu ? gpu.totalMiB / 1024 : 0;
    const candidates = catalog.filter(m => m.tierGiB && m.minRamGiB <= machine.totalGiB && m.tierGiB <= Math.max(4, tier + .15));
    const fits = candidates.filter(m => {
        const weightMiB = m.bytes / 1024 ** 2;
        const gpuCost = weightMiB + 256 + m.defaultContext * .03 + (gpu?.totalMiB > 8192 ? (m.projector?.bytes || 0) / 1024 ** 2 : 0);
        const hostCostGiB = (m.projector?.bytes || 0) / 1024 ** 3 + 1.5 + (gpu ? 0 : m.bytes / 1024 ** 3);
        return (!gpu || gpuCost <= available) && (machine.freeGiB ?? machine.totalGiB) >= hostCostGiB;
    });
    const model = [...(fits.length ? fits : candidates.slice(0, 1))].sort((a, b) => b.tierGiB - a.tierGiB)[0];
    return { modelId: model?.id || '', quant: model?.quant || 'Custom GGUF', context: model?.defaultContext || 2048,
        gpuLayers: gpu ? 99 : 0, reserveMiB, estimated: true,
        note: model ? `${model.name} ${model.quant} is the balanced starting choice for this setup. ${gpu ? `Keeping ${Math.ceil(reserveMiB)} MB graphics memory free for Windows; other applications and images also use memory.` : 'CPU mode is available; replies will be slower.'} Fit is estimated and checked when loading.` : 'Available system RAM is below the catalog profiles. Connect a local server or import a smaller GGUF.' };
}
let cached, cachedAt = 0;
export function detectHardware(resources, catalog = [], refresh = false, runtimeRoot = '') {
    if (!refresh && cached && Date.now() - cachedAt < 10000) return { ...cached, recommendation: recommend(cached, catalog) };
    const gpus = [];
    try {
        const lines = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim().split('\n');
        for (const [index, line] of lines.entries()) {
            const [name, total, free] = line.split(',').map(x => x.trim());
            if (Number(total)) gpus.push({ name, totalMiB: Number(total), freeMiB: Number(free), backend: 'cuda', device: `CUDA${index}`, integrated: false });
        }
    } catch { /* NVIDIA tools are optional on CPU, AMD, and Intel systems. */ }
    if (process.platform === 'win32') {
        try {
            // The 64-bit registry memory value avoids WMI AdapterRAM's 4 GB overflow.
            const script = '$r=@(); Get-ChildItem \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\' -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-ItemProperty ($_.PSPath+\'\\0000\') -ErrorAction SilentlyContinue; if($p.\'HardwareInformation.qwMemorySize\'){ $n=$p.\'HardwareInformation.AdapterString\'; if($n -is [byte[]]){$n=[Text.Encoding]::Unicode.GetString($n).Trim([char]0)}; $r+=@{name=[string]$n; totalMiB=[math]::Floor([double]$p.\'HardwareInformation.qwMemorySize\'/1MB)}} }; ConvertTo-Json -InputObject @($r) -Compress';
            const adapters = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 7000, windowsHide: true }));
            for (const gpu of adapters) if (gpu.name && !gpus.some(g => g.name === gpu.name || (g.name.includes('NVIDIA') && gpu.name.includes('NVIDIA')))) gpus.push({ ...gpu, freeMiB: gpu.totalMiB, backend: 'vulkan', integrated: gpu.totalMiB < 512, freeMemoryEstimated: true });
        } catch { /* Unknown adapters safely retain CPU inference. */ }
    }
    const root = process.env.ASTRAL_RUNNER_ROOT || path.join(resources, 'runner');
    const installedVulkan = path.join(runtimeRoot, 'vulkan', 'llama-server.exe');
    const vulkan = runtimeRoot && fs.existsSync(installedVulkan) ? installedVulkan : path.join(root, 'vulkan', 'llama-server.exe');
    if (gpus.some(g => g.backend === 'vulkan' && !g.integrated) && fs.existsSync(vulkan)) {
        try {
            const devices = execFileSync(vulkan, ['--list-devices'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
            for (const gpu of gpus.filter(g => g.backend === 'vulkan')) {
                const row = devices.split('\n').find(line => line.includes(gpu.name));
                gpu.device = row?.match(/(Vulkan\d+):/)?.[1];
                gpu.compatible = !!gpu.device;
            }
        } catch { for (const gpu of gpus.filter(g => g.backend === 'vulkan')) gpu.compatible = false; }
    }
    const usable = gpus.filter(g => !g.integrated && g.compatible !== false).sort((a, b) => b.totalMiB - a.totalMiB);
    cached = { cpu: os.cpus()[0]?.model || 'Processor', threads: os.availableParallelism(), totalGiB: Math.round(os.totalmem() / 1024 ** 3), freeGiB: Math.round(os.freemem() / 1024 ** 3 * 10) / 10, gpus, gpu: usable[0] || null };
    cachedAt = Date.now();
    return { ...cached, recommendation: recommend(cached, catalog) };
}
let pendingProbe;
export function cachedHardware(catalog = []) {
    const machine = cached || { cpu: os.cpus()[0]?.model || 'Processor', threads: os.availableParallelism(), totalGiB: Math.round(os.totalmem() / 1024 ** 3), freeGiB: Math.round(os.freemem() / 1024 ** 3 * 10) / 10, gpu: null, gpus: [], detecting: true };
    return { ...machine, recommendation: recommend(machine, catalog) };
}
export function probeHardware(resources, catalog = [], runtimeRoot = '') {
    if (cached && Date.now() - cachedAt < 10000) return Promise.resolve(cachedHardware(catalog));
    if (!pendingProbe) pendingProbe = new Promise(resolve => {
        const worker = new Worker(new URL('./hardware-worker.js', import.meta.url), { workerData: { resources, runtimeRoot } });
        const finish = machine => { if (machine) { cached = machine; cachedAt = Date.now(); } resolve(cachedHardware(catalog)); };
        const timeout = setTimeout(() => { void worker.terminate(); finish(); }, 20000);
        worker.once('message', machine => { clearTimeout(timeout); finish(machine); });
        worker.once('error', () => { clearTimeout(timeout); finish(); });
    }).finally(() => { pendingProbe = undefined; });
    return pendingProbe.then(machine => ({ ...machine, recommendation: recommend(machine, catalog) }));
}
