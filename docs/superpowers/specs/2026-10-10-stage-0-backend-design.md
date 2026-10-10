# Goldie Stage 0 Backend Design

## Purpose

Complete Akshar's Stage 0 responsibilities from the current Goldie HackNC PRD while preserving Rishit's Eclipse Theia IDE fork. Stage 0 establishes a locally runnable teaching backend, a stable shared API contract, and a real ElevenLabs credential check. Rishit's Goldie panel will consume this contract; this work does not implement later lesson, Gemini, session, or voice-playback behavior.

The newer PRD supplied for this task is authoritative where it differs from the repository copy. The repository PRD must be updated during implementation so the checked-in plan and implementation do not contradict each other.

## Existing Context

- The repository is a fork of Eclipse Theia IDE at Theia `1.77.0-next.25`.
- The primary development target is the Electron desktop application.
- Node `24.21.0`, Yarn Classic `1.22.22`, the upstream lockfile, and the existing Lerna/Yarn workspace structure remain in place.
- Rishit's bootstrap commits already brand the application as Goldie and document a verified desktop build.
- Cursor, VS Code, code-server, and IDE-adjacent fallbacks are excluded. Goldie is built directly on the Theia fork.
- No ElevenLabs API key is currently present in this machine's process environment.

## Scope

Stage 0 backend work includes:

1. A standalone TypeScript HTTP service under `backend/`.
2. `GET /health` returning exactly `{ "ok": true }` on success.
3. Shared runtime-validated contracts under `shared/contracts/` for every endpoint frozen in the PRD.
4. Local-only environment loading with a committed example file and ignored secret-bearing files.
5. A dedicated ElevenLabs credential smoke command that makes a genuine authenticated request without printing or returning the key.
6. Tests for health behavior, contract parsing, configuration failures, and provider error sanitization.
7. Setup documentation that tells Rishit how to run the service and connect the Theia panel.

The following are explicitly deferred:

- Gemini calls or prompts.
- Lesson fixtures and session state.
- Text-to-speech generation or audio streaming.
- The Goldie Theia widget itself, which remains Rishit's owned surface.
- Accounts, databases, deployment, authentication, analytics, or hosted infrastructure.

## Architecture

### Backend service

Use Fastify with TypeScript as a separate local process. Fastify supplies a small, testable routing boundary and handles JSON, CORS, and future binary audio responses without coupling provider credentials to Theia's frontend or Electron renderer.

The service binds to `127.0.0.1` by default and uses a configurable local port. It exposes only the Stage 0 health route initially. The application factory is separate from the process entry point so tests can exercise real routes without opening a network port.

Proposed files:

```text
backend/
  package.json
  tsconfig.json
  src/app.ts
  src/config.ts
  src/server.ts
  src/providers/elevenlabs.ts
  src/smoke-elevenlabs.ts
  test/health.test.ts
  test/config.test.ts
  test/elevenlabs.test.ts
  .env.example
```

### Shared contracts

Create a workspace package at `shared/contracts`. It owns schemas and inferred TypeScript types for:

- health;
- offer evaluation;
- session creation;
- teaching;
- questions and optional source excerpts;
- completion and catch-up offers; and
- speech requests/responses.

Zod schemas provide runtime validation at the HTTP boundary and static types to both backend and Theia client. Stage 0 implements only `/health`, but freezing all PRD shapes now lets Rishit build the client against the same package without duplicating interfaces. Fields not specified by the PRD will not be invented unless required for valid transport; future stages may extend schemas compatibly through reviewed contract changes.

### Workspace integration

Add `backend` and `shared/*` to the root Yarn workspaces. Keep Theia's existing application and extension workspaces unchanged. Add narrow root scripts for building, testing, starting, and running the provider smoke check; do not replace upstream scripts or package management.

## Data Flow

1. Rishit starts the Goldie backend locally.
2. The Theia panel sends `GET http://127.0.0.1:<port>/health` through its API client.
3. The backend validates/serializes the response through the shared health contract and returns `{ "ok": true }`.
4. Rishit's panel displays the connected state.

The ElevenLabs check is deliberately separate:

1. Akshar places `ELEVENLABS_API_KEY` in `backend/.env` or exports it locally.
2. `yarn backend:smoke:elevenlabs` loads and validates configuration.
3. The provider client makes one inexpensive authenticated metadata request to ElevenLabs.
4. The command reports success or a sanitized failure. It never logs the key, request authorization headers, or a full provider response.

Routine `/health` calls never contact ElevenLabs. This keeps panel connectivity fast and distinguishes local server health from provider credential readiness.

## API and Errors

- Successful health response: HTTP 200 with `{ "ok": true }`.
- Unknown routes use Fastify's normal JSON 404 behavior.
- Invalid local configuration prevents the smoke command from making a request and produces a concise actionable message.
- ElevenLabs authentication, rate-limit, timeout, and network failures produce safe summaries without leaking credentials or response headers.
- CORS permits the local Theia development client only. The allowed origin is configurable for local development rather than using an unrestricted production wildcard.
- Provider timeouts are bounded so the smoke command cannot hang indefinitely.

## Secrets and Privacy

- Add `.env` patterns to `.gitignore` while retaining `.env.example`.
- The example file contains names and safe defaults only.
- No key is placed in source, tests, command history, logs, contracts, or the Theia renderer.
- The backend remains the sole owner of provider credentials.
- Stage 0 sends no repository, handoff, prompt, source, or voice content to an external provider.

## Testing and Verification

Implementation follows test-driven development:

1. Write and observe a failing `/health` route test.
2. Implement the minimum app factory and route to pass.
3. Write failing contract/config/provider tests before implementing each behavior.
4. Run the backend test suite, TypeScript build, lint for affected packages, and the relevant repository build checks.
5. Start the service and verify `/health` over a real local socket.
6. With Akshar's key present, run the genuine ElevenLabs smoke command once and record only its success status.
7. Rishit performs the cross-owner exit check by calling `/health` from the actual Theia panel on merged `main`.

Stage 0 is complete only after steps 1–6 pass for Akshar's scope and the shared panel-to-backend check passes with Rishit. If the API key is unavailable, the code can be complete but the PRD's Stage 0 provider gate remains explicitly unverified.

## Git and Delivery

- Work locally on `codex/stage-0-akshar`, based on the current remote `main`.
- Preserve the upstream Theia history and Rishit's commits.
- Commit only Stage 0 backend, contracts, tests, and affected documentation.
- Do not push, open a pull request, merge, deploy, or publish without Akshar's explicit approval after the required delivery summary.
