const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
    'astralDesktop',
    Object.freeze({
        selectModel: () => ipcRenderer.invoke('astral:select-model'),
        openDataFolder: () => ipcRenderer.invoke('astral:open-data'),
        version: () => ipcRenderer.invoke('astral:version'),
        libraryReady: () => ipcRenderer.send('astral:library-ready'),
        openExternal: (url) => ipcRenderer.invoke('astral:open-external', url),
        onActivated: (listener) => {
            const handler = () => listener();
            ipcRenderer.on('astral:activated', handler);
            ipcRenderer.send('astral:activation-ready');
            return () => ipcRenderer.removeListener('astral:activated', handler);
        },
    }),
);
