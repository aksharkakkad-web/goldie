# Goldie Stage 0 panel

The real Electron IDE has a Goldie panel docked on the right. It opens at startup.
Close it with its × button; reopen with Cmd-Shift-P → **Goldie: Open Panel**,
or View → Views → Goldie. The panel can be resized or moved like any Theia view.

Run the existing development loop from `DEV_SETUP.md`: `yarn electron watch` in one
terminal and `yarn electron start .` in another. Wait for compilation and bundling,
then Cmd-R to reload frontend changes. A new backend contribution requires
`yarn electron build` and a full Electron restart. Keep the tmux `goldie` session
running; detaching does not stop it.

## Teaching service

The default health endpoint is `http://127.0.0.1:8000/health`. Before starting the IDE,
set `GOLDIE_BACKEND_URL=http://127.0.0.1:PORT` if Akshar's service uses another port.
This setting is server-side, accepts only local HTTP addresses, and requires an IDE
restart. The renderer uses Theia's local RPC connection, avoiding Electron file-origin
CORS. There is no arbitrary-URL proxy and no provider key in the frontend.

Connected requires HTTP 200 with JSON `{ "ok": true }`. It means the teaching service
is reachable, not that Gemini or ElevenLabs is ready. Retry runs a new check. Errors,
invalid JSON, large responses and a five-second deadline all become Unavailable.
There is no background polling, audio, microphone use, or sample lesson simulation.
The teaching backend and credential checks remain Akshar's Stage 0 responsibilities.

## Source and checks

- `theia-extensions/product/src/browser/goldie/`: ReactWidget and view contribution.
- `theia-extensions/product/src/browser/style/index.css`: theme-aware panel styles.
- `theia-extensions/product/src/browser/theia-ide-frontend-module.ts`: widget/RPC bindings.
- `theia-extensions/product/src/common/goldie-service.ts`: IDE transport interface.
- `theia-extensions/product/src/node/`: bounded health transport and backend binding.

```sh
yarn --cwd theia-extensions/product build
yarn --cwd theia-extensions/product lint
node --test theia-extensions/product/test/goldie-health.test.cjs
yarn electron build
```

If the panel says Unavailable, verify the separate teaching service is running and
returns the expected health JSON. Restart the IDE after changing its address. If edits
are absent, inspect both watcher outputs before reloading. See `DEV_SETUP.md` for Node
and Yarn PATH configuration and the desktop restart fallback.
