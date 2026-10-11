# Goldie interactive web demo design

Status: design accepted in conversation; written specification awaiting review.

## Intent and approved scope

Give a judge or Discord visitor a hands-on explanation of Goldie without installing
the desktop IDE. The website resembles the actual Goldie Theia desktop and lets
visitors follow one prepared coding scenario, opt into learning, hear explanations,
ask questions and optionally practise what they covered.

Akshar approved a hybrid: a fixed coding replay with real Goldie teaching and
conversation. He also approved matching the desktop's newer practice direction:
optional practice after covered phases and a final review of those same questions.
There is no graded closing quiz, score or mastery claim.

The current task is local development only. Public hosting, push/merge, additional
paid services and deployment architecture require separate approval. No subagents
are used in this side conversation, and ongoing desktop/backend work is not edited.

## Source of truth and implementation boundaries

- Visual reference: merged commit `6e84904656e08173746a78aaa032633a6a2bdcf3`,
  especially `goldie-midnight-theme.ts`, `goldie-widget.tsx`,
  `goldie-lesson.css`, `gradient-orb.tsx`, and the approved desktop screenshot.
- Product baseline: `docs/Goldie_HackNC_PRD.md` and shared contracts.
- Stage 3 direction approved in the main thread: click-to-record questions, explicit
  resume and per-covered-phase text practice. At design time its implementation is
  in progress in a different worktree, not verified merged-main behavior. Do not
  present that work as shipped or copy unfinished backend code into the demo.
- Use the existing team-management handoff as conceptual context. It explicitly
  makes no claim that its source implementation was inspected. Create matching
  synthetic demo files and identify them as sample code, not verified desktop
  workspace evidence.

Develop on `codex/web-demo` in the separate website worktree. Before implementation,
bring that clean checkout to the reviewed merged visual baseline without modifying
the original checkout or the main agent's worktree. Keep new application code under
`applications/web-demo/`; do not repurpose `applications/browser/`, change Theia
framework behavior or alter desktop UI. Reuse existing toolchain and dependencies
where suitable; keep Node 24.21.0, Yarn Classic 1.22.22 and the existing lockfile.

## Chosen approach

A lightweight IDE-shaped web application, not a hosted full Theia instance and not
a screenshot with clickable hotspots. Separate the deterministic coding replay,
learning state, backend transport, audio/microphone lifecycle and presentation.
Reuse Goldie assets and pure orb/audio utilities where practical, preserving their
license notices; do not import Electron or Theia RPC services into the website.

The alternatives are a fully scripted tour (reliable but unable to answer unseen
questions) and hosting the full IDE (more operational complexity than this demo
needs). The selected hybrid preserves a reliable narrative and genuine mentoring.

## Visual design

Desktop layout follows the screenshot: narrow activity rail, file explorer, editor
tabs and code area, terminal below the editor, Goldie dock on the right, and a
status bar. Use the merged near-black palette, quiet borders, monospace source
text, actual branding and reactive purple orb. Keep the orb prominent rather
than adding an unrelated marketing layout.

The functional website need not implement every IDE command. Non-functional shell
icons must not masquerade as working tools. Source files and tabs can be browsed;
the terminal is a read-only replay, not a shell, and code is read-only sample code.

Retain the compact orb and its player controls. Improve discoverability without
changing lesson semantics: show a concise offer with accept/decline, current phase
and progress, and an obvious route to text/details. Recap and practice appear when
relevant rather than being available only through a settings gear.

On narrower screens preserve a usable mentor panel and selectable code view;
collapse the explorer/terminal before shrinking controls or text to unreadability.
Respect reduced motion and provide a static orb fallback when WebGL is unavailable.

## Visitor journey

1. Open the demo into the prepared team-management project. A short note identifies
   the coding activity as a prepared replay; no fake live-agent thinking indicator.
2. Explicitly start the fixed prompt. Reveal a deterministic sequence of sample
   files, terminal output and a bounded handoff about frontend, API validation and
   database transactions. Replay controls never execute commands or modify files.
3. Offer an optional lesson. Decline leaves code browsing usable and causes no
   speech, microphone recording or accepted lesson session.
4. Accept to create a real backend learning session using the selected knowledge
   level and fixed handoff. The roadmap can contain a variable number of phases;
   the replay does not impose a three-phase API limit.
5. Hear phase explanations using Gemini and ElevenLabs through the backend. Support
   pause/play, skip, self-reported familiarity, readable text and early end.
6. Ask Goldie pauses the original clip and starts microphone capture only on that
   explicit click. Send stops capture and submits; Cancel stops and discards.
   Local transcription, contextual Gemini answers and ElevenLabs playback use the
   verified Stage 3 backend contract when available. Resume is explicit and returns
   to the original phase and clip position.
7. After a covered phase offer Practice or Continue. Skip and already-known bypass
   practice. Continue does not generate questions. Practice retrieves a cached batch
   or explicitly requests one batch of three to five text questions/model answers.
   Responses and reveal state stay client-local. Revealing an answer costs no new
   model call, plays no speech and assigns no grade.
8. At completion or early end show covered, skipped and self-reported familiar
   topics. Offer a final review of existing practice batches from covered phases;
   do not generate a separate final quiz or reopen a closed session. With no cached
   practice show the recap without an empty review action.
9. Reset explicitly stops playback/recording, discards unsent audio, ends any open
   owned session through existing semantics and clears demo-local state. It does
   not wipe server storage or change the desktop's session.

## Transport and backend integration

Use a web-specific transport adapter against existing validated shared contracts.
Start local-only, using the backend's already configurable allowed browser origin;
never weaken origin checks to a wildcard or expose provider keys in client code.
Do not edit the user's existing environment file merely to get a browser working.
If a separate backend process is needed, give it an isolated data directory/port
and explicit task-scoped configuration, without stopping the desktop's process.

Model scenario replay state separately from accepted learning state. Freeze accepted
context for a lesson; replay/reset or later coding activity cannot replace an active
lesson's context. Browsing code never sends repository content to a provider.

Build the shell and journey against deterministic test adapters first. A local
test adapter is not an undisclosed fallback for a failed live provider. The visitor
experience must surface an unavailable integration with manual retry or exit, not
silently substitute scripted answers. Release readiness for live questions and
practice depends on the main-thread Stage 3 contracts and backend being verified;
until then label the implementation status honestly in development documentation.

Public multi-visitor use is out of scope for the first local version: the local
backend is not assumed to provide hosted-session isolation, abuse controls or cost
budgets. A future hosting plan must resolve those before exposing paid endpoints.

## Privacy and failure behavior

- No lesson audio, microphone capture or paid request on page load, restoration,
  answer reveal or simply opening the final review.
- Microphone denial/unavailability leaves lesson playback and text usable. Do not
  silently add the typed-question fallback rejected by the newer product direction.
- Enforce the Stage 3 capture limit of 30 seconds and 2 MiB; at the limit stop and
  require Send or Cancel, never auto-submit. Navigation, focus loss, cancel and
  disposal stop tracks and discard unsent recordings.
- Disable duplicate submission while processing and ignore stale results after
  cancellation, navigation or reset. Restore never starts recording or playback.
- Provider, transcription and audio failures display safe actionable errors; keep
  recap/exit usable and offer only explicit retries. Never claim an unseen question
  was answered live when only prepared content was available.
- Never upload credentials, `.env`, whole repositories or unrelated user files.
  Use only the fixed handoff and the agreed bounded question context. Do not claim
  source-grounded file answers without an actual approved evidence mechanism.
- Clear timers, audio URLs, analyser/WebGL resources and microphone tracks on
  teardown; pause/exit returns the orb's measured speaking level to zero.

## Implementation deliverables and order

1. Local web application and faithful responsive shell, including assets/tokens and
   an independently testable synthetic project/replay model.
2. Opt-in lesson controller and backend adapter, with real session lifecycle,
   variable phases, player controls, text/details and failure states.
3. Stage 3 voice question integration and exact-position resume once its backend
   contract is verified, with microphone cleanup and stale-result tests.
4. Per-phase practice plus final cached review, with eligibility and zero-call
   reveal checks; no grading or student-answer submission API.
5. Full browser verification and documentation of start commands, fixed-vs-live
   behavior, prerequisites, remaining limits and any unverified integration.

No delivery step may report the whole demo complete if live integration is still
unavailable. The shell can be delivered as an explicitly partial milestone.

## Acceptance criteria

- At desktop size the layout/palette/orb clearly match the merged Goldie IDE, with
  source comparison and browser screenshots at desktop, intermediate and mobile
  widths. Keyboard focus, accessible names and reduced motion are checked.
- One uninterrupted run completes replay -> optional offer -> real spoken lesson
  -> pause -> skip/familiarity -> unseen spoken question -> exact resume -> practice
  -> recap -> final cached review. Record which integrations were genuinely live.
- No calls on decline, practice Continue, cached answer reveal, final review,
  restoration or page load. No surprise audio or recording.
- Tests cover variable-phase navigation, duplicate clicks, cancellation/late result,
  provider offline/errors, audio failure, microphone denial/limits, partial recap,
  skipped-topic exclusion, empty practice and repeat/reset teardown.
- Browser console/network inspection finds no leaked credentials, whole-repo
  transmission, unexpected paid retries or uncaught errors in supported flows.
- Existing desktop files and active main-thread work remain untouched. Targeted
  checks, limitations and documentation accompany delivery; no push or deployment.
