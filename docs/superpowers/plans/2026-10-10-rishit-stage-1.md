# Rishit's Stage 1: controllable lessons in the desktop IDE

Goal: accept a lesson offer, view a backend-provided roadmap and explanations, control audio, ask a typed question, resume the original lesson, and finish with a truthful recap.

Parallel ownership:
1. IDE transport: validate shared contracts; connect offer, session, teaching, question, completion, and binary speech endpoints.
2. Lesson state and audio: preserve phase/playback position, distinguish heard/skipped/familiar, recover from failures, release audio when closed.
3. Panel: offer, roadmap, text, playback/navigation controls, typed questions, and recap using the existing Theia style.
4. Integration: install pulled dependencies, verify Stage 0 locally, run focused checks, rebuild Electron, exercise controls and capture screenshots.

Akshar owns prepared backend responses and real ElevenLabs generation. A temporary test server can verify client behavior but cannot satisfy the integrated real-speech stage gate. No Gemini, microphone, Codex watcher, source retrieval, or production packaging in this change.

Acceptance: decline starts no audio; variable phase counts work; questions pause and resume the same lesson position; skipped/unplayed content is not mastered; failed speech keeps text available; closing stops audio; native desktop controls and an error path are tested. Complete Stage 1 requires the same flow with Akshar's real backend and ElevenLabs.
