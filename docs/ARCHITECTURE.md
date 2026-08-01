# Architecture

RepoCanvas has three intentionally separate layers.

```text
RepoCanvasEditor        controlled document ↔ engine translation
        ↓
WhiteboardCanvas        load, autosave, retry, recovery, revision conflicts
        ↓
WhiteboardWorkspace     searchable library, navigation, collapsible layout
```

## Engine boundary

The public `RepoCanvasDocument` exposes an opaque snapshot rather than Excalidraw element types. Engine-specific types remain inside `RepoCanvasEditor`. The optional metadata sidecar maps element IDs to host-owned developer resources without requiring hosts to manipulate element records.

`migrateDocument`, `assertSupportedDocument`, and `serializeRepoCanvasDocument` are the only supported document-boundary operations. Arrays retain their order because element order is meaningful; object keys are sorted for deterministic output.

## Persistence state

The persistence wrapper tracks independent change and saved versions. A save captures its target version, board ID, revision, and session. Results from an earlier board session are ignored. Only one request is active at a time; edits arriving during a request remain dirty and schedule the next serialized save.

```text
idle/saved → dirty → saving → saved
                    ├→ offline → saving when online
                    ├→ failed  → capped exponential retry or manual retry
                    └→ conflict → save as copy or export recovery
```

Every document change is also written to the browser recovery journal on a best-effort basis. LocalStorage provides a synchronous emergency copy; IndexedDB supports larger documents. A successful current-version save clears both.

## Storage boundary

`WhiteboardStorageAdapter` is host-owned. Required methods support the full lifecycle; optional methods add paging, subscriptions, metadata, and permanent removal. Revisions cover document and metadata mutations. Built-in adapters return defensive copies.

The Fetch adapter contains no authentication opinion. Provide headers or credentials from the host. The editor does not send telemetry.

## Extension rules

- Prefer stable RepoCanvas configuration types over re-exporting engine types.
- Add document migrations before changing `REPOCANVAS_FORMAT_VERSION`.
- Keep `core` and `testing` free of React and style side effects.
- Treat CSS selectors targeting Excalidraw internals as compatibility-sensitive and cover them in browser tests.
- Keep navigation for developer resources host-owned through callbacks.
