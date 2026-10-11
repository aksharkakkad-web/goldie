# Tested Team Tasks demo

This is the completed Next.js app built through native Goldie Codex chat during the
Stage 4 walkthrough. The create-task feature already exists here; use a separate
fresh starter for a live coding demonstration. This is a source backup, not a video.

From this directory, with Node 24 and Yarn Classic:

```sh
yarn --frozen-lockfile
yarn test
yarn dev --webpack --port 3111
```

The form calls POST /api/tasks. The server requires a nonempty trimmed title of at
most 120 characters and writes local data/tasks.json using atomic replacement.
GET returns the three starter tasks plus saved tasks. This is single-user demo
storage; it does not prevent concurrent writes from overwriting each other.

Stop the dev server before running yarn build because both use .next. No provider
keys are needed for the task app. Goldie itself uses the separate backend's private
configuration. Saved tasks, handoff history, account settings, dependencies, and
build outputs were excluded from this copy. See ../../docs/JUDGE_DEMO.md.
