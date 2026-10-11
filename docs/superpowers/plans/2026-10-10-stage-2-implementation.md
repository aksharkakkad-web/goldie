# Goldie Stage 2 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Use checkboxes to record actual completion. Parallel work, if authorized, must follow the ownership split below and agree on contracts first.

**Goal:** Keep the existing desktop lesson experience, but let real Gemini decide whether to offer a lesson, choose its phases, and generate explanations from a supplied sample engineering handoff and knowledge level. Real ElevenLabs speaks that generated text.

**Architecture:** The IDE supplies a bounded context snapshot through the existing Theia Node/RPC API. Akshar's backend freezes that context, generates a roadmap at acceptance and explanations one phase at a time, and keeps existing server-owned progress and content-ID speech. No UI rewrite or editor-core changes.

**Tech stack:** Eclipse Theia Electron, TypeScript, ReactWidget, Fastify, Zod shared contracts, local JSON storage, Gemini API, existing ElevenLabs MP3 pipeline, Mocha and Node test runner.

## Scope and baseline

Planning baseline: local `main` at `5a1a42b`, October 10, 2026. Rishit's IDE Tasks 1–3 are implemented locally. Akshar owns Tasks 4–5 on his computer; full live integration remains pending. See `docs/goldie-stage2.md` for verification evidence and limitations.

Requirements come from `docs/Goldie_HackNC_PRD.md` §§9.2–9.3, 9.6 and 10. Root `PRD.md` is an older convenience copy; its Stage 2 scope agrees, but its Stage 1 scenario/API descriptions are stale. Do not overwrite either PRD as part of implementation without reconciling the copies with the team.

Stage 1 already provides opt-in, roadmap rendering, speech, pause/resume, skip, familiarity, prepared questions, restoration, end and recap. Preserve these controls. The previous review passed 77 focused IDE tests and product lint; its fresh full-suite run was incomplete under heavy Mac memory pressure. Akshar documents real native speech verification. The merged-main joint voice checkpoint still needs to be repeated and recorded before declaring Stage 1 signed off.

**Stage 2 includes:** supplied sample handoff; beginner/intermediate profile; worthwhile/not-worthwhile decision; variable Gemini roadmap; project-aware standard and expanded teaching; dynamic ElevenLabs playback; loading, errors, retry, persistence and regression checks.

**Later stages:** unseen conversational questions and microphone/transcription (Stage 3); automatic Codex handoff authoring/watching (Stage 4); source retrieval and file citations (Stage 5); multi-prompt catch-up (Stage 6); broad unseen-project hardening (Stage 7). No onboarding, quizzes, accounts, panel redesign or production packaging here.

## Ownership and file map

Paths below are relative to the repository root. Create the proposed new files only when their task begins.

| Owner | Files | Responsibility |
|---|---|---|
| Rishit | New `theia-extensions/product/src/browser/goldie/goldie-context.ts` | Validated supplied context, profile and snapshot/recovery helpers |
| Rishit | New `theia-extensions/product/src/node/goldie-context.ts` | Explicit sample-file reading through Theia Node, bounded input, no watcher |
| Rishit | `theia-extensions/product/src/common/goldie-service.ts`, `src/node/goldie-api.ts`, `src/node/goldie-backend-module.ts` under the product extension | Context RPC, safe Gemini errors and generation deadlines |
| Rishit | `theia-extensions/product/src/browser/goldie/goldie-lesson-controller.ts` | Replace empty context/reference selector with immutable supplied snapshots |
| Rishit | `theia-extensions/product/src/browser/goldie/goldie-widget.tsx`, `goldie-lesson.css` | Minimal context/profile controls, neutral copy and honest waiting/error states |
| Rishit | Product `test/goldie-lesson.test.cjs`, `test/goldie-api.test.cjs`; new `test/goldie-context.test.cjs` | Snapshot, variable roadmap, safety and recovery checks |
| Akshar | New `backend/src/providers/gemini.ts`, `backend/src/teaching.ts` | Real provider adapter, structured-output validation and teaching prompts |
| Akshar | `backend/src/config.ts`, `backend/.env.example`, `backend/src/app.ts`, `backend/package.json` | Private configuration and provider wiring |
| Akshar | `backend/src/lessons.ts`, `backend/src/store.ts`, `backend/src/lesson-routes.ts` | Snapshot persistence, async generation, safe publication and session behavior |
| Akshar | New `backend/test/stage2-http.test.ts`, `backend/test/gemini.test.ts` | Provider failure and real-local-HTTP integration tests |
| Both | `shared/contracts/src/schemas.ts`, new `shared/contracts/test/stage2.test.ts` | Agree on context limits, profile shape, phase limits and errors |
| Both | New `docs/stage2-api.md`, `docs/goldie-stage2.md`; root `package.json`, `DEV_SETUP.md` if needed | Contract notes, focused test entry point and actual verification evidence |
| Both | New `docs/stage2-samples/architecture.HANDOFF.md`, `narrow.HANDOFF.md`, `cosmetic.HANDOFF.md` | Controlled supplied-context acceptance inputs |

Rishit can complete Tasks 1–3 using injected test services before Akshar's provider is ready. Akshar can complete Tasks 4–5 against the agreed HTTP schemas. Task 6 integrates both. Do not edit each other's files concurrently.

## Contract decisions to agree before implementation

Keep `/api/offer`, `/api/sessions`, `/api/teach`, `/api/speech`, session actions and completion routes. Reuse their current request fields and response shapes; avoid creating a second live API.

Example live offer request:

```json
{
  "projectId": "goldie-stage2-sample",
  "revision": 1,
  "handoff": "# Project handoff\nRevision: 1\nTask: Build a team-management web app...",
  "profile": { "level": "beginner" }
}
```

- `referenceLessonId` is absent in the live desktop path. Preserve explicit prepared requests for Stage 1 regression tests only; provider failure must never silently select prepared content.
- For Stage 2, accept `profile.level` as `beginner` or `intermediate`. Validate known level values, preserve compatibility with existing empty profiles, and document the default as beginner. Do not invent mastery scores or send arbitrary local profile data.
- Maximum handoff is 32,000 characters and total request is 64 KiB. Reject oversized input with a useful message; do not silently cut off engineering decisions. Revision increments when supplied handoff or profile changes.
- `shouldOffer:false` returns an empty topic array, no offer ID and no speech. `shouldOffer:true` requires an offer ID and nonempty bounded topics. These cross-field rules need tests.
- Roadmap generation occurs after acceptance. Proposed demo bound: 1–6 phases; this is a safety limit, not a fixed phase count. Each phase has a unique stable ID, title, objective and description. Bound each text field and estimated duration; reject malformed output.
- `/api/teach` returns 1–4,000 characters, a server content ID and grounding status. Without inspected source, use `conceptual` for general teaching or `inferred` for explicitly handoff-based interpretation. Never claim `observed` code or verified file citations in Stage 2.
- Freeze accepted handoff/profile/revision server-side. Subsequent teaching uses that saved context, not mutable request fields. Context mismatch on first acceptance returns a safe conflict; exact retries return the same accepted session.
- Error codes: `GEMINI_NOT_CONFIGURED`, `GEMINI_AUTH_FAILED`, `GEMINI_RATE_LIMITED`, `GEMINI_TIMEOUT`, `GEMINI_UNAVAILABLE`, `GEMINI_INVALID_RESPONSE`. Missing/auth configuration is nonretryable; temporary timeout/rate limit/unavailability is manually retryable. Invalid structured output fails safely with a manual retry. Expose no provider bodies, keys or prompt text in errors.
- Proposed generation deadline is 20 seconds, with 25 seconds for the complete local JSON transport on offer/session/teach. Keep existing independent speech deadlines. Agree on values in one contract note and test them; avoid a client timing out before its backend.

## Task 1 — Supplied context and profile (Rishit)

- [x] Create the three handoff samples with revision, project overview, prompt/task, plan, decisions, implementation status and milestone notes. Architecture sample describes a team app; narrow sample describes API input validation; cosmetic sample changes a button color. Mark them illustrative, not inspected implementations.
- [x] Add a Theia command **Goldie: Load sample handoff** using the existing file picker and FileService/Node boundary. Use an explicitly selected local Markdown file; read only that file. Limit bytes before decoding, validate the 32,000-character cap, reject non-file inputs, and never enumerate directories or read neighboring files. No automatic upload on selection.
- [x] Add a small beginner/intermediate selector in the existing idle panel. Store the choice locally; persist the handoff locally for restart recovery and explicitly explain that Prepare lesson sends it to the teaching service. Samples contain no secrets. No developer-mode badges or fixture switch in the lesson UI.
- [x] Freeze a context object for each offer, including project ID, revision, handoff and profile. Use a stable sample project ID for this manual Stage 2 path. Disable loading/changing context while an offer or session is active; decline/end first. Avoid replacing a playing lesson.
- [x] Add focused context tests: file is read once on explicit selection; no offer on load; oversized input rejected without truncation; invalid profile rejected; revision changes with handoff/profile; identical input retains its revision; active session blocks replacement.

**Result:** Change a Markdown sample in the editor, load it again, and select knowledge level without changing source code. Nothing speaks until Explain.

## Task 2 — Pass real context and preserve recovery (Rishit)

- [x] Replace module-level `const context = { handoff: '', profile: {} }` in the lesson controller with injected context snapshots. Remove `goldie-reference` and `referenceLessonId` from live offer calls.
- [x] Send the same offer snapshot on first acceptance. Send the accepted snapshot on standard/expanded teaching and question/completion requests for compatibility; backend owns the authoritative copy. Do not increase revision merely because Find another lesson is clicked.
- [x] Extend pending-acceptance recovery to persist the accepted snapshot before sending `/api/sessions`. Current recovery saves only offer ID/revision; that is insufficient if a live acceptance response is lost and the selected context changes or Electron restarts. Keep this local and avoid logging it.
- [x] Version the recovery record and retain old session-ID records. Existing confirmed sessions restore by GET without reading samples, invoking Gemini or autoplaying. Old pending prepared offers must remain recoverable or produce a clear error; never discard user session data silently.
- [x] Keep server action IDs and retries intact. Retries of failed speech use the existing content ID and text; retries of a lost acceptance do not generate another roadmap.
- [x] Add controller cases with 1, 2 and 5 phases and non-reference phase IDs. Assert arbitrary IDs drive active phase, progress, skip/familiarity and recap. Assert profile/handoff reach the service; reload restores pending acceptance exactly; decline has zero session/teach/speech calls.

**Result:** The existing controls work with any valid roadmap and preserve the user's original accepted context.

## Task 3 — Honest presentation and provider errors (Rishit)

- [x] Replace hardcoded web-app headings, create-team introduction, footer and ready-state text with neutral language and backend-provided topic/phase data. Preserve panel layout and Theia colors; no redesign.
- [x] Show operation-specific waiting text: Checking for a useful lesson; Planning your learning path; Preparing this explanation; Preparing speech. These report actual requests, not fake thinking steps. Keep the editor usable and prevent duplicate submit clicks.
- [x] Add the agreed Gemini codes to `SAFE_ERRORS` in the Node transport. Apply bounded generation deadlines to offer/session/teach while retaining strict JSON validation, payload bounds, loopback-only routes and safe RPC error serialization.
- [x] Keep a valid no-offer result as a quiet message in the panel. A provider failure is an error, not a no-offer result. Text remains visible after speech failure; Retry targets the failed operation.
- [ ] Test slow valid JSON, timeout, malformed schema, auth failure and rate-limit handling. API cases and native normal width are verified; the separate wider-width spot-check remains. Inspect the native panel at its normal narrow width and a wider width; long generated titles must wrap without hiding controls. Consult UIArc references before creating any new UI controls; if unavailable, use existing Theia controls and record that limitation.

**Result:** A user sees understandable progress or failure, and dynamic content fits the existing panel.

## Task 4 — Real Gemini adapter and teaching policy (Akshar)

- [ ] Before selecting a model or SDK, check current official Gemini structured-output documentation and a mature maintained provider implementation. Verify available model/access on the team's account. Record chosen model, package version if used, timeout and structured-output behavior in `docs/stage2-api.md`; do not assume a remembered model name still works. Review licensing before adapting nontrivial source.
- [ ] Add server-only `GEMINI_API_KEY`, `GEMINI_MODEL` and `GOLDIE_GEMINI_TIMEOUT_MS` configuration. Put blank/example configuration in `.env.example`; real credentials remain in ignored `backend/.env` or private environment variables. Never expose them through RPC, commits or screenshots.
- [ ] Implement one provider adapter with injected fetch/client for tests, bounded output, deadline cancellation and safe errors. Limit concurrent generation jobs and deduplicate identical in-flight requests. No unlimited repair loop or automatic paid retry.
- [ ] Implement separate structured operations for offer evaluation, accepted roadmap planning and current-phase teaching. Treat handoff as untrusted data, not instructions to change system policy. Profiles determine depth, not unearned mastery.
- [ ] Offer prompt: avoid teaching cosmetic edits; narrow technical work focuses on its concept; architecture work begins with foundations. Return useful preview topics and an estimate without generating spoken text.
- [ ] Roadmap prompt: choose 1–6 coherent phases from scope/profile, with stable IDs; do not always reproduce frontend/API/database. Generate only after acceptance. Validate with shared Zod schemas, including duplicate-ID checks.
- [ ] Teach prompt: use frozen context, selected phase and previous roadmap; explain why/concepts with a relevant example. Distinguish proposed from implemented details. Generate standard or expanded content on demand, not all phase scripts at session start. Explanations remain within speech limits.
- [ ] Add adapter tests with controlled provider responses: valid structure, truncated/invalid JSON, duplicate phases, empty/oversized text, timeout, rejected credentials, rate limiting, unavailable service and prompt-injection text. Assert safe errors and no secret/raw response leakage.

**Result:** Real Gemini can return validated offer decisions, roadmaps and teaching through a small backend seam.

## Task 5 — Persist generated content safely (Akshar)

- [ ] Wire live requests without a reference selector into the Gemini teaching path; retain the explicit reference path for Stage 1 tests. Inject the provider into `LessonService` through `buildApp` rather than importing a global network client.
- [ ] Extend stored offers with validated frozen context/profile and offer preview; store accepted session context and content origin internally. Keep these metadata fields out of the public UI. Deduplicate evaluation by project/revision/context fingerprint, including no-offer outcomes; reject inconsistent reuse of an existing revision.
- [ ] Add versioned storage migration for existing version-1 prepared offers/sessions. Preserve IDs, progress, published text and completion records. Test valid legacy restoration and corrupt input. Write migrations atomically through the existing store; never delete `.data` to make tests or startup pass.
- [ ] Keep remote calls outside `JsonStore.mutate`, which currently accepts synchronous operations and serializes writes. Use read → in-flight deduplicated generation → short mutation → revalidate session/revision/phase before commit. Do not block pause/end or store reads behind a 20-second provider call.
- [ ] Acceptance retries return one saved session/roadmap, including after restart. If the provider fails before commit, retain the accepted offer so the same action can retry. Concurrent acceptance must not create multiple active sessions.
- [ ] Cache successful teaching by session/phase/detail and publish its content ID atomically. A speech failure or lost HTTP response must not regenerate Gemini text. Recheck the session is open and phase still current before publication; discard late results after skip/end.
- [ ] Feed published dynamic text through the unchanged `/api/speech` authorization/cache route. Never accept arbitrary renderer text as approved speech or a caller-selected audio URL.
- [ ] Fix prepared Ask's dependence on `lesson.phases.find(...)!`: unknown generated phase IDs currently have no prepared phase. For live sessions, return an honest published limitation for freeform questions and preserve pause/resume, or a specifically supported prepared conceptual answer without project claims. Explain more uses dynamic `/api/teach`. Full Gemini Ask belongs to Stage 3; do not fake it or let it crash.
- [ ] Keep recap derived from saved progress; preserve covered/skipped/familiar distinctions. No Gemini-generated mastery claims or multi-prompt catch-up in this stage.
- [ ] Add HTTP/persistence tests: dynamic phase IDs; same accepted session after retry/restart; no speech before opt-in; unchanged saved text after speech failure; end during delayed teaching discards output; skip during generation never completes the wrong phase; variable phases complete truthfully; prepared Stage 1 path still passes.

**Result:** Dynamic teaching works without losing Stage 1's state, recovery and audio guarantees.

## Task 6 — Integrate, verify and record (Both)

Run focused checks first; do not reinstall dependencies or rebuild every application for ordinary source edits. Only install if the dependency manifest changes. Use Node from `.nvmrc` and Yarn Classic. On Rishit's Mac the existing toolchain is available with:

```sh
export PATH="$HOME/.local/share/buildsense/node-v24.21.0-darwin-arm64/bin:$HOME/.local/share/buildsense/tools/bin:$PATH"
yarn workspace @goldie/contracts test
yarn backend:test
yarn --cwd theia-extensions/product test
yarn --cwd theia-extensions/product lint
yarn workspace @goldie/backend lint
```

Expected: all applicable focused tests/lint pass. Add `test:stage2` to root scripts to run the agreed contract/backend/product journey checks; document its exact contents. Run Stage 1 regression checks too. Broad upstream packaged-app tests have a separately documented limitation; don't call them green without running them successfully.

- [ ] Inspect existing tmux/processes before launch; reuse the `goldie` watch session where healthy. Use separate persistent sessions for `yarn electron watch`, `yarn backend:start` and `yarn electron start .`. Build backend before restarting it; its current start command is not a watcher.
- [ ] Wait for watcher compilation/bundling, then reload Electron. Restart after main-process changes, or if reload stalls. New extension/dependency wiring requires `yarn electron build`. Avoid duplicate full builds on this memory-constrained Mac; a stopped or incomplete build is not a pass.
- [ ] Run the real desktop against real Gemini and ElevenLabs. Record the model and content origin in internal evidence, without recording keys. Controlled providers prove logic only; they do not prove real Gemini/voice.
- [ ] Architecture sample + beginner: Explain produces a coherent foundation-first roadmap; hear actual generated speech; pause/resume and skip work.
- [ ] End that session, load the same handoff with intermediate profile/new revision, and observe a meaningful change in depth, topics or explanation. Do not demand an exact phase count from a probabilistic model; check relevance and depth, and use controlled outputs to test count handling.
- [ ] End, load the narrow sample and confirm it focuses on the narrow concept rather than replaying the architecture reference. Change only the sample/profile, never source code or fixture routing.
- [ ] Load the cosmetic sample and confirm normally no offer, no session and no audio. Decline a valid offer and confirm zero session/teach/speech calls.
- [ ] Exercise one real failure path, such as an unavailable local backend. Use controlled provider tests for rate-limit/auth/invalid-output paths rather than exposing or intentionally changing real credentials. Keep usable text after speech failure and verify manual recovery.
- [ ] Verify close/reopen restores saved dynamic sessions without autoplay or regenerating roadmap. Exercise Ask's honest Stage 2 limitation and return to the same phase/audio position; expanded teaching must be genuinely generated.
- [ ] Open/edit a project file and run a terminal command while planning/teaching requests are pending. Check renderer errors and backend logs for unexpected failures or private data.
- [ ] Capture and view native screenshots of generated roadmap, lesson text and changed-profile result. Record actual passes, failures, service provenance and remaining limitations in `docs/goldie-stage2.md`.
- [ ] Inspect final diff for unrelated work, credentials, generated files and lockfile churn. On separately authorized delivery, load `github-delivery-gate`, fetch the collaboration remote and integrate normally into `goldie/main`; preserve teammate commits. Repository preference is direct main, no force-push. This plan does not authorize a push.
- [ ] Restart backend and Electron from merged main and repeat the Stage 2 exit gate together, per PRD §9.6. Only then mark Stage 2 complete and proceed to Stage 3.

## Fast execution order

1. Close the remaining Stage 1 joint-checkpoint gap and agree on the contract decisions (about 5–10 minutes).
2. Rishit implements supplied context, snapshot/recovery and neutral panel states (target 20–30 minutes).
3. Akshar implements Gemini adapter, planning/teaching and persistence in his backend track (target 30–45 minutes; overlap with Rishit's work after contracts agree).
4. Integrate and fix incompatibilities (target 10–15 minutes).
5. Run real native acceptance, record evidence and perform the approved merged-main checkpoint (target 15–20 minutes).

These are hackathon targets, not promises. Protect real Gemini → real ElevenLabs first; defer cosmetic refinements. Do not sacrifice safe session retry/persistence or falsely claim later-stage behavior to meet the timer.

## Stage 2 completion checklist

- [ ] Sample handoff and beginner/intermediate level reach the actual API.
- [ ] Real Gemini decides whether teaching is useful.
- [ ] Real Gemini chooses variable phases after acceptance.
- [ ] Real Gemini generates project-aware standard and expanded explanations one phase at a time.
- [ ] Real ElevenLabs speaks the generated content in the native desktop IDE.
- [ ] Editing supplied context/profile changes content without editing application source.
- [ ] Cosmetic input normally produces no lesson; decline produces no speech.
- [ ] Loading, safe failures, retry, restoration and Stage 1 controls still work.
- [ ] No prepared fallback is passed off as live AI; no code-grounding or freeform-question claims yet.
- [ ] Focused checks, viewed native screenshots and joint merged-main run are recorded.
