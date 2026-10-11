# Temporary judging deployment

Akshar approved Vercel + a protected temporary Cloudflare connection on October 11.
This is a judging setup, **not an independently hosted or production backend**.

Website: https://goldie-judge-demo.vercel.app

Vercel project: `goldie-judge-demo`, team `aksharkakkad-webs-projects`.

## Access and boundaries

Akshar explicitly requested a public website with **no login or passcode**.
Anyone with the link can open the IDE and use the shared demo budget. The opening
screen is branding only, not an authentication or provider-loading screen.
The server-to-server bridge still requires its separate secret, stored in the
ignored local file `backend/.data/web-demo-judge/private.json`. Never commit that
file or paste its bridge token into a browser, chat, log or document. Historical
judge username/password fields are unused. The provider `.env` remains on
the Mac; Gemini/ElevenLabs keys are **not** uploaded to Vercel or Cloudflare.

Website assets and allowlisted API requests are anonymous over HTTPS.
Vercel SSO is disabled only for this newly created project so judges need no Vercel
account. Its generated bridge secret is encrypted in Vercel environment storage.
The tunnel exposes only the loopback judge bridge—not the IDE, filesystem, terminal
or raw backend. It requires the separate secret, rejects browser Origin headers,
allowlists API methods/paths and strips all incoming credentials before forwarding.

The bridge reserves a conservative total **12,000 speech-text characters** and
**500 POST attempts** across all visitors, and allows at most two concurrent POSTs.
Reservations happen before upstream work; failures and speech-cache hits still
count. The total persists in `backend/.data/web-demo-judge/usage.json`. Unknown
speech content fails before upstream access; load the explanation again after a
bridge restart. Never delete/reset the usage file to bypass the limit without
Akshar's explicit approval. This is a request/character guard, not an ElevenLabs
billing/balance measurement. Read-only access, replay and browser audio resume do
not generate speech. Reaching the voice cap leaves text/read/finish usable.

## Keep running for judges

Keep the Mac awake, lid open, connected to the internet, and Codex running. A scoped
`caffeinate -i -w <cloudflared-pid>` prevents idle sleep only while the tunnel runs;
it does not prevent lid-close sleep, reboot, connectivity loss or manual shutdown.
Cloudflare Quick Tunnels have no uptime guarantee and change hostname on restart.

There are three owned services:

1. Existing connected launcher: website 4317 + isolated Stage 3 backend 8797.
2. Judge bridge 8798, started from this worktree with:

   ```sh
   GOLDIE_JUDGE_CONFIG=/Users/aksharkakkad/.codex/worktrees/goldie-web-demo/goldie/backend/.data/web-demo-judge/private.json yarn --cwd applications/web-demo start:judge-bridge
   ```

3. Temporary `cloudflared tunnel --url http://127.0.0.1:8798 --no-autoupdate --protocol http2`.

The official Cloudflare 2026.10.0 macOS arm64 archive was downloaded into
`/tmp/goldie-cloudflared.OfhyTy`, verified against its published SHA256
`a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70`, and extracted
locally. Nothing was installed globally. Its binary may disappear after temp-file
cleanup/reboot; reacquire the reviewed official release if necessary.

Do not start duplicates on occupied ports. To stop judging access, Ctrl-C only the
owned cloudflared process; the public website then shows the backend
unavailable. Do not stop or modify unrelated desktop/main-thread services.

If the tunnel restarts, update only `GOLDIE_JUDGE_BRIDGE_URL` in this project's
production environment to the new HTTPS `trycloudflare.com` origin and redeploy
the allowlisted output. Keep the same bridge secret and saved budget.
Do not put provider keys in the deployment environment.

## Rebuild/redeploy

From the repository root in this worktree:

```sh
yarn --cwd applications/web-demo test
yarn --cwd applications/web-demo build
yarn --cwd applications/web-demo build:judge
vercel --cwd applications/web-demo deploy --prebuilt --prod --yes --scope aksharkakkad-webs-projects --project goldie-judge-demo
```

Deployment still requires Akshar's explicit approval. `build:judge` copies only the
public HTML/CSS/seven browser modules, exact merged logo/shaders and two reviewed
gateway modules into `.vercel/output`. It uploads no repository, native tools,
provider keys, `.env`, private config, local sessions/audio or dependencies. API
responses are bounded at 4 MiB to remain below the function payload limit.

## Verified versus still open

- Public HTTPS page/assets load anonymously without an authentication challenge;
  private-file attempts return 404 and cross-origin requests fail closed. Direct
  unauthenticated tunnel requests still return 401.
- Deployed `/demo-config` reaches the real Mac backend `/health` through the tunnel.
  An unknown speech-content check returns 409 before any provider call.
- The complete real UI journey runs against the deployed assets in Chrome with all
  API responses controlled, including voice-question recording, lesson resume,
  practice/review, loading states, three widths and reduced motion.
- The actual Stage 3 backend routes/store also pass through the real judge
  gateway and budget bridge with controlled model/speech providers. Run with
  `GOLDIE_CONTRACT_JUDGE=1 GOLDIE_CONTRACT_BACKEND_ROOT=/absolute/built-checkout node applications/web-demo/test/contract-check.mjs`.
- No Gemini/ElevenLabs generation was used for deployment checks. **The complete
  live-provider browser rehearsal remains unverified**; Akshar should do that once
  before judging. Do not repeat paid audio smoke tests during automated QA.

Sources: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/),
[Vercel Build Output API](https://vercel.com/docs/build-output-api/primitives).
