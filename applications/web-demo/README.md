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

The local Node server serves merged desktop shader strings/branding from
allowlisted repository paths. A separate, approved temporary judging deployment
is now available at https://goldie-judge-demo.vercel.app; see
[deployment access, limits and restart instructions](deploy/README.md).

## Connect a verified backend

To start the website and an isolated backend together from this checkout, point
at an already built Stage 3 checkout and the existing ignored server environment:

```sh
GOLDIE_DEMO_BACKEND_ROOT=/absolute/stage3-checkout \
GOLDIE_DEMO_ENV_FILE=/absolute/existing/backend/.env \
yarn --cwd applications/web-demo start:connected
```

The launcher checks local credential presence and Whisper/FFmpeg/model paths, then
starts backend port 8797 and website port 4317. It does not generate model output
or speech. Its own data/cache lives in this checkout's ignored
`backend/.data/web-demo`; the desktop store and environment file are unchanged.
Ctrl-C closes only these two owned services. `GOLDIE_DEMO_BACKEND_PORT`,
`GOLDIE_DEMO_PORT` and `GOLDIE_DEMO_DATA_DIR` override these defaults. Do not run it
on occupied ports. The backend must already be built and have its dependencies.

On Akshar's Mac, the current connected preview uses
`/Users/aksharkakkad/.codex/worktrees/stage2-product-review/goldie` as the backend
checkout and `/Users/aksharkakkad/goldie/backend/.env` as the existing environment.
Only the launcher reads that file; no credentials enter the website or Git.

Alternatively, start the two processes manually:

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
and Origin headers and listens only on 127.0.0.1. “Backend connected” confirms only
the local `/health` response—not provider credit balance or live generation.

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
- A persistent Next step cue and purple button glow guide replay, acceptance,
  lessons, optional practice and final review. Waiting states do not urge another
  click; reduced-motion keeps a static highlight.
- An in-panel Goldie logo and indeterminate purple bar replace the orb while
  processing. Labels follow actual lesson, voice, transcription, answer and
  practice work; audio startup stays pending until playback resolves. No invented
  percentage, countdown or minimum wait. The editor remains usable, errors/Cancel
  clear the loader, and reduced-motion leaves a static visible bar.
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
widths, stage-aware processing labels, keyboard/reduced motion and honest
disconnected-service errors. Deliberately held HTTP responses verify loading
visibility without real provider calls or arbitrary delays. This is
not proof of live Whisper/Gemini/ElevenLabs.

The panel loader's logo/line composition is inspired by the supplied
[MinimalPreloader reference](https://framer.com/m/MinimalPreloader-cc1jlH.js@90xfSUueigFLBdzFT7LN).
It is implemented locally with CSS/DOM; no remote Framer code, dependency or
page-asset percentage calculation is imported.

**Actual Stage 3 HTTP integration** is checked separately against a built local
backend's real Fastify routes, store and validation through the web proxy/controller.
Model and speech providers are controlled. It covers offer, session, teach, Q&A,
actions and closed-session practice, not actual microphone transcription/audio.
No credentials or paid calls are used in these checks.

**Credit-preserving testing policy:** real ElevenLabs voice remains enabled for
explicit user lesson/question use. Automated browser checks intercept every API
request in both successful and unavailable-service contexts, even when the preview
has a real backend configured. No browser/computer-voice substitution, automatic
paid retry or changed lesson-content limits were added. Do not run live voice smoke
scripts again unless Akshar explicitly requests them. Local health checks, reveal,
cached review, and replay do not generate paid speech. New lesson/answer text does;
exact speech cache hits reuse the existing audio.

**Full live browser walkthrough: not verified.** On October 11, Akshar topped up;
one explicitly requested real 1050-character ElevenLabs check returned valid MP3
audio, resolving the earlier quota failure. After the request to preserve credits,
only controlled-provider tests and local readiness/health checks were run. The
connected preview now uses the existing Stage 3 backend and server-side keys, with
local transcription dependencies present. The human live walkthrough is still
open; provider success is not proof of the complete browser journey. The basic
`start` command still defaults to disconnected; use `start:connected` as above.
No other checkout or desktop/backend/shared source was changed.

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

## Temporary judging access

Akshar approved the Vercel website plus protected temporary Cloudflare connection.
Judges use the supplied username/passcode; real lessons, questions and practice
route to the existing isolated Mac backend. The Mac must remain awake and online.
The shared 12,000-character speech/500-POST cap preserves credits; no provider keys
leave the Mac. See the deployment runbook above. This is not a production multi-user
backend or independent cloud-hosting claim. No Git push/merge was performed.
