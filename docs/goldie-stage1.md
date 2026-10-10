# Connected Stage 1 — native Theia lesson

Akshar's prepared backend and Rishit's native Theia UI share the same session,
progress and content-ID speech contracts. The lesson explains frontend, backend/API
and database through creating a team. These are logical responsibilities: Next.js
can contain frontend and server code. This is conceptual teaching, not workspace
inspection or a generated application. Gemini is not used yet.

## Run the product

Use Node 24.21.0 and Yarn Classic 1.22.22 from this checkout:

```sh
yarn backend:build
yarn workspace theia-ide-product-ext build
yarn electron build
yarn backend:start
```

In another terminal, `yarn electron start .`. For iteration, keep `yarn electron
watch` running; restart Electron after transport/backend-module changes. See
`DEV_SETUP.md` for toolchain/reload troubleshooting. Configure speech only in
ignored `backend/.env`; never renderer preferences. One backend owns each JSON
data directory. Open **Goldie: Open Panel** from the command palette if needed.
Prepare lesson → Explain this build → roadmap/spoken lesson. Not now creates no
session/audio. The reference selector is internal, not a live Codex handoff.

## Connected behavior and ownership

- `theia-extensions/product/src/common/goldie-service.ts` and `src/node/goldie-api.ts`
  bind strict `@goldie/contracts` through local Node/RPC. Exact payloads are in
  `docs/stage1-api.md`. No backend schema redesign was needed.
- Text arrives first. Speech POST uses `{sessionId,contentId}`, then Node retrieves
  the validated audio ID through a locally constructed path. Only MP3 is accepted,
  bounded to 2 MiB with whole-body deadlines; redirects/arbitrary URLs are rejected.
  The renderer creates local Blob URLs and revokes them on release. No file-origin
  CORS bypass or provider key reaches the renderer.
- Server roadmap, active phase, status and progress are authoritative. Action IDs
  survive manual action retries. Fetching text never completes a phase. Covered,
  skipped and self-reported familiarity remain separate; none proves mastery.
- Questions/Explain more pause the lesson, speak a separate answer/add-on, then
  Resume returns to the original element/time. Unknown questions honestly disclose
  the prepared-content limit and suggest supported questions without changing phase.
- Lesson-ended saves completion and advances. Mark read explicitly records text
  coverage, not proof of hearing. Skip/Already know stop playback and advance. End
  invalidates media, waits for pending mutations and displays a server partial recap.
- Pending accepted offer ID/revision is saved before session creation. Lost responses
  or disposal recover by idempotent acceptance. Confirmed session ID/revision uses
  GET session. Restore never teaches, synthesizes or autoplays. Clip position is
  retained during interruptions, not across closing/restarting the panel.
- Failures retain text/controls. Retry last request reuses failed action intent;
  safe configuration/auth failures instead explain backend correction. Explicit Play
  remains available after correction. No automatic paid retry or purchase occurs.
- Find another lesson after closure advances only the illustrative reference revision,
  not a live engineering checkpoint. Theia is the sole product host.

## Verification — October 10, 2026

Passing automated commands: `yarn test:stage1` (129 checks: 38 backend, 10 shared
contracts, 80 product and one Stage 0 real health integration), `yarn lint` (seven
targets), product TypeScript and `yarn electron build`. Tests include a real Fastify/Node
transport journey, persistence/restart, duplicate actions, prepared Q&A, speech cache
and recap, plus lost acceptance/action responses, media cancellation, safe RPC errors,
strict payloads, deadlines and bounds. Automated providers are controlled local
servers, not evidence of ElevenLabs playback.

Native acceptance uses actual Theia Electron, real Fastify, isolated Electron/Theia
profiles and JSON storage, actual ElevenLabs MP3s and existing credits/cache. No
alternate IDE/browser-hosted product, fake media element, synthetic ended event or
quiet tone is used for this gate. Verified:

- connected/offline/recovered backend; decline with no session/playback;
- three-topic offer, accepted roadmap and real spoken lesson;
- pause/resume, spoken prepared answer and Explain more, original clip/time resume;
- honest unsupported question and supported suggestions;
- close/reopen and full native app restart restoring without autoplay;
- real media-ended completion/advance (QA seeks near the end rather than claiming
  a human listened to every second);
- separate completed/skipped/familiar progress in the server recap;
- uncached speech failure leaves usable answer text/lesson controls;
- early end yields partial recap without invented completion.

Final native run: 16 checks passed, zero renderer errors. Default panel was 292 CSS
pixels; actual Theia splitter drags to 500 and 260 pixels kept the recap readable
without horizontal overflow. Screenshots were visually inspected.

Full-run local evidence: `/tmp/goldie-stage1-verified.O6SJKd/result.json` and its
initial/question/recap/layout screenshots. These temporary diagnostic artifacts may not
survive cleanup; this guide and committed regressions are the durable record.
Generated audio, session stores and credentials remain ignored by Git.

The broad upstream `yarn test` is **not green**: Electron/Electron-next suites
expect packaged macOS binaries and fail in launch hooks (`chrome-launcher` undefined
`.toString()`, then undefined `closeWindow`). Packaging, e.g. `yarn electron
package:preview`, is their prerequisite per repository instructions. No installer
or packaged distribution was built here. This is separate from the passing native
development-app acceptance; do not describe all repository tests as passing.

## Diagnostic fixture — not real-voice evidence

`node scripts/goldie-stage1/fixture-server.cjs` starts the actual lesson backend on
127.0.0.1:8788 with fresh temporary storage, without loading `.env` or provider keys.
Use a separate Electron instance with `GOLDIE_BACKEND_URL=http://127.0.0.1:8788`.
Default speech intentionally fails while text works. Optional
`--audio=/absolute/path/test.mp3` replays that bounded local MP3 for every response
through a local provider; it is not ElevenLabs or a judged demo.
`--fail-teach-once --fail-speech-once` exercises recovery. The temporary store is
printed and preserved; stop the fixture with Ctrl-C.

## Stage 2 boundary

The connected prepared experience is the technical Stage 2 baseline. First deliver
the approved candidate to shared main and repeat the native gate together, as PRD
§9.6 requires. This work performs no push, PR, external merge, deployment, Gemini
implementation, microphone input, hosted database or dependency change. Stage 2
replaces prepared lesson decisions/text with Gemini while preserving these controls,
server progress, speech safeguards and cumulative checks.
