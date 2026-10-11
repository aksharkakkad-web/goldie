# Goldie desktop development

## Toolchain on this Mac

Apple Silicon, Node 24.21.0, Yarn Classic 1.22.22, Xcode and Python 3.
From your own checkout, use the repository's pinned Node version:

```sh
nvm use
node --version
yarn --version
```

Developers without nvm can put their existing Node 24.21.0/Yarn 1.22.22 installation
on PATH. Keep the upstream lockfile; do not reinstall for routine source changes.

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
yarn electron start .
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

Add `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` to `backend/.env`, preserving existing
values if the file already exists, then build, test and start the service:

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

## Connected Stage 1 lesson

Build with `yarn backend:build`, `yarn workspace theia-ide-product-ext build`,
and `yarn electron build`, then run the backend and native Electron application as
above. The explicit reference API selector is `webapp-architecture`; the Stage 2
desktop uses supplied handoff context instead. The reference
lesson covers frontend, backend/API and database through creating a team; it does
not inspect workspace files or generate an application.

Pause/play, Explain more, typed prepared questions, skip, self-reported familiarity,
and End session use saved server progress. Closing/reopening or restarting restores
the accepted lesson without starting audio. Clip position survives question/add-on
interruptions while the panel is open; it is not saved across closing the panel.
Speech errors leave text and read/skip/end controls usable. Credentials stay in
ignored `backend/.env`. Use only one backend process per JSON data directory.

Run `yarn test:stage1` and `yarn lint` before handoff. These do not spend credits.
Native playback and failure evidence, diagnostic fixture limits, and the separate
packaged-Electron test prerequisite are in [the Stage 1 guide](docs/goldie-stage1.md).

## Stage 3 backend setup

Stage 3 adds conversational Gemini answers, optional text practice and local Whisper
transcription. See `docs/stage3-integration.md` for explicit binary/model setup,
server-only paths and exact Node/RPC payloads. Run `yarn test:stage3` for cumulative
checks. The recording/practice renderer is Rishit's separate track; existing Stage 2
typed UI is not proof of the Stage 3 voice-only gate. No microphone starts on restore.

## Integrated Stage 2

Open the Goldie panel and choose **Load handoff** or run **Goldie: Load sample handoff**
from the command palette. Select one Markdown file from `docs/stage2-samples/`, then
choose Beginner or Intermediate. Loading and changing level save context locally;
they do not contact the teaching backend or start audio. **Prepare lesson** sends
the selected context. **Explain this build** accepts the offer and permits playback.

End the current session or decline its offer before loading different context.
Edit a sample in the editor, save, then explicitly load it again to send changed
context. There is no handoff watcher yet. The same lesson controls support variable
phase counts and preserve the accepted context on retry/restart.

Goldie uses Theia's in-app file picker because the native Mac picker blocked valid
Markdown selections during verification. In the picker, the pencil icon switches
to path input. Enter a sample file path, select the file and choose Open.

Both tracks are integrated locally. Add Gemini credentials only to the existing
ignored backend `.env`. The approved primary is `gemini-3.5-flash-lite`, with a
20-second provider deadline and no automatic retry or fallback. Offer/teach
transport permits 30 seconds; ordinary acceptance retains 15 seconds. The IDE
does not send a reference selector, and generated roadmaps have no fixed phase cap.

If acceptance conflicts with a lesson in another window, finish it in its owning
window. Definite rejections archive/release pending recovery and unlock context;
uncertain network failures preserve the exact pending intent. Restore never autoplays.
Run `yarn test:stage2`, `yarn lint` and `yarn electron build` before handoff; those
do not spend credits. `yarn backend:smoke:gemini --play` is an explicitly invoked
real-provider check using existing credits. Contracts/privacy are in
`docs/stage2-api.md`; current evidence and the separate joint merged-main gate are
in `docs/stage2-alignment-verification.md`. `docs/goldie-stage2.md` records the
earlier Rishit-only controlled milestone, not live AI evidence.

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

- Wrong Node/Yarn: use the pinned toolchain above, then `node -v` and `yarn -v`. Node 22 does not meet this checkout's requirements.
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
and real ElevenLabs credential validation. The integrated Stage 1 desktop adds prepared
web-app architecture lessons, local persistent session/progress state, Q&A, recap and
real ElevenLabs playback/cache. Stage 2 adds Gemini-driven roadmaps/teaching and
explicit handoff/profile loading, merged in PR #3. Stage 3 backend work adds
conversational answers, local transcription and practice; native integration remains
a separate gate. Onboarding and live Codex handoffs remain future work.
See `docs/stage1-api.md` for exact contracts and `docs/goldie-stage1.md` for the native
workflow and verified integration status. The human together-run checkpoint remains open.
