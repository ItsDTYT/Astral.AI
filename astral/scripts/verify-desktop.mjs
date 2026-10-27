import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import path from 'node:path';

// Requires one downloaded model in the desktop app's data folder.
const executable = path.resolve(process.argv[2] || 'release/win-unpacked/Astral.AI.exe');
const child = spawn(executable, ['--remote-debugging-port=19229'], {
    env: { ...process.env, ASTRAL_SMOKE: 'lifecycle', PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}` },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
const exited = new Promise((resolve) => child.once('exit', resolve));
let browser;
try {
    const deadline = Date.now() + 150000;
    while (!browser && Date.now() < deadline) {
        try {
            browser = await chromium.connectOverCDP('http://127.0.0.1:19229');
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    if (!browser) throw new Error('Desktop debugging endpoint did not become ready.');
    let page;
    while (!page && Date.now() < deadline) {
        page = browser
            .contexts()
            .flatMap((context) => context.pages())
            .find((candidate) => candidate.url().startsWith('http://127.0.0.1:'));
        if (!page) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!page) throw new Error('Desktop window did not become ready.');
    await page.waitForFunction(() => window.astralBridge?.st?.astralAppReady, undefined, { timeout: 90000 });
    await page.evaluate(async (modelId) => {
        const { token } = await (await fetch('/csrf-token')).json();
        const response = await fetch('/api/astral/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
            body: JSON.stringify({ action: 'start', modelId, options: { gpuLayers: 28, context: 4096 } }),
        });
        if (!response.ok) throw new Error(await response.text());
    }, process.argv[3] || 'angelic-iq4_xs');
    let runner;
    const loadDeadline = Date.now() + 180000;
    do {
        runner = await page.evaluate(async () => (await (await fetch('/api/astral/models')).json()).runner);
        if (runner.state === 'error') throw new Error(runner.error);
        if (runner.state !== 'ready') await new Promise((resolve) => setTimeout(resolve, 500));
    } while (runner.state !== 'ready' && Date.now() < loadDeadline);
    if (runner.state !== 'ready') throw new Error('Native runner did not become ready.');
    console.log('ASTRAL_DESKTOP_MODEL_READY');
    await page.close();
    await Promise.race([
        exited,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Desktop did not shut down.')), 10000).unref(),
        ),
    ]);
    const stillRunning = await fetch(runner.url + '/health', { signal: AbortSignal.timeout(3000) }).then(
        () => true,
        () => false,
    );
    if (stillRunning) throw new Error('Native runner survived closing the desktop app.');
    console.log('ASTRAL_DESKTOP_RUNNER_SHUTDOWN_VERIFIED');
} finally {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill();
}
