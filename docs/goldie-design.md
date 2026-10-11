# Goldie desktop design

The desktop now uses a near-black Goldie Midnight theme, a compact orb panel on the right, Play/Pause/Skip controls and a settings/details drawer for the existing lesson flow. The orb reads the currently playing lesson/answer waveform through one Web Audio output path. Pause/exit resets its audio level; reduced-motion preferences suppress ambient movement. Goldie's selected icon is used in frontend branding and the macOS Dock.

Daily development uses the existing Electron watch/start commands in DEV_SETUP.md. Wait for the watch build, then explicitly reload. Restart Electron for launcher/icon changes. If reload stalls during Theia layout restoration, quit and start again. The design makes no claim of automatic hot reload.

Verification for this design-only commit: product TypeScript build, product ESLint, launcher syntax check and 61 focused lesson/audio/real-widget-rendering tests passed. A separate snapshot excluded unfinished Stage 3 capture/practice changes before these checks. The running native desktop's matching orb appearance was captured and inspected in `goldie-design-native.png`; that development checkout also contains separate unpublished Stage 3 work.

The existing typed/prepared Q&A remains until Stage 3 backend integration. This design commit does not implement voice transcription, freeform Gemini Q&A or per-phase practice. No installer or production deployment was created.
