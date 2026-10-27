import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
export default defineConfig({
    define: { __ASTRAL_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync('package.json', 'utf8')).version) },
    root: path.resolve('astral/ui'),
    base: '/astral/',
    build: {
        outDir: path.resolve('public/astral'),
        emptyOutDir: false,
        cssCodeSplit: false,
        rollupOptions: {
            input: path.resolve('astral/ui/main.tsx'),
            output: {
                entryFileNames: 'app.js',
                assetFileNames: (asset) =>
                    asset.names.some((n) => n.endsWith('.css')) ? 'app.css' : 'assets/[name]-[hash][extname]',
                chunkFileNames: 'chunks/[name]-[hash].js',
            },
        },
    },
});
