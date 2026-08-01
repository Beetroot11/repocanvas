# Contributing

## Setup

```bash
npm ci
npm run dev
```

Use Node 20 or 22. Keep changes scoped, preserve public API compatibility where possible, and add a migration before changing the document format.

## Required checks

```bash
npm test
npm run typecheck
npm run build
npm run verify:package --workspace=@beetroot11/repocanvas
npm run verify:consumer --workspace=@beetroot11/repocanvas
```

For UI or input changes, install Chromium with `npx playwright install chromium` and run `npm run test:e2e`. Pencil/touch concurrency changes also require the physical checklist in `docs/INPUT-SPIKE.md`.

## Package boundaries

- `core` and `testing` must remain React- and style-free.
- Public APIs should use RepoCanvas-owned types instead of Excalidraw records.
- Storage implementations should pass `verifyWhiteboardStorageAdapter`.
- Do not add authentication, telemetry, or external network calls to the editor layer.

Update `CHANGELOG.md` for user-visible behavior. Use conventional, focused commit messages and include verification results in pull requests.
