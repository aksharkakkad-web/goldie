# Goldie Stage 3 — Rishit's implementation spec

Updated from Rishit's supplied Akshar message. This replaces the earlier typed-Q&A/recap-check proposal. Approved to implement by Rishit's current request.

## Goal and ownership

Deliver click-to-record questions, contextual spoken answers, exact lesson resume and optional per-phase practice in the existing native Theia Goldie panel. Preserve the dark orb UI and all Stage 2 context/progress behavior. Rishit owns capture, presentation and playback. Akshar owns Whisper, Gemini, ElevenLabs, generation, shared contracts and Node/RPC integration.

## Observed integration state

Fetched `goldie/main`: `6e84904` (dark/orb design included). Its PRD still describes typed Q&A and an optional closing check. It has no voice/practice schemas or RPC methods. Rishit's directly supplied newer requirements take precedence. Do not invent routes or overwrite Akshar's backend work. Implement independent capture and local practice state now; wire requests only against his pushed, agreed contracts. The closing-session check is superseded by per-phase practice, not an additional feature.

## Recording and Q&A

1. Explicit Ask Goldie click pauses the active audio synchronously, retains the lesson element/URL/currentTime, and saves server pause before starting microphone capture. Also permit another question from the answer view.
2. States: idle → permission → recording → stopping → ready → submitting → answer. Permission denial, no device or unsupported capture shows a safe message and leaves the lesson paused.
3. Capture audio only with `getUserMedia`, use supported WebM/Opus MediaRecorder, no continuous recording. Keep the Blob only in memory. No file upload, transcription or provider call occurs without Send.
4. Send stops the recorder, awaits its final data event and releases all tracks before submitting. Repeated clicks submit once. At 30 seconds stop and retain the clip, awaiting Send or Cancel. No autosubmit.
5. Cancel discards the clip; panel hide/disposal, page navigation, document hidden or window blur cancels permission/recording, stops tracks, invalidates late callbacks and discards the clip. A late permission result must also have its tracks stopped. Never start recording or playing on restoration.
6. Display the returned transcript read-only and the generated answer as text. Ordinary questions have no typed composer. Use the backend's content ID for ElevenLabs speech; never send arbitrary text to speech.
7. Keep separate lesson/answer tracks. Answer end never advances a phase. Resume is an explicit action that selects and plays the original clip at the retained timestamp without fetching or regenerating it. Another question retains the original lesson position.
8. Failed transcription/answer requests preserve the session and original clip. Safe manual retry uses the contract's stable request ID if supported; no automatic provider retries. Failed answer speech retains text and retries speech only. End invalidates pending work and stops all media.

## Per-phase practice

After an actually covered phase, stop progression and offer Practice / Continue. Skipped/familiar phases do not qualify. Practice is optional and must not block lesson completion.

Practice receives 3–5 text question/model-answer pairs about that phase from Akshar's contract. Show one at a time with a typed response retained only in memory, and explicit Show model answer. No response transmission, grading, scores, claims of mastery or practice audio. Previous/Next and exit/Continue preserve responses for this phase while the panel remains open. Never generate practice on restoration or merely entering a recap. Continue advances once using the existing action ID discipline. For the last phase, Continue closes the lesson after the optional practice opportunity. Do not call ordinary Ask or Speech after a terminal session.

## Files and execution sequence

- Capture: new `theia-extensions/product/src/browser/goldie/goldie-recorder.ts`, focused `test/goldie-recorder.test.cjs`. Test delayed permission/cancel, final chunk ordering, double clicks, 30-second stop, runtime errors, byte limits, disposal and lifecycle cleanup.
- Pause/resume: `goldie-lesson-controller.ts`, `test/goldie-lesson.test.cjs`; add a capture preparation entry point retaining both audio tracks. Verify an original clip at 17.25 seconds survives question and explicit resume.
- Practice state: new `goldie-practice.ts`, `test/goldie-practice.test.cjs`; validate 3–5 nonempty bounded pairs, store typed responses locally, reveal only on explicit action. Map Akshar's response to this view model at integration.
- UI: `goldie-widget.tsx`, `goldie-lesson.css`, widget rendering tests. Preserve orb styling. Clear explicit recording/ready/error states, Send/Cancel, read-only transcript and explicit Resume. Use existing Theia controls; UIArc is unavailable in this session.
- Contracts: fetch again after Akshar pushes; inspect exact schemas and service methods before wiring. Do not modify his backend, provider, shared contract or Node/RPC implementations in parallel.
- Integration: consume the agreed methods, test error/late-result ordering, phase-boundary practice and exact original audio resume; update this document with actual contract names.

## Verification and evidence

Use pinned Node 24.21.0 and Yarn Classic. Run focused Node tests, product build/lint, then native Electron watch/reload. Tests must exercise production classes with controlled hardware/provider adapters, not copies of implementation. Include regression tests that fail without the new behavior.

Capture and inspect native screenshots of recording controls and practice. If a recording tool is available, record the interaction. Controlled tests prove state/cleanup logic; screenshots prove rendering only. They do not prove real microphone audio, Whisper, Gemini or ElevenLabs. Require a real spoken unseen question → read-only transcript → contextual answer text/speech → explicit exact resume for final Stage 3 signoff. Ask Rishit to speak the test question if automation cannot supply real microphone audio. Record one failure/cancel path as well. Do not call Stage 3 complete until both tracks pass that gate.

## Current checklist

- [x] Fetch main and inspect existing code/contracts; preserve existing orb work.
- [x] Rewrite spec for latest voice-only questions and per-phase practice.
- [x] Implement/test independent capture, local practice state and practice React component.
- [ ] Receive Akshar's pushed PRD/contracts and wire voice/practice requests.
- [x] Product build/lint, 76 focused checks and inspected native screenshots. Native screen recording is not available through the current capture tool.
- [ ] Joint real-service microphone/answer/exact-resume verification.

Rishit subsequently authorized merging this partial frontend checkpoint to main. Backend integration and final Stage 3 acceptance remain pending. Deployment and background automation are outside this delivery.

## References

Implementation follows the documented final-data-before-stop-event flow of [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) and permission/track lifecycle of [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia). Existing source remains MIT; no external source is copied.

## Implementation checkpoint

Native setup now includes an explicitly labelled local microphone check with recording, stop, preview and discard. It makes no backend upload. The old prepared typed-question flow remains intact until agreed voice endpoints permit an atomic replacement; voice-only Q&A is not yet shipped. Practice state/component exist and are tested but are not mounted into lesson progression yet: they need Akshar's question contract and the phase-boundary integration. These are incomplete integration tasks, not completed Stage 3 features.

See `docs/stage3-proof/VERIFICATION.md` for fresh evidence and remaining acceptance work.
