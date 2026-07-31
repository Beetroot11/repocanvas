# RepoCanvas

RepoCanvas is a reusable React and TypeScript package for keeping visual project context inside the project where it belongs. It provides a whiteboard library and an effectively endless Excalidraw-powered canvas, while leaving authentication and persistence to the host application.

The package is named `@beetroot11/repocanvas`.

Add it to an existing React application with one command—the editor, visual assets, and styles are bundled with it, with no separate CSS import:

```bash
npm install @beetroot11/repocanvas
```

## What is implemented

- Multiple independent whiteboards
- Create, open, rename, duplicate, archive, and restore flows
- Rectangle, circle, diamond, connector, pen, eraser, undo, and redo tools
- Visible connector edge lock points while arrow endpoints are dragged over a target
- Shape labels and durable connected arrows through Excalidraw
- Debounced, serialized autosave of document-only snapshots
- Optimistic revision conflicts with recovery-copy and JSON export actions
- Offline/save-failure status without discarding local edits
- Native fullscreen plus a layout fallback that keeps the editor mounted
- Mouse and keyboard tools, touch protection, and Pencil-first input policy
- In-memory and browser-local storage adapters
- A versioned RepoCanvas document envelope that does not expose Excalidraw records
- A persistent example application that begins with an empty library
- A first-class `WhiteboardSurface` canvas-only embed with minimal or zero package chrome

## Workspace

```text
apps/example/              local demonstration app
packages/repocanvas/       reusable package
docs/INPUT-SPIKE.md        input-engine findings and physical test checklist
```

## Run it

```bash
npm install
npm run dev
```

The example runs at `http://localhost:5173` by default.

```bash
npm test
npm run typecheck
npm run build
```

## Important status note

The engine and browser-level input policy are implemented, but simultaneous Pencil writing and finger manipulation still needs verification on a physical iPad in Safari. RepoCanvas does not claim that hardware-dependent acceptance criterion yet; use the checklist in [docs/INPUT-SPIKE.md](docs/INPUT-SPIKE.md).

See [packages/repocanvas/README.md](packages/repocanvas/README.md) for installation and integration details.
