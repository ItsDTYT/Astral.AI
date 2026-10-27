const { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { windowState } = require('./window-state.cjs');
let activated = false;
let rendererReady = false;
let server;
let window;
let origin;
let closing = false;
const startedAt = Date.now();
const desktopToken = crypto.randomBytes(32).toString('hex');
const timing = event => console.log(JSON.stringify({ event, elapsedMs: Date.now() - startedAt }));
const root = path.resolve(__dirname, '../..');
app.setName('Astral.AI');
app.setAppUserModelId('ai.astral.desktop');
if (app.isPackaged) { app.commandLine.removeSwitch('remote-debugging-port'); app.commandLine.removeSwitch('remote-debugging-pipe'); }
if (process.env.ASTRAL_TEST_USER_DATA) app.setPath('userData', path.resolve(process.env.ASTRAL_TEST_USER_DATA));
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        activated = true;
        if (window && !window.isDestroyed()) {
            if (window.isMinimized()) window.restore();
            window.show();
            window.focus();
            if (rendererReady) { window.webContents.send('astral:activated'); activated = false; }
        }
    });
    async function port() {
        const s = net.createServer();
        await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
        const p = s.address().port;
        await new Promise((resolve) => s.close(resolve));
        return p;
    }
    function trusted(event) {
        if (!origin || !window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Untrusted IPC sender.');
    }
    app.whenReady().then(async () => {
        const dataRoot = path.join(app.getPath('userData'), 'data');
        const config = path.join(app.getPath('userData'), 'config.yaml');
        fs.mkdirSync(dataRoot, { recursive: true });
        if (!fs.existsSync(config)) fs.copyFileSync(path.join(root, 'default/config.yaml'), config);
        const p = await port();
        origin = `http://127.0.0.1:${p}`;
        const geometry = windowState(app.getPath('userData'), screen);
        window = new BrowserWindow({
            show: !process.env.ASTRAL_SMOKE,
            ...geometry.bounds,
            minWidth: Math.min(600, geometry.bounds.width),
            minHeight: Math.min(440, geometry.bounds.height),
            backgroundColor: '#18181b',
            title: 'Astral.AI',
            icon: path.join(root, 'astral/resources/icon.png'),
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webSecurity: true,
                devTools: !app.isPackaged,
            },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-attach-webview', event => event.preventDefault());
        const ownerContents = window.webContents;
        const ownerContentsId = ownerContents.id;
        ownerContents.session.webRequest.onBeforeSendHeaders({ urls: [origin + '/*'] }, (details, callback) => {
            if (!ownerContents.isDestroyed() && details.webContentsId === ownerContentsId) details.requestHeaders['X-Astral-Desktop-Token'] = desktopToken;
            callback({ requestHeaders: details.requestHeaders });
        });
        window.on('page-title-updated', (event) => event.preventDefault());
        window.webContents.on('will-navigate', (event, url) => {
            if (!url.startsWith(origin + '/')) event.preventDefault();
        });
        window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
            callback(false),
        );
        geometry.bind(window);
        if (geometry.maximized && !process.env.ASTRAL_SMOKE) window.maximize();
        await window.loadFile(path.join(__dirname, 'startup.html'));
        timing('window-visible');
        const log = fs.createWriteStream(path.join(app.getPath('userData'), 'server.log'), { flags: 'a' });
        server = utilityProcess.fork(
            path.join(root, 'server.js'),
            [
                '--dataRoot',
                dataRoot,
                '--configPath',
                config,
                '--port',
                String(p),
                '--listen',
                'false',
                '--browserLaunchEnabled',
                'false',
                '--enableIPv6',
                'false',
            ],
            {
                cwd: app.getPath('userData'),
                stdio: 'pipe',
                env: {
                    ...process.env,
                    ASTRAL_DESKTOP: '1',
                    ASTRAL_DESKTOP_TOKEN: desktopToken,
                    ASTRAL_DESKTOP_ORIGIN: origin,
                    ASTRAL_PRECOMPILED_LIB: path.join(root, 'astral/resources/upstream-lib.js'),
                    ASTRAL_RUNNER_ROOT: app.isPackaged
                        ? path.join(process.resourcesPath, 'runner')
                        : path.join(root, 'astral/resources/runner'),
                },
            },
        );
        server.stdout.on('data', (data) => log.write(data));
        server.stderr.on('data', (data) => log.write(data));
        server.on('exit', (code) => {
            server = null;
            log.end();
            if (!closing) {
                dialog.showErrorBox(
                    'Astral.AI stopped',
                    `The local service exited (${code}). Diagnostics are in ${app.getPath('userData')}\\server.log.`,
                );
                app.quit();
            }
        });
        const deadline = Date.now() + 120000;
        let ready = false;
        while (Date.now() < deadline) {
            if (!server || closing) return;
            try {
                if ((await fetch(origin + '/csrf-token', { headers: { 'X-Astral-Desktop-Token': desktopToken } })).ok) {
                    ready = true;
                    break;
                }
            } catch { /* The loopback server is still starting. */ }
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (!ready) {
            dialog.showErrorBox(
                'Astral.AI could not start',
                'The local service did not become ready. Open server.log in the Astral.AI application data folder.',
            );
            return app.quit();
        }
        ipcMain.handle('astral:select-model', async (event) => {
            trusted(event);
            const result = await dialog.showOpenDialog(window, {
                title: 'Link a GGUF model',
                properties: ['openFile'],
                filters: [{ name: 'GGUF model', extensions: ['gguf'] }],
            });
            return result.canceled ? null : result.filePaths[0];
        });
        ipcMain.handle('astral:open-data', async (event) => {
            trusted(event);
            await shell.openPath(app.getPath('userData'));
        });
        ipcMain.handle('astral:version', (event) => {
            trusted(event);
            return app.getVersion();
        });
        ipcMain.handle('astral:open-external', async (event, value) => {
            trusted(event);
            if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid link.');
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only secure public links are supported.');
            await shell.openExternal(url.href);
        });
        ipcMain.on('astral:activation-ready', (event) => {
            trusted(event);
            rendererReady = true;
            timing('chat-engine-ready');
            if (activated) {
                window.show(); window.focus();
                window.webContents.send('astral:activated');
                activated = false;
            }
        });
        ipcMain.on('astral:library-ready', event => { trusted(event); timing('library-ready'); });
        await window.loadURL(origin);
        if (process.env.ASTRAL_SMOKE === '1') {
            const smokeDeadline = Date.now() + 90000;
            let smokeReady = false;
            while (Date.now() < smokeDeadline) {
                if (await window.webContents.executeJavaScript('!!window.astralBridge?.st?.astralAppReady')) {
                    const thumbnail = await fetch(origin + '/thumbnail?type=avatar&file=default_Seraphina.png', { headers: { 'X-Astral-Desktop-Token': desktopToken } });
                    if (!thumbnail.ok || (await thumbnail.arrayBuffer()).byteLength < 100) {
                        console.error('ASTRAL_IMAGE_CODEC_FAILED');
                        app.exit(1);
                        return;
                    }
                    console.log('ASTRAL_IMAGE_CODEC_READY');
                    console.log('ASTRAL_DESKTOP_READY');
                    smokeReady = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            if (!smokeReady) { console.error('ASTRAL_DESKTOP_TIMEOUT'); app.exit(1); return; }
            setTimeout(() => app.quit(), 1000);
        }
    }).catch(error => {
        if (!closing) dialog.showErrorBox('Astral could not start', `The local service could not finish starting. Open the Astral.AI data folder to check diagnostics. ${error.code || ''}`);
        app.quit();
    });
    app.on('before-quit', (event) => {
        if (closing || !server) return;
        event.preventDefault();
        closing = true;
        const child = server;
        const timeout = setTimeout(() => {
            child.kill();
            server = null;
            app.quit();
        }, 5000);
        child.once('exit', () => {
            clearTimeout(timeout);
            app.quit();
        });
        child.postMessage('astral:shutdown');
    });
    app.on('window-all-closed', () => app.quit());
}
