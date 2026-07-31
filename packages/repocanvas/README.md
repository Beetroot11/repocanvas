# `@andrew/repocanvas`

A private visual notebook for every project, packaged as reusable React components.

## Install

```bash
npm install @andrew/repocanvas
```

That is the only RepoCanvas package an existing React application needs. The editor, icons, fonts, styles, and their runtime code ship inside RepoCanvas; React 18.2+ or React 19 remains a peer so the host and canvas share one React instance. Excalidraw is MIT-licensed and does not require a production key.

There is no separate stylesheet import. RepoCanvas injects its compiled styles once when the package loads. In a strict Content Security Policy host, provide the page's nonce through `<meta property="csp-nonce" content="…" />`.

## Smallest integration

```tsx
import {
  LocalStorageWhiteboardStorageAdapter,
  WhiteboardWorkspace,
} from '@andrew/repocanvas'

const storage = new LocalStorageWhiteboardStorageAdapter('my-project:whiteboards')

export function WhiteboardsPage() {
  return (
    <main style={{ height: '100dvh' }}>
      <WhiteboardWorkspace storage={storage} />
    </main>
  )
}
```

The local-storage adapter is intended for demonstrations and personal browser-local use. Production hosts should implement `WhiteboardStorageAdapter` over their own authenticated application API.

## Canvas-only embed

Use `WhiteboardSurface` when the host needs only the whiteboard—no library, board index, workspace frame, RepoCanvas masthead, or title bar:

```tsx
import { WhiteboardSurface } from '@andrew/repocanvas'

export function EmbeddedDiagram({ storage, id }: Props) {
  return (
    <div style={{ height: 640 }}>
      <WhiteboardSurface whiteboardId={id} storage={storage} />
    </div>
  )
}
```

The default `minimal` mode keeps the floating tool, zoom, fullscreen, save-recovery, and connector-lock UI. Pass `chrome="none"` when the host supplies every control itself. Autosave, save-status callbacks, recovery, Pencil/touch policy, and bindings continue to run in both modes:

```tsx
<WhiteboardSurface
  whiteboardId={id}
  storage={storage}
  chrome="none"
  onSaveStatusChange={(status) => hostToolbar.setSaveStatus(status)}
/>
```

## Route-controlled integration

```tsx
import {
  WhiteboardCanvas,
  WhiteboardLibrary,
  type WhiteboardStorageAdapter,
} from '@andrew/repocanvas'

export function LibraryRoute({ storage }: { storage: WhiteboardStorageAdapter }) {
  return (
    <WhiteboardLibrary
      storage={storage}
      onOpen={(id) => navigate(`/whiteboards/${id}`)}
    />
  )
}

export function CanvasRoute({ storage, id }: { storage: WhiteboardStorageAdapter; id: string }) {
  return (
    <WhiteboardCanvas
      storage={storage}
      whiteboardId={id}
      onBack={() => navigate('/whiteboards')}
      onRecoveredCopy={(copyId) => navigate(`/whiteboards/${copyId}`)}
    />
  )
}
```

`RepoCanvasProvider` can provide `storage` when several descendants use the package.

## Storage contract

```ts
interface WhiteboardStorageAdapter {
  list(): Promise<WhiteboardSummary[]>
  create(input: { title: string }): Promise<Whiteboard>
  load(id: string): Promise<Whiteboard>
  save(input: SaveWhiteboardInput): Promise<Whiteboard>
  rename(id: string, title: string): Promise<WhiteboardSummary>
  duplicate(id: string, title?: string): Promise<Whiteboard>
  archive(id: string): Promise<void>
  restore(id: string): Promise<void>
}
```

`save` receives an `expectedRevision`. The host must reject stale writes, ideally by throwing `RevisionConflictError`. RepoCanvas will stop autosaving, retain the local canvas, and offer **Save as copy** and **Export recovery**.

RepoCanvas stores the durable Excalidraw scene in its public envelope:

```ts
interface RepoCanvasDocument {
  formatVersion: 2
  engine: 'excalidraw'
  engineVersion?: string
  snapshot: unknown
}
```

The snapshot includes elements, files, and restorable canvas view state while keeping engine-specific types out of the public API.

## Autosave and recovery

- Document changes are debounced for 1 second by default.
- Saves are serialized so an older request cannot overwrite a newer request.
- Scene and restorable view changes are coalesced into the same debounced save.
- A pending save is flushed when the page becomes hidden when the platform permits.
- Offline, failed, and revision-conflict states keep the live editor intact.
- Failed work can be retried or exported as a RepoCanvas JSON recovery file.
- A conflict can be written into a newly created recovered board.

## Input policy

- Pencil pointers switch to natural freehand drawing.
- Touch pointers are prevented from drawing when the pen tool is active.
- Mouse users choose tools explicitly.
- Excalidraw's keyboard shortcuts remain available for its drawing tools.
- Dragging an arrow endpoint over a bindable shape shows its target highlight and four edge lock points. Dropping creates a durable binding, so the connector follows the shape when it moves.

Touch/Pencil concurrency is partly controlled by browser and engine pointer handling. Do not treat it as production-proven until the physical Safari checklist in the repository has passed.

## Editor licence

RepoCanvas uses the MIT-licensed Excalidraw editor package. There is no RepoCanvas editor licence prop, runtime key, production watermark requirement, or paid deployment gate.

## Public exports

- `WhiteboardWorkspace`
- `WhiteboardLibrary`
- `WhiteboardCanvas`
- `WhiteboardSurface`
- `RepoCanvasProvider`
- `InMemoryWhiteboardStorageAdapter`
- `LocalStorageWhiteboardStorageAdapter`
- RepoCanvas document, whiteboard, save, error, and storage types
