// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url));
const app = resolve(directory, '..'); const repo = resolve(app, '../..');

/** Explicit allowlist: never upload the repo, private env, local tools, data or keys. */
export async function buildJudgeOutput(output) {
    if (!output || !isAbsolute(output)) { throw new Error('Use an absolute output path.'); }
    const fn = resolve(output, 'functions/judge.func'); const publicDir = resolve(fn, 'public');
    await mkdir(resolve(publicDir, 'src'), { recursive: true }); await mkdir(resolve(publicDir, 'assets'), { recursive: true });
    for (const file of ['index.html', 'style.css', ...['app', 'view', 'controller', 'api', 'media', 'scenario', 'orb'].map(name => `src/${name}.js`)]) {
        await copyFile(resolve(app, file), resolve(publicDir, file));
    }
    for (const file of ['handler.mjs', 'http.mjs']) { await copyFile(resolve(directory, file), resolve(fn, file)); }
    await copyFile(resolve(repo, 'theia-extensions/product/src/browser/icons/goldie/icon-dark.png'), resolve(publicDir, 'assets/goldie.png'));
    const source = await readFile(resolve(repo, 'theia-extensions/product/src/browser/goldie/gradient-orb.tsx'), 'utf8');
    const vertex = source.match(/const vertexShader = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
    const fragment = source.match(/const fragmentShader = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
    if (!vertex || !fragment) { throw new Error('Missing merged orb shaders.'); }
    await writeFile(resolve(publicDir, 'orb-shaders.js'), `// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT\nexport const vertexShader=${JSON.stringify(vertex)};\nexport const fragmentShader=${JSON.stringify(fragment)};`);
    await writeFile(resolve(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs24.x', handler: 'handler.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }));
    await writeFile(resolve(output, 'config.json'), JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/judge?__goldie_path=$1' }] }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await buildJudgeOutput(resolve(process.argv[2] ?? resolve(app, '.vercel/output')));
    console.log('Allowlisted judge deployment built. No provider credentials or repository data included.');
}
