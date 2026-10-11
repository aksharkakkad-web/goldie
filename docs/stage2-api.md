# Stage 2 IDE integration contract

Rishit's IDE sends supplied engineering context through the existing API. Akshar owns live Gemini generation and persistence on his computer. This document describes the implemented IDE boundary; it does not claim that the live backend is present in this checkout.

## Requests

`POST /api/offer` sends `{projectId, revision, handoff, profile:{level}}`.
`projectId` is `goldie-stage2-sample` for this explicitly loaded sample workflow.
`level` is `beginner` or `intermediate`. The live IDE never sends `referenceLessonId`.

Context changes increment a locally persisted revision. Reopening the panel, requesting the same offer, or declining does not increment it. Loading a file or changing level never calls the backend. Prepare lesson sends context; Explain accepts the offer and permits speech.

`POST /api/sessions` sends `{offerId, revision, handoff, profile}` using the exact offer snapshot. Standard/expanded teaching sends `{sessionId, phaseId, detail, handoff, profile}`. Ask and completion retain their Stage 1 contracts. The backend must use its accepted snapshot authoritatively. Generated-phase Ask must fail honestly or give a supported conceptual response; the existing prepared backend assumes reference phase IDs and needs Akshar's compatibility update.

Limits remain 32,000 handoff characters and 64 KiB JSON requests. The IDE reserves 1 KiB for request envelopes and rejects context exceeding this byte budget without truncating it. Choose a local regular `.md` or `.markdown` file. The reader rejects final-component symlinks, folders, invalid UTF-8, empty input, non-file URIs and input over 128,000 bytes. It reads only that file; no directories or source code are scanned.

Selected context and accepted recovery snapshots are saved locally in Electron storage for restart recovery. They contain handoff text, so use the provided non-sensitive examples for the demo. Credentials stay in the teaching backend.

## Responses and state

- Offered lesson: `shouldOffer:true`, a valid offer ID and 1–6 preview topics.
- No lesson: `shouldOffer:false`, empty topics and no offer ID.
- Session: 1–6 phases with unique IDs. Progress IDs must belong to the roadmap and be distinct across covered/skipped/familiar groups. An open session's active ID is the first pending phase. Completed sessions cannot leave pending phases. Question resume IDs must belong to the roadmap.
- Teaching: current shared `TeachResponse` with usable text and a server content ID; speech uses that ID. The renderer never submits arbitrary text or fetches arbitrary audio URLs.

The IDE validates returned session references on acceptance, retrieval and actions. Invalid state produces a safe error rather than a false completed path. UI labels and roadmap are generic and derive from the response, including arbitrary phase IDs and variable counts.

Confirmed sessions restore through GET without autoplay. Pending acceptance saves the full context before POST and replays exactly after a lost response. Safe definitive `CONTEXT_CONFLICT`, `REVISION_CONFLICT` or `OFFER_NOT_FOUND` acceptance failures archive the rejected snapshot, then retire its recovery record so declining permits a new context. Network/auth/unknown failures preserve the pending record because acceptance may already have committed. Corrupt recovery data is preserved and blocks unsafe replay; it requires local repair.

## Errors and deadlines

The IDE recognizes `GEMINI_NOT_CONFIGURED`, `GEMINI_AUTH_FAILED`, `GEMINI_RATE_LIMITED`, `GEMINI_TIMEOUT`, `GEMINI_UNAVAILABLE`, `GEMINI_INVALID_RESPONSE` and `CONTEXT_CONFLICT`. Use the existing `{error:{code,message,retryable}}` shape. Theia RPC forwards safe fixed messages and retryability, never the provider's raw message or stack.

Offer, acceptance and teaching have a 25-second whole-response deadline. Akshar's planned provider deadline must be shorter, for example 20 seconds. Ordinary JSON/audio retrieval retains 15 seconds; speech generation retains 30 seconds. Retry is manual. A speech retry reuses text/content ID instead of generating another lesson or accepting again.

No prepared fallback is selected by the live IDE. Until Akshar's backend is integrated, native tests with controlled responses prove only the IDE behavior. Real-service acceptance requires the same flow with Gemini and ElevenLabs, then the PRD's merged-main checkpoint.

The implementation uses Theia's existing [service and contribution pattern](https://theia-ide.org/docs/services_and_contributions/) and the installed `@theia/filesystem` API. Goldie has a dedicated `DefaultFileDialogService` binding, keeping its picker inside the desktop and leaving other application file dialogs unchanged.
