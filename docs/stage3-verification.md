# Stage 3 local backend verification

Date: October 10–11, 2026. Branch: `codex/stage-3-backend`, based on merged main `39a1634`. Documentation-only commit: `0620a85`; implementation candidate: `ee56015` plus final review fixes recorded in Git history.

## Status and boundary

Backend implementation is present locally. **Full backend sign-off remains open** because the complete live ElevenLabs spoken journey could not finish with the configured credits. **Overall Stage 3 is not complete**: Rishit still owns click-to-toggle recording, voice-only composer, practice UI, playback/controller integration and the joint merged-main walkthrough. Existing renderer tests cover Stage 0–2 behavior, not those unimplemented Stage 3 controls. Nothing in this task has been pushed or merged.

## Checks

- `yarn test:stage3`: **239 pass** (102 backend, 15 contracts, 121 product, 1 standalone health). Tests cover question recovery/collision/concurrency/staleness, frozen context and last-six history, practice persistence/eligibility/closure, V1/V2 migration, actual FFmpeg media limits/silence, controlled local Whisper failures/timeout/cleanup, large-upload RPC and safe error codecs.
- `yarn lint`: all seven workspaces pass, with existing upstream deprecation/color/no-enabled-rule warnings.
- `yarn electron build`: zero errors.
- `git diff --check`: pass.
- Broad `yarn test`: **not green**. Electron-next packaged preview launcher fails in before/after hooks (`undefined.toString`, `undefined.closeWindow`); the same packaging precondition was present before Stage 3. `yarn electron package:preview` was not run. This is not concealed by the scoped Stage 3 result.
- Independent whole-branch review: no remaining Critical/Important findings. The error-body timeout defect was reproduced RED→GREEN and fixed. Deferred Minor: real ApiError phase/closure changes during transcription can return PHASE_CONFLICT/SESSION_CLOSED before the dedicated TRANSCRIPTION_STALE mapping; late results are still discarded and messages safe/actionable.

## Actual local Whisper + Gemini

Akshar explicitly approved local setup. Installed CMake with Homebrew, built official whisper.cpp **v1.9.5** commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`, CPU/Accelerate configuration, and downloaded English **base.en**. Model SHA-1 matches `137c40403d78fd54d454da0f9bd998f78703390c`. Server paths were added to the existing ignored backend `.env`; no keys were displayed or changed.

Two actual localhost HTTP journeys used local English speech synthesized with macOS `say`, converted to WebM. This is repeatable audio input, **not a human microphone or renderer recording test**. Both questions transcribed accurately:

1. Why should the backend validate a request when the browser already validated the form?
2. What changes if an attacker skips the browser form and calls the server directly?

Gemini returned relevant contextual answers, preserved resumePhaseId, and distinguished unverified implementation. Matching retries returned identical saved answers in about 1 ms. Resume, phase coverage, on-demand three-item practice and partial recap succeeded. A second pass with the separately versioned qualified conversation prompt correctly distinguished server permissions from database constraints and stated validation limitations. Generated content still needs human review before a judged demo; structured validation is not a correctness guarantee.

Demo-machine benchmark: Apple M5, two ~4.24-second WebM clips. First run: **1849 ms / 848 ms** FFmpeg+Whisper; subsequent run: **661 ms / 577 ms**. These are end-to-end transcription route timings, not isolated model inference or a 30-second/noisy-input guarantee. Gemini answers were about 1 second and practice about 1.3 seconds in these runs. No transcription audio went to a cloud service.

Private generated content/timings remain ignored in `backend/.data/stage3-text-live/verification.json`. Runtime transcription job directories were removed. Recordings/transcripts/subprocess output are not logged by the transcription service; successfully submitted recognized questions enter ordinary saved conversation history.

## ElevenLabs limitation

The explicit `--live --play` smoke generated a real Gemini roadmap and lesson, then stopped at speech. ElevenLabs returned **quota_exceeded with HTTP 401** for the 1050-character lesson. A small 18-character diagnostic returned valid audio, confirming that a blanket invalid-key diagnosis was wrong. No subscription change, purchase, cheaper-model fallback or automatic paid retry was made.

Added bounded, sanitized **SPEECH_QUOTA** classification and RPC messaging, including a timeout regression for stalled error bodies. Full lesson/answer generation and actual playback remain **unverified in this Stage 3 run**. Configure a key with sufficient existing credits in ignored `.env`, then explicitly rerun:

```sh
yarn backend:smoke:stage3 --live --audio /absolute/question.webm --followup-audio /absolute/followup.webm --play
```

See [integration contract](stage3-integration.md) and [Rishit handoff](stage3-rishit-handoff.md). Stage 4 remains the hackathon target; preserve the final 2–3-hour feature freeze.

## Decisions and review boundaries

Execution followed the approved chat plan inline, with a temporary progress ledger rather than fabricated scripted task briefs. Recording/controller work stayed with Rishit: this costs an explicit native integration gate, not a hidden fallback to typed chat. Akshar approved the local model/build setup; disk usage includes the 142 MiB model plus source/build/CMake. SPEECH_QUOTA is an additive error mapping, not a voice/model fallback. Branch, worktree, ignored data and the original checkout are preserved; the only original-checkout edit was adding approved local tool paths to ignored backend `.env`.

The independent reviewer deliberately did not judge renderer recording/cancellation/focus cleanup, exact clip resume, practice rendering or restart playback (excluded frontend ownership), live generated answer quality (reviewed separately by the manager on two synthetic-context runs, not universally guaranteed), human-microphone accuracy (synthetic clips only), or full ElevenLabs playback (credit limitation). These remain explicitly unverified where stated above; no native or merged-main sign-off is implied.
