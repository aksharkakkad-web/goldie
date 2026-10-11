# Goldie native end-to-end test — 2026-10-11

This was a real integrated desktop run, with one initial microphone recognition
failure and later successful human recordings. It was not an uninterrupted clean
rehearsal and is not final Stage 4 demo sign-off.

## Real integrated evidence

- Created a separate read-only starter at
  `/Users/rishits/Documents/ChatGPT/hacknc/goldie-e2e-demo`. The original demo was preserved.
- Connected the project explicitly in native Goldie. Submitted the create-task
  request in its actual Codex chat. Codex implemented the form, POST validation,
  atomic JSON persistence, focused tests and compatible webpack build.
- Codex wrote cumulative handoff revisions 1–4. Goldie automatically offered a
  lesson from revision 1. The accepted session stayed frozen at revision 1 as the
  handoff advanced to revision 4. No manual context selection/replacement.
- Real Gemini explanations and ElevenLabs clips played through the moving orb.
  Approximate sentence captions appeared without a transcript drawer.
- The first human recording returned no recognized speech. Known clean audio
  transcribed successfully through the real local Whisper endpoint. Later native
  human recordings recognized a greeting and a concurrency question; the user
  confirmed audible replies. The original failure's precise cause is not proven.
  Added a live input meter and elapsed recording time, without retaining audio.
- In native Goldie: recording interrupted the lesson, Cancel discarded capture,
  the visible Return to lesson button resumed the section in one click, and
  Replay section restarted it. Precise retained clip/time behavior is covered by
  controlled tests; no numerical native timestamp comparison was captured.
- Finish & practice opened three real generated questions. Typing, explicit
  model-answer reveal, Next/Previous, and retained local response/reveal state
  were exercised. Exiting returned to the next section's orb playback.
- The final section ended naturally and closed the session. Practice for that
  covered section still worked. Backend state remained completed with two
  covered phases, two recognized questions and two practice batches.
- The actual browser form created "Prepare Goldie judge walkthrough"; the task
  survived refresh and was present through GET. Direct HTTP checks returned 400
  for empty, blank, oversized, non-string and malformed JSON inputs, and 201 for
  a valid trimmed title. Original starter tasks remained.
- Restart restored silently; no microphone/audio started by restoration.
- Error details now show the retained explanation/answer if speech fails. Normal
  voice playback still shows only the orb and one sentence. This fallback was
  checked with controlled rendering, not a real provider outage.
- Completed-session practice exits through **Back to recap**, rather than
  promising to continue an already finished lesson.

## Controlled checks and limits

Latest cumulative suite: 308 passed, zero failures: 102 backend, 12 contracts,
193 product, one real backend-health check. Full lint and Electron build passed;
watch was stopped for the full build and restarted with zero compilation errors.
The native-built task app's four tests and production webpack build passed.
Provider failures, lost response retry/deduplication, and stale/cancelled results
are covered by controlled tests, not a deliberately induced real provider outage.

The browser logged one normal Fast Refresh reload warning during Codex edits;
no application console errors were observed. Production and development Next
builds shared `.next`, temporarily affecting live GET during Codex verification;
the dev app recovered. Avoid building that demo concurrently during judging.

Automatic spoken interruption and source-grounded implementation claims remain
outside this demo. Captions have estimated sentence timing, not word alignment.
Question speech requires an accepted open lesson; completed lessons support
optional covered-topic practice. Back navigation means Return to lesson or Replay
the current section; jumping to earlier completed sections is not supported.

Remaining sign-off: repeat the full human question/follow-up/resume sequence with
the clearer controls in two uninterrupted runs, and verify a recording captures
the actual audio. No verified backup video exists. No push or merge was performed.

## Proof files

- `e2e-starter-before.png`: starter before the live native Codex feature.
- `e2e-native-auto-offer.png`: automatically detected learning offer.
- `e2e-native-spoken-captions.png`: real lesson speech/caption UI.
- `e2e-native-recording-input.png`: native recording and live input meter.
- `e2e-native-return-button.png`: clear one-click lesson return.
- `e2e-native-gold-practice.png`: real generated practice in the requested design.
- `e2e-form-persisted.png`: form-created task after refresh.
- `e2e-task-api.json`: direct HTTP validation results.
- `e2e-native-state.json`: final real session state, without credentials/audio.
