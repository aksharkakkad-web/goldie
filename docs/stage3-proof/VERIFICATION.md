# Stage 3 frontend checkpoint — evidence

This is a partial implementation checkpoint, not Stage 3 signoff. Latest inspected remote main before this frontend delivery is `6e84904`. Akshar's voice/Whisper/practice contracts have not been pushed there.

## Implemented here

- Production `GoldieRecorder`: explicit audio-only capture, WebM/Opus, final-chunk completion, 30-second automatic stop, 2 MiB ceiling, memory-only clip, safe permission/error messages and track cleanup on cancel/blur/pagehide/document hidden/dispose.
- Native Goldie details: local Test microphone, Stop, preview and Discard. Closing the drawer/panel cancels capture. No upload/transcription/provider call.
- `prepareVoiceQuestion`: pauses before capture, keeps original lesson audio identity/time, saves backend pause and prevents capture if pause failed.
- `GoldiePractice` and its real React view: 3–5 validated question/model-answer pairs, bounded typed responses held only in memory, explicit answer reveal, previous/next/exit. Component is not yet wired to phase progression or backend questions.
- Spec updated for voice-only ordinary questions and per-phase optional practice. Existing Stage 2 typed/prepared flow is preserved until atomic backend integration.

## Fresh checks

Pinned Node 24.21.0, Yarn 1.22.22. Product `build` and `lint`: exit 0. Focused production-module tests: 76 passed, zero failed. Existing lesson/audio tests included; the whole backend/provider suite was not run for this frontend-only checkpoint.

New coverage includes permission denial, permission resolving after cancellation/disposal, final audio data ordering, repeated Stop, timer stop, empty/oversized recording, recorder errors, blur/navigation cleanup, practice validation/client-only responses/explicit reveal, real widget/component rendering and exact 17.25-second original clip resume after answer playback. A failed server pause retains progress and blocks capture.

A test-only mutation in `/tmp/goldie-stage3-mutation.cjs` removed generation invalidation from recorder cancellation. Two regression tests failed (late permission and late stop), exit 1. Normal implementation then passed all 76 checks. Repository source and generated files were not altered by that mutation.

## Native observations

Native Electron launched after rebuilding through the existing persistent watch process. Reload initially stalled at an empty Theia shell; quitting/restarting through the established tmux workflow recovered it. UI screenshots were captured through CUA and visually inspected.

- `native-recording.png`: actual microphone permission succeeded and real MediaRecorder entered recording, with Stop/Discard visible.
- `native-recording-ready.png`: explicit Stop returned a local clip and rendered its HTML audio preview. Nothing auto-played or uploaded. Speech intelligibility was not verified: Rishit must speak into and listen to the microphone check.
- `native-30-second-stop.png`: a second actual capture automatically became ready without pressing Stop or Send. Observed at 40 seconds from the click; unit coverage verifies the timer is scheduled for 30,000 ms. No claim of sub-second native timing precision.
- Discard removed the local preview and returned Microphone is off. In the final build, closing the settings drawer during actual recording and reopening it also returned Microphone is off. A fresh Electron startup did not record or play automatically.

The current native capture API exposes screenshots, not a screen-recording operation. The macOS screen-recording shortcut was attempted, but the Screenshot toolbar could not be accessed through the enabled native surfaces (control timed out); Escape dismissed the attempt. No screen recording was produced. These screenshots prove UI states, not Gemini/Whisper/ElevenLabs output.

## Remaining before Stage 3 is complete

1. Akshar pushes the updated PRD, shared voice/practice contracts and Node/RPC methods.
2. Map those exact methods into Send/transcript/answer; replace ordinary typed composer with voice-only controls.
3. Add covered-phase Practice/Continue boundary and wire real generated practice to the existing client-only model/view.
4. Integrated request cancellation/retry/error tests and native practice screenshot.
5. Real unseen spoken question → local Whisper transcript → contextual Gemini answer → ElevenLabs speech → explicit resume at measured original clip time. Another question, cancel, provider failure and no autoplay on restoration must pass.

## Rishit's immediate hardware test

Goldie settings/details → Test microphone → speak a short sentence → Stop recording → Play in the local preview. Confirm you hear it clearly, then Discard. That tests microphone audio quality without any provider request. The editor and development watcher remain running in the `goldie` tmux session.
