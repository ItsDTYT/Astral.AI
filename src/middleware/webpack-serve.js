import path from 'node:path';
import fs from 'node:fs';

export default function getWebpackServeMiddleware() {
    let compiledOutput;
    const bundledLibrary = process.env.ASTRAL_PRECOMPILED_LIB;
    if (bundledLibrary) {
        if (!fs.existsSync(bundledLibrary)) throw new Error('Astral browser libraries are missing. Run npm run astral:build before starting the desktop app.');
        const serveBundled = (req, res, next) => {
            if (req.method === 'GET' && req.path === '/lib.js') return res.sendFile(bundledLibrary);
            next();
        };
        serveBundled.runWebpackCompiler = async () => { console.log('Using bundled SillyTavern browser libraries.'); };
        return serveBundled;
    }
    /**
     * A very spartan recreation of webpack-dev-middleware.
     * @param {import('express').Request} req Request object.
     * @param {import('express').Response} res Response object.
     * @param {import('express').NextFunction} next Next function.
     * @type {import('express').RequestHandler}
     */
    function devMiddleware(req, res, next) {
        const outputPath = compiledOutput?.path;
        const outputFile = compiledOutput?.filename;
        const parsedPath = path.parse(req.path);

        if (req.method === 'GET' && parsedPath.dir === '/' && parsedPath.base === outputFile) {
            return res.sendFile(outputFile, { root: outputPath });
        }

        next();
    }

    /**
     * Wait until Webpack is done compiling.
     * @param {object} param Parameters.
     * @param {boolean} [param.forceDist=false] Whether to force the use the /dist folder.
     * @param {boolean} [param.pruneCache=false] Whether to prune old cache directories before compiling.
     * @returns {Promise<void>}
     */
    devMiddleware.runWebpackCompiler = async ({ forceDist = false, pruneCache = false } = {}) => {
        console.log();
        console.log('Compiling frontend libraries...');

        const [{ default: webpack }, { default: getPublicLibConfig }] = await Promise.all([import('webpack'), import('../../webpack.config.js')]);
        const publicLibConfig = getPublicLibConfig({ forceDist, pruneCache });
        compiledOutput = publicLibConfig.output;
        const compiler = webpack(publicLibConfig);

        return new Promise((resolve) => {
            compiler.run((_error, stats) => {
                const output = stats?.toString(publicLibConfig.stats);
                if (output) {
                    console.log(output);
                    console.log();
                }
                compiler.close(() => {
                    resolve();
                });
            });
        });
    };

    return devMiddleware;
}
