# Stage 4 Live Codex Implementation Plan

Goal: actual native Codex requests produce a cumulative canonical handoff, automatically detected for opt-in Gemini lessons and ElevenLabs speech. Existing Akshar teaching contracts remain the source of truth. No backend/shared schema changes or delivery are authorized.

- [x] Add bounded local workspace handoff reader with canonical project ID, required Markdown fields/revision, fingerprint, path and credential protections.
- [x] Add singleton connection lifecycle using Theia file watching, one-second debounce, duplicate/conflicting revision checks, silent restoration and pending-context handling.
- [x] Extend existing Codex frontend service to add handoff policy only for the explicitly connected matching workspace. Preserve user-visible request and normal Codex behavior.
- [x] Extend context factory/controller to accept real workspace IDs/revisions while keeping legacy manual context/recovery.
- [x] Use shared controller in panel, add Connect/Disconnect/latest-revision/learn-current-build controls, cancel microphone on workspace navigation, and keep offers/lessons frozen.
- [x] Prepare separate Next.js Team Tasks starter with actual Codex. Judge feature: create form + POST validation + local JSON storage.
- [x] Run regression/cumulative tests, lint, full Electron build with watcher stopped. Exercise actual native Codex handoff and automatic offer, cancellation, restart and active-lesson invariants.
- [ ] Verify live Gemini/ElevenLabs and human spoken walkthrough, two uninterrupted rehearsals, screenshots/recording if available. Missing private credentials block demo signoff.

Implementation records go in docs/stage4-proof/VERIFICATION.md. The current scope ends at Stage 4; source retrieval, automatic catch-up planning, production packaging and purchases are excluded. No push or merge without approval.

Delivery update: the user authorized push/integration on 2026-10-11. The source and
completed demo are ready to share after fresh verification; clean rehearsals and
an audio-checked backup remain separate demo sign-off requirements.
