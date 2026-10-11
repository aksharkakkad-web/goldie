# Stage 3 backend and native integration contract

Status: local implementation under verification. Rishit's recording/controller UI and joint merged-main walkthrough are separate gates. The existing renderer still has Stage 2 typed Q&A until that work lands. Do not describe it as a completed voice-only product.

## Voice conversation sequence

1. Accept an offer and GET/teach the saved active phase as in Stage 2. Keep the original lesson audio object and position in the renderer.
2. Click **Ask Goldie**: pause lesson or answer playback; POST the existing pause action with a unique actionId if needed. Wait for the action to settle before submitting audio. Start recording only after user acceptance and the click.
3. Click **Send question**: stop tracks and create one stable requestId for this recording. Send through Node/RPC `transcribe({sessionId, phaseId, requestId, mimeType: "audio/webm", dataBase64})`. WebM/Opus is the capture format. Transcription returns `{text}`; no context, progress or Gemini call is made by transcription.
4. Immediately call `ask({sessionId, phaseId, requestId, question: text})`, without confirmation/editing. Text may be shown read-only. Handoff/profile are frozen server-side; do not supply newer context or source excerpts.
5. Display the returned answer and request existing `speech({sessionId, contentId})`. Its existing Node/base64 audio boundary is unchanged. Gemini answers live sessions; only explicit webapp-architecture reference sessions use prepared FAQ answers. No provider-failure fallback.
6. After playback, offer another question or explicit **Resume lesson**. Resume the original lesson clip at its retained position, not the answer clip and not a regenerated lesson. Server resumePhaseId is invariant; playback position remains client-owned.

Matching ask retries reuse the SAME requestId/phase/question and recover the same persisted answer/contentId without another paid call. Changed content requires a new ID. Old clients may omit requestId but then cannot recover a lost answer idempotently. Only one distinct question generation per session; duplicate pending requests join. Intervening actions, phase changes or closure discard late answers. Keep the click/send intent until a definite result; do not silently create another ID on network failure.

Transcription deduplication lasts five minutes in memory, bounded to 100 successful results; recordings are never persisted. After restart/expiry the same recording can be locally transcribed again. Cancellation is client-side result suppression, not a promise that a paid generation already sent was stopped. Do not automatically retry any model/TTS request.

## Recording state requirements (Rishit)

- Click/start, click/send, Cancel; never hold-to-talk or ordinary typed chat. Cancel stops/discards audio and ignores late results.
- At 30 seconds stop capture and require Send or Cancel, never auto-submit. Maximum decoded upload 2 MiB. Bound the renderer before base64/RPC too.
- Navigation, lost focus, disposal and end stop all microphone tracks and discard unsent recordings. Processing disables duplicate sends and offers Cancel. Token/generation checks must ignore all late cancelled results.
- On failure offer re-record, manual retry where safe, or Resume. Never autoplay or start capture/generation on restoration. Microphone permission/capture failure must not corrupt the lesson or discard its original audio position.

## Optional text practice

`POST /api/sessions/:sessionId/phases/:phaseId/practice` with `{}` generates or returns `{practiceId, phaseId, questions: [{id, question, modelAnswer}]}`. Three to five distinct items; default three. Node/RPC: `generatePractice(sessionId, phaseId)`.

`GET` at the same path returns the cached batch or `null`, without generation. Node/RPC: `getPractice(sessionId, phaseId)`. Extra POST fields, including student responses, are rejected. No grading endpoint exists.

After phase audio completes, record `phase_completed` exactly once. The server advances activePhaseId; the renderer must NOT immediately fetch/play the next clip. Offer **Practice / Continue** for the just-covered phase. Pause next-phase server state using the existing pause action if necessary. Continue resumes and teaches the next pending phase. Skipped/already-know phases bypass practice. After the final phase, close normally, keep its phase ID, and allow text practice on the closed session. Early-ended sessions also allow practice for their covered phases.

Practice reads frozen context and the saved standard explanation. It never changes progress, recap or profile, and never publishes speech content. Model answers arrive in the batch: reveal/retry is purely local, no network or AI call. Typed responses/reveal state stay client-local. Self-comparison is not demonstrated mastery.

## Local transcription setup (explicit, no runtime install)

Install FFmpeg and CMake explicitly, clone the official pinned source, build and download only the English model:

```sh
brew install ffmpeg cmake
git clone --depth 1 --branch v1.9.5 https://github.com/ggml-org/whisper.cpp.git /absolute/local/whisper.cpp-v1.9.5
cd /absolute/local/whisper.cpp-v1.9.5
cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF -DGGML_METAL=OFF
cmake --build build --target whisper-cli -j 4
bash models/download-ggml-model.sh base.en
shasum -a 1 models/ggml-base.en.bin
```

Expected base.en SHA-1: `137c40403d78fd54d454da0f9bd998f78703390c`. CPU/Accelerate build avoids GPU startup requirements; benchmark on the actual demo machine. Upstream: [pinned whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/v1.9.5), [model checksums](https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/models/README.md).

Set these server-only absolute paths in ignored backend `.env`, then restart:

```dotenv
GOLDIE_WHISPER_BIN=/absolute/local/whisper.cpp-v1.9.5/build/bin/whisper-cli
GOLDIE_WHISPER_MODEL_PATH=/absolute/local/whisper.cpp-v1.9.5/models/ggml-base.en.bin
GOLDIE_FFMPEG_BIN=/opt/homebrew/bin/ffmpeg
```

On Akshar's Mac the explicit approved setup is `/Users/aksharkakkad/.local/share/goldie/whisper.cpp-v1.9.5`. No model/audio is uploaded to a transcription service. FFmpeg decodes to private mono 16-kHz PCM; the backend measures actual decoded duration and detects silence before invoking Whisper. Jobs use fixed arguments, no shell, no recording/transcript/subprocess logs, and remove their private temporary directory on success/failure. Only one transcription job runs at a time.

## Deadlines, errors and storage

Gemini: 20-second total deadline and two generations across planning, teaching, conversation and practice. Node transport offer/teach/ask/practice generation: 30 seconds; ordinary calls including GET practice/acceptance: 15; speech: 30. Local FFmpeg + Whisper: 30-second total; transcription transport: 40 seconds. Upload body limit is 3 MiB only on transcribe; all other backend requests remain 64 KiB.

Canonical additional codes: REQUEST_CONFLICT, QUESTION_BUSY, QUESTION_STALE, EXPLANATION_REQUIRED, PRACTICE_NOT_AVAILABLE, INVALID_RECORDING, RECORDING_TOO_LONG, TRANSCRIPTION_NOT_CONFIGURED, TRANSCRIPTION_EMPTY, TRANSCRIPTION_TOO_LONG, TRANSCRIPTION_FAILED, TRANSCRIPTION_TIMEOUT, TRANSCRIPTION_BUSY, TRANSCRIPTION_STALE. Node/RPC preserves code/retryability but uses fixed safe messages, never upstream text or paths. Existing Gemini/TTS/session codes remain unchanged. Safe errors do not lose progress; retries are explicit.

Store V3 migrates V1/V2 atomically, preserving snapshots, actions, published IDs, progress and history. Successful question intents and practice batches persist locally; only the last six successful conversation pairs are sent as conversation context. Recognized question text enters normal conversation history only when ask succeeds; the transcription service does not persist it. Stage 2 model/prompt identity is unchanged; conversation and practice prompts have separate versions. No API keys or audio recordings enter the store. Preserve V3 data when switching branches; older backends cannot read the new schema.

ElevenLabs may return HTTP 401 with quota_exceeded when credits are insufficient. This maps to safe **SPEECH_QUOTA**, not an invalid-key message. No smaller/cheaper model fallback, purchase or automatic retry is made. Restore credits/key access explicitly before a full spoken live check.

## Verification gates

Run `yarn test:stage3`, `yarn lint`, `yarn electron build`, `git diff --check`. Test unseen questions/follow-ups, lost responses and collisions, stale results and provider failures; practice cache/eligibility/terminal immutability; transcription limits, malformed media, silence, missing tools, timeouts, cleanup and no cloud audio. Run an explicitly invoked live smoke and benchmark with the configured local model and existing Gemini/ElevenLabs credits.

FFmpeg must be installed for real media-decoding regression tests; use PATH or `GOLDIE_FFMPEG_BIN`. Those tests use a controlled local Whisper executable (no model download or cloud request). The separate live check requires the actual pinned model:

```sh
yarn backend:smoke:stage3 --live --audio /absolute/question.webm --followup-audio /absolute/followup.webm --play
```

This spends existing model/voice credits only when explicitly invoked; failure stops without retries. It uses real localhost HTTP, saves a private ignored report, and does not prove native capture or original-clip resume.

Overall Stage 3 additionally needs Rishit's native Electron recording/practice UI, original-clip resume, focus/disposal/cancel cleanup, restart without autoplay, and the human joint merged-main walkthrough. Backend tests do not establish those UI behaviors. No Stage 4 watcher, Stage 5 source retrieval, hosted database, deployment, purchases or automatic provider fallback is included.
