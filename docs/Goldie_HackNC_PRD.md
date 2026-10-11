# Goldie — HackNC 2026 Product & Staged Build PRD

**Status:** Build-ready specification — prepared voice experience first, live AI second, Codex third  
**Owners:** Rishit — IDE, context and user experience; Akshar — Gemini, teaching and voice backend  
**Primary track:** General  
**Natural additional tracks:** Gemini API and ElevenLabs  
**Optional:** .Tech domain; TigerData only after the core demo works  
**Explicitly out of scope:** Photon, Community-specific features, a standalone coding agent, a full curriculum platform

## 1. Product definition

**One-line pitch:** Goldie is an opt-in engineering mentor within an AI coding environment. While Codex implements a developer's request, Goldie teaches the architecture, underlying concepts and tradeoffs of that developer's *actual project*, without requiring them to switch tabs or slow down coding.

**User problem:** AI coding agents can generate application features faster than their users can develop a mental model of the systems they are shipping. Asking a separate chatbot for context requires switching tools, reconstructing project details and interrupting the building flow.

**Core differentiator:** Goldie is not a transcript narrator, syntax explainer or generic repository chatbot. It takes a cumulative, agent-authored engineering handoff; plans a task-aware learning path; delivers spoken conceptual lessons; lets the user zoom out to theory or zoom in to real implementation; and preserves the user's current lesson while new prompts arrive.

**Final judging demonstration:** A judge sees a real Codex task create/update a project handoff, an optional learning offer, a Gemini-generated multi-phase roadmap, an ElevenLabs explanation, a skipped phase, a grounded implementation question, and a later coding prompt that does not interrupt the active lesson. Every behavior claimed as live must use its real integration.

## 2. Product rules — locked decisions

1. **Opt-in, never surprise audio.** Goldie may offer a non-blocking “Explain what you're building?” popup, but starts no lesson or microphone capture until the developer accepts.
2. **Proactive only after acceptance.** Within an active session, it chooses worthwhile concepts and advances through phases automatically unless the user pauses, skips or asks a question.
3. **Phases are dynamic.** A lesson has 0 to N coherent learning objectives, based on engineering scope and the user's baseline knowledge. There is no fixed 3- or 5-phase maximum. For the hackathon, generate the roadmap at the start and the detailed explanation one phase at a time to control latency and cost.
4. **Hybrid sequencing.** For a large PRD/app build, begin with a system-level foundation, then follow relevant implementation milestones. For smaller tasks, prioritize the specific implementation and its underlying engineering principle. For cosmetic tasks, normally offer nothing.
5. **HANDOFF.md is primary context.** The Codex-authored, cumulative `.goldie/HANDOFF.md` contains current architecture, all relevant prompts, plan, dependencies, decisions, progress and changes. It is updated at meaningful milestones rather than every file edit.
6. **Code is on-demand evidence, not the routine context stream.** No continuous Git diff feed or full-repository upload. The IDE can read/search a limited set of local files, and optionally inspect local Git, only when the user asks “where/how is this implemented?” or Gemini needs evidence for an implementation-specific claim.
7. **Single active lesson.** New coding prompts update the cumulative handoff; they do **not** replace or interrupt the current learning path. When the user completes or dismisses the lesson, Goldie may offer a catch-up lesson covering accumulated architectural changes.
8. **Conversational depth.** The user can ask to zoom out (e.g., “How do neural networks work?”), discuss architectural tradeoffs, or zoom in (“Which files implement this?”), then resume the paused phase.
9. **Click-to-talk, not hold-to-talk or full-duplex speech.** Click **Ask Goldie** to pause playback and start recording; click **Send question** to stop and submit, or **Cancel** to discard. Local Whisper transcribes, Gemini answers and ElevenLabs speaks. No ordinary typed-question composer or typed fallback. Resume is explicit and preserves the original lesson clip and position.
10. **Learning is not automatically mastery.** Skip and “already know this” are distinct. The latter records claimed familiarity. Optional text practice is self-comparison with model answers, not grading or evidence of mastery.
11. **Prepared voice-first experience, then intelligence.** First make one complete reference flow work using a preconfigured learning path, prewritten lessons and **real ElevenLabs speech**. Then replace predetermined content with Gemini-generated decisions and explanations; finally connect live Codex handoffs, source evidence and multi-prompt continuity. Preserve the same user-facing interface across stages, without user-facing “stub” badges, demo switches or fake AI-thinking indicators. Keep temporary content identifiable in developer tests, and do not describe it as live AI to judges.
12. **Generalize only after the vertical slice works.** Start with one prepared web-app task and predictable teaching content. First establish actual speech/playback; next add genuine Gemini decision-making; then live Codex context. Only afterward test different prompt sizes, changing plans and an unrelated project. Do not build arbitrary-repo parsing before the core interaction works.

## 3. Target users and scenarios

**Primary user:** A developer or student using Codex to build a real web application while wanting to understand its engineering architecture, not every generated line.

| Codex request | Planner behavior | Example phases |
|---|---|---|
| “Make the signup button blue” | No offer unless manually requested | None |
| “Add rate limiting” | Narrow, implementation-first | Rate-limiting purpose; local vs distributed counters if relevant |
| “Add Google OAuth” | Small/medium; start with the central concept | OAuth flow; sessions vs authorization |
| “Build this entire SaaS PRD” | Large; learning-first foundation, then implementation-aware | Application architecture; auth; data model; API boundaries; payments; async jobs — only where relevant |
| “Fix duplicate Stripe webhook processing” | Root-cause concept rather than narrating a patch | Retries; idempotency; persistence guarantees |
| “Build an ML feature” | Adapt depth to experience | Model/inference pipeline; neural networks; model serving, as relevant |

A ten-phase roadmap is valid if the work merits it. Each phase should have one objective, a short description, and a generated spoken explanation when entered. A developer can finish or dismiss early; a long build is **not** an instruction to fill time with audio.

## 4. User journey / screens

### 4.1 Onboarding (first launch)
- Three short questions or concise self-assessment to estimate familiarity with frontend/backend architecture, APIs, databases and authentication. Store a small local knowledge profile.
- Do not block the demo with account creation.

### 4.2 Coding begins
- Developer uses Codex normally in the IDE.
- Rishit's context integration instructs Codex to start/update `.goldie/HANDOFF.md` with the prompt and a concise plan. The IDE watches handoff revision changes.
- When enough context exists, call Gemini to evaluate whether a useful lesson can be offered. No popup for trivial changes.

### 4.3 Learning offer
- Small non-blocking popup: **“Want to understand the engineering behind this?”**
- Shows 1–3 preview topics and estimated total listening time (estimate, not a promise).
- Buttons: **Explain** and **Not now**.
- At most one initial offer per meaningful task; dismissing is silent. A manual **Learn about this build** control remains available.

### 4.4 Learning panel
- Current phase title, concise concept summary, audio progress, numbered roadmap and upcoming phases.
- Controls: **Pause / Resume**, **Skip phase**, **Already know this**, **Ask**, **Explain more**, and **End session**.
- “Skip” moves on for this session; “Already know” also saves a self-reported familiarity signal.
- No new popup or automatic lesson replaces the active session when Codex receives more prompts.

### 4.5 Interactive question
- Click **Ask Goldie** to pause lesson or answer playback and start microphone capture. Click **Send question** to stop and submit; **Cancel** discards. No holding, transcript editing or automatic submission.
- Gemini answers according to intent: zoom out into theory, explain the architectural choice, or request on-demand code evidence and reference real local paths.
- A concise answer is spoken via ElevenLabs. **Resume lesson** returns to the current phase, without losing position.

### 4.6 Session completion
- After all selected phases, or when user ends: short recap of covered, skipped and self-reported familiar concepts. Stage 3 offers optional text practice after each covered phase; see §9.2.1. Closing never depends on practice, and final-phase practice does not reopen the lesson.
- If the handoff changed since this session's snapshot, Gemini evaluates *all relevant changes* together and may offer **“Your app evolved — learn what's new”**. It doesn't force-start a new session.
- If the currently playing lesson becomes factually outdated, flag it and offer refresh; do not continue asserting superseded implementation details.

## 5. Context integration — Rishit's domain

**Canonical file:** `.goldie/HANDOFF.md` in the project workspace. Keep it human-readable, bounded and cumulative. The initial task may be a detailed PRD; do not copy an enormous PRD verbatim into the handoff. Reference the source document and summarize its technical implications.

**Required fields / headings**

```md
# Goldie Handoff
Revision: 7
Project: TeamFlow
Updated: <ISO time>

## Project overview / existing architecture
...
## Requirements and user prompts (chronological; IDs)
- P001: Build a team project management SaaS. [active]
- P002: Add semantic search. [in_progress]
- P003: Add role-based administration. [planned]
## Implementation plan and dependencies
...
## Architectural decisions and tradeoffs
...
## Current implementation state
- Planned: ...
- In progress: ...
- Implemented / verified: ...
- Superseded: ...
## Affected components and relevant file pointers
...
## Milestone history / changes since prior revision
- R7: Added admin permission requirement; no server authorization verified yet.
```

**Required behavior:**
- On each new Codex prompt: append/merge request into chronological history; increment revision; identify effect on previous work and dependencies.
- On a meaningful plan or implementation milestone: update plan, status, decisions, file pointers and revision. Never record private chain-of-thought; only ordinary summarized engineering rationale.
- On completion: mark what is *actually completed*, what was dropped, and what's still pending.
- Maintain cumulative project state and histories so Gemini is never limited to the last prompt.
- A small watcher notifies the IDE when revision changes. If Codex fails to update the handoff, the IDE may capture the explicit user prompt and create a temporary **unverified** context; do not present that as confirmed implementation.

**On-demand source retrieval:** Rishit's IDE layer exposes `searchWorkspace(query, maxFiles)` and `readSource(path, maxLines)` with safe workspace-relative paths, bounded excerpts, ignoring secrets, generated files and irrelevant directories. An optional local Git diff is permitted **only for a narrow implementation question**. The backend asks for targeted evidence; the IDE chooses and returns excerpts. The routine Gemini planner does not ingest Git history or the whole repository.

**Proof of correctness:** Explanations distinguish *planned*, *in progress* and *verified*. Any file/folder answer must name paths present in retrieved evidence; otherwise explicitly say it is not verified.

## 6. Gemini / learning engine — Akshar's domain

### 6.1 Input
- Current `HANDOFF.md` content (or normalized structured extraction), current revision, new items since selected checkpoint, developer's onboarding profile, completed/skipped phases, current active phase and recent Q&A.
- Optional bounded source excerpts only when implementation-specific evidence is requested.

### 6.2 Planner (`evaluateOffer` and `createPlan`)
- Detect whether the task offers a meaningful engineering learning opportunity; return `shouldOffer=false` for trivial/cosmetic changes.
- Rank candidate concepts on **architectural importance, current relevance, knowledge gap, engineering consequences and prerequisites**.
- Choose as many *nonredundant* phases as genuinely warranted. Each phase has `id`, `title`, `objective`, `whyNow`, `status`, `sourceStatus` (`planned` / `implemented` / `general`), and optional prerequisite IDs.
- For large prompts choose foundation-first, then implementation-aware order. For narrow requests choose the immediate underlying concept first.
- Keep roadmap stable while active; add nothing automatically from new prompts. Lazy-generate phase explanations to avoid precomputing a long lecture.

### 6.3 Teacher (`teachPhase`)
- Start with a plain-language architecture or engineering mental model; connect it to the specific project and explain why the tradeoff matters.
- Adapt terminology and technical depth to the user. Default spoken segments roughly 40–90 seconds, expandable on request.
- Do **not** merely report file edits, list syntax, or attribute unverified decisions to existing implementation.
- Separate conceptual principle, current project relevance, and verified implementation evidence.

### 6.4 Conversation (`askQuestion`)
- Understand question intent without explicit mode switching: `zoom_out`, `architecture`, `zoom_in`, `deeper`, `clarify`.
- For broad theory (“How does a neural network work?”), teach the principle and optionally relate it back to the project.
- For code-specific questions (“Which file handles sessions?”), request bounded source retrieval before claiming paths.
- Preserve lesson context and provide a `resumePhaseId` after an answer.

### 6.5 Completion and catch-up
- Completion/early dismissal writes learning state but preserves new, unevaluated project changes.
- Upon closure, compare the lesson's `snapshotRevision` and taught concepts to the *cumulative* current handoff. Plan a new optional offer only when materially new or changed concepts exist.
- Store two checkpoint values: `sessionSnapshotRevision` and `lastEvaluatedRevision`. Never advance them in a way that silently loses unseen updates. Concept coverage is deduped by topic, not by prompt count.

## 7. State, data and voice

**Minimal session states:** `idle → offered → learning ↔ paused / asking → completed|dismissed → catchup_offered|idle`.

**Session record:** `sessionId`, `projectId`, `snapshotRevision`, `status`, `phases[]`, `activePhaseId`, `completedIds[]`, `skippedIds[]`, `alreadyKnowIds[]`, `lastEvaluatedRevision`, `questionHistory[]`.

**Local-first storage:** Small JSON or SQLite profile/session store. No accounts and no required cloud database. TigerData is an optional adapter after every integration gate passes; if included, store timestamped learning events and demonstrate a useful time-based query rather than simply persisting records.

**Voice:** ElevenLabs text-to-speech on phase or Q&A output; click-to-start/click-to-send microphone capture through the IDE; local whisper.cpp v1.9.5 with English base.en and FFmpeg for transcription. No cloud transcription, ordinary typed chat or paid transcription fallback. Audio failures retain usable text. No native voice calling, barge-in detection or streaming full-duplex voice in MVP.

**Privacy:** Never upload API keys, `.env`, secrets, credentials or whole repos. Bound text and excerpt sizes. Display when source is inferred versus observed. Avoid retaining unnecessary voice recordings.

## 8. Shared API contract (freeze before parallel development)

These are proposed endpoints; exact implementation language is up to the team. API calls return JSON, with stable IDs and errors. Rishit can mock every response in the UI before backend completion.

| Endpoint | Request (minimum) | Response (minimum) |
|---|---|---|
| `GET /health` | — | `{ "ok": true }` |
| `POST /api/offer` | `{ projectId, revision, handoff?, profile?, referenceLessonId? }` | `{ shouldOffer, previewTopics, offerId?, estimatedSeconds? }` |
| `POST /api/sessions` | `{ offerId, revision, handoff?, profile? }` | Full session state, including stable IDs, snapshot, roadmap and progress |
| `GET /api/sessions/:sessionId` | — | Saved session state; client restoration never autoplays |
| `POST /api/sessions/:sessionId/actions` | `{ actionId, action, phaseId? }` | Current session state; duplicate actions do not advance twice |
| `POST /api/teach` | `{ sessionId, phaseId, detail?, handoff?, profile? }` | `{ explanation, groundingStatus, contentId, audioUrl? }` |
| `POST /api/ask` | `{ sessionId, phaseId, question, handoff?, sources? }` | `{ kind: "answer"|"needs_sources", answer?, contentId?, supportedQuestions?, sourceQueries?, resumePhaseId }` |
| `POST /api/complete` | `{ sessionId, status, currentRevision, handoff?, learningState? }` | `{ recap, catchupOffer?, lastEvaluatedRevision }` |
| `POST /api/speech` | `{ sessionId, contentId }` | `{ audioId, audioUrl, mimeType: "audio/mpeg" }`; approved session content only |
| `GET /api/audio/:audioId` | — | Bounded generated MP3 bytes |

Stage 1 delivers text first, followed by an explicit speech request for lesson or answer content. The reference selector is `webapp-architecture`; it is a developer fixture, not a user-facing mode switch. Exact schemas, errors, limits, transitions and Theia audio transport requirements are in `docs/stage1-api.md` and `shared/contracts`.

**Code-specific Q&A handshake:** If `/api/ask` returns `needs_sources`, the IDE performs bounded local retrieval, then calls `/api/ask` again with `sources` (each excerpt includes actual path and line range). Gemini must avoid imaginary references. Do not let the backend assume it can directly read Rishit's local filesystem.

**Integration ownership:** Rishit owns client requests, file retrieval and presentation state; Akshar owns API behavior, deterministic reference responses in the first stage, Gemini outputs and real ElevenLabs voice API credentials from the beginning. Both own the contract file. API secrets stay server-side.

## 9. Hackathon build plan — voice experience first, intelligence next, live context later

### 9.1 Build philosophy and reference scenario

**Work backward from a complete two-minute product experience.** Goldie's interface and ElevenLabs speech should function *before* its lesson selection and explanations are generated by Gemini. Build a vertical slice with predetermined content, then replace one internal source of data at a time. The stable API and UI avoid integration rewrites.

**Reference scenario (updated by Akshar):** Teach the architecture of a typical web app through an illustrative Next.js team-management example. The three phases explain (1) frontend forms and UI state, (2) backend/API validation, permissions and business rules, and (3) database teams/memberships and the complete create-team request flow. These are logical responsibilities, not necessarily separate deployments. Authentication is a supporting concept rather than the entire lesson. The sample handoff is illustrative, not a claim that an application was generated or inspected. Keep the number of phases *variable in the API*, even though this scenario contains three.

**At the end of Stage 1, the product should feel complete:** a nonblocking opt-in popup, lesson path, *actual ElevenLabs spoken explanations*, pause/resume, skip/already-know, a working text-question interaction using prepared responses, and a recap. It is not yet adapting to arbitrary questions or live Codex activity. No user-facing badge or feature flag is needed to expose the internal content source. **Do not claim prerecorded/preconfigured lesson decisions were made live by Gemini** in the judged version.

Keep the reference content in one place (e.g. `backend/reference/lesson.json`) and behind the **same endpoints** used later. Never wire frontend controls directly to lesson constants. ElevenLabs must actually produce the speech from lesson text, not merely play an audio asset falsely described as an ElevenLabs integration.

**Parallel ownership:** Rishit owns `/ide` and the context/source adapter; Akshar owns `/backend` and its reference data, Gemini and ElevenLabs adapters. Both approve `/shared/contracts` together. Use one monorepo, small branches, and one merge into a runnable `main` after every gate.

**Checkpoint ritual:** Reserve 10–15 minutes at every stage to merge, test the same workflow together, test one negative case, and fix integration errors. Do not begin the next stage until the merged build works. Protect at least 2–3 hours for submission and demo preparation. Git is used for team collaboration, not as the routine lesson context source.

### 9.2 Stage-by-stage responsibilities and integration gates

| Stage / target time | Rishit — IDE, context, user interactions | Akshar — teaching backend, voice, state | **Merge and test together — exit gate** |
|---|---|---|---|
| **0. Connect the skeleton — 20–30 min** | Start the forked Eclipse Theia desktop IDE, display an empty Goldie panel, implement API client | Start backend, `/health`, stable request/response contracts, ElevenLabs credential smoke test | Goldie panel successfully calls backend; both run from merged `main`. Confirm real ElevenLabs credentials are valid without exposing the key. |
| **1. Complete prepared voice experience — 75–105 min** | Build popup, opt-in, 3-phase roadmap, lesson display, working audio play/pause/skip/already-know, typed Ask control, end/recap. Use API responses, not direct UI hardcoding. | Return a coherent preconfigured offer, three-phase roadmap, explanations, prepared Q&A responses and recap. Wire **real ElevenLabs text-to-speech** for lessons and responses. Maintain real session IDs and navigation. | Walk through **popup → Explain → hear ElevenLabs → pause → skip → typed prepared question → spoken answer → recap**. No Gemini/Codex runtime required yet. Every visible control in this reference flow works. **Merge now.** |
| **2. Replace lesson decisions with live Gemini — 60–90 min** | Send a sample `HANDOFF.md` + beginner/intermediate profile through the real API; show variable phase counts, loading/error states without UI rewrite | Replace prepared `/api/offer`, `/api/sessions`, `/api/teach` content with **real Gemini**: decide if teaching is worthwhile, select phases, determine conceptual depth, generate project-aware explanations. ElevenLabs still speaks the resulting text. | Edit the *sample handoff* or knowledge level (not source code) and see a meaningfully different **Gemini-generated** roadmap and spoken lesson. Cosmetic task should normally get no offer. **Merge.** |
| **3. Voice conversation and optional phase practice** | Click-to-start/click-to-send recording, Cancel, read-only transcript, exact original-clip resume; text Practice / Continue after covered phases | Contextual Gemini Q&A, local Whisper transcription, stable request IDs; cached 3–5 practice questions/model answers per covered phase | Speak an **unseen** question and follow-up, hear answers and explicitly resume the original clip. Verify recording cleanup, failures, text practice and immutable terminal progress. Native integration and joint merged-main walkthrough required. **Merge.** |
| **4. Connect real Codex handoff — 60–90 min** | Instruct Codex to create/update the cumulative `.goldie/HANDOFF.md` at prompt start and meaningful milestones; detect revisions; pass full current handoff to backend. Don't require Git change analysis. | Consume live handoff and revision as context; distinguish planned versus implemented details, evaluate opt-in offer from actual coding activity | Prompt Codex in the reference app. **Its actual updated handoff** produces a relevant popup → Gemini roadmap → real ElevenLabs explanation. No manual replacement of context. **Merge.** |
| **5. Answer implementation questions with evidence — 45–75 min** | Implement bounded local `searchWorkspace` / `readSource`; provide safe existing file excerpts only on request | Implement Gemini source-request handshake for “which files?” / “how does this connect in code?”; ground file claims in actual excerpts | Ask a conceptual question, then “Where is this implemented?” and get a reply using **real source file paths**, or a clear unverified answer if evidence is missing. **Merge.** |
| **6. Preserve lessons across multiple prompts — 60–75 min** | Keep active phase/roadmap stable while Codex receives 2+ new prompts; keep cumulative handoff up to date; show optional catch-up offer after current path ends | Snapshot lesson context revision; gather **all relevant changes since that snapshot**, dedupe covered concepts, plan next optional path without interrupting the active lesson | Begin a lesson, submit two Codex prompts, finish/dismiss it; current lesson never resets, and one follow-up offer reflects both prompts. **Merge.** |
| **7. Generalize and harden — 60–90 min** | Test a different repo and unseen tasks; verify variable roadmaps, consistent controls, missing handoff and offline/error behavior | Remove reference-scenario assumptions from live routing; test narrow, large-PRD, debugging and cosmetic prompts; validate ground truth/status handling | Run **three unseen task types** (trivial, narrow technical, large architecture) without modifying source or switching fixtures. **Merge and freeze features.** |
| **8. Final demo and submission — reserve 2–3 h** | Rehearse and record verified UI workflow, submission/video, Devpost UX; clean-run IDE startup | Verify live backend, provider use, handoff and source claims; complete technical README, credits and judges' Q&A | Two uninterrupted real end-to-end runs. Video ≤2 min; GitHub/README/Devpost completed before event deadlines. No feature expansion. |

### 9.2.1 Stage 3 — optional per-phase text practice

**Status: implementation in progress; native UI integration not verified.** Practice replaces the closing quiz. After coverage is recorded, offer **Practice / Continue** instead of immediately starting the next clip. Skipped and self-reported familiar phases bypass practice.

- Generate only on explicit Practice: one persisted batch of 3–5 unique questions and model answers from the accepted context and saved explanation. Default three; add more only for distinct objectives.
- Responses and reveal state remain client-local. **Show model answer** reveals cached text; no further AI call, grading, score, mastery claim or quiz audio. No student-response submission endpoint.
- GET retrieves a cached batch or null without generating. Only completedIds are eligible, including covered phases of closed/partial sessions. Final-phase completion still closes normally; practice never reopens or changes progress, recap or profile.
- Rishit owns recording, practice UI and playback. Akshar owns local transcription, generation, persistence, contracts and Node/RPC additions. Ordinary ask/speech still require an open accepted session.
- Recording is limited to 30 seconds and 2 MiB. At the limit stop capture and require Send or Cancel, never auto-submit. Cancel, navigation, focus loss and disposal stop tracks and discard unsent audio. Processing disables duplicate sends; cancellation ignores late results. Restoration starts no recording, generation or audio.
- Verify unseen voice questions, contextual follow-ups, exact clip resume, duplicate/lost responses, stale results, provider failures, local transcription limits/cleanup, practice eligibility/cache, and zero calls on answer reveal. Backend completion is separate from Rishit's native Theia gate and the joint merged-main walkthrough.

**Hackathon stopping point:** Target reliable Stage 4 coding → handoff → Gemini lesson → ElevenLabs. Stage 5 is needed only for source-grounded implementation claims; defer Stage 6+ otherwise. Protect the final 2–3-hour feature-freeze buffer, two uninterrupted demo runs and submission preparation. Deferred gates remain explicitly incomplete.

### 9.3 What each stage looks like to a user

- **After Stage 1:** The user can go through a **complete spoken, controllable Goldie lesson** for the prepared web-app architecture example. The *content and progression are prepared*; ElevenLabs is already real. No live Gemini decision-making or Codex integration is claimed yet. This is the first integrated product experience.
- **After Stage 2:** The same interface is now driven by **Gemini's real choices and explanations**, based on supplied engineering context. ElevenLabs reads dynamic Gemini content. The IDE UI is unchanged.
- **After Stage 3:** Click to record an unseen question, click to send, hear a contextual answer and explicitly resume the original clip. Optional per-covered-phase practice offers 3–5 text questions and revealable model answers, without grading or audio.
- **After Stage 4:** Engineering context comes from **live Codex-authored `HANDOFF.md`** updates, not a supplied example. This is the first genuine Codex → Gemini → ElevenLabs end-to-end Goldie workflow.
- **After Stage 5:** Questions about concrete implementation receive code-grounded answers through targeted, read-only source retrieval. Git remains optional for narrow debugging queries only.
- **After Stage 6:** The user can keep prompting Codex during a lesson. New work is accumulated for a later optional learning path rather than hijacking the current session.
- **After Stage 7:** Goldie generalizes beyond the first prepared web-app architecture scenario. No reference fixtures are used in the real judged execution path.

### 9.4 Why this order is lower risk

1. **Audio+UX first:** Voice playback, UI, skip and session transitions are independently testable before waiting on AI planning or IDE hooks. Because ElevenLabs is required for the intended sponsor track, validate it immediately.
2. **Gemini second:** Prove concept selection and adaptive explanations using a stable, known handoff before bringing in the variability of live Codex events.
3. **Codex fourth:** Prove the handoff once the teaching experience already works. When it breaks, you can distinguish a *context ingestion* bug from an *AI teaching* bug.
4. **Generalization last:** A working reference scenario is a foundation, not the finished competitive claim. Generalization and truthful, source-grounded behavior are necessary before promoting Goldie as a general IDE mentor.

### 9.5 Prioritized fallbacks if time slips

1. If the Theia build is difficult, reduce customizations and use the verified Electron development build; do not switch editors or spend hours modifying editor core.
2. If Stage 1 voice is unreliable, fix one real ElevenLabs spoken lesson first while keeping text controls functional. **Do not postpone all voice work until after Gemini.**
3. If Gemini planning is late, reduce personalized nuance and obtain one working *live Gemini-generated* roadmap/lesson from the sample handoff; do not present prepared answers as adaptive.
4. If microphone integration is late, report Stage 3 incomplete and fix the click-to-talk path; do not substitute ordinary typed chat without Akshar changing scope.
5. If Codex handoff automation is late, support explicit handoff updates at task milestones and verify that the handoff truly reflects the agent's work; do not claim file watching magically generates rationale.
6. If source retrieval is late, answer broad conceptual questions reliably and omit unverified code-specific file claims.
7. If multi-prompt catch-up is late, preserve the active lesson and keep the cumulative handoff; offer a manual catch-up action rather than fabricate automatic adaptation.
8. Cut TigerData, additional agents, polished architecture diagrams, elaborate analytics and nonessential domain styling first. Protect the final 2–3 hours.

### 9.6 Merge-and-test routine (mandatory after *every* stage)

1. Each person commits only the files they own; shared API schema changes require both to agree.
2. Merge both pieces into `main`, restart the app and backend from the merged checkout, and run the stated gate **together**.
3. Test one failure/edge case (e.g., decline offer, bad audio response, skipped phase, missing handoff, unavailable file).
4. Note internally which routes use prepared responses and which use real Gemini/ElevenLabs/Codex integrations; no user-facing developer badges or switches are necessary.
5. Before filming, verify all narrated claims run through real services and actual handoffs. Do not misrepresent prepared responses as adaptive AI.
6. Only then begin the next stage from the newest `main`.

**Submission constraints:** HackNC requires a Devpost draft and selected tracks by midnight Saturday, then final GitHub, detailed README and ≤2-minute video by 10:00 AM Sunday. Credit all AI and third-party tools. Follow event eligibility requirements.

## 10. Test cases / acceptance criteria

**Stage gates are cumulative**: finishing Stage 2 must not break the Stage 1 complete voice experience; connecting live Codex must not break Gemini teaching or audio. Prepared content is acceptable for *internal development gates*, not as evidence of adaptive intelligence in judging.

- [x] **Stage 0:** IDE panel talks to backend; ElevenLabs credentials pass a genuine connectivity test. Verified October 10, 2026; see `docs/goldie-panel.md` for the repeatable workflow.
- [ ] **Stage 1:** Prepared opt-in → roadmap → lesson → skip/already-know → typed prepared question → recap works, with **real ElevenLabs speech** at the lesson and answer steps. Native gate verified and merged in PR #2; the human together-run checkpoint (§9.6) remains open.
- [ ] **Stage 2:** With the same UI, Gemini (not a prepared file) chooses phases and generates spoken teaching; changes to handoff/profile change the output appropriately.
- [ ] **Stage 3:** Click/start, click/send and Cancel work in native Theia with local Whisper. Unseen questions and follow-ups receive Gemini/ElevenLabs answers, then explicitly resume the saved clip. Per-phase text practice passes §9.2.1; restart never autoplays or records. Backend and native/joint merged-main gates are tracked separately.
- [ ] **Stage 4:** Codex actually creates and updates the cumulative handoff during a coding task; that context drives a Gemini lesson and ElevenLabs speech.
- [ ] **Stage 5:** Implementation questions cite real locally retrieved paths and excerpts, or say implementation is unverified.
- [ ] **Stage 6:** Two new prompts during an active lesson do not interrupt it; catch-up afterward considers both prompts together.
- [ ] **Stage 7:** A styling task, a narrow engineering task and a large PRD in an unfamiliar project work without manual fixture swaps.
- [x] “Not now” dismisses the popup and never starts audio.
- [x] Pause/resume, skip, already know and end are all functional; an unplayed lesson is not marked mastered.
- [ ] The number and order of phases depend on the actual engineering scope and knowledge profile once Gemini is live.
- [ ] Large PRDs begin with architecture-first foundations; narrower tasks focus on current implementation; trivial tasks normally remain silent.
- [ ] Spoken teaching is conceptual, not a file-by-file status narration.
- [ ] User questions can zoom out to principles and zoom in to verified code without destroying phase progress.
- [ ] `HANDOFF.md` distinguishes planned, in-progress, implemented and superseded details; it preserves cumulative prompts and dependencies.
- [ ] No routine Git history / whole-repository dump is sent to Gemini; source files are retrieved only when necessary.
- [ ] Audio, Gemini and context failures degrade to safe text messages, not a crashed IDE.
- [ ] Secrets and irrelevant repository content are not sent to model APIs.
- [ ] README credits Codex, Gemini, ElevenLabs and open-source IDE dependencies and identifies hackathon-original code.
- [ ] Two truthful, real-service two-minute demos pass without manually swapping reference data.

**Stage 1 integrated local milestone — October 10, 2026:** Akshar's backend and
Rishit's native Theia lesson UI now agree on architecture content, session retrieval,
server progress/actions, content-ID speech and truthful recap. The full local native
journey passes with actual ElevenLabs lesson/answer MP3 playback, pause/resume,
Explain more, unsupported-question limits, skip/familiarity, restart restoration,
early end and backend/speech failures. Interrupted acceptance and safe RPC error
semantics have regression coverage and independent re-review. See `docs/goldie-stage1.md`
for evidence and the separate upstream packaged-test limitation, and `docs/stage1-api.md`
for contracts. This is the technical Stage 2 baseline; the shared Stage 1 checkbox
remains open only for the human together-run checkpoint in §9.6; delivery to main
completed in PR #2. That milestone did not implement or claim Gemini/live Codex.

**Stage 2 integrated local candidate — October 10, 2026:** Rishit's explicit
Markdown handoff/profile UI and Akshar's server-only Gemini teaching backend now
share one native Theia workflow. The approved primary is `gemini-3.5-flash-lite`.
Offer evaluation generates an adaptive, uncapped roadmap; acceptance freezes it
without another model call. Lazy standard/expanded explanations use content-ID
ElevenLabs speech. Conceptual/inferred teaching is not observed repository evidence.
Prepared general FAQ answers remain until Stage 3; there is no automatic fallback.
Akshar approved bounded deliberately supplied private context, never credentials,
`.env` or whole repositories. Definite acceptance rejections archive/release only
matching recovery and return an idle usable panel; unknown/network failures keep
the exact intent. Another window's active lesson is never automatically replaced.
See `docs/stage2-api.md` for the authoritative contract and
`docs/stage2-alignment-verification.md` for checks, provenance and limitations.
The local technical gate passed 211 cumulative checks and 16 native checks with
real beginner/intermediate Gemini roadmaps and ElevenLabs lessons, narrow/cosmetic
adaptation, exact-clip question/add-on resume and restart without autoplay. Larger
roadmap/failure scenarios use explicitly labeled controlled test data. Generated
text still needs semantic review; passing integration is not a factual guarantee.
The overall Stage 2 checkbox stays open for approved merged-main delivery and
Akshar/Rishit's joint checkpoint (§9.6), not merely passing mocked tests.

## 11. Final two-minute judging demonstration (all claimed functionality live)

| Time | Show | Claim proved |
|---|---|---|
| 0:00–0:15 | Codex developing a small SaaS; explain understanding gap | Real problem |
| 0:15–0:35 | Real prompt leads to `HANDOFF.md` update and optional lesson popup | Native workflow + opt-in |
| 0:35–1:00 | Click Explain; Gemini proposes phases; ElevenLabs explains architectural foundation | Context-aware teaching |
| 1:00–1:15 | Skip one familiar phase | Personal control |
| 1:15–1:35 | Ask “How is this connected in code?”; show a verified path | Grounding and interaction |
| 1:35–1:50 | Another Codex prompt updates handoff while lesson remains in place | Continuous workflow |
| 1:50–2:00 | End lesson; show catch-up offer / recap and finished product | End-to-end result |

**Demonstration discipline:** A prepared repository and reliably executable prompt are fine. Stage 1 has predetermined *lesson content* and real ElevenLabs voice; the final judged flow must additionally have authentic Codex handoff updates and Gemini-generated lessons for anything described as live/adaptive. Keep development fixtures out of the judged execution path and disclose AI/tool usage in the README. There is no need for a public-facing “demo mode” UI.

## 12. Definition of done

Goldie is **done for HackNC** when a developer can continue using Codex; receive (but not automatically play) a useful learning offer; opt into a variable-phase, architecture-first or implementation-first path as appropriate; hear Gemini/ElevenLabs explanations; ask a grounded question; skip a phase; and complete the lesson while intervening coding prompts remain in the cumulative handoff for a subsequent optional catch-up offer.

**Not necessary for “done”:** TigerData, Git-based continuous analysis, polished design system, long-term mastery analytics, native mobile app, published marketplace extension, full SaaS generated live during judging. Goldie must not depend on hardcoded reference-task outputs in the final claimed feature path.
