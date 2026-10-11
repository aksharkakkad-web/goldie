# Goldie web demo

A local, IDE-shaped interactive walkthrough based on Goldie's merged Midnight
theme and reactive orb (`6e84904`). Separate from the Theia desktop; no real shell
or coding agent is run by this website.

## Start

From this checkout with Node **24.21.0** and Yarn Classic **1.22.22**:

```sh
yarn --cwd applications/web-demo start
```

Open <http://127.0.0.1:4317>. This app needs no installation or new dependencies.
Run the sample prompt, browse the files and handoff, then Prepare lesson. Without
a configured backend the coding replay works and lesson preparation explains that
the live mentor is unavailable. It never substitutes prepared answers for live AI.

The Node server serves merged desktop shader strings/branding from allowlisted
repository paths. Keep this application inside the repo; there is no static export
or public deployment in this change.

## Connect a verified backend

Use a separately started Stage 3 backend with an isolated store and port. Do not
reuse/stop the desktop's process or point two processes at the same store. In a
terminal at the verified backend checkout, with its existing server-side credentials
and documented local transcription tools configured:

```sh
GOLDIE_BACKEND_PORT=8797 GOLDIE_DATA_DIR="$(mktemp -d /tmp/goldie-web-backend.XXXXXX)" yarn backend:start
```

Then start the website from this checkout:

```sh
GOLDIE_DEMO_BACKEND_URL=http://127.0.0.1:8797 yarn --cwd applications/web-demo start
```

`GOLDIE_DEMO_PORT` changes the website port. The website reads no `.env` files and
holds no API credentials. Only allowlisted paths can reach an explicitly configured
loopback backend. Cookies, authorization and browser Origin headers are not forwarded;
backend origin restrictions are not weakened. The web server rejects external Host
and Origin headers and listens only on 127.0.0.1. “Mentor configured” means a target
was supplied, not that keys, credits or transcription readiness were verified.

Preparing a lesson can use Gemini credits; accepting and asking can use
Gemini/ElevenLabs credits. No automatic paid retry or provider fallback is added.
Ask starts recording; Send stops/submits; Cancel discards. Capture stops at 30 seconds
or 2 MiB and still requires Send/Cancel. Transcription uses the existing local Whisper
backend, not a cloud speech service.

## Implemented behavior

- Disclosed deterministic team-management replay, file browsing, syntax-highlighted
  read-only code, terminal replay and a bounded handoff. Sample auth/database imports
  are illustrative; the sample app is not compiled/executed or claimed as verified.
- Merged palette/assets/shaders, waveform-reactive orb, reduced-motion handling,
  static WebGL fallback and responsive shell.
- Backend offers, opt-in variable-phase lessons, pause/resume, skip, distinct
  self-reported familiarity, read completion and early end. Speech failure leaves
  text/coverage/exit usable.
- Voice-question lifecycle via Stage 3 endpoints, separate lesson/answer tracks,
  explicit original-clip resume and late-result suppression.
- Optional per-covered-phase text practice, local drafts/reveal and final cached
  review. No grades, mastery score, quiz speech or response submission.
- Reload recovers accepted-session intent/progress without autoplay/recording.
  Practice references survive reload; drafts/reveal state are in memory and reset
  on reload. Reset dismisses an owned open session before starting fresh.

Live Codex integration, arbitrary workspaces and source-grounded file answers are
not implemented. No user repo, secrets or unbounded source are uploaded.

## Verification and limits

**Unit/server tests** exercise real replay/controller/rendering/transport/recording
logic, doubling only browser/provider boundaries. **Browser QA** exercises the real
UI in installed Chrome with controlled HTTP responses and a fake microphone device:
opt-in, practice/reveal, recorded question, exact resume, recap/review/reset, three
widths, keyboard/reduced motion and honest disconnected-service errors. This is
not proof of live Whisper/Gemini/ElevenLabs.

**Actual Stage 3 HTTP integration** is checked separately against a built local
backend's real Fastify routes, store and validation through the web proxy/controller.
Model and speech providers are controlled. It covers offer, session, teach, Q&A,
actions and closed-session practice, not actual microphone transcription/audio.
No credentials or paid calls are used in these checks.

**Full live browser walkthrough: not verified.** At handoff the main thread reports
insufficient ElevenLabs credits; Stage 3 backend/native integration is not merged
into this website baseline. The default preview therefore starts disconnected.
Connect the verified backend and complete the live gate before calling this a live
public AI demo. No other checkout or desktop/backend/shared source was changed.

## Commands

```sh
yarn --cwd applications/web-demo test
yarn --cwd applications/web-demo build
```

Build checks syntax; buildless source has no compilation step. Yarn itself may
emit Node's `url.parse()` deprecation warning; this app does not use that API.

With the existing Playwright skill runtime, start the preview then run:

```sh
node /Users/aksharkakkad/.codex/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/run.js applications/web-demo/test/browser.cjs
```

On another machine use the same test script with compatible Playwright and installed
Chrome. `TARGET_URL` overrides the local URL. Tests use a temporary profile and fake
microphone, not your personal browser or actual microphone. Screenshots go to
`/tmp/goldie-web-*.png`.

For an already built Stage 3 checkout, set `GOLDIE_CONTRACT_BACKEND_ROOT` to its
absolute path, then run:

```sh
node applications/web-demo/test/contract-check.mjs
```

The contract check removes only its own temporary store. Broad desktop/Electron
tests are not part of this independent app's verification; this clean worktree
does not contain installed monorepo dependencies.

## Public sharing is a separate gate

This is local-only, not a production multi-user backend. Before a Discord/public
link, approve hosting and define session isolation, paid-call budgets, abuse limits
and production secret storage. Nothing was pushed, merged remotely or deployed.
