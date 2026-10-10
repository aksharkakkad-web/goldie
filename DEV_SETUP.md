# Goldie desktop development

## Toolchain on this Mac

Apple Silicon, Node 24.21.0, Yarn Classic 1.22.22, Xcode and Python 3.
Node and Yarn were installed separately for this project. In each new terminal:

```sh
export PATH="$HOME/.local/share/buildsense/node-v24.21.0-darwin-arm64/bin:$HOME/.local/share/buildsense/tools/bin:$PATH"
cd /Users/rishits/Documents/ChatGPT/hacknc/buildsense
```

`.nvmrc` also pins Node for developers who use nvm. Keep the upstream lockfile.

## First build

```sh
yarn --frozen-lockfile
yarn build:dev
yarn download:plugins
```

The initial build builds both upstream targets. Subsequent desktop-only builds use `yarn electron build`.
No installer or packaging is needed.

## Daily development

In one terminal, run:

```sh
yarn electron watch
```

This starts TypeScript build watch and Theia's Electron application bundler.
The upstream `theiaext` command was missing; the local script now uses the installed `tsc -b --watch`.
The Electron tsconfig references the product, launcher and updater extensions.
In another terminal:

```sh
yarn electron start /Users/rishits/Documents/ChatGPT/hacknc/buildsense
```

Keep the app process running while editing source. After the watcher finishes without errors,
press **Cmd-R**, or use **Cmd-Shift-P** and run **Reload Window**.
This workflow uses continuous rebuilding plus an explicit reload; it does not promise React hot reload.
For Electron main-process code, quit the desktop app and run the start command again.
For application dependency/configuration changes, stop watch, run `yarn electron build`, restart watch and the app.
Run `yarn` only when dependencies change. Download plugins again only when the plugin list changes.

## Goldie backend development

The teaching backend is a separate local process so provider credentials never enter the Electron renderer.
Create its ignored environment file once:

```sh
cp backend/.env.example backend/.env
```

Add `ELEVENLABS_API_KEY` to `backend/.env`, then build, test and start the service:

```sh
yarn backend:build
yarn backend:test
yarn backend:start
```

Keep the backend running in its own terminal alongside `yarn electron watch` and
`yarn electron start .`. It listens on `http://127.0.0.1:8787` by default. Check the
local route with `curl http://127.0.0.1:8787/health` and validate the provider key with
`yarn backend:smoke:elevenlabs`.

The Goldie panel calls the teaching backend through Theia's local RPC service, so the
Electron renderer's file origin needs no CORS override. `GOLDIE_ALLOWED_ORIGIN` controls
CORS for direct HTTP browser clients. `GOLDIE_BACKEND_URL` overrides the IDE transport's
default `http://127.0.0.1:8787` and must be set before starting the IDE. Never place provider
keys in Theia preferences, frontend code or renderer storage.

Run `yarn test:stage0` for all Stage 0 regression checks. In the desktop, verify Connected,
stop the backend and check Unavailable, then restart the backend and retry to recover.
The panel can be closed and reopened through **Goldie: Open Panel** in the command palette.

## Persistent terminals

A tmux session named `goldie` keeps development processes independent of this chat.

```sh
tmux attach -t goldie
```

The `ide` window runs Electron and `watch` runs both compilers.
Switch windows with Ctrl-B then a window number. Detach with Ctrl-B then D.
Detaching leaves the IDE and watchers running. Stop a foreground process with Ctrl-C in its window.
Use `tmux list-windows -t goldie` to inspect the session before starting duplicate processes.

## Source locations

- `applications/electron/package.json`: desktop application name, dependencies and generated app configuration.
- `applications/electron/scripts/theia-electron-main.js`: Electron launcher.
- `applications/electron/resources/`: splash screen and preload template.
- `theia-extensions/product/src/browser/branding-util.tsx`: welcome/About product heading and descriptions.
- `theia-extensions/product/src/browser/theia-ide-getting-started-widget.tsx`: welcome page layout.
- `theia-extensions/product/src/browser/style/index.css`: product styling.
- `theia-extensions/product/src/browser/theia-ide-frontend-module.ts`: frontend dependency bindings.
- `theia-extensions/product/src/electron-main/`: product Electron contributions.

Add custom Goldie panels as Theia widgets and view contributions in a local extension under
`theia-extensions/`. For the first panel, the existing product extension is a small starting point.
Register bindings in its frontend module. A larger independent feature can become a separate workspace extension,
listed in `applications/electron/package.json`. Do not edit generated `lib/`, `src-gen/` or `node_modules/`.
The Theia framework itself is an npm dependency. Framework internals require a local framework checkout;
see `docs/developing-with-local-theia.md` if we actually need that later.

## Troubleshooting

- Wrong Node/Yarn: run the PATH export above, then `node -v` and `yarn -v`. Node 22 does not meet this checkout's requirements.
- Native module errors after switching runtimes: stop the app and run `yarn electron rebuild`, then `yarn electron build`.
- TypeScript errors: read the watch terminal and fix the source error before reloading.
- Source changes absent: confirm TypeScript compilation and bundling both finished; reload the Electron window.
- Low disk space: installation needs room for dependency caches, node_modules, plugins and bundles.
- Plugin download errors: rerun `yarn download:plugins`; check the failing GitHub/Open VSX URL.
- Existing backend/port: stop the previous Goldie desktop process before starting another.
- Avoid upstream's blanket `git clean -xfd` suggestion because it deletes untracked work.

Development settings live in `~/.goldie-dev`, separate from upstream Theia IDE settings.
The upstream source, MIT license, notices, remote and Git history are retained.

## Verification

Verified on this Mac on 2026-10-10:

- `yarn --frozen-lockfile` completed, preserving the upstream lockfile.
- `yarn build:dev` built the extensions, browser target and Electron target successfully.
- `yarn download:plugins` completed, including the built-in editor plugins and Java extension pack.
- The real Electron desktop app opened the repository; Explorer and quick file opening worked.
- The integrated terminal ran `printf` and `pwd`, and created `docs/desktop-smoke.txt`.
- The desktop editor changed that file and saved it; the saved contents were verified on disk.
- A source edit to `branding-util.tsx` triggered TypeScript compilation with zero errors, followed by
  a browser bundle rebuild with zero errors in about 11 seconds. Reload Window displayed Goldie DEV.
- Desktop-only rebuilding after the title configuration change took about 9 seconds.

A stale, empty pyenv rehash lock from July 3 delayed terminal startup. It was backed up to
`/tmp/goldie-stale-pyenv-lock.backup` and removed; Python environments were preserved.
The desktop launcher sets the application name to Goldie, and the title template includes it.
The repository folder remains named `buildsense` to preserve the original setup path.

Electron 42 downloads its binary on first use. This is expected, not a failed Yarn install.
See https://www.electronjs.org/blog/electron-42-0.

Current process logs: `/tmp/goldie-desktop-verified.log`, `/tmp/goldie-watch-verified.log`.
Initial build log: `/tmp/goldie-build-real.log`; plugin log: `/tmp/goldie-plugins.log`.
`applications/electron/esbuild.mjs` contains a narrow source-map fix: each concurrent builder rewrites only
its own emitted maps, avoiding upstream's shared-folder race. All 17 emitted maps were parsed successfully.
The launcher skips the upstream splash in development to avoid its destroyed-window error on reload.
The corrected watch loop was exercised again with a temporary Goldie LIVE heading and restored to DEV.
Incremental rebuilds took about 10–30 seconds under this Mac's current workload. Reloading can also take time
while plugins initialize. It is explicit reload, not automatic hot reload.
Upstream deprecation and unsupported plugin-activation warnings remain, without blocking the verified flows.

The reviewed product specification is saved at `docs/Goldie_HackNC_PRD.md`.
Stage 0 implements the Goldie connection panel, teaching backend, shared API contracts,
and real ElevenLabs credential validation. The Stage 1 backend adds prepared web-app
architecture lessons, local persistent session/progress state, Q&A, recap and ElevenLabs
speech generation/cache. Rishit's lesson UI/playback integration, onboarding, Gemini
and live handoffs remain pending. See `docs/stage1-api.md` for the exact client sequence,
environment variables, `yarn test:stage1`, and the opt-in real-speech smoke command.
