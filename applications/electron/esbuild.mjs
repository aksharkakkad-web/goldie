/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import { electronOptions } from './gen-esbuild.electron.mjs';
import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Upstream scans the entire output folder. Browser and preload watch builds
// share lib/frontend, so they can concurrently rewrite the same source map.
// Limit each rewrite to files emitted by that context's current build.
function sourceMapPathsForOutputs() {
    return {
        name: 'goldie-source-map-paths',
        setup(build) {
            build.initialOptions.metafile = true;
            build.onEnd(async result => {
                if (result.errors.length) {
                    return;
                }
                await Promise.all(Object.keys(result.metafile?.outputs ?? {}).filter(file => file.endsWith('.map')).map(async file => {
                    const map = JSON.parse(await fs.readFile(file, 'utf8'));
                    if (Array.isArray(map.sources)) {
                        map.sources = map.sources.map(source => source.startsWith('..')
                            ? pathToFileURL(path.resolve(path.dirname(file), source)).href : source);
                        await fs.writeFile(file, JSON.stringify(map));
                    }
                }));
            });
        }
    };
}

for (const options of [browserOptions, nodeOptions, electronOptions]) {
    options.plugins = options.plugins.map(plugin => plugin.name === 'theia-source-map-paths'
        ? sourceMapPathsForOutputs() : plugin);
}

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);
const electronContext = await esbuild.context(electronOptions);

if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
        electronContext.watch(),
    ]);
} else {
    try {
        await browserContext.rebuild();
        await browserContext.dispose();
        await nodeContext.rebuild();
        await nodeContext.dispose();
        await electronContext.rebuild();
        await electronContext.dispose();
    } catch {
        process.exit(1);
    }
}
