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
- Open gate: real browser transcription/Gemini/ElevenLabs walkthrough and public hosting. Main-thread report identifies insufficient ElevenLabs credits; default preview intentionally remains disconnected. No new service or fallback added.
