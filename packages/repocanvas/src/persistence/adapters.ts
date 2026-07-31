import { createEmptyDocument } from '../engine/document'
import {
  RevisionConflictError,
  WhiteboardNotFoundError,
  type RepoCanvasDocument,
  type SaveWhiteboardInput,
  type Whiteboard,
  type WhiteboardStorageAdapter,
  type WhiteboardSummary,
} from '../types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function now(): string {
  return new Date().toISOString()
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `board-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeTitle(title: string): string {
  return title.trim() || 'Untitled whiteboard'
}

export class InMemoryWhiteboardStorageAdapter implements WhiteboardStorageAdapter {
  protected boards = new Map<string, Whiteboard>()

  constructor(initialBoards: Whiteboard[] = []) {
    for (const board of initialBoards) this.boards.set(board.id, clone(board))
  }

  async list(): Promise<WhiteboardSummary[]> {
    return [...this.boards.values()]
      .map(({ document: _document, ...summary }) => clone(summary))
      .sort((a, b) => {
        const aTime = a.lastOpenedAt ?? a.updatedAt
        const bTime = b.lastOpenedAt ?? b.updatedAt
        return bTime.localeCompare(aTime)
      })
  }

  async create(input: { title: string }): Promise<Whiteboard> {
    const timestamp = now()
    const board: Whiteboard = {
      id: createId(),
      title: normalizeTitle(input.title),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      document: createEmptyDocument(),
    }
    this.boards.set(board.id, board)
    await this.didChange()
    return clone(board)
  }

  async load(id: string): Promise<Whiteboard> {
    const board = this.requireBoard(id)
    board.lastOpenedAt = now()
    await this.didChange()
    return clone(board)
  }

  async save(input: SaveWhiteboardInput): Promise<Whiteboard> {
    const board = this.requireBoard(input.id)
    if (board.revision !== input.expectedRevision) {
      throw new RevisionConflictError(input.expectedRevision, board.revision)
    }
    board.document = clone(input.document)
    board.revision += 1
    board.updatedAt = now()
    await this.didChange()
    return clone(board)
  }

  async rename(id: string, title: string): Promise<WhiteboardSummary> {
    const board = this.requireBoard(id)
    board.title = normalizeTitle(title)
    board.updatedAt = now()
    await this.didChange()
    const { document: _document, ...summary } = board
    return clone(summary)
  }

  async duplicate(id: string, title?: string): Promise<Whiteboard> {
    const source = this.requireBoard(id)
    const copy = await this.create({ title: title ?? `${source.title} copy` })
    copy.document = clone(source.document)
    this.boards.set(copy.id, clone(copy))
    await this.didChange()
    return clone(copy)
  }

  async archive(id: string): Promise<void> {
    const board = this.requireBoard(id)
    board.archivedAt = now()
    board.updatedAt = board.archivedAt
    await this.didChange()
  }

  async restore(id: string): Promise<void> {
    const board = this.requireBoard(id)
    delete board.archivedAt
    board.updatedAt = now()
    await this.didChange()
  }

  protected requireBoard(id: string): Whiteboard {
    const board = this.boards.get(id)
    if (!board) throw new WhiteboardNotFoundError(id)
    return board
  }

  protected async didChange(): Promise<void> {}
}

interface PersistedLibrary {
  version: 1
  boards: Whiteboard[]
}

export class LocalStorageWhiteboardStorageAdapter extends InMemoryWhiteboardStorageAdapter {
  private readonly key: string

  constructor(key = 'repocanvas:whiteboards') {
    let boards: Whiteboard[] = []
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedLibrary
          if (parsed.version === 1 && Array.isArray(parsed.boards)) boards = parsed.boards
        }
      } catch {
        boards = []
      }
    }
    super(boards)
    this.key = key
  }

  protected override async didChange(): Promise<void> {
    if (typeof window === 'undefined') return
    const payload: PersistedLibrary = {
      version: 1,
      boards: [...this.boards.values()],
    }
    window.localStorage.setItem(this.key, JSON.stringify(payload))
  }
}

export function createSeedBoard(input: {
  id: string
  title: string
  document?: RepoCanvasDocument
  updatedAt?: string
}): Whiteboard {
  const timestamp = input.updatedAt ?? now()
  return {
    id: input.id,
    title: input.title,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    document: input.document ?? createEmptyDocument(),
  }
}

