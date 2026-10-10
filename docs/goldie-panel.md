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

Start the teaching service with `yarn backend:build` and `yarn backend:start`.
The default health endpoint is `http://127.0.0.1:8787/health`. Before starting the IDE,
set `GOLDIE_BACKEND_URL=http://127.0.0.1:PORT` if Akshar's service uses another port.
This setting is server-side, accepts only local HTTP addresses, and requires an IDE
restart. The renderer uses Theia's local RPC connection, avoiding Electron file-origin
CORS. There is no arbitrary-URL proxy and no provider key in the frontend.

Connected requires HTTP 200 with the exact shared `@goldie/contracts` JSON `{ "ok": true }`. It means the teaching service
is reachable, not that Gemini or ElevenLabs is ready. Retry runs a new check. Errors,
invalid JSON, large responses and a five-second deadline all become Unavailable.
There is no background polling, audio, microphone use, or sample lesson simulation.
Run `yarn backend:smoke:elevenlabs` separately to validate the real provider credential.

## Stage 0 verification

Run `yarn test:stage0` from the repository root. It builds and checks the backend,
shared contracts and IDE health transport, including a real client/server request and
the backend going offline. Run `yarn lint` and `yarn electron build` for the desktop candidate.

With `yarn backend:start` and `yarn electron start .` running from the same checkout:

1. The startup panel must show **Connected** using the default port 8787.
2. Stop the backend and click **Check connection**. The panel must show **Unavailable**
   while the editor continues working.
3. Restart the backend and click **Retry connection**. It must return to **Connected**.
4. Close the panel and reopen it using Cmd-Shift-P → **Goldie: Open Panel**.
5. Run `yarn backend:smoke:elevenlabs`; it must validate the real credential without printing it.

These checks were exercised on October 10, 2026 in the native Theia Electron development
app. The panel uses real local RPC and HTTP; no mock health service is used for this gate.
This gate validates provider connectivity, not lesson generation or speech synthesis.

## Source and checks

- `theia-extensions/product/src/browser/goldie/`: ReactWidget and view contribution.
- `theia-extensions/product/src/browser/style/index.css`: theme-aware panel styles.
- `theia-extensions/product/src/browser/theia-ide-frontend-module.ts`: widget/RPC bindings.
- `theia-extensions/product/src/common/goldie-service.ts`: IDE transport interface.
- `theia-extensions/product/src/node/`: bounded health transport and backend binding.

```sh
yarn --cwd theia-extensions/product build
yarn --cwd theia-extensions/product lint
yarn --cwd theia-extensions/product test
yarn electron build
```

If the panel says Unavailable, verify the separate teaching service is running and
returns the expected health JSON. Restart the IDE after changing its address. If edits
are absent, inspect both watcher outputs before reloading. See `DEV_SETUP.md` for Node
and Yarn PATH configuration and the desktop restart fallback.
