#!/usr/bin/env node
import { CommandLineParser } from './src/command-line.js';
import { serverDirectory } from './src/server-directory.js';

console.log(`Node version: ${process.version}. Running in ${process.env.NODE_ENV} environment. Server directory: ${serverDirectory}`);

// config.yaml will be set when parsing command line arguments
const cliArgs = new CommandLineParser().parse(process.argv);
globalThis.DATA_ROOT = cliArgs.dataRoot;
globalThis.COMMAND_LINE_ARGS = cliArgs;
process.chdir(process.env.ASTRAL_DESKTOP === '1' ? pathWorkingDirectory() : serverDirectory);
function pathWorkingDirectory() {
    // CLI parsing has resolved dataRoot before the installation becomes read-only.
    return globalThis.DATA_ROOT;
}

try {
    await import('./src/server-main.js');
    process.parentPort?.on('message', async ({ data }) => {
        if (data === 'astral:shutdown') {
            const { shutdownAstral } = await import('./src/astral/router.js');
            await shutdownAstral();
            process.exit(0);
        }
    });
} catch (error) {
    console.error('A critical error has occurred while starting the server:', error);
    process.exitCode = 1;
}
