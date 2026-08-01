# `@beetroot11/repocanvas`

A reusable React whiteboard with controlled, persistence-aware, and complete-library integration levels.

## Install and compatibility

```bash
npm install @beetroot11/repocanvas
```

| Dependency | Supported |
| --- | --- |
| React / React DOM | 18.2+ and 19 |
| Excalidraw | `^0.18.1` |
| TypeScript | Declarations included |
| Rendering | Modern evergreen browsers |
| Server import | Safe; the editor still renders on the client |

Styled entry points inject their compiled styles once, including Excalidraw styles and the bundled font. A strict CSP host can provide `<meta property="csp-nonce" content="…" />`. The `core` and `testing` subpaths do not inject styles or import React.

## Controlled editor

Use the controlled editor when your application already owns the document and save lifecycle:

```tsx
import { useRef, useState } from 'react'
import {
  RepoCanvasEditor,
  type RepoCanvasDocument,
  type RepoCanvasEditorHandle,
} from '@beetroot11/repocanvas/editor'
import { createEmptyDocument } from '@beetroot11/repocanvas/core'

export function DiagramField() {
  const [document, setDocument] = useState<RepoCanvasDocument>(createEmptyDocument())
  const editor = useRef<RepoCanvasEditorHandle>(null)

  return (
    <div style={{ height: 640 }}>
      <RepoCanvasEditor
        ref={editor}
        document={document}
        onChange={setDocument}
        theme="system"
        tools={{ image: true }}
      />
    </div>
  )
}
```

Set `readOnly`, `locale`, `grid`, `pencilMode`, `className`, `style`, or `renderTopRightUI` as needed. Change `documentKey` to intentionally reset the editor scene and undo history.

The handle exposes document capture/replacement, focus, zoom-to-fit, tool selection, fullscreen, PNG/SVG/JSON export, clipboard export, thumbnail generation, and resource attachment.

## Persistence-aware canvas

```tsx
import { useRef } from 'react'
import {
  WhiteboardSurface,
  type WhiteboardCanvasHandle,
} from '@beetroot11/repocanvas/editor'

const canvas = useRef<WhiteboardCanvasHandle>(null)

<WhiteboardSurface
  ref={canvas}
  whiteboardId={id}
  storage={storage}
  chrome="none"
  onSaveStatusDetailChange={(detail) => hostToolbar.setSaveState(detail)}
/>

// Host-provided controls remain possible with zero package chrome.
await canvas.current?.save()
await canvas.current?.download('svg')
await canvas.current?.saveAsCopy()
```

Autosave uses a one-second debounce by default, serializes writes, flushes before internal back navigation, ignores stale board requests, and retries ordinary failures with capped exponential backoff. Offline and conflict states retain the current editor. A LocalStorage-plus-IndexedDB recovery journal restores dirty work after an interrupted browser session.

## Complete workspace

```tsx
import {
  IndexedDbWhiteboardStorageAdapter,
  WhiteboardWorkspace,
} from '@beetroot11/repocanvas'

const storage = new IndexedDbWhiteboardStorageAdapter({ databaseName: 'my-product-whiteboards' })

<WhiteboardWorkspace
  storage={storage}
  libraryTitle="Project diagrams"
  libraryProps={{ productName: 'My Product', projectId, logo: <MyLogo /> }}
  canvasProps={{ theme: 'system', tools: { image: true } }}
/>
```

The board list is collapsible by button or `Ctrl/⌘+Shift+L`. Configure `initialLibraryCollapsed`, `persistLayoutKey`, `showLibraryToggle`, or `onLibraryCollapsedChange` to integrate it with the host layout.

The library supports title/tag search, tag filters, real thumbnails, templates, project scoping, archives, and an accessible mobile overflow menu.

## Storage adapters

- `InMemoryWhiteboardStorageAdapter`: tests, previews, and ephemeral sessions
- `LocalStorageWhiteboardStorageAdapter`: small personal browser-local libraries with cross-tab refresh
- `IndexedDbWhiteboardStorageAdapter`: larger browser-local libraries and embedded images
- `FetchWhiteboardStorageAdapter`: authenticated host API integration

Production hosts can implement `WhiteboardStorageAdapter`. Optimistic operations receive an expected revision and should throw `RevisionConflictError` for stale writes. Optional `updateMetadata`, `remove`, `subscribe`, and `listPage` capabilities progressively enhance the library.

Validate an implementation without coupling to a test framework:

```ts
import { verifyWhiteboardStorageAdapter } from '@beetroot11/repocanvas/testing'

await verifyWhiteboardStorageAdapter(() => new MyStorageAdapter(testApi))
```

See the repository’s `docs/HTTP-ADAPTER.md` for the fetch contract.

## Documents, imports, and source control

```ts
interface RepoCanvasDocument {
  formatVersion: 2
  engine: 'excalidraw'
  engineVersion?: string
  snapshot: unknown
  metadata?: {
    templateId?: string
    resources?: Record<string, RepoCanvasResource>
  }
}
```

`migrateDocument` accepts RepoCanvas v1, v2, and ordinary Excalidraw JSON. `serializeRepoCanvasDocument` sorts object keys while preserving arrays, producing deterministic JSON suitable for fixtures and source control.

Use `createDocumentFromMermaid`, `createDocumentFromMarkdown`, or `createDocumentFromCode` to turn developer-friendly text into an editable canvas. The persistence-aware canvas also recognizes `.mmd`, `.md`, common source-code extensions, RepoCanvas JSON, and Excalidraw JSON from its import control.

```bash
npx repocanvas validate diagram.json
npx repocanvas upgrade old.json upgraded.json
npx repocanvas format diagram.json
npx repocanvas render diagram.json diagram.svg
```

## Templates and developer resources

The default library includes system architecture, data-flow, architecture-decision, and incident-timeline templates. Pass your own `RepoCanvasTemplate[]` to `WhiteboardLibrary`.

Attach a file, symbol, commit, issue, route, or URL to selected shapes using the editor handle. `onResourceOpen` keeps navigation host-owned, allowing integrations with IDE routes, GitHub, issue trackers, or internal applications without coupling RepoCanvas to them.

## Styling

Use `className`/`style` and override the documented variables on the component itself:

```tsx
<RepoCanvasEditor
  style={{
    '--rc-orange': '#8b5cf6',
    '--rc-blue': '#06b6d4',
    '--rc-field': '#f8fafc',
  } as React.CSSProperties}
  document={document}
/>
```

Stable variables include `--rc-ink`, `--rc-ink-soft`, `--rc-panel`, `--rc-panel-raised`, `--rc-paper`, `--rc-field`, `--rc-field-deep`, `--rc-rule`, `--rc-orange`, `--rc-blue`, `--rc-green`, `--rc-red`, and `--rc-radius`.

## Entry points

- `@beetroot11/repocanvas`: complete API with styles
- `@beetroot11/repocanvas/core`: documents and adapters, no React or styles
- `@beetroot11/repocanvas/editor`: editor/canvas components with styles
- `@beetroot11/repocanvas/library`: provider/library/workspace with styles and a lazy canvas
- `@beetroot11/repocanvas/testing`: adapter contract verifier, no React or styles

## Input status

Pencil selects freehand drawing, touch exits freehand so fingers manipulate the view, and mouse users select tools normally. Simultaneous Pencil and touch depends on Safari and Excalidraw pointer handling; complete the repository’s physical-device checklist before treating it as production-proven.
