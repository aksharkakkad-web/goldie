# Stage 1 connection repair implementation plan

**Goal:** Make Rishit's native Theia lesson experience work against Akshar's existing prepared architecture backend, and verify the complete Stage 1 gate before starting Gemini work.

**Architecture:** Keep shared contracts/backend behavior authoritative. The renderer uses Theia Node/RPC for JSON and bounded MP3 retrieval; the controller derives progress from saved server state, while audio positions stay client-local. No backend schema redesign.

**Spec:** `docs/Goldie_HackNC_PRD.md` sections 8–10 and `docs/stage1-api.md`.

## Constraints and decisions

- Node 24.21.0, Yarn Classic 1.22.22; no dependency/lockfile changes.
- Reuse `codex/stage-1-integration`; preserve unrelated untracked `AGENTS.md`.
- Theia Electron only. No Gemini, microphone, hosted DB, live Codex integration, push, or merge in this implementation.
- Reference selector `webapp-architecture`; variable returned roadmap; conceptual claims only.
- Existing ElevenLabs credits and cache only. Generate speech only after acceptance; no automatic paid retries or secret output.
- Manager owns service/Node transport, transport/real HTTP tests, documentation, native QA, final integration. Frontend specialist owns controller/player/widget/CSS and controller tests. Serialize any shared-file changes.
- Restore an accepted lesson without autoplay. Persist its ID and sample revision, not credentials. Explicit Find another lesson may advance the illustrative revision after closure; never reset or replace an active lesson.

## Review focus

1. Lost action response: exact action ID must remain retryable, never advance twice.
2. Late speech/ended callbacks after skip, question, closure, or disposal must not resurrect audio or change the wrong phase.
3. Restore after close/restart, including paused/asking/final-phase state, must preserve server progress without autoplay.
4. Audio failure must retain text and working controls; arbitrary audio URLs, redirects, large responses and provider details must be rejected.
5. Narrow Theia dock must keep readable controls and roadmap; familiarity must never be presented as demonstrated mastery.

## Task 1 — transport contracts (manager)

- [x] Replace outdated transport fixtures with complete current session/content shapes and add failing checks for GET session, POST actions, speech metadata → validated audio-ID GET.
- [x] Add `getSession(sessionId): Promise<SessionResponse>` and `action(sessionId, request: SessionActionRequest): Promise<SessionResponse>` to GoldieService.
- [x] Validate every request/response using existing Zod schemas. Retrieve only locally constructed `/api/audio/<64-lowercase-hex-id>`, MP3 MIME, 2 MiB bound, whole-request deadline, no redirects. Renderer receives `{mimeType,dataBase64}`.
- [x] Keep errors sanitized, with useful server error codes when safe. Verify invalid IDs/metadata, provider failures, redirects, timeouts and body limits.
- [x] Run transport tests against real Fastify endpoints using a controlled TTS provider, not only permissive mocks.

## Task 2 — frontend state and controls (frontend specialist)

- [x] Write failing controller regressions for explicit selector, content references, server actions/recap, restored progress, no-autoplay, same-ID retries and stale callback cancellation.
- [x] Connect accepted session, active phase and terminal statuses to server responses. Serialize state mutations; preserve exact failed action IDs for explicit retries. Fetching text alone never completes a phase.
- [x] On question/add-on: pause/save original clip → server pause → text/answer → separate speech → explicit server resume → original clip/time. Explain more requests `detail: expanded`.
- [x] Lesson end completes the current phase and advances; skip/familiar stop playback before server action. End can cancel an in-flight speech response and show server-derived partial recap.
- [x] Persist session ID and restore via getSession; no autoplay. Keep unknown/server unavailable references recoverable without deleting server data.
- [x] Align widget with frontend/API/database architecture, offer estimate, conceptual disclaimer, supported questions, readable narrow layout, distinct familiarity and completion. Retain existing design system.
- [x] Run controller tests and product TypeScript/lint. Manager then reviews against real backend and native UI.

## Task 3 — native integration gate and delivery (manager)

- [x] Update the fixture server to current contracts or retire it from supported verification; never use tone playback as real speech evidence.
- [x] Run cumulative `yarn test:stage1`, `yarn lint`, product build and `yarn electron build`.
- [x] Use isolated Electron/profile/JSON store. Verify decline/no synthesis, Explain/roadmap, actual ElevenLabs MP3 playback, pause/resume position, question/spoken answer/original resume, unsupported question, Explain more, skip/familiar, natural completion and early recap.
- [x] Verify close/reopen and application restart restore without autoplay, offline/recovery and speech failure with usable text; inspect narrow/default/wider panel layout.
- [x] Obtain independent final review of the actual integration diff; fix confirmed load-bearing findings and rerun checks.
- [x] Update PRD milestone, README, setup and both API/client guides with exact tested status, native evidence, and remaining Stage 2 boundary. Do not claim shared-main gate until approved merge.
- [x] Commit the verified candidate locally; report exact Git state and request separate approval before external push/merge.

## Progress ledger

- Initial planning: prior native failure and two compiler errors reproduced in assessment `984eaf1` before these repairs.
- Preflight: Tasks 1/2 share only the declared service signatures; shared schemas unchanged. Task 3 consumes both; native acceptance cannot precede both. Ownership is disjoint and constraints agree.
- Transport/controller/player/widget repaired with failing-then-passing checks; current backend schemas preserved. Diagnostic fixture now uses actual backend contracts and cannot load live provider credentials.
- Independent review found interrupted acceptance recovery and discarded nonretryable errors. Both fixed and re-reviewed, no remaining material findings. Real HTTP regressions cover delayed/lost acceptance responses; actual Theia error codec covers safe error semantics. Pending offer/revision is persisted before acceptance; storage failure prevents mutation. Restore never teaches/synthesizes/plays.
- Final automated evidence: 129 cumulative checks pass (38 backend, 10 contracts, 80 product, one real Stage 0 integration); repository lint passes all seven targets; Electron development bundles have zero errors. The smoke CLI test ignores inherited color env only to preserve exact diagnostic stderr assertions.
- Final native evidence: 16 checks pass with actual ElevenLabs MP3s and zero renderer errors; default/500/260-pixel layouts visually inspected. Full record and limitations: `docs/goldie-stage1.md`.
- Broad upstream `yarn test` is not green: packaged Electron/Electron-next launch hooks fail without packaged binaries; installer packaging is outside this integration. Native development-app acceptance passed separately.
- Technical Stage 2 baseline ready. PRD shared Stage 1 checkbox remains pending approved main delivery and together-run checkpoint; no Stage 2 code, external push/merge, deployment or destructive cleanup performed.
