# Rishit's Stage 1 — IDE lesson flow

Implemented on `codex/rishit-stage-1`, based on Akshar's merged Stage 0 (`fe45be6`).

The right panel accepts backend offers, starts real session IDs, displays a variable roadmap and phase explanations, plays binary speech, supports pause/resume, skip, self-reported familiarity, typed questions, and a backend recap. Questions retain the original lesson audio element and playback position. Only completed playback is recorded as heard; skipped, familiar, and pending stay distinct. Closing releases audio and ignores late responses. Failed requests can be retried; speech failure leaves text usable.

## Backend integration handoff

Akshar owns prepared responses and ElevenLabs generation. The IDE uses the existing `@goldie/contracts` payloads with these local POST routes:

| Route | Contract |
| --- | --- |
| `/api/offer` | OfferRequest → OfferResponse |
| `/api/sessions` | SessionRequest → SessionResponse |
| `/api/teach` | TeachRequest → TeachResponse |
| `/api/ask` | AskRequest → AskResponse |
| `/api/complete` | CompleteRequest → CompleteResponse |
| `/api/speech` | SpeechRequest → raw audio bytes with explicit audio Content-Type |

JSON responses need `application/json`. Speech supports MP3, WAV, Ogg, MP4, or WebM. The IDE requests speech separately for explanation/answer text; optional teach audioUrl is not fetched. Requests have bounded sizes and deadlines and do not follow redirects. Provider keys stay in the backend.

The current context is explicitly the prepared Next.js authentication example, project `goldie-reference`, revision 1, beginner profile. It does not inspect the user's workspace or claim a live Codex handoff. Source retrieval and microphone input are later stages.

## Run and iterate

Use the Node/Yarn PATH in `DEV_SETUP.md`. Keep `yarn backend:start`, `yarn electron watch`, and `yarn electron start .` running in separate terminals. On this Mac those processes use tmux session `goldie`. After TypeScript and browser bundling report zero errors, try Cmd-R in Electron. This Mac can stall during upstream plugin startup after reload: quit Electron and run the start command again while watch continues. Restarting was verified to load the new panel code. Backend service/binding changes require quitting/restarting Electron. Do not reinstall dependencies for routine panel edits.

Main files:
- `theia-extensions/product/src/browser/goldie/goldie-widget.tsx`: controls and views.
- `theia-extensions/product/src/browser/goldie/goldie-lesson.css`: native theme styling; imported from source because tsc does not copy CSS.
- `theia-extensions/product/src/browser/goldie/goldie-lesson-controller.ts`: navigation, request sequencing, truthful status.
- `theia-extensions/product/src/browser/goldie/goldie-audio-player.ts`: separate lesson/answer players and cleanup.
- `theia-extensions/product/src/node/goldie-api.ts`: local HTTP transport; service interface in `src/common/goldie-service.ts`.

## Verification and remaining gate

Locally passed Stage 0 suite: 11 backend tests, 4 shared-contract tests, 50 product tests, and real backend health/offline integration. Product TypeScript, ESLint, Electron development build, and watch compile/bundle passed. Native Electron verified Connected against the real Stage 0 backend and an honest error for missing Stage 1 routes. The key smoke check reports `ELEVENLABS_API_KEY is required` on this Mac; teammate's credential verification cannot be independently repeated here yet.

Client-only native QA uses `node scripts/goldie-stage1/fixture-server.cjs` on 127.0.0.1:8788 and launches Electron with `GOLDIE_BACKEND_URL=http://127.0.0.1:8788`. This is an explicit test server, never backend:start or a judged demo. It returns prepared responses and a quiet playback tone, not ElevenLabs speech. `--fail-teach-once --fail-speech-once` exercises recovery. Keep it separate from the real backend on 8787.

Native QA verified decline with no session/speech requests, acceptance, actual browser playback state, pause, typed question/answer, original phase resume without refetching lesson/speech, skip, familiarity, next/finish, and a truthful recap. Real project file editing/saving and terminal commands still function; watch-built panel changes load after restart; Cmd-R stalled during upstream plugin startup on this Mac, so explicit restart is the verified fallback. Screenshot evidence is captured locally. A dedicated narrower panel drag could not be exercised because native automation rejected drag; normal desktop layout was visually inspected.

Full Stage 1 remains pending Akshar's six endpoints and real ElevenLabs lesson/answer speech. Frontend completion and test audio are not evidence that the integrated real-speech gate passed.
