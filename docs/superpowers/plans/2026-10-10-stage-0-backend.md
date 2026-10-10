# Goldie Stage 0 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Akshar's Stage 0 backend: frozen shared API contracts, a local health service, and a genuine secret-safe ElevenLabs credential check that Rishit's Theia panel can consume.

**Architecture:** Add two focused Yarn workspaces to the existing Theia monorepo: `@goldie/contracts` for Zod schemas/types and `@goldie/backend` for a standalone Fastify service. The backend owns provider credentials, binds to loopback by default, and keeps local health separate from provider readiness; the Electron renderer receives only contract-safe JSON.

**Tech Stack:** Node 24.21.0, Yarn Classic 1.22.22, TypeScript 5.9.3, Fastify 5.12.5, `@fastify/cors` 11.3.1, Zod 4.6.5, dotenv 18.0.7, Mocha 11.8.0, Chai 4.5.0

**Spec:** `docs/superpowers/specs/2026-10-10-stage-0-backend-design.md`

## Global Constraints

- Preserve the Eclipse Theia `1.77.0-next.25` fork, its Git history, upstream scripts, and Rishit's existing commits.
- Use Node `24.21.0`, Yarn Classic `1.22.22`, and the existing Yarn lockfile/workspace model.
- The Electron-based Theia fork is the only IDE target; do not add Cursor, VS Code, code-server, or an IDE-adjacent fallback.
- Keep `ELEVENLABS_API_KEY` server-side and out of source, logs, tests, contracts, renderer code, and Git.
- Bind the development backend to `127.0.0.1` by default and do not add deployment or hosted infrastructure.
- Do not implement Gemini, lesson fixtures, session state, TTS generation, audio streaming, accounts, persistence, authentication, or analytics in Stage 0.
- Do not push, open a pull request, merge, deploy, or publish without Akshar's explicit approval after the required delivery summary.

## Review Focus

- A request with a hostile or unrelated `Origin` must not receive an allow-origin header; a configured local Theia origin must.
- A missing or whitespace-only `ELEVENLABS_API_KEY` must fail before any outbound request and must not appear in the error.
- An ElevenLabs 401/403 response body or response headers must not be echoed to the terminal because they may contain account or request details.
- A stalled ElevenLabs request must abort within the configured timeout and return a concise timeout error.
- Contract schemas must reject malformed revisions, missing phase IDs, and invalid source line ranges so the IDE and backend cannot silently disagree.

---

## File Structure

### New shared contract workspace

- `shared/contracts/package.json` — workspace metadata and package scripts.
- `shared/contracts/tsconfig.json` — composite TypeScript build configuration.
- `shared/contracts/src/index.ts` — public exports only.
- `shared/contracts/src/schemas.ts` — API schemas and inferred types.
- `shared/contracts/test/contracts.test.ts` — valid and invalid payload behavior.

### New backend workspace

- `backend/package.json` — backend runtime and test scripts.
- `backend/tsconfig.json` — composite TypeScript build configuration.
- `backend/.env.example` — documented variable names and safe defaults.
- `backend/src/config.ts` — environment parsing and validated `BackendConfig`.
- `backend/src/app.ts` — Fastify application factory, CORS, and `/health`.
- `backend/src/server.ts` — local process entry point and shutdown handling.
- `backend/src/providers/elevenlabs.ts` — bounded credential probe and sanitized errors.
- `backend/src/smoke-elevenlabs.ts` — CLI entry point with success/failure exit status.
- `backend/test/config.test.ts` — configuration defaults and rejection cases.
- `backend/test/health.test.ts` — exact health response and CORS behavior.
- `backend/test/elevenlabs.test.ts` — real local HTTP-server tests for provider behavior.

### Existing files to modify

- `package.json` — add workspaces and narrow Stage 0 scripts/dependencies.
- `tsconfig.json` — add project references for the two new workspaces.
- `.gitignore` — ignore secret-bearing `.env` files while retaining examples.
- `README.md` — add Akshar backend setup and Stage 0 commands.
- `DEV_SETUP.md` — document the two-process Theia/backend loop and local origin.
- `docs/Goldie_HackNC_PRD.md` — synchronize the checked-in PRD with the newer user-supplied PRD.

### Interfaces locked by this plan

```ts
export const HealthResponseSchema: z.ZodObject<{ ok: z.ZodLiteral<true> }>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export interface BackendConfig {
    host: string;
    port: number;
    allowedOrigin: string;
    elevenLabsApiKey?: string;
    elevenLabsBaseUrl: string;
    providerTimeoutMs: number;
}

export function loadConfig(env?: NodeJS.ProcessEnv): BackendConfig;
export function buildApp(config: BackendConfig): Promise<FastifyInstance>;

export interface ElevenLabsCheckOptions {
    apiKey: string;
    baseUrl: string;
    timeoutMs: number;
}

export interface ElevenLabsCheckResult {
    ok: true;
}

export function checkElevenLabsCredential(options: ElevenLabsCheckOptions): Promise<ElevenLabsCheckResult>;
```

### Task 1: Freeze the Shared API Contract

**Files:**
- Create: `shared/contracts/package.json`
- Create: `shared/contracts/tsconfig.json`
- Create: `shared/contracts/src/index.ts`
- Create: `shared/contracts/src/schemas.ts`
- Create: `shared/contracts/test/contracts.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: The endpoint minimums in `docs/superpowers/specs/2026-10-10-stage-0-backend-design.md` and the supplied PRD.
- Produces: Zod schemas and inferred types exported by `@goldie/contracts`, especially `HealthResponseSchema` and `HealthResponse`.

- [ ] **Step 1: Add workspace metadata and the failing contract test**

Add `backend` and `shared/*` to the root `workspaces`, then create this package manifest:

```json
{
  "private": true,
  "name": "@goldie/contracts",
  "version": "0.0.0",
  "main": "lib/src/index.js",
  "types": "lib/src/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "clean": "rimraf lib *.tsbuildinfo",
    "test": "yarn build && mocha \"lib/test/**/*.test.js\""
  },
  "dependencies": {
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/chai": "^4.3.20",
    "@types/mocha": "10.0.10",
    "chai": "^4.5.0",
    "mocha": "11.8.0",
    "rimraf": "^2.7.1",
    "typescript": "~5.9.3"
  }
}
```

Create `shared/contracts/tsconfig.json` extending `../../configs/base.tsconfig.json`, with `rootDir: "."`, `outDir: "lib"`, and includes for `src/**/*.ts` and `test/**/*.ts`. Add the workspace to the root `tsconfig.json` references.

Create `shared/contracts/test/contracts.test.ts` with tests that name the production behaviors:

```ts
import { expect } from 'chai';
import {
    AskRequestSchema,
    HealthResponseSchema,
    SessionResponseSchema,
    SourceExcerptSchema
} from '../src';

describe('Goldie API contracts', () => {
    it('accepts only the exact successful health payload', () => {
        expect(HealthResponseSchema.parse({ ok: true })).to.deep.equal({ ok: true });
        expect(() => HealthResponseSchema.parse({ ok: false })).to.throw();
        expect(() => HealthResponseSchema.parse({ ok: true, provider: 'ready' })).to.throw();
    });

    it('rejects malformed revisions and phases without stable IDs', () => {
        expect(() => SessionResponseSchema.parse({
            sessionId: 'session-1',
            snapshotRevision: -1,
            phases: []
        })).to.throw();
        expect(() => SessionResponseSchema.parse({
            sessionId: 'session-1',
            snapshotRevision: 1,
            phases: [{ title: 'Sessions', objective: 'Understand access control', description: '...' }]
        })).to.throw();
    });

    it('rejects source excerpts whose line range runs backwards', () => {
        expect(() => SourceExcerptSchema.parse({
            path: 'src/auth.ts',
            startLine: 20,
            endLine: 10,
            content: 'example'
        })).to.throw();
    });

    it('accepts a typed ask request without source evidence', () => {
        expect(AskRequestSchema.parse({
            sessionId: 'session-1',
            phaseId: 'phase-1',
            question: 'Why use sessions?',
            handoff: '# Goldie Handoff'
        })).to.deep.include({ phaseId: 'phase-1' });
    });
});
```

- [ ] **Step 2: Install dependencies and verify the contract test is red**

Run:

```bash
yarn --frozen-lockfile
yarn workspace @goldie/contracts test
```

Expected: the workspace install initially reports that the lockfile needs the new dependencies. Run `yarn install` once to update `yarn.lock`, then rerun the test. The test must fail because `../src` and the schemas do not exist, not because of an unrelated toolchain error.

- [ ] **Step 3: Implement the minimum strict contract schemas**

Create `shared/contracts/src/schemas.ts`. All object schemas use `.strict()`. Define:

```ts
import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1);
const RevisionSchema = z.number().int().nonnegative();
export const KnowledgeProfileSchema = z.record(z.string(), z.unknown());
export const PhaseSchema = z.object({
    id: IdentifierSchema,
    title: z.string().trim().min(1),
    objective: z.string().trim().min(1),
    description: z.string().trim().min(1)
}).strict();

export const SourceExcerptSchema = z.object({
    path: z.string().trim().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    content: z.string()
}).strict().refine(value => value.endLine >= value.startLine, {
    message: 'endLine must be greater than or equal to startLine'
});

export const HealthResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const OfferRequestSchema = z.object({
    projectId: IdentifierSchema,
    revision: RevisionSchema,
    handoff: z.string(),
    profile: KnowledgeProfileSchema
}).strict();
export const OfferResponseSchema = z.object({
    shouldOffer: z.boolean(),
    previewTopics: z.array(z.string().trim().min(1)),
    offerId: IdentifierSchema.optional()
}).strict();
export const SessionRequestSchema = z.object({
    offerId: IdentifierSchema,
    revision: RevisionSchema,
    handoff: z.string(),
    profile: KnowledgeProfileSchema
}).strict();
export const SessionResponseSchema = z.object({
    sessionId: IdentifierSchema,
    snapshotRevision: RevisionSchema,
    phases: z.array(PhaseSchema)
}).strict();
export const TeachRequestSchema = z.object({
    sessionId: IdentifierSchema,
    phaseId: IdentifierSchema,
    handoff: z.string(),
    profile: KnowledgeProfileSchema
}).strict();
export const TeachResponseSchema = z.object({
    explanation: z.string(),
    groundingStatus: z.enum(['conceptual', 'inferred', 'observed']),
    audioUrl: z.string().url().optional()
}).strict();
export const AskRequestSchema = z.object({
    sessionId: IdentifierSchema,
    phaseId: IdentifierSchema,
    question: z.string().trim().min(1),
    handoff: z.string(),
    sources: z.array(SourceExcerptSchema).optional()
}).strict();
export const AskResponseSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('answer'),
        answer: z.string(),
        resumePhaseId: IdentifierSchema
    }).strict(),
    z.object({
        kind: z.literal('needs_sources'),
        sourceQueries: z.array(z.string().trim().min(1)),
        resumePhaseId: IdentifierSchema
    }).strict()
]);
export const CompleteRequestSchema = z.object({
    sessionId: IdentifierSchema,
    status: z.enum(['completed', 'dismissed']),
    currentRevision: RevisionSchema,
    handoff: z.string(),
    learningState: z.record(z.string(), z.unknown())
}).strict();
export const CompleteResponseSchema = z.object({
    recap: z.string(),
    catchupOffer: OfferResponseSchema.optional(),
    lastEvaluatedRevision: RevisionSchema
}).strict();
export const SpeechRequestSchema = z.object({ text: z.string().trim().min(1) }).strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type OfferRequest = z.infer<typeof OfferRequestSchema>;
export type OfferResponse = z.infer<typeof OfferResponseSchema>;
export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type TeachRequest = z.infer<typeof TeachRequestSchema>;
export type TeachResponse = z.infer<typeof TeachResponseSchema>;
export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
```

Create `shared/contracts/src/index.ts` that exports every schema and inferred type from `./schemas`.

- [ ] **Step 4: Verify contracts are green**

Run:

```bash
yarn workspace @goldie/contracts test
yarn workspace @goldie/contracts build
```

Expected: all four contract tests pass and TypeScript emits declarations without diagnostics.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add package.json yarn.lock tsconfig.json shared/contracts
git commit -m "feat: define Goldie API contracts"
```

### Task 2: Add the Local Health Service

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/config.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Create: `backend/test/config.test.ts`
- Create: `backend/test/health.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `HealthResponseSchema` and `HealthResponse` from `@goldie/contracts`.
- Produces: `BackendConfig`, `loadConfig`, `buildApp`, and a process that serves `GET /health`.

- [ ] **Step 1: Add backend workspace metadata and failing configuration tests**

Create `backend/package.json` with exact dependencies `@goldie/contracts: "0.0.0"`, `fastify: "5.12.5"`, `@fastify/cors: "11.3.1"`, and `dotenv: "18.0.7"`; dev dependencies use the repository's TypeScript, Mocha, Chai, and Node types. Scripts:

```json
{
  "build": "tsc -b",
  "clean": "rimraf lib *.tsbuildinfo",
  "start": "node lib/src/server.js",
  "test": "yarn build && mocha \"lib/test/**/*.test.js\"",
  "smoke:elevenlabs": "node lib/src/smoke-elevenlabs.js"
}
```

Create `backend/tsconfig.json` with the same root/out directories as contracts and a project reference to `../shared/contracts`.

Create `backend/test/config.test.ts`:

```ts
import { expect } from 'chai';
import { loadConfig } from '../src/config';

describe('backend configuration', () => {
    it('uses loopback-only defaults', () => {
        const config = loadConfig({});
        expect(config.host).to.equal('127.0.0.1');
        expect(config.port).to.equal(8787);
        expect(config.allowedOrigin).to.equal('http://127.0.0.1:3000');
    });

    it('rejects an invalid port', () => {
        expect(() => loadConfig({ GOLDIE_BACKEND_PORT: 'not-a-port' }))
            .to.throw('GOLDIE_BACKEND_PORT must be an integer between 1 and 65535');
    });

    it('normalizes a whitespace-only provider key to missing', () => {
        expect(loadConfig({ ELEVENLABS_API_KEY: '   ' }).elevenLabsApiKey).to.equal(undefined);
    });
});
```

- [ ] **Step 2: Verify configuration tests fail for the missing module**

Run `yarn workspace @goldie/backend test`.

Expected: FAIL because `../src/config` does not exist.

- [ ] **Step 3: Implement configuration parsing**

Implement `BackendConfig` and `loadConfig(env = process.env)` in `backend/src/config.ts`. Parse integers with a helper that rejects non-digits and out-of-range values. Defaults:

```ts
{
    host: '127.0.0.1',
    port: 8787,
    allowedOrigin: 'http://127.0.0.1:3000',
    elevenLabsApiKey: undefined,
    elevenLabsBaseUrl: 'https://api.elevenlabs.io',
    providerTimeoutMs: 5000
}
```

Trim string values. Accept overrides from `GOLDIE_BACKEND_HOST`, `GOLDIE_BACKEND_PORT`, `GOLDIE_ALLOWED_ORIGIN`, `ELEVENLABS_API_KEY`, `ELEVENLABS_BASE_URL`, and `GOLDIE_PROVIDER_TIMEOUT_MS`.

- [ ] **Step 4: Verify configuration tests pass**

Run `yarn workspace @goldie/backend test`.

Expected: three passing tests.

- [ ] **Step 5: Write failing health and CORS tests**

Create `backend/test/health.test.ts`:

```ts
import { expect } from 'chai';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

describe('GET /health', () => {
    it('returns the exact shared health contract', async () => {
        const app = await buildApp(loadConfig({}));
        const response = await app.inject({ method: 'GET', url: '/health' });
        await app.close();
        expect(response.statusCode).to.equal(200);
        expect(response.json()).to.deep.equal({ ok: true });
    });

    it('allows only the configured local origin', async () => {
        const app = await buildApp(loadConfig({ GOLDIE_ALLOWED_ORIGIN: 'http://127.0.0.1:3000' }));
        const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://127.0.0.1:3000' } });
        const rejected = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://attacker.example' } });
        await app.close();
        expect(allowed.headers['access-control-allow-origin']).to.equal('http://127.0.0.1:3000');
        expect(rejected.headers['access-control-allow-origin']).to.equal(undefined);
    });
});
```

- [ ] **Step 6: Verify health tests fail for the missing app factory**

Run `yarn workspace @goldie/backend test`.

Expected: FAIL because `../src/app` does not exist.

- [ ] **Step 7: Implement the app and process entry point**

In `backend/src/app.ts`, register `@fastify/cors` with an origin callback that accepts requests with no origin and the single configured origin, but returns `false` for all others. Register `GET /health` and pass its response through `HealthResponseSchema.parse({ ok: true })` before returning it.

In `backend/src/server.ts`, call `dotenv.config({ path: path.resolve(__dirname, '../../.env') })` so both direct and root workspace commands resolve `backend/.env` from compiled `lib/src`. Load configuration, build the app, listen on the configured host/port, and close gracefully on `SIGINT`/`SIGTERM`. Log only the local listening URL; never log the configuration object.

Add root scripts:

```json
{
  "backend:build": "yarn workspace @goldie/backend build",
  "backend:test": "yarn workspace @goldie/backend test",
  "backend:start": "yarn workspace @goldie/backend start",
  "backend:smoke:elevenlabs": "yarn workspace @goldie/backend smoke:elevenlabs"
}
```

- [ ] **Step 8: Verify health and configuration behavior**

Run:

```bash
yarn backend:test
yarn backend:build
```

Expected: five passing tests and a clean TypeScript build.

- [ ] **Step 9: Commit the runnable health service**

```bash
git add package.json yarn.lock tsconfig.json backend
git commit -m "feat: add Goldie backend health service"
```

### Task 3: Add the ElevenLabs Credential Smoke Check

**Files:**
- Create: `backend/src/providers/elevenlabs.ts`
- Create: `backend/src/smoke-elevenlabs.ts`
- Create: `backend/test/elevenlabs.test.ts`
- Create: `backend/.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `BackendConfig.elevenLabsApiKey`, `elevenLabsBaseUrl`, and `providerTimeoutMs`.
- Produces: `checkElevenLabsCredential(options): Promise<{ ok: true }>` and `yarn backend:smoke:elevenlabs`.

- [ ] **Step 1: Protect environment files before adding provider code**

Add these rules to `.gitignore`:

```gitignore
**/.env
**/.env.*
!**/.env.example
```

Create `backend/.env.example`:

```dotenv
GOLDIE_BACKEND_HOST=127.0.0.1
GOLDIE_BACKEND_PORT=8787
GOLDIE_ALLOWED_ORIGIN=http://127.0.0.1:3000
GOLDIE_PROVIDER_TIMEOUT_MS=5000
ELEVENLABS_API_KEY=
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
```

- [ ] **Step 2: Write failing tests using a real local HTTP server**

Create a small `withServer` helper inside `backend/test/elevenlabs.test.ts` using `node:http.createServer`, listen on `127.0.0.1` and an ephemeral port, pass its base URL to each test, and always close it in `finally`.

Add these tests:

```ts
it('sends the credential only in the xi-api-key header to /v1/models', async () => {
    // Local server asserts method, path, and header, then returns 200 JSON.
    const result = await checkElevenLabsCredential({ apiKey: 'test-secret', baseUrl, timeoutMs: 500 });
    expect(result).to.deep.equal({ ok: true });
});

it('rejects a blank key before making a request', async () => {
    let requestCount = 0;
    // Local server increments requestCount if contacted.
    await expectRejected(
        checkElevenLabsCredential({ apiKey: '   ', baseUrl, timeoutMs: 500 }),
        'ELEVENLABS_API_KEY is required'
    );
    expect(requestCount).to.equal(0);
});

it('sanitizes provider authentication failures', async () => {
    // Local server returns 401 with body "account-for-test-secret" and x-request-id.
    const error = await captureError(checkElevenLabsCredential({ apiKey: 'test-secret', baseUrl, timeoutMs: 500 }));
    expect(error.message).to.equal('ElevenLabs credential check failed with status 401');
    expect(error.message).not.to.contain('test-secret');
    expect(error.message).not.to.contain('account-for-test-secret');
});

it('aborts a stalled provider request', async () => {
    // Local server delays longer than timeoutMs.
    await expectRejected(
        checkElevenLabsCredential({ apiKey: 'test-secret', baseUrl, timeoutMs: 20 }),
        'ElevenLabs credential check timed out'
    );
});
```

The helper functions must assert that a promise rejects and return the real `Error`; do not replace the network call with a mocked fetch.

- [ ] **Step 3: Run the provider test and verify red**

Run `yarn workspace @goldie/backend test`.

Expected: FAIL because `../src/providers/elevenlabs` does not exist.

- [ ] **Step 4: Implement the bounded provider probe**

Implement `checkElevenLabsCredential` with Node's built-in `fetch` and `AbortSignal.timeout(options.timeoutMs)`. Normalize the base URL by removing trailing slashes, then call `${baseUrl}/v1/models` with method `GET`, `Accept: application/json`, and the trimmed key in the `xi-api-key` header.

Behavior:

```ts
if (!options.apiKey.trim()) {
    throw new Error('ELEVENLABS_API_KEY is required');
}
if (!response.ok) {
    throw new Error(`ElevenLabs credential check failed with status ${response.status}`);
}
return { ok: true };
```

Translate an abort/timeout failure to `ElevenLabs credential check timed out`. Translate other fetch failures to `ElevenLabs credential check could not reach the provider`. Never include the original response body, headers, URL query, API key, or raw error message.

- [ ] **Step 5: Implement the smoke CLI**

In `backend/src/smoke-elevenlabs.ts`, load `backend/.env` using `path.resolve(__dirname, '../../.env')`, call `loadConfig`, reject a missing key, call the provider probe, and write exactly `ElevenLabs credential check passed.\n` on success. On failure, write the sanitized `Error.message` to stderr and set `process.exitCode = 1`. Do not print config or provider response data.

- [ ] **Step 6: Verify provider tests and secret hygiene**

Run:

```bash
yarn backend:test
rg -n "xi-api-key|ELEVENLABS_API_KEY" backend shared .gitignore
git check-ignore backend/.env
git check-ignore backend/.env.example || true
```

Expected: nine total backend tests pass; `backend/.env` is ignored; `backend/.env.example` is not ignored; key references contain no real credential.

- [ ] **Step 7: Commit the credential checker**

```bash
git add .gitignore backend/.env.example backend/src/providers backend/src/smoke-elevenlabs.ts backend/test/elevenlabs.test.ts
git commit -m "feat: verify ElevenLabs credentials safely"
```

### Task 4: Align Documentation and Run the Stage 0 Gate

**Files:**
- Modify: `README.md`
- Modify: `DEV_SETUP.md`
- Modify: `docs/Goldie_HackNC_PRD.md`
- Verify only: all files changed in Tasks 1–3

**Interfaces:**
- Consumes: all Stage 0 commands and environment names implemented above.
- Produces: teammate setup instructions and evidence for Akshar's Stage 0 completion packet.

- [ ] **Step 1: Synchronize the authoritative PRD**

Replace the repository's older `docs/Goldie_HackNC_PRD.md` with the exact newer PRD supplied at `/Users/aksharkakkad/Downloads/Goldie_HackNC_PRD (1).md`. Verify the checked-in Stage 0 row requires the Theia panel, `/health`, stable contracts, and a genuine ElevenLabs credential check, and that its fallback language no longer governs this project choice.

- [ ] **Step 2: Document the backend setup**

Add to `README.md`:

````markdown
### Goldie backend

```sh
cp backend/.env.example backend/.env
# Add ELEVENLABS_API_KEY to backend/.env; never commit this file.
yarn backend:build
yarn backend:test
yarn backend:start
```

The local service listens at `http://127.0.0.1:8787` by default. Verify it with
`curl http://127.0.0.1:8787/health`, then run `yarn backend:smoke:elevenlabs`.
````

Add a matching two-terminal workflow to `DEV_SETUP.md`: keep the existing Electron/watch process, run the backend separately, set `GOLDIE_ALLOWED_ORIGIN` only when the actual Theia development origin differs, and never place provider keys in frontend settings.

- [ ] **Step 3: Run the complete automated verification**

Run:

```bash
yarn workspace @goldie/contracts test
yarn backend:test
yarn workspace @goldie/contracts build
yarn backend:build
yarn lint
git diff --check
```

Expected: all new tests pass, both TypeScript workspaces build, repository lint succeeds, and the diff has no whitespace errors. If the upstream full lint reports a pre-existing failure, capture the exact command and output; do not conceal it.

- [ ] **Step 4: Verify the real local health socket**

Start `yarn backend:start`, then from a second process run:

```bash
curl --fail --silent http://127.0.0.1:8787/health
```

Expected output:

```json
{"ok":true}
```

Stop the backend cleanly and confirm it exits without a stack trace.

- [ ] **Step 5: Run the real ElevenLabs gate when the key is available**

Place the key only in `backend/.env`, run:

```bash
yarn backend:smoke:elevenlabs
```

Expected output: `ElevenLabs credential check passed.` with exit code 0. If no key is available, record Stage 0 as code-complete but provider-unverified; do not fabricate or skip the gate.

- [ ] **Step 6: Inspect final scope and commit documentation**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff --check main...HEAD
git log --oneline main..HEAD
```

Confirm only Stage 0 backend, contracts, tests, current PRD, and setup documentation changed. Then commit:

```bash
git add README.md DEV_SETUP.md docs/Goldie_HackNC_PRD.md
git commit -m "docs: document Goldie stage 0 setup"
```

- [ ] **Step 7: Prepare the cross-owner exit check**

Give Rishit these exact integration values without pushing or merging:

```text
Backend URL: http://127.0.0.1:8787
Health route: GET /health
Success JSON: {"ok":true}
Shared package: @goldie/contracts
Allowed origin override: GOLDIE_ALLOWED_ORIGIN=<actual Theia origin>
```

Stage 0 becomes fully integrated only after the real Theia panel calls this route from merged `main`. Akshar's backend portion is complete when automated checks, local socket verification, and the real ElevenLabs smoke gate pass.
