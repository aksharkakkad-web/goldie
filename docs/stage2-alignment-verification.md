# Stage 2 alignment — local verification

Candidate: `/Users/aksharkakkad/.codex/worktrees/stage2-product-review/goldie`,
based on Rishit's `a0574c957b16303bcca5ec7e3ccc1cd573f43fcd`, with Akshar's
Stage 2 backend/contracts and the alignment repairs. Original
`/Users/aksharkakkad/goldie` is preserved. No push, merge, deployment, dependency
upgrade or billing change is included.

## Regressions and repairs

- Removed the client six-phase limit without relaxing progress/session invariants.
- Reconciled canonical backend errors with safe messages, RPC codes/retryability,
  and 20-second Gemini / 30-second offer-teach / 15-second ordinary acceptance /
  30-second speech transport deadlines (`teachingTimeoutMs`).
- Definitive acceptance rejection archives the exact intent, idempotently retires
  only matching recovery, returns to idle and unlocks context. Newer/different
  records and storage-failure recovery remain protected. Ambiguous failures still
  recover the exact accepted session without autoplay or duplication.

Tests were written and observed failing before the repairs. Logs:
`/tmp/goldie-alignment-transport-red.log`, `/tmp/goldie-alignment-recovery-red.log`,
`/tmp/goldie-alignment-windows-red.log`. Focused product verification then passed
118/118 checks in `/tmp/goldie-alignment-product-green.log`, including real HTTP
seven-/twelve-phase restart/recap and two-window conflict cases.

## Final verification

Verified October 10, 2026 with Node 24.21.0 / Yarn 1.22.22:

| Check | Result / evidence |
| --- | --- |
| `yarn test:stage2` | **211 passed**: 79 backend, 12 contracts, 119 product, one standalone health integration; cumulative Stage 0/1 coverage. `/tmp/goldie-alignment-stage2-final.log` |
| `yarn lint` | All seven workspaces passed; existing upstream warnings informational. `/tmp/goldie-alignment-lint-final.log` |
| `yarn electron build` | Browser, Node and Electron bundles: zero errors. `/tmp/goldie-alignment-electron-final.log` |
| `git diff --check` | Passed |
| Independent read-only review | No remaining Critical/Important/Minor findings; reviewer independently ran 101 API/controller/real-HTTP checks with pinned Node and checked the diff |
| Native integrated journey | **16 checks passed, zero renderer errors**; actual Gemini + ElevenLabs plus explicitly controlled failure/large-roadmap cases. `/tmp/goldie-alignment-native.log` |

Same-window Retry initially resumed the acceptance's original teach/play
continuation. An additional observed RED regression fixed it to restore paused
without teaching/speech (`/tmp/goldie-alignment-retry-red.log`). Review also caught
stale conflict guidance referring to removed offer controls; fixed with an RPC
regression (`/tmp/goldie-alignment-guidance-red.log`). Final product count is 119.

The broad upstream **`yarn test` is not green**. Both unbuilt packaged Electron
targets fail the `Correct window title` before-each hook in chrome-launcher
(`undefined.toString`), then after-each cleanup (`undefined.closeWindow`); Lerna
interrupts the run (exit 130). `/tmp/goldie-alignment-upstream-tests.log`.
`yarn electron package:preview` was not run. The documented packaged-test
prerequisite is separate from the successful actual native development-app gate;
neither result substitutes for the other.

## Native walkthrough and provenance

Artifacts:
`/var/folders/qr/0gfz5v8d76gch8wdknd578gc0000gn/T/goldie-stage2-aligned-native-9G2h5q/`.
`result.json` records all 16 checks and 85 HTTP responses (84 success and one
explicitly injected quota failure). `adaptation.json` records the live plans;
screenshots include beginner, intermediate lesson, narrow offer, cosmetic result,
controlled twelve-phase roadmap and full recap. Intermediate and full-recap
screenshots were opened and visually inspected. No broad responsive/accessibility
audit is claimed.

The repeatable local harness is `/tmp/playwright-test-goldie-stage2-pair.js`, run via:

```sh
node /Users/aksharkakkad/.codex/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/run.js /tmp/playwright-test-goldie-stage2-pair.js
```

It launches the actual built native Theia Electron app with isolated temporary
profiles, the actual Fastify backend on a random local port and its own JSON store.
Original ignored `.env` is loaded only inside the server/test process; both provider
keys are explicitly removed from Electron's environment. Only repository sample
handoffs are transmitted, never repository contents or credentials. Owned app and
backend processes close in `finally`; artifacts remain for inspection.

- Real local file picker: selected Markdown only, no generation on selection.
- Actual Gemini beginner offer; decline created no session/speech.
- Deliberately lost acceptance response **after** server commit; same-window Retry
  recovered the exact session without duplicate creation, teaching or autoplay.
- Explicit Prepare explanation generated a real Gemini lesson and actual new
  ElevenLabs MP3, played through Node/RPC and renderer Blob URL.
- Pause/resume, prepared API FAQ with matching cached real ElevenLabs audio,
  lazy Gemini Explain more with actual new ElevenLabs audio, then original-clip
  resume all passed without losing phase progress.
- Native app **and backend** restart restored accepted progress without teaching,
  speech or autoplay; early end produced a truthful partial recap.
- Same handoff with intermediate profile generated a real new roadmap **and
  spoken lesson**, not just inspected offer text.
- Changed narrow context generated a relevant real offer; cosmetic context
  produced no offer or audio.
- Actual backend shutdown produced Unavailable/disabled preparation; restart and
  explicit Retry reconnected. An explicitly injected `GEMINI_QUOTA` error separately
  proved safe fixed text, redaction, no automatic retry and manual recovery. This
  injected failure is not a claim of actual Google quota exhaustion.
- A separate controlled backend returned twelve phases and reused the exact
  matching real ElevenLabs lesson cache. Both provider credentials were disabled
  for this portion. It rendered all twelve phases, survived app/backend restart,
  and completed with **one covered, ten skipped, one self-reported familiar**.
  This is test data, not proof Gemini generated twelve phases. Real HTTP tests
  separately verify seven- and twelve-phase acceptance/actions/restart/recap.

An initial harness run used the wrong accessible button name after paused
recovery; the actual control was `Prepare explanation`, not `Play lesson audio`.
That run stopped before teaching/speech. `/tmp/goldie-alignment-native-selector.log`
and the `haHWcG` artifact directory retain the failure. The corrected successful
run above supersedes it; no provider failure or automatic paid retry was hidden.

## Semantic adaptation and limits

Human review of the successful run found meaningful adaptation, not just wording:

- Beginner: two phases, foundation-level client/server validation trust boundary
  followed by transactional team/owner consistency.
- Intermediate: one advanced phase on atomic transaction boundaries, partial
  failure, deduplication/idempotency, external side effects and contention.
- Narrow: one working-level runtime API validation objective, including erased
  TypeScript types and untrusted JSON. No unrelated curriculum was added.
- Cosmetic: no lesson.

The spoken intermediate lesson explicitly said implementation is planned, not
verified. The beginner lesson likewise described the planned app and qualified
security claims. One expanded clarification still used overly broad language
(server validation being mandatory “to guarantee data integrity and security”).
That should be read as a required boundary, **not sufficient or complete security**;
authorization, database constraints and business rules remain separate. Existing
prompt guidance discourages overclaims but cannot prove generated facts correct.
This known content-quality limitation is not hidden by the passing integration
checks; review generated teaching before a judged demo.

Provider latency/availability and billing-tier behavior cannot be established by
this successful run or mocks. There are no automatic retries/model fallbacks or
billing changes. The reviewer intentionally left native/semantic verification to
this walkthrough and uptime/billing guarantees unclaimed.

## Completion boundary

The local technical gate and the PRD's joint merged-main sign-off are separate.
No approval to push/merge is inferred. After approved delivery, Akshar and Rishit
must run §9.6 together before marking overall Stage 2 complete. Stage 3 freeform
Q&A, microphone, live Codex watching and source retrieval remain out of scope.
The verified candidate is retained locally on `codex/stage-2-aligned`;
remote delivery requires exact-candidate approval. No original checkout source,
user-owned `AGENTS.md`, credentials, lockfile or global Codex setup was edited.
The worktree and verification artifacts are retained; no destructive cleanup ran.

Delivery preparation reran `yarn test:stage2` (211 passed), `yarn lint`,
`yarn electron build` and `git diff --check` successfully on the same source.
Logs: `/tmp/goldie-stage2-delivery-tests.log`,
`/tmp/goldie-stage2-delivery-lint.log`, `/tmp/goldie-stage2-delivery-build.log`.
No additional live provider calls were made for delivery preparation.
