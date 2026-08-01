export const REPOCANVAS_FORMAT_VERSION = 2 as const

export type RepoCanvasResourceKind =
  | 'file'
  | 'symbol'
  | 'commit'
  | 'issue'
  | 'url'
  | 'route'

/** Host-owned context attached to an Excalidraw element without exposing engine types. */
export interface RepoCanvasResource {
  kind: RepoCanvasResourceKind
  uri: string
  label?: string
  description?: string
}

export interface RepoCanvasDocumentMetadata {
  templateId?: string
  resources?: Record<string, RepoCanvasResource>
}

export interface RepoCanvasDocument {
  formatVersion: typeof REPOCANVAS_FORMAT_VERSION
  engine: 'excalidraw'
  engineVersion?: string
  snapshot: unknown
  metadata?: RepoCanvasDocumentMetadata
}

export interface WhiteboardSummary {
  id: string
  title: string
  revision: number
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  archivedAt?: string
  tags?: string[]
  projectId?: string
  /** A small data URL or host URL suitable for a library card. */
  thumbnailUrl?: string
}

export interface Whiteboard extends WhiteboardSummary {
  document: RepoCanvasDocument
}

export interface CreateWhiteboardInput {
  title: string
  document?: RepoCanvasDocument
  tags?: string[]
  projectId?: string
  thumbnailUrl?: string
}

export interface SaveWhiteboardInput {
  id: string
  document: RepoCanvasDocument
  expectedRevision: number
  thumbnailUrl?: string
}

export interface WhiteboardMutationOptions {
  expectedRevision?: number
}

export interface UpdateWhiteboardMetadataInput extends WhiteboardMutationOptions {
  title?: string
  tags?: string[]
  projectId?: string | null
  thumbnailUrl?: string | null
}

export interface WhiteboardListQuery {
  search?: string
  archived?: boolean
  tags?: string[]
  projectId?: string
  limit?: number
  cursor?: string
}

export interface WhiteboardPage {
  items: WhiteboardSummary[]
  nextCursor?: string
}

export type WhiteboardStorageChange =
  | { type: 'created' | 'updated' | 'archived' | 'restored'; id: string }
  | { type: 'removed'; id: string }
  | { type: 'reset' }

export type WhiteboardStorageListener = (change: WhiteboardStorageChange) => void

export interface WhiteboardStorageAdapter {
  list(query?: WhiteboardListQuery): Promise<WhiteboardSummary[]>
  listPage?(query?: WhiteboardListQuery): Promise<WhiteboardPage>
  create(input: CreateWhiteboardInput): Promise<Whiteboard>
  load(id: string): Promise<Whiteboard>
  save(input: SaveWhiteboardInput): Promise<Whiteboard>
  rename(
    id: string,
    title: string,
    options?: WhiteboardMutationOptions,
  ): Promise<WhiteboardSummary>
  updateMetadata?(
    id: string,
    input: UpdateWhiteboardMetadataInput,
  ): Promise<WhiteboardSummary>
  duplicate(id: string, title?: string): Promise<Whiteboard>
  archive(id: string, options?: WhiteboardMutationOptions): Promise<void>
  restore(id: string, options?: WhiteboardMutationOptions): Promise<void>
  remove?(id: string, options?: WhiteboardMutationOptions): Promise<void>
  subscribe?(listener: WhiteboardStorageListener): () => void
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'failed' | 'conflict'

export interface SaveStatusDetail {
  status: SaveStatus
  error?: Error
  revision?: number
  retryAttempt?: number
}

export class WhiteboardNotFoundError extends Error {
  readonly code = 'WHITEBOARD_NOT_FOUND'

  constructor(id: string) {
    super(`Whiteboard ${id} was not found.`)
    this.name = 'WhiteboardNotFoundError'
  }
}

export class RevisionConflictError extends Error {
  readonly code = 'REVISION_CONFLICT'
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(expectedRevision: number, actualRevision: number) {
    super(`Expected revision ${expectedRevision}, but found revision ${actualRevision}.`)
    this.name = 'RevisionConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export class UnsupportedDocumentError extends Error {
  readonly code = 'UNSUPPORTED_DOCUMENT'

  constructor(message = 'This whiteboard uses an unsupported document format.') {
    super(message)
    this.name = 'UnsupportedDocumentError'
  }
}

export class StorageWriteError extends Error {
  readonly code = 'STORAGE_WRITE_FAILED'
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'StorageWriteError'
    this.cause = cause
  }
}
