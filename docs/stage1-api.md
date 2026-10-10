# Stage 1 backend integration

Akshar's backend serves a prepared, conceptual web-app architecture lesson:
frontend → backend/API → database, connected through creating a team. Next.js can
host frontend and server responsibilities in one project. This is not a generated
application, inspected source code, live Gemini teaching, or Codex integration.

Rishit's Theia UI and Akshar's backend are connected through the local Node/RPC
transport. The native spoken workflow is verified on the local integration candidate;
see `docs/goldie-stage1.md` for evidence, recovery behavior and the shared-main gate.

## Run and verify

Use Node 24.21.0 and Yarn Classic 1.22.22:

```sh
yarn --frozen-lockfile
yarn backend:build
yarn test:stage1
yarn backend:start
```

Default address: `http://127.0.0.1:8787`. Put configuration in ignored
`backend/.env`, never renderer preferences or frontend code.

| Variable | Default / meaning |
|---|---|
| `ELEVENLABS_API_KEY` | Required only for uncached real speech |
| `ELEVENLABS_VOICE_ID` | George: `JBFqnCBsd6RMkjVDRZzb` |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` |
| `GOLDIE_SPEECH_TIMEOUT_MS` | `20000`; includes the complete audio body |
| `GOLDIE_DATA_DIR` | Absolute `backend/.data`, independent of launch directory |
| `GOLDIE_ALLOWED_ORIGIN` | `http://127.0.0.1:3000`; other explicit origins get 403 |

The adapter uses [ElevenLabs' speech conversion API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
`mp3_44100_128`, stability `0.5`, and similarity boost `0.75`. Voice/model must be
available to the account; failures never trigger a purchase or alternative paid call.

The explicit smoke spends existing credits for one frontend lesson and one API
answer, unless cached. **Stop the normal backend first**: the JSON store must have
one owning backend process, including smoke commands.

```sh
yarn backend:build
yarn backend:smoke:elevenlabs
yarn backend:smoke:speech --play
```

`--play` uses macOS `afplay`; omit it elsewhere and play the returned MP3 paths.
The smoke accepts a dedicated lesson, exercises real HTTP routes/audio retrieval,
plays both clips when requested, and dismisses its session afterward. Automated
tests use local provider servers, not ElevenLabs credits.

## Contract and client sequence

`shared/contracts` defines strict Zod schemas and inferred types. `handoff` and
`profile` have empty defaults; they do not adapt prepared content and are neither
persisted nor sent to ElevenLabs. Only the explicit reference selector creates
an offer in Stage 1. Do not parse arbitrary handoffs or hardcode lessons in the UI.
Use returned IDs and variable-length phase arrays.

1. `POST /api/offer`:

   ```json
   {"projectId":"teamflow","revision":1,"referenceLessonId":"webapp-architecture"}
   ```

   Returns `{shouldOffer,previewTopics,offerId?,estimatedSeconds?}` (165 seconds
   for this example). No selector, active session, or already-accepted revision
   returns false. Repeated unaccepted requests reuse the offer. The IDE suppresses
   duplicate popups and remembers Not now; decline sends no session/speech call.

2. Only after **Explain**, `POST /api/sessions`:

   ```json
   {"offerId":"<returned-offer-id>","revision":1}
   ```

   Returns `SessionState`: `sessionId`, `projectId`, `snapshotRevision`, `phases`,
   `status`, optional `activePhaseId`, `completedIds`, `skippedIds`,
   `alreadyKnowIds`, `lastEvaluatedRevision`, and `questionHistory`.
   Phases have `id`, `title`, `objective`, `description`. First acceptance must
   match the offer revision. Retrying acceptance returns its existing session,
   even if ended; it never starts another lesson implicitly.

3. `POST /api/teach`:

   ```json
   {"sessionId":"<session-id>","phaseId":"frontend","detail":"standard"}
   ```

   Returns `{explanation,groundingStatus:"conceptual",contentId}` immediately.
   Fetching text does not complete a phase. `detail:"expanded"` returns a shorter
   add-on for Explain more without changing progress or pause/asking status.

4. For lesson OR answer text, `POST /api/speech`:

   ```json
   {"sessionId":"<session-id>","contentId":"<returned-content-id>"}
   ```

   Returns `{audioId,audioUrl:"/api/audio/<audioId>",mimeType:"audio/mpeg"}`.
   Arbitrary `{text}` is rejected. Only content served within that open accepted
   session is eligible. Synthesis is lazy; cached by text, voice/model/settings;
   concurrent duplicates share a single provider call. Keep text visible on failure.

5. `GET /api/audio/:audioId` returns MP3 bytes. Extend Theia's existing Node/RPC
   boundary: validate a 64-character lowercase hex audio ID, construct the local
   backend path, fetch with timeout/body bounds (2 MiB), reject redirects, and
   return bytes/base64 plus MIME. Never fetch a caller-supplied URL. The renderer
   creates a Blob URL and revokes replaced URLs. No keys or file-origin CORS needed.

6. `POST /api/sessions/:sessionId/actions`:

   ```json
   {"actionId":"<unique-action-id>","action":"pause"}
   ```

   `pause`/`resume` have no phase ID. `phase_completed`, `skip`, `already_know`
   require current `phaseId`. Returns current `SessionState`. Retry exact intent
   with the same action ID after a network failure: no double advance. Different
   intent with the same ID returns 409. Serialize pending client mutations.

7. For **Ask**, pause local playback and save phase, clip and position. Send
   `pause`, then `POST /api/ask`:

   ```json
   {"sessionId":"<session-id>","phaseId":"frontend","question":"What is an API?"}
   ```

   Returns `{kind:"answer",answer,resumePhaseId,contentId}`. Request answer speech
   through the same speech endpoint. Session becomes `asking` without advancing.
   Unknown questions receive an honest limitation and `supportedQuestions`;
   supplied sources still do not produce file claims. Resume sends `resume`, then
   restores the original clip/position. Explain more uses this pause/save/add-on/
   resume pattern through `/api/teach` rather than `/api/ask`.

8. When the **lesson clip**, not a question/add-on, ends in learning state,
   send `phase_completed`. The explicit Mark read control may also send it after
   resuming a paused session: this records coverage, not proof of hearing or mastery.
   Skip/Already know stop audio and invalidate late callbacks
   before sending the action. These advance but preserve paused/asking status;
   resume explicitly if needed. Completion callbacks while paused/asking return 409.

9. When `activePhaseId` is absent, `POST /api/complete`:

   ```json
   {"sessionId":"<session-id>","status":"completed","currentRevision":1}
   ```

   End session uses `status:"dismissed"` anytime. Returns
   `{recap,lastEvaluatedRevision}` derived from stored progress, ignoring client
   `learningState`. Same closure retries safely; changing terminal status returns
   409. No catch-up yet: checkpoint stays at snapshot even if currentRevision is
   newer, preserving unevaluated changes for future stages.

## Recovery, errors and limits

- IDE persists pending offer ID/revision before acceptance, then the returned
  session ID/revision. Interrupted acceptance is recovered by idempotently replaying
  that accepted offer; confirmed sessions use `GET /api/sessions/:sessionId`.
  Never autoplay from restoration, even if returned status is learning.
- Prepared questions normalize case, apostrophes, punctuation and whitespace.
  Topics: APIs, direct DB access, authentication, request flow, backend, UI state,
  transactions, and explain-more aliases. This is not arbitrary conversational AI.
- Errors: `{error:{code,message,retryable}}`; 400 invalid request, 403 disallowed
  origin, 404 missing IDs, 409 phase/action/session conflict or history limit, 503
  speech/storage unavailable. Provider bodies, credentials and local paths are
  not returned. Speech failure leaves text and lesson progress intact.
- No automatic synthesis retries. Offer manual retry when retryable; auth/config
  failures need backend correction. Corrupt cache fails instead of spending credits.
  Node/RPC forwards only allowlisted API codes and fixed safe messages using Theia
  application errors (`-32001` nonretryable, `-32002` retryable); raw error bodies,
  provider messages and filesystem paths never reach the renderer.
- Limits: 64 KiB HTTP body; 1000-character question; 32000-character handoff;
  4000-character speech; 2 MiB audio; four concurrent speech jobs. Each session
  allows 100 questions/500 unique actions; history allows 1000 offers/sessions.
  Limits fail explicitly without truncating checkpoints or idempotency records.
- Local ignored `backend/.data/sessions.json` and audio persist between restarts.
  Question history can contain user-entered text. One backend process owns the
  store. Preserve corrupt data for repair; no automatic deletion or reset.
- No accounts, cloud DB, Gemini, microphone input or deployment is included.

## Integration gate

Backend tests cover real local HTTP and persistence using controlled provider
responses. The real-speech smoke separately verifies ElevenLabs and native MP3
playback. The integrated local native run verifies in Theia Electron: decline
without audio, Explain, roadmap, spoken lesson, pause, skip/already know, typed
question, spoken answer, resume at saved position, and recap. Only the merged
native main-checkout run closes the PRD's shared Stage 1 gate; publishing/merging
the verified local candidate is a separate approval, not implied by this milestone.

### Backend verification — October 10, 2026

- Node 24.21.0 / Yarn 1.22.22; `yarn --frozen-lockfile` succeeded without changing
  the lockfile. The backend now directly declares the existing Zod 4.6.5 dependency.
- `yarn test:stage1`: 38 backend, 10 contract, 12 Theia health transport, and one
  real backend/transport integration test: 61 checks total.
- Repository `yarn lint`: all seven configured targets passed. Existing upstream
  peer/deprecation and unconfigured JavaScript lint notices remain.
- `yarn backend:smoke:speech --play`: real ElevenLabs frontend lesson (46.39 seconds)
  and API answer (21.55 seconds), retrieved through the audio route and both played
  successfully with macOS `afplay`. MP3 metadata independently checked with `afinfo`.
  Generated audio and smoke session state stay local and ignored by Git.
- Independent read-only review found one storage error-classification gap, fixed
  with a failing-then-passing read-only-cache regression test. No remaining findings.
- That backend-only milestone preceded the frontend repair. Current integrated
  evidence and packaged-suite limitations are recorded in `docs/goldie-stage1.md`.
  No live Gemini/Codex integration or deployment is claimed.
