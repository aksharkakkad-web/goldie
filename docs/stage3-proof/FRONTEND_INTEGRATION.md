# Stage 3 frontend integration — local verification

Integration base: `34a916f`, containing Akshar's backend through `3e77d1b`. Source of truth: `docs/stage3-integration.md`. Rishit authorized delivery of this frontend integration to main. Overall Stage 3 sign-off remains pending.

## Implemented

- Voice-only ordinary Q&A: explicit Ask pauses playback and saves the backend pause before microphone capture. Send waits for final recording data, releases tracks, normalizes WebM/Opus to `audio/webm`, calls transcribe then ask, displays read-only transcript/answer, and requests answer speech.
- One request ID and exact recognized question survive manual retry. A successful answer is retained for speech-only retry. Duplicate Send is disabled; cancellation invalidates late results. Resume explicitly selects the retained original lesson clip.
- Capture is limited to accepted open lessons; 30 seconds stops without sending. Cancel, End, blur, navigation, panel/drawer closure and disposal discard unsent recordings and stop tracks. Restoration does not start recording, generation or playback.
- Covered phases offer Practice / Continue after recording progress. Skipped/familiar phases bypass practice. Explicit Practice retrieves cached questions before generating, and renders the existing client-only response/reveal model. Closed/partial recaps expose covered-phase practice without reopening the session.

## Verification boundary

Focused tests use production controller, recorder, player and React rendering, with controlled hardware/service adapters. They are not live Gemini or ElevenLabs evidence. Additional checks cover exact original clip position, follow-ups, lost transcription/answer responses, speech-only retry, cancellation, duplicate Send, final closed practice and client-only reveal state.

Local official Whisper v1.9.5 CPU/Accelerate and English base.en are installed. Model SHA-1 is `137c40403d78fd54d454da0f9bd998f78703390c`. Its official JFK sample transcribed successfully. The ignored backend `.env` contains only local tool paths; Gemini and ElevenLabs keys are not configured on this Mac.

Native checks used an isolated Electron user-data directory and temporary backend state, with the real backend/Node transport/local Whisper. Teaching and speech adapters in that check are clearly labelled local fixtures; they do not establish live provider behavior. Default development data and backend configuration are preserved.

Full Stage 3 remains unapproved until the joint native microphone → Whisper → Gemini → ElevenLabs → exact resume walkthrough. Credentials must be configured privately; never paste keys into chat. No purchases or backend contract changes are included.

## Fresh results

- `yarn --frozen-lockfile`: passed. This fixes stale installed backend Zod 4.5.4 versus required/shared 4.6.5; incompatible installed declarations caused the initial compiler heap exhaustion. No lockfile, backend source or contracts changed.
- `yarn test:stage3`: passed, exit 0: 102 backend, 12 shared-contract, 146 product and 1 real-health checks (261 total). FFmpeg is on the verification terminal PATH. Providers are controlled local adapters in these tests.
- `yarn lint`: passed, exit 0. Existing upstream deprecation/no-enabled-rule warnings remain.
- Electron build: passed with zero bundler errors; repeated after dependency alignment.
- Independent frontend correctness review found no blocking defect. Client session is refreshed after a successful answer so follow-up capture saves the current backend pause.

## Native observations

The actual Electron application was tested with separate user data and backend state. Two explicit native microphone recordings captured macOS synthetic speech played through the speakers; actual local Whisper recognized them. First transcript was exactly “Why does the server validate requests?”; follow-up was “What if an attacker skips the browser and calls a server directly?” (the synthesized wording used “the server”). These are acoustic microphone tests, not a human voice-quality or Gemini-answer test. Teaching/answer text is labelled CONTROLLED TEST; speech is a valid local silent MP3 fixture.

Explicit Resume returned to the original lesson at approximately 4.31 seconds rather than regenerating/restarting at zero; focused player/controller tests verify exact 17.25-second identity/position. Native Cancel stopped recording and restored Resume. A separate recording automatically became ready and displayed Send/Cancel without submitting; unit tests verify the exact 30,000 ms timer.

Mark read paused at Practice / Continue without playing the next phase. Explicit Practice rendered 3 questions; typed response and Show model answer worked. Continue entered the next phase only after a click. Final phase closed normally and still allowed practice. Actual backend state confirmed completed, both covered phase IDs, two conversation turns and two cached practice batches. The typed practice response was absent from stored JSON.

Screenshots `integrated-native-recording.png`, `integrated-native-answer.png`, `integrated-native-time-limit.png`, `integrated-native-practice.png`, `integrated-native-final-practice.png` and `integrated-native-recap.png` capture the actual desktop. Answer/practice screenshots were visually inspected; native recording/timer/recap states were also inspected through the accessibility tree. No screen recording is claimed.

Remaining joint checks: human microphone intelligibility; actual contextual Gemini response and ElevenLabs audio; native injected lost-response/provider-failure cases (covered with controlled tests); precise native clip timing beyond displayed time; partial recap practice and all focus/disposal combinations with a human; joint merged-main acceptance. Overall Stage 3 is not signed off.

Restart verification: the isolated native IDE restored its completed recap with the same covered-phase links and no microphone, autoplay or generation. `integrated-native-restored.png` records that state. The temporary fixture server was stopped afterward; the normal development IDE/backend/watch are restored.

Development recovery: a simultaneous full build/watch attempted to read a half-written map. Full build passed; restarting the watcher after the build avoids this same-target race. The startup/editor remain available. Do not run concurrent builds against the same Electron outputs.
