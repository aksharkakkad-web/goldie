# Goldie web demo implementation plan

> Execution: inline in this side conversation; subagents are prohibited. Akshar explicitly requested implementation after reviewing the linked design. No further design check-ins; stop only for a material authority or dependency blocker.

**Goal:** A local, interactive IDE-shaped Goldie website with fixed coding replay, live-backend transport, opt-in lessons, voice questions and cached text practice.

**Architecture:** Buildless ES modules and a loopback-only Node static server with an optional allowlisted local-backend proxy. Pure replay data, an observable lesson controller, audio/recording adapters and DOM rendering remain separate. The server serves the exact merged orb shader source and branding from explicit repository paths, avoiding new frontend dependencies or Electron imports.

**Tech stack:** Node 24.21.0, Yarn Classic 1.22.22, browser JavaScript/CSS/WebGL, node:test, existing Playwright runtime for QA.

**Spec:** ../specs/2026-10-10-goldie-web-demo-design.md

## Global constraints

- Work only in codex/web-demo; preserve main-thread work. No push/deploy.
- Reuse merged 6e84904 visual reference. Do not edit desktop/backend/shared source.
- No keys in client code; configured isolated backend only. No cloud transcription.
- Coding is a disclosed prepared replay. No prepared response fallback for live AI.
- No autoplay/capture on load or restore, no grading, no student-answer submission.
- Stage 3 API availability is a dependency, not an implemented-backend claim.

## Review focus

- Late acceptance/action results after cancellation must not start playback or corrupt session state.
- Practice on a closed final phase must not invoke ordinary speech or reopen progress.
- Microphone permission resolving after Cancel must immediately release tracks.
- Traversal, cross-origin POST and proxy destination injection must fail safely.
- Speech failure must leave read/skip/end available rather than strand a lesson.

## Task 1: replay and local server

**Files:** applications/web-demo/package.json, server.mjs, src/scenario.js, test/server.test.mjs, test/scenario.test.mjs.
**Interfaces:** export scenario files/events and createDemoServer({backendUrl}) returning an unstarted Node server. Public assets/modules only; proxy bounded documented endpoints.

- [x] Write replay tests for handoff availability only at final milestone, file selection and terminal history. Write HTTP tests for static loading, traversal denial, origin checks, no configured backend, payload limits and safe local proxy behavior.
- [x] Run `node --test applications/web-demo/test/*.test.mjs`; expected RED before modules exist.
- [x] Implement scenario data and server. Server URL is loopback-only; read bounded allowlisted files. Test proxy against a local in-process HTTP server, never a paid endpoint.
- [x] Rerun tests; expected PASS. Commit with the integrated website candidate (ruling below).

## Task 2: lesson controller and browser adapters

**Files:** src/controller.js, src/api.js, src/media.js, test/controller.test.mjs, test/api.test.mjs, test/media.test.mjs.
**Interfaces:** DemoController(api, media) exposes subscribe, prepare, accept, playPause, mark, continuePhase, end, practice, reveal, questionStart/Send/Cancel/resume and reset. HttpApi.request(path, body?, signal?) handles deadlines and safe errors. Media owns original/answer audio and microphone resources.

- [x] Write failing tests for opt-in (zero calls at construction/decline), variable phases, coverage gate, skip/familiarity, cached practice/reveal, closed-session final practice, stale work and exact resume.
- [x] Add recording lifecycle tests with external browser APIs doubled: denial, delayed permission, cancel, duration/size stop without submit, send and cleanup.
- [x] Run suite; expected RED for missing functionality.
- [x] Implement controller/adapters against inspected Stage 2 and Stage 3 HTTP contracts. Maintain stable operation IDs on manual retry, explicit error/exit paths and no fallback providers. Keep drafts local.
- [x] Rerun the complete demo suite; expected PASS. Commit with the integrated website candidate.

## Task 3: faithful shell, browser journey and documentation

**Files:** index.html, src/app.js, src/view.js, src/orb.js, style.css, README.md, test/browser.cjs.
**Consumes:** scenario from Task 1, controller/HTTP/media from Task 2. DOM uses escaped/textContent values; orb consumes exact source shaders and measured audio level.

- [x] Write an executable Playwright journey before UI implementation: choose files, run replay, decline/accept, pause, mark coverage, practice/reveal/continue, question lifecycle, recap/review/reset. Use route interception with explicit controlled backend responses; never call them live-provider evidence.
- [x] Run the browser journey after server startup; expected RED for absent UI.
- [x] Implement the screenshot-derived IDE shell, readable lesson details, controls, optional practice and final review. Implement orb resize/reduced-motion/WebGL fallback and cleanup.
- [x] Run unit suite, browser journey and screenshots at 1440, 900 and 390 px. Inspect console and network. Fix actual failures with regression tests.
- [x] Document start commands, isolated backend configuration, real-vs-replay behavior and unverified live integration. Root desktop suite not run: no monorepo dependencies in this independent app's checkout; no desktop/shared/backend source changed.
- [x] Finish self-review, commit the candidate and hand off the running local preview. No remote writes.

## Progress

- Setup: existing isolated worktree verified; design-only local commit rebased onto merged 6e84904 without changing other checkouts.
- Pre-flight: Task 1 replay data feeds Task 3 shell; Task 2 controller consumes bounded handoff only after replay. Task 3 uses Task 2 methods, not direct provider requests.
- Ruling: buildless browser modules replace a React bundler for this independent demo, avoiding unapproved dependencies; the source-of-truth shader is reused verbatim. Cost if wrong: a later packaging task, not a backend/desktop change.
- Ruling: live Stage 3 integration is conditional on the existing backend becoming available; implement and verify HTTP contracts with explicit test responses, and report live verification separately.
- Ruling: commit the integrated app in one local feature commit, rather than intermediate commits with missing index/browser modules. Cost if wrong: coarser rollback, confined to this new app and its documents.
- Task 1: complete; server/replay tests observed RED then GREEN.
- Task 2: complete; adapter/controller/recording tests observed RED then GREEN, including late-permission and stale-conversion suppression, stable question IDs, phase-state consistency and last-phase practice.
- Task 3: implemented; Chrome controlled journey passes at 1440/900/390 px with zero renderer errors and no page overflow. Keyboard/reduced motion checked. New app suite: 31/31 pass; syntax build passes. Existing Yarn emits its known Node deprecation warning.
- Actual local Stage 3 routes additionally tested through proxy/controller with controlled model/speech providers and isolated storage. No paid requests, no real voice/model verification claimed.
- Final review: self-review only; no subagents permitted in this side conversation. Regression fixes cover repeated practice IDs, lost acceptance, cached-review restoration and preservation across resumed actions, cancellation during conversion, wrong-phase audio after failed teaching, and hidden-label document overflow.
- Handoff: keep the candidate on local `codex/web-demo` in its isolated worktree; preview at http://127.0.0.1:4317. No push, merge or deployment authorized.
- Open gate: real browser transcription/Gemini/ElevenLabs walkthrough and public hosting. The original handoff's quota/disconnected state is superseded by the follow-up below; no public hosting or fallback added.

## October 11 follow-up: guided, connected preview without paid testing

- Akshar clarified that real ElevenLabs voice must stay in the product. Stop repeating paid voice checks during implementation/QA; use controlled responses for surrounding behavior. No text-only/browser-voice replacement or shorter-content backend contract was introduced.
- A prior explicitly requested 1050-character real voice test returned valid MP3 after the top-up. It is generation evidence, not a full live-browser sign-off.
- Added persistent next-step text and purple next-action glow, including reduced-motion treatment. Waiting states have no highlighted click target; practice stays optional.
- Added a web-owned connected launcher: read the existing ignored server environment, reuse built Stage 3 modules/dependencies, validate local transcription paths and start isolated port/store alongside the website. No source/config/store changes in the desktop or main-thread checkout.
- `/demo-config` now checks only local `/health`. Backend connected is an availability claim, not an API balance or provider-success claim.
- Browser QA now intercepts every API route in its offline context too. This prevents a future connected preview from accidentally turning an unavailable-service test into a paid generation. Recording QA waits for observable captured bytes before submitting the fake microphone.
- Verification: 34 unit/server/launcher tests pass; syntax build and controlled Chrome journey at 1440/900/390 px pass; real Stage 3 route integration passes with controlled providers. Zero paid requests in these follow-up checks. Manager self-review only; no subagents allowed.
- Running preview: http://127.0.0.1:4317, isolated backend http://127.0.0.1:8797. Both `/health` and website `reachable` checks pass. No live model/voice walkthrough rerun; Akshar will run the actual demonstration. Nothing pushed, merged or deployed.

## October 11 follow-up: in-panel processing loader

- Akshar approved the logo/slim purple bar inside the Goldie panel. The supplied Framer loader was inspected as a visual reference only; use an original local CSS/DOM implementation, no external runtime or dependency.
- Real controller operations now report lesson preparation, explanation, voice preparation, audio startup, microphone permission, recording conversion, transcription, answering, cached/generated practice, progress and recap stages. There is no fabricated percentage/countdown or forced display delay. The loader replaces the orb only while busy; the editor stays usable.
- Errors and Cancel clear processing. Generation guards prevent late canceled work from hiding a newer operation's loader. Audio startup remains pending until the playback promise settles. Reduced-motion preserves a visible static segment; live status and content busy semantics are provided.
- TDD: five controller regressions and two rendering/copy regressions observed RED then GREEN. Full demo suite now 41/41 passes; syntax build passes (known Yarn `url.parse()` warning only).
- Controlled Chrome journey passes with held responses for lesson/explanation/voice/practice/answer loading, no page overflow at 1440/900/390 px, editor access while pending, hidden loader after ready/error, and reduced-motion visibility. Desktop/mobile loader screenshots inspected. Existing complete lesson/question/practice/review journey still passes with 19 intercepted API requests.
- Actual Stage 3 route/proxy/controller contract check passes with controlled providers. Zero paid provider requests in all loader verification. No desktop/backend/shared source edits; no other checkout changed. Full live-provider browser rehearsal and public hosting remain separate unverified gates.

## October 11 follow-up: approved temporary judge deployment

- Akshar explicitly requested web/Vercel deployment and approved a protected temporary Cloudflare connection to the existing Mac backend. This supersedes the earlier local-only publication gate for this judging setup only; Git push/merge, purchases and permanent hosted-backend migration remain unauthorized.
- Source stays in the isolated `codex/web-demo` worktree. A dependency-free Vercel Node 24 gateway serves an explicit allowlist of the existing app/logo/shaders behind native HTTP Basic judge access and proxies allowed methods/paths to a fixed HTTPS tunnel. API keys and the provider `.env` never leave the Mac. No frontend behavior or desktop/backend/shared implementation changed.
- The tunnel exposes only a new authenticated loopback bridge on 8798, not the raw backend/IDE/filesystem. It strips credentials/Origin before reaching existing isolated backend 8797, rejects direct browser access, bounds bodies/responses and concurrency, and reserves a persistent conservative 12,000 speech-character / 500 POST-attempt budget before provider work. Generated private bridge/judge credentials and usage stay ignored and outside the deployment allowlist.
- Official cloudflared 2026.10.0 macOS arm64 release checksum verified before local extraction under `/tmp`; nothing installed globally. Tunnel process is owned by this conversation; scoped caffeinate prevents idle sleep while it runs. Mac/lid/network/process lifetime and Quick Tunnel restart/availability limitations are documented in `applications/web-demo/deploy/README.md`.
- Vercel team `aksharkakkad-webs-projects`, new project `goldie-judge-demo`, production deployment `dpl_5AnPF6WXVDDfZNNLzzybJz6pwQna` is READY at https://goldie-judge-demo.vercel.app. Vercel SSO was disabled only on this new project; native judge passcode remains mandatory. No domain purchase or Git write was needed.
- Verification: 50 demo tests pass; all deployment modules pass syntax checks; deployed Chrome controlled journey passes (19 intercepted requests, three widths, reduced motion); both ordinary and judge-gateway actual Stage 3 route/controller contract checks pass with controlled providers. Public page/modules/CSS return 200 with judge credentials, unauthenticated page returns 401, private path returns 404, deployed health confirms the real backend reachable, and unknown-content speech returns 409 before provider access. Paid requests: zero.
- Manager review focused on exact upload allowlist, fail-closed authorization, fixed destinations, method/body limits, atomic persistent budget reservations including concurrent requests, corrupt-budget refusal, no credential forwarding, secret ignores and matching documentation. No subagents permitted. The complete live-provider browser rehearsal remains open; Akshar must run it once before judging. No desktop/Electron suite run because no desktop/shared source changed and this app is isolated.

## October 11 follow-up: public access and opening screen

- Akshar explicitly requested no login and approved a brief “Goldie IDE Demo” purple-glow introduction that automatically fades into the IDE. This supersedes the browser Basic-auth gate above, not the server-to-server bridge authorization or credit limits.
- The gateway no longer reads or requires judge username/password environment values and sends no authentication challenge. The fixed tunnel destination, bridge secret, route/body restrictions, private upload allowlist and persistent 12,000 speech-character / 500 POST-attempt budget are unchanged. Anyone with the public link can use this shared budget.
- The opening uses the existing logo and local CSS: 1.5-second hold, 0.5-second fade, no extra click or provider request. Session storage suppresses repeat openings on refresh; denied storage remains usable. Covered IDE controls and skip link are temporarily inert, automatically restored after the transition. Reduced motion removes animation. No dependencies or desktop/backend/shared source changed.
- TDD observed anonymous-gateway tests fail against required judge credentials and the browser opening test fail because the screen was absent, then both pass. All 50 demo tests and syntax/build-output checks pass. Local and deployed controlled Chrome journeys pass, including first opening, automatic transition, refresh, blocked storage, keyboard recovery, 1440/900/390 px, reduced motion and the existing complete lesson/question/practice/review flow (19 intercepted API requests).
- The actual Stage 3 routes/store/controller also pass through the anonymous gateway and protected bridge with controlled providers. Paid requests: zero. Live anonymous page/CSS/module requests return 200 without a challenge, private `.env` returns 404, direct unauthenticated tunnel health returns 401, and the deployed health endpoint confirms the Mac backend is reachable without generation. Complete live-provider rehearsal remains unverified.
- Production deployment `dpl_HFu4ttGeM22ZYWFPMUnKuPs4sfiY` is READY at https://goldie-judge-demo.vercel.app. Manager review checked the narrow auth removal, preserved secret/cost boundary, intro lifecycle and matching runbook. No subagents, Git push/merge or unrelated checkout changes. Keep the Mac awake, lid open and online for the existing temporary backend connection.
