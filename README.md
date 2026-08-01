# RepoCanvas

RepoCanvas is a reusable React and TypeScript whiteboard for keeping visual project context alongside the application that owns it. It provides a controlled editor, a persistence-aware canvas, and an optional searchable whiteboard library powered by Excalidraw.

```bash
npm install @beetroot11/repocanvas
```

## Choose the integration level

```tsx
// Existing domain object: no RepoCanvas storage adapter required.
import { RepoCanvasEditor } from '@beetroot11/repocanvas/editor'

<RepoCanvasEditor document={diagram} onChange={setDiagram} />
```

```tsx
// Complete library, autosave, recovery, and navigation.
import {
  IndexedDbWhiteboardStorageAdapter,
  WhiteboardWorkspace,
} from '@beetroot11/repocanvas'

const storage = new IndexedDbWhiteboardStorageAdapter()

<main style={{ height: '100dvh' }}>
  <WhiteboardWorkspace storage={storage} />
</main>
```

When a board is open, users can hide or restore its board list using the workspace button or `Ctrl/⌘+Shift+L`. The preference is retained in browser storage so the canvas can keep the maximum available space.

## Highlights

- Controlled `RepoCanvasEditor` for storage-independent embedding
- Full, minimal, read-only, and zero-chrome surfaces
- Create, rename, duplicate, tag, search, archive, restore, and thumbnail flows
- Empty, system architecture, data-flow, ADR, and incident templates
- Debounced serialized autosave with capped exponential retry
- Revision conflicts, recovered copies, deterministic JSON export, and a browser recovery journal
- PNG, SVG, clipboard, RepoCanvas JSON, and ordinary Excalidraw JSON interoperability
- Developer-resource links for files, symbols, commits, issues, routes, and URLs
- In-memory, LocalStorage, IndexedDB, and HTTP storage adapters
- A framework-neutral contract verifier for custom storage adapters
- Mouse, keyboard, touch protection, Pencil-first input, connector binding, and fullscreen
- Split `core`, `editor`, `library`, and `testing` package entry points
- CLI validation, migration, formatting, and SVG rendering

## Workspace

```text
apps/example/                  local demonstration app
packages/repocanvas/           reusable package and CLI
docs/ARCHITECTURE.md           layers, state, and extension boundaries
docs/HTTP-ADAPTER.md           reference API contract
docs/INPUT-SPIKE.md            physical Pencil/touch acceptance checklist
e2e/                           Playwright browser coverage
```

## Develop and verify

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run verify
```

The example runs at `http://localhost:5173` by default. Browser tests require Playwright Chromium (`npx playwright install chromium`).

Simultaneous Pencil drawing and finger manipulation remains a hardware/browser acceptance criterion. Run [the physical iPad checklist](docs/INPUT-SPIKE.md) before making that claim for a production deployment.

See the [package integration guide](packages/repocanvas/README.md), [changelog](CHANGELOG.md), and [contributing guide](CONTRIBUTING.md).

## Licence

RepoCanvas is available under the [MIT licence](LICENSE). Excalidraw is also MIT-licensed.
