export const REPOCANVAS_FORMAT_VERSION = 2 as const

export interface RepoCanvasDocument {
  formatVersion: typeof REPOCANVAS_FORMAT_VERSION
  engine: 'excalidraw'
  engineVersion?: string
  snapshot: unknown
}

export interface WhiteboardSummary {
  id: string
  title: string
  revision: number
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  archivedAt?: string
}

export interface Whiteboard extends WhiteboardSummary {
  document: RepoCanvasDocument
}

export interface SaveWhiteboardInput {
  id: string
  document: RepoCanvasDocument
  expectedRevision: number
}

export interface WhiteboardStorageAdapter {
  list(): Promise<WhiteboardSummary[]>
  create(input: { title: string }): Promise<Whiteboard>
  load(id: string): Promise<Whiteboard>
  save(input: SaveWhiteboardInput): Promise<Whiteboard>
  rename(id: string, title: string): Promise<WhiteboardSummary>
  duplicate(id: string, title?: string): Promise<Whiteboard>
  archive(id: string): Promise<void>
  restore(id: string): Promise<void>
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'failed' | 'conflict'

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
