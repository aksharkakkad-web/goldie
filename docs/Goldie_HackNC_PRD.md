# Goldie — HackNC 2026 Product & Staged Build PRD

**Status:** Build-ready specification, designed for staged integration  
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
9. **Push-to-talk, not full-duplex speech.** Press/hold or toggle microphone → transcribe → Gemini answer → ElevenLabs response → return to lesson. Text question is a fallback.
10. **Learning is not automatically mastery.** Skip and “already know this” are distinct. The latter records claimed familiarity; an optional applied question can provide stronger evidence.
11. **Stable experience, progressively real integrations.** First make one representative end-to-end flow work with contract fixtures, then progressively connect live Gemini, ElevenLabs, Codex handoff, source retrieval, and cross-prompt continuity. The user-facing interface is identical across stages. No fake “AI is thinking” status, “demo mode” switch, or debug fixture badge appears in the UI. Development/test fixtures must remain distinguishable internally; do not claim simulated output is produced live in judging or the Devpost submission.
12. **Scope generalizes only after the core flow is real.** Start with a single prepared, representative web-app task and predictable example responses. Once the complete experience works with real providers, test different prompt sizes, changing plans, and an unrelated project; remove hardcoded assumptions that prevent adaptation. Do not build arbitrary-repo parsing at the expense of the first working flow.

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
- Speaking pauses. User invokes push-to-talk (or types).
- Gemini answers according to intent: zoom out into theory, explain the architectural choice, or request on-demand code evidence and reference real local paths.
- A concise answer is spoken via ElevenLabs. **Resume lesson** returns to the current phase, without losing position.

### 4.6 Session completion
- After all selected phases, or when user ends: short recap of covered, skipped and self-reported familiar concepts; optional one applied reasoning question.
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

**Voice:** ElevenLabs text-to-speech on phase or Q&A output; microphone capture through the IDE for push-to-talk; transcription through an available speech-to-text endpoint. Type-to-ask fallback is required. Audio failures should display text rather than block learning. No native voice calling, barge-in detection or streaming full-duplex voice in MVP.

**Privacy:** Never upload API keys, `.env`, secrets, credentials or whole repos. Bound text and excerpt sizes. Display when source is inferred versus observed. Avoid retaining unnecessary voice recordings.

## 8. Shared API contract (freeze before parallel development)

These are proposed endpoints; exact implementation language is up to the team. API calls return JSON, with stable IDs and errors. Rishit can mock every response in the UI before backend completion.

| Endpoint | Request (minimum) | Response (minimum) |
|---|---|---|
| `GET /health` | — | `{ "ok": true }` |
| `POST /api/offer` | `{ projectId, revision, handoff, profile }` | `{ shouldOffer, previewTopics, offerId? }` |
| `POST /api/sessions` | `{ offerId, revision, handoff, profile }` | `{ sessionId, snapshotRevision, phases[] }` |
| `POST /api/teach` | `{ sessionId, phaseId, handoff, profile }` | `{ explanation, groundingStatus, audioUrl? }` |
| `POST /api/ask` | `{ sessionId, phaseId, question, handoff, sources? }` | `{ kind: "answer"|"needs_sources", answer?, sourceQueries?, resumePhaseId }` |
| `POST /api/complete` | `{ sessionId, status, currentRevision, handoff, learningState }` | `{ recap, catchupOffer?, lastEvaluatedRevision }` |
| `POST /api/speech` | `{ text }` or audio transcription request | Spoken audio or transcript, with explicit MIME type |

**Code-specific Q&A handshake:** If `/api/ask` returns `needs_sources`, the IDE performs bounded local retrieval, then calls `/api/ask` again with `sources` (each excerpt includes actual path and line range). Gemini must avoid imaginary references. Do not let the backend assume it can directly read Rishit's local filesystem.

**Integration ownership:** Rishit owns client requests, file retrieval and presentation state; Akshar owns API behavior, Gemini outputs and voice API credentials. Both own the contract file. API secrets stay server-side.

## 9. Hackathon build plan — staged experience first, generalization last

### 9.1 Operating principles

This is **one product assembled in thin vertical slices**, not two independent subsystems merged at the end. In early phases, use a single prepared reference project and contract-compatible fixtures to exercise the full UX. Keep fixtures internal to development; the released UI never displays developer-only labels or modes. Replace each fixture with real behavior behind the same API. Be accurate about which features are live when recording or talking to judges.

- **Reference scenario (first):** A small Next.js team-management app. The current Codex task is to implement authentication and access-protected workspace routes. This scenario offers recognizable engineering concepts, specific example file paths, and a fast, understandable two-minute presentation. Those paths are *examples only* until actually present in the workspace.
- **Contract first:** Freeze request/response shapes in `/shared/contracts` before parallel work. Create valid JSON fixtures for one `offer`, one three-phase `session`, one `teach` response, one `ask` response, and one `complete` response. The same client code must work whether the response comes from a fixture or a live service.
- **No forked architecture:** Rishit owns `/ide` and the context adapter. Akshar owns `/backend` and AI/voice adapters. Both own `/shared/contracts` and the reference test scenario.
- **Integration rule:** End each stage with a 10–15 minute shared test *on `main`*. Make small commits/PRs, integrate, then branch from the latest `main`. If the checkpoint fails, fix that checkpoint before building new features.
- **Keep the interface honest:** No user-facing stub banners, feature flags, or “demo mode” pages. At the same time, fixture responses are never passed off as live AI or live Codex behavior in judged demonstrations. Review the exact live path before recording.
- **No routine Git analysis:** Git is for team source control. The cumulative `.goldie/HANDOFF.md` is Gemini's primary engineering context. Local workspace search/source retrieval (optionally Git for a narrow question) is invoked only as needed.

### 9.2 Owner map

| Rishit — IDE, context, interaction | Akshar — intelligence, voice, lesson state |
|---|---|
| Run code-server or VS Code fallback, install/show Goldie panel | Backend application, health, typed API contracts and validation |
| Nonblocking opt-in popup, roadmap, phase player, skip / already know / end | Lesson offer evaluator, dynamic roadmap planner, concept selection |
| Codex instruction/integration and cumulative `.goldie/HANDOFF.md` | Gemini conceptual lesson generation, adaptation, Q&A |
| Handoff watcher, prompt/milestone update delivery, local source retrieval | ElevenLabs TTS/STT, source-evidence request handshake |
| Microphone, playback UI, typed question fallback | Session snapshots, deduped catch-up learning, local memory |
| User-facing state, status clarity, demo UX | Guardrails for planned versus implemented assertions, service fallbacks |

**Rishit owns the handoff document and targeted local code retrieval. Akshar must not build a second repository reader in the backend.** Backend sends source queries; Rishit's workspace adapter returns bounded excerpts with real paths and line ranges. The backend remains usable with contract fixtures before the IDE integration exists.

### 9.3 Progressive stages and merge checkpoints

**Time estimates are target blocks from your start time, not deadlines to keep pushing if something breaks.** Plan around the real submission cutoffs; protect the final 2–3 hours.

| Stage (target) | Rishit delivers | Akshar delivers | Merge gate: both verify on `main` |
|---|---|---|---|
| **0 — Skeleton + shared contract (20–30 min)** | Launch IDE, mount Goldie panel, wire fetch client and display server connection | Start backend, `GET /health`, CORS, typed response schemas | Panel connects to backend; fixture JSON parses and renders. Commit, merge, run together. |
| **1 — Complete reference experience with fixtures (50–75 min)** | Build polished-enough popup → accept → phase roadmap → lesson text/audio-player shell → skip/already know → typed ask → recap. No dead buttons. | Implement all defined routes with coherent reference-scenario fixture responses; consistent IDs/status and session state so transitions actually work | Click through entire Goldie experience for the *one reference task* with no manual payload edits. Every control works. Merge **now**, before model integrations. |
| **2 — Real Gemini planning + teaching (60–75 min)** | Keep same UI, feed handoff reference fixture through normal API client, handle loading/error states | Swap offer, plan, and teach routes to real Gemini; validate structured JSON; personalize from a simple onboarding level | For reference task, Gemini chooses coherent architecture phases and writes one project-aware lesson. A changed knowledge level changes explanation depth. No manual text swapping. Merge. |
| **3 — Real ElevenLabs speech (45–60 min)** | Implement functional play/pause/skip and text fallback in actual panel | Replace audio fixture with live ElevenLabs TTS; return playable media; handle timeouts | Gemini explanation is converted into audible ElevenLabs speech inside IDE; skip stops current playback and advances. Merge. |
| **4 — Real Codex → cumulative handoff (60–90 min)** | Set up task-start/update process that creates and maintains `.goldie/HANDOFF.md`; watch revision changes; update UI context without starting lessons automatically | Consume changing handoff revision, re-evaluate offers/plans for idle state; preserve planned/in-progress/implemented distinctions | Prompt Codex in the reference repo; handoff changes *from a real coding workflow*; offer appears; user opts in; Gemini+ElevenLabs teach from that handoff. Merge. |
| **5 — Interactive depth + code evidence (60–90 min)** | Typed ask first; then push-to-talk capture if ready; targeted `searchWorkspace` / `readSource` implementation | Real Gemini follow-up answers, zoom out/architecture/zoom in behavior, source-request handshake; STT if ready | Ask “why this architecture?” then “which file implements it?”; second answer cites an actual file or states evidence is unavailable. Audio responds if voice path ready. Merge. |
| **6 — Multiple prompts, one lesson (60–75 min)** | Keep active roadmap stable while Codex receives 2+ new prompts; accumulate handoff revisions; show catch-up offer only after session end/dismissal | Snapshot lesson revision; evaluate *all changes since snapshot*; avoid duplicate concepts; return new optional roadmap | Start a lesson, give Codex two extra requests, finish/dismiss lesson, then receive a **single** optional catch-up path covering material changes. The old lesson does not reset. Merge. |
| **7 — Generalize and harden (60–90 min)** | Test unseen prompts/another small repo, variable number of phases, cosmetic no-offer behavior, state resets and UI failures | Test live Gemini against narrow, large-PRD and troubleshooting tasks; remove scenario-specific prompting and fixtures from released execution; add guards for missing handoff and old plans | Pass at least three task classes (trivial, narrow technical, large architecture) **without editing source or swapping fixtures**. Repeated questions and failures degrade gracefully. Merge and freeze. |
| **8 — Demo, verification & submit (reserved ≥2–3 h)** | Lead live walkthrough, capture actual product behavior, test clean install, prepare video/Devpost UX | Lead backend verification, check grounded claims, finish technical README/AI disclosures, prepare Q&A | Two consecutive authentic end-to-end demo runs; final video ≤2 minutes; README/repo/Devpost complete before deadline. **No feature expansion.** |

### 9.4 What “staged” means in practice

**At the end of Stage 1**, Goldie already looks and behaves like the finished user experience for the reference scenario. Clicking Explain leads to a roadmap, teaches a phase in text, permits skips and questions, and displays a recap. Responses are contract fixtures behind the API, not a production intelligence engine. This is an internal integration baseline, not something to advertise as live AI.

**At the end of Stage 3**, the same experience is driven by **real Gemini planning, real Gemini teaching, and real ElevenLabs audio** using known handoff context. The IDE, lesson player, and API shapes are unchanged.

**At the end of Stage 4**, the context originates from **real Codex activity**, rather than a supplied example. This is the first full proof of the essential product promise: a coding task produces an optional lesson grounded in the active project.

**At the end of Stage 6**, Goldie supports an evolving project and multiple prompts without competing lessons. **Stage 7** proves that the system generalizes to unfamiliar prompt sizes and contents instead of only the prepared example.

### 9.5 If checkpoints fail: cut features in this order

1. **Code-server consumes Stage 0:** Use ordinary VS Code with a Goldie extension/webview, or a small IDE-adjacent panel, preserving the same contracts. Don't modify the editor engine.
2. **Gemini is late:** Keep the reference UX baseline, but prioritize making one real `/api/plan` and `/api/teach` pipeline function. Cut dynamic onboarding sophistication.
3. **ElevenLabs takes too long:** Use text-based teaching temporarily while fixing voice; never claim ElevenLabs audio is live if it isn't. Prioritize one actual spoken lesson over a premium player.
4. **Codex handoff automation is unreliable:** Begin with reliable explicit handoff updates at task start/completion; refine watcher automation. Verify document revisions actually come from the coding workflow before presenting them as such.
5. **Voice question input is late:** Typed Q&A first. Push-to-talk remains a stretch, not a reason to miss an otherwise convincing demo.
6. **Catch-up or generalization is late:** Keep one real, excellent Codex → Gemini → ElevenLabs flow. Show only features actually working; don't present fixed responses as adaptive intelligence.
7. **Optional tracks:** TigerData, extra IDE styling, rich analytics, extra coding agents and .Tech flourish are last; Photon and Community remain out of scope.

### 9.6 Shared checkpoint ritual (every stage)

- Rishit and Akshar run the **same scenario together** against merged `main`.
- Verify API request/response against frozen contracts, successful UI state, and no console/server exceptions.
- Test one simple negative case (declined popup, failed API, skipped phase, missing source, or stale revision depending on stage).
- Confirm no secret-bearing files or unrelated repository content were sent to the model.
- Record a quick commit/tag or changelog note saying what is **actually working** and what is still incomplete; internal notes do not need to appear in the user-facing panel.
- Only then branch to the next stage.

**Submission constraints:** HackNC requires a Devpost draft with tracks selected by midnight Saturday and final GitHub, README, and ≤2-minute video submitted before 10:00 AM Sunday. Credit all AI and third-party tools and distinguish tested functionality from planned functionality. Follow organizer eligibility requirements.

## 10. Test cases / acceptance criteria

**Progressive release criteria:** Stages 0–1 validate UI/API behavior using internal contract fixtures; Stages 2–6 replace those fixtures with real providers and real Codex context; Stage 7 tests unknown tasks without changing the running implementation. Every publicly claimed live capability needs a passing real-integration check.

- [ ] Stage 1: The entire opt-in → roadmap → lesson → skip → ask → recap interface works through ordinary endpoints for the reference scenario, with no broken controls.
- [ ] Stage 2: Changing the context and knowledge profile produces meaningfully different **real Gemini** outputs.
- [ ] Stage 3: ElevenLabs actually generates and plays an explanation returned by Gemini; errors fall back to text.
- [ ] Stage 4: The Codex-driven handoff revision can be observed changing from a real coding task, not only from a manually prepared example.
- [ ] Stage 7: Another repository or unseen PRD generates a sensible learning path without scenario-specific manual edits.
- [ ] Launch the IDE and Goldie panel with the backend connected.
- [ ] Prompt Codex twice; the **same** handoff retains both requests, dependencies, current architecture and a monotonically increased revision.
- [ ] Styling-only prompt yields no unsolicited audio and normally no offer.
- [ ] Meaningful prompt triggers a single dismissible popup; declining it does not affect Codex.
- [ ] Large PRD produces a foundation-first variable-length roadmap; narrow prompt produces targeted phases.
- [ ] Gemini lessons are conceptual and project-specific, not a tool/file-change narration.
- [ ] ElevenLabs speech plays on opt-in; pause, skip and already-know behave correctly.
- [ ] Push-to-talk works or typed fallback works; user's question does not destroy lesson progress.
- [ ] “Which file implements X?” is answered from local evidence with real file paths (or explicitly says unverified).
- [ ] Two new Codex prompts during a lesson do not create a competing lesson/popup or reset current progress.
- [ ] After dismissing/finishing, the catch-up offer considers **all** accumulated changes since the lesson's initial snapshot, avoids re-teaching unchanged concepts, and does not auto-play.
- [ ] TTS/Gemini failure yields a readable text error or fallback instead of crashing the IDE.
- [ ] No secrets or unrelated repository content are sent in model context.
- [ ] README credits all AI tools/APIs/frameworks and identifies the new code written during HackNC.
- [ ] Real two-minute demo runs twice consecutively without manual data manipulation.

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

**Demonstration discipline:** A prepared repository and reliably executable prompt are fine; they are not the same thing as fabricated system behavior. Record and present authentic Codex handoff updates, Gemini lessons and ElevenLabs audio for anything described as live. Keep test fixtures internal to development, remove them from the judged execution path, and disclose AI/tool usage in the README. There is no need for a public-facing “demo mode” UI.

## 12. Definition of done

Goldie is **done for HackNC** when a developer can continue using Codex; receive (but not automatically play) a useful learning offer; opt into a variable-phase, architecture-first or implementation-first path as appropriate; hear Gemini/ElevenLabs explanations; ask a grounded question; skip a phase; and complete the lesson while intervening coding prompts remain in the cumulative handoff for a subsequent optional catch-up offer.

**Not necessary for “done”:** TigerData, Git-based continuous analysis, polished design system, long-term mastery analytics, native mobile app, published marketplace extension, full SaaS generated live during judging. Goldie must not depend on hardcoded reference-task outputs in the final claimed feature path.
