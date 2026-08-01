# HTTP storage adapter contract

`FetchWhiteboardStorageAdapter` uses JSON and the following endpoints beneath its configured `baseUrl`.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/whiteboards` | Query filters | `WhiteboardSummary[]` or `WhiteboardPage` |
| POST | `/whiteboards` | `CreateWhiteboardInput` | `Whiteboard` |
| GET | `/whiteboards/:id` | — | `Whiteboard` |
| PUT | `/whiteboards/:id/document` | `SaveWhiteboardInput` | `Whiteboard` |
| PATCH | `/whiteboards/:id` | `UpdateWhiteboardMetadataInput` | `WhiteboardSummary` |
| POST | `/whiteboards/:id/duplicate` | `{ title?: string }` | `Whiteboard` |
| POST | `/whiteboards/:id/archive` | `WhiteboardMutationOptions` | `204` |
| POST | `/whiteboards/:id/restore` | `WhiteboardMutationOptions` | `204` |
| DELETE | `/whiteboards/:id?expectedRevision=n` | — | `204` |

List query parameters are `search`, `archived`, `projectId`, `limit`, `cursor`, and repeated `tag` values.

Return `404` for a missing board. Return `409` for a stale mutation with an optional body:

```json
{
  "message": "The whiteboard changed in another session.",
  "expectedRevision": 4,
  "actualRevision": 5
}
```

All successful document and metadata mutations should increment `revision` atomically. Authenticate using the adapter’s `headers` callback and/or `credentials` option; do not embed credentials in RepoCanvas documents.

Run `verifyWhiteboardStorageAdapter` against an isolated test API in CI to exercise lifecycle, concurrency, defensive document, and query behavior.
