# Stage 2 — integrated Gemini teaching and Theia contract

This is the authoritative integration guide for both tracks. Rishit's manual
Markdown context/profile UI and Akshar's backend provide real Gemini offer
decisions, adaptive roadmaps and lazy spoken explanations behind the same HTTP
contracts. The product remains native Theia Electron only. Stage 1 remains available only
through the explicit developer reference selector. There is no automatic fixture
fallback. Arbitrary Gemini Q&A, microphone input, live Codex watching, source-file
evidence and catch-up planning remain later stages.

## Setup and privacy

Use Node 24.21.0 and Yarn Classic. Add `GEMINI_API_KEY` to the existing ignored
`backend/.env`; do not overwrite that file or paste the key in chat. The default
`GEMINI_MODEL=gemini-3.5-flash-lite` is configurable. Akshar approved testing and
adopting this faster primary after intermittent `gemini-3.8-flash` generation.
This is an explicit primary-model choice, not an automatic fallback or billing
change. `GOLDIE_GEMINI_TIMEOUT_MS`
defaults to 20000 and cannot exceed it. Keep ElevenLabs configuration unchanged.

Akshar approved deliberately supplied private-project handoff text as Gemini
context. This does not approve repository uploads, credentials, `.env` files or
unnecessary personal data. Google’s [unpaid-service data-use terms](https://ai.google.dev/gemini-api/terms#unpaid-services)
apply; private-project approval does not create provider confidentiality
guarantees. A key's billing tier is controlled in Google, not enforceable by this
backend. Use the approved free-tier project; the backend never changes billing,
buys credits, selects a fallback model or automatically retries.

Only the supplied handoff (maximum 32,000 characters) and an allowlisted profile
are sent, along with the current saved roadmap when teaching. No source files are
read. Unknown profile fields are stripped; invalid known fields are rejected.

Gemini snapshots **retain raw supplied handoff text locally**, normalized profile,
revision, roadmap and model/prompt identity in gitignored `sessions.json`.
New data directories/files use 0700/0600 permissions. Do not log these snapshots.
Prepared reference sessions continue discarding supplied handoff/profile text.
Use one backend process per data directory. Version 1 storage is validated and
atomically migrated to version 2; corrupt state is preserved, never reset.

The IDE reads one explicitly selected local regular `.md`/`.markdown` file through
its dedicated Theia in-app picker; other IDE dialogs are unchanged. It rejects
final-component symlinks, folders, non-file URIs, invalid UTF-8, empty text and files
over 128,000 bytes. Requests are at most 64 KiB; the IDE reserves 1 KiB for envelopes
and never silently truncates context. Loading or changing level makes no backend
request. Selected context and full acceptance recovery, including handoff text,
persist in Electron local storage. The sample workflow's project ID is
`goldie-stage2-sample`, not inferred workspace identity. Revisions change only with
handoff/level changes, not filename changes, reopening or declining.

## Exact client sequence

1. Send a bounded sample handoff and profile to `POST /api/offer`. **Omit
   `referenceLessonId`** for Gemini. An empty handoff returns no offer. The explicit
   `webapp-architecture` selector intentionally keeps using prepared Stage 1 content.

   ```json
   {
     "projectId": "goldie-stage2-sample",
     "revision": 7,
     "handoff": "Status: planned. Build a Next.js team app. Browser forms call server APIs; PostgreSQL stores teams and memberships. Add authenticated membership checks.",
     "profile": {"level": "beginner", "knownConcepts": []}
   }
   ```

   `profile.level` accepts `beginner` or `intermediate`, defaulting to beginner.
   `knownConcepts` defaults to an empty list (at most 100 nonempty, trimmed strings,
   each at most 200 characters). These are self-reported familiarity, not mastery.

2. Show the returned `previewTopics` (at most three), estimated listening time and
   opt-in control. No offer means no popup or audio. A provider failure is an error,
   not a cosmetic/no-offer decision. Offer evaluation makes one Gemini call for the
   decision **and complete roadmap**; it never generates speech.
   The server estimates listening time at roughly 60 seconds per saved phase,
   matching the 40–90-second lesson target instead of exposing inflated model
   curriculum-time estimates. The original model decision remains in the snapshot.

3. Persist the exact offer ID/revision **and context** before acceptance. Accept
   with `POST /api/sessions`:

   ```json
   {"offerId": "<returned offer ID>", "revision": 7, "handoff": "<unchanged offer handoff>", "profile": {"level":"beginner"}}
   ```

   Acceptance returns the exact saved roadmap without another Gemini call. Phase
   objects remain `{id,title,objective,description}`; no public schema expansion
   or fixed phase-count cap. Positive offers have nonempty roadmaps; no-offer
   decisions create no session. Internal rationale, status and prerequisite metadata stay
   server-side. Repeating acceptance returns the same session, even after closure.

4. For the active phase, request `POST /api/teach`:

   ```json
   {"sessionId": "<accepted session ID>", "phaseId": "<active phase ID>", "detail": "standard"}
   ```

   Render `{explanation,groundingStatus,contentId}` immediately. `detail:"expanded"`
   generates a focused clarification of at most 100 whitespace-delimited words;
   overlong output is rejected safely rather than published. Both use the offer's frozen context/profile;
   later request `handoff`/`profile` fields remain accepted for compatibility but
   cannot replace that snapshot. Responses are conceptual or handoff-inferred,
   never observed source evidence. Fetching a lesson does not complete a phase.

5. Request `{sessionId,contentId}` from `POST /api/speech`. The existing Theia Node
   transport validates the audio ID, fetches bounded MP3 bytes and returns base64
   over RPC; the renderer creates a local playback URL. Never fetch a provider or
   filesystem URL directly in the Electron renderer.

6. Keep existing pause/resume, progress action IDs, skip/already-know, typed Ask and
   server-derived recap flow. Pause before Ask; play the answer; resume the original
   lesson at its saved client position. Stage 2 Ask provides general prepared API,
   transaction and idempotency FAQ answers, or an honest limitation and suggestions.
   It makes **no Gemini call** and does not claim knowledge of project files.

7. Restore with `GET /api/sessions/:sessionId` without autoplay. Cached explanations
   and audio survive restart. Uncached explanations require the original model and
   prompt identity; changed configuration returns `GEMINI_CONTEXT_CHANGED` instead
   of silently mixing lesson versions. End early for a partial recap.

The Node client validates unique phase IDs, disjoint valid completed/skipped/
familiar groups, question references, first-pending active phase and completed
session consistency on acceptance, retrieval and actions. Roadmaps are uncapped;
seven-, twelve- or larger lessons are not rejected merely for their size. The UI
uses returned phase IDs and locks context during active/recovering lessons.

One active lesson per project suppresses new offers. An already accepted project
revision cannot be reoffered. Successful positive and negative evaluations are
cached by project/revision, canonical context, normalized profile and provider
identity. Concurrent duplicate calls share work. Network calls never hold the JSON
write queue; late results after skip/end or superseding acceptance are discarded.

### Acceptance recovery and parallel windows

Nonretryable `ACTIVE_SESSION`, `REVISION_ALREADY_ACCEPTED`, `NO_LESSON_OFFER`,
`CONTEXT_CONFLICT`, `REVISION_CONFLICT` and `OFFER_NOT_FOUND` definitively reject
acceptance. Archive the exact rejected snapshot first, then retire only its
still-matching pending recovery record. Preserve newer/different records from
another window. Archival retry is idempotent; archive/tombstone storage failures
preserve recovery and show a storage error. Successful rejection recovery returns
to idle with context controls unlocked and actionable guidance, without requiring
an additional decline.

For an active conflict, finish the lesson in its owning window. Goldie never ends,
replaces or takes over that lesson automatically. This protects newer records
observed before synchronous retirement, not all local storage writes through a
general multi-window locking protocol. Network/unknown errors preserve exact
pending intent because acceptance may already have committed. Restart/replay
recovers the same session without duplicate creation or autoplay. Corrupt recovery
remains saved and blocks unsafe replay until repaired.

## Failure and cost behavior

Gemini uses stateless `generateContent`, structured JSON and local Zod/semantic
validation. No tools or cloud conversation state are enabled. Handoff and profile
text are untrusted data, not prompt instructions. Provider responses and outgoing
requests are bounded to 1 MiB; planning output is bounded to 8192 tokens and short
lesson/clarification output to 1024 tokens, not a phase-count cap. Gemini 3-series
requests explicitly select `thinkingLevel: LOW`; older models omit that unsupported
parameter. The generation policy is included in the versioned provider identity
(`stage2-v7-qualified`), preventing silent cache/session mixing after this change.
Teaching guidance qualifies security/consistency claims and distinguishes atomic
database writes from external side effects. Structured validation is not a factual
correctness proof: generated teaching still needs semantic review.
The provider allows two simultaneous generations, with a 20-second total deadline
including body reads. Offer/teach have separate 30-second Theia transport deadlines;
ordinary session operations retain 15 seconds and speech retains 30 seconds.
Acceptance is an ordinary operation, not model generation. The Node option is
`teachingTimeoutMs` for offer/teach, `timeoutMs` for ordinary operations and
`speechTimeoutMs` for speech generation. ElevenLabs synthesis itself is bounded
to 20 seconds by default. Audio retrieval retains the ordinary 15-second deadline.

All errors use the existing `{error:{code,message,retryable}}` shape, and the Node
transport maps known codes to fixed safe RPC messages. It never forwards raw
provider bodies, credentials or provider error text.
The actual Theia RPC codec preserves `apiCode` and server retryability (`-32001`
nonretryable, `-32002` retryable); unknown/malformed errors remain generic.

| Code | Recovery |
| --- | --- |
| `GEMINI_NOT_CONFIGURED`, `GEMINI_AUTH_FAILED` | Fix server credentials/access; not automatically retryable |
| `GEMINI_REQUEST_REJECTED` | Check model/request configuration; not automatically retryable |
| `GEMINI_CONTEXT_CHANGED` | Restore original configuration for uncached content |
| `GEMINI_QUOTA`, `GEMINI_BUSY`, `GEMINI_UNAVAILABLE` | Explicit manual retry later |
| `GEMINI_TIMEOUT`, `GEMINI_INVALID_OUTPUT` | Explicit manual retry; existing state/text preserved |
| `REVISION_ALREADY_ACCEPTED`, `ACTIVE_SESSION`, `NO_LESSON_OFFER` | Definite acceptance rejection: archive/release pending intent; never replace another lesson |

## Verification and release gate

```sh
yarn test:stage2
yarn lint
yarn electron build
# Explicit real-provider calls; never part of CI or the normal test command:
yarn backend:smoke:gemini
yarn backend:smoke:gemini --play
```

The live smoke uses supplied non-sensitive sample handoffs: beginner, intermediate
with known concepts, added billing/queue architecture, and cosmetic-only work.
It makes at most four planning and four teaching calls, with no automatic retries.
`--speech` additionally generates one Gemini lesson and one **prepared FAQ answer**
through ElevenLabs; `--play` includes speech and plays both MP3s via macOS `afplay`.
It uses a separate `<GOLDIE_DATA_DIR>/stage2-smoke` store/cache so it does not share
the normal backend's sessions file. Do not run two smoke processes together.

The smoke prints each API operation's start/result and elapsed milliseconds without
logging supplied handoff/profile text or credentials. A successful 0600 JSON report
includes these timings. Failure identifies the operation, elapsed time and safe
error code; it never triggers a retry. The smoke closes its sessions. It rejects a
cosmetic offer or identical outputs, but **different wording alone is not proof of
adaptation**: review the report for meaningful changes in coverage/depth/relevance.

Automated tests use controlled upstream HTTP and spend no provider credits. They
cover real API/session/speech integration, restart/migration, negative decisions,
context freezing, deduplication, invalid/stale output, quota/timeouts, credential
redaction and Stage 1 regression behavior. Packaged upstream Electron tests still
require `yarn electron package:preview`; these are separate from Goldie's checks.

Both tracks are now integrated in the local review worktree. The native client
loads a selected handoff/profile and omits the reference selector. The prepared
Stage 1 path remains explicit developer regression coverage, not an automatic
Gemini fallback.

See [current integrated verification](stage2-alignment-verification.md) for exact
candidate, checks, real-provider provenance and remaining limitations. The earlier
[Rishit-only milestone](goldie-stage2.md) is controlled-client evidence, not proof
of real Gemini or ElevenLabs. Overall Stage 2 remains open until approved delivery
to main and Akshar/Rishit's together-run checkpoint in PRD §9.6.

### Provider history and limitations

Earlier `gemini-3.8-flash` runs intermittently succeeded but repeatedly exceeded
the 20-second deadline despite valid key/model access. LOW thinking and smaller
output did not fully resolve it; a diagnostic-only 60-second call received no
response headers. Exact causes and any benefit from paid access remain unproven;
no quota failure was observed in those runs. The application deadline was never
increased and billing was not changed.

Akshar approved `gemini-3.5-flash-lite` as primary. Earlier trials also had upstream
5xx failures; successful verification is not an uptime guarantee. Final v7 text
smoke reviewed meaningful beginner/intermediate and changed-architecture
adaptation, including qualified transaction/external-side-effect guarantees,
with eight Gemini calls in 785–1799 ms. The preceding v6 full speech run used real
ElevenLabs and macOS playback. Current integrated native results supersede those
backend-only milestones, while preserving the same no-auto-retry policy.

Structured validation is not a complete hallucination detector. Review actual
generated teaching for correctness before recording a judged demo. No Stage 3
freeform Q&A, microphone, live Codex handoff watcher, source retrieval, hosted
database or deployment is included.
