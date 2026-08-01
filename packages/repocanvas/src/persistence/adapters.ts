import {
  assertSupportedDocument,
  createEmptyDocument,
  migrateDocument,
} from '../engine/document'
import {
  RevisionConflictError,
  StorageWriteError,
  WhiteboardNotFoundError,
  type CreateWhiteboardInput,
  type RepoCanvasDocument,
  type SaveWhiteboardInput,
  type UpdateWhiteboardMetadataInput,
  type Whiteboard,
  type WhiteboardListQuery,
  type WhiteboardMutationOptions,
  type WhiteboardPage,
  type WhiteboardStorageAdapter,
  type WhiteboardStorageChange,
  type WhiteboardStorageListener,
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

function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined
  const seen = new Set<string>()
  const normalized = tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase()
      if (!tag || seen.has(key)) return false
      seen.add(key)
      return true
    })
  return normalized.length ? normalized : undefined
}

function toSummary(board: Whiteboard): WhiteboardSummary {
  const { document: _document, ...summary } = board
  return clone(summary)
}

function matchesQuery(board: Whiteboard, query: WhiteboardListQuery): boolean {
  if (query.archived !== undefined && Boolean(board.archivedAt) !== query.archived) return false
  if (query.projectId !== undefined && board.projectId !== query.projectId) return false
  if (query.tags?.length) {
    const boardTags = new Set((board.tags ?? []).map((tag) => tag.toLocaleLowerCase()))
    if (!query.tags.every((tag) => boardTags.has(tag.toLocaleLowerCase()))) return false
  }
  if (query.search?.trim()) {
    const needle = query.search.trim().toLocaleLowerCase()
    const haystack = `${board.title} ${(board.tags ?? []).join(' ')}`.toLocaleLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

function assertRevision(board: Whiteboard, expectedRevision?: number): void {
  if (expectedRevision !== undefined && board.revision !== expectedRevision) {
    throw new RevisionConflictError(expectedRevision, board.revision)
  }
}

export class InMemoryWhiteboardStorageAdapter implements WhiteboardStorageAdapter {
  protected boards = new Map<string, Whiteboard>()
  private readonly listeners = new Set<WhiteboardStorageListener>()

  constructor(initialBoards: Whiteboard[] = []) {
    for (const input of initialBoards) {
      const board = clone(input)
      board.document = migrateDocument(board.document)
      board.tags = normalizeTags(board.tags)
      this.boards.set(board.id, board)
    }
  }

  subscribe(listener: WhiteboardStorageListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async list(query: WhiteboardListQuery = {}): Promise<WhiteboardSummary[]> {
    await this.willAccess()
    let boards = [...this.boards.values()]
      .filter((board) => matchesQuery(board, query))
      .sort((a, b) => {
        const aTime = a.lastOpenedAt ?? a.updatedAt
        const bTime = b.lastOpenedAt ?? b.updatedAt
        return bTime.localeCompare(aTime)
      })

    if (query.cursor) {
      const cursorIndex = boards.findIndex((board) => board.id === query.cursor)
      if (cursorIndex >= 0) boards = boards.slice(cursorIndex + 1)
    }
    if (query.limit !== undefined) boards = boards.slice(0, Math.max(0, query.limit))
    return boards.map(toSummary)
  }

  async listPage(query: WhiteboardListQuery = {}): Promise<WhiteboardPage> {
    const limit = query.limit ?? 50
    const items = await this.list({ ...query, limit: limit + 1 })
    const hasNext = items.length > limit
    const pageItems = hasNext ? items.slice(0, limit) : items
    return {
      items: pageItems,
      ...(hasNext ? { nextCursor: pageItems.at(-1)?.id } : {}),
    }
  }

  async create(input: CreateWhiteboardInput): Promise<Whiteboard> {
    await this.willAccess()
    const timestamp = now()
    const document = input.document ? migrateDocument(input.document) : createEmptyDocument()
    const board: Whiteboard = {
      id: createId(),
      title: normalizeTitle(input.title),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      document,
      ...(normalizeTags(input.tags) ? { tags: normalizeTags(input.tags) } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
    }
    this.boards.set(board.id, board)
    try {
      await this.didChange({ type: 'created', id: board.id })
    } catch (error) {
      this.boards.delete(board.id)
      throw this.writeError(error)
    }
    return clone(board)
  }

  async load(id: string): Promise<Whiteboard> {
    await this.willAccess()
    const board = this.requireBoard(id)
    const previous = board.lastOpenedAt
    board.lastOpenedAt = now()
    try {
      await this.didChange({ type: 'updated', id })
    } catch (error) {
      board.lastOpenedAt = previous
      throw this.writeError(error)
    }
    return clone(board)
  }

  async save(input: SaveWhiteboardInput): Promise<Whiteboard> {
    await this.willAccess()
    const board = this.requireBoard(input.id)
    assertRevision(board, input.expectedRevision)
    assertSupportedDocument(input.document)
    const previous = clone(board)
    board.document = clone(input.document)
    board.revision += 1
    board.updatedAt = now()
    if (input.thumbnailUrl !== undefined) board.thumbnailUrl = input.thumbnailUrl
    try {
      await this.didChange({ type: 'updated', id: board.id })
    } catch (error) {
      this.boards.set(board.id, previous)
      throw this.writeError(error)
    }
    return clone(board)
  }

  async rename(
    id: string,
    title: string,
    options: WhiteboardMutationOptions = {},
  ): Promise<WhiteboardSummary> {
    return this.updateMetadata(id, { title, ...options })
  }

  async updateMetadata(
    id: string,
    input: UpdateWhiteboardMetadataInput,
  ): Promise<WhiteboardSummary> {
    await this.willAccess()
    const board = this.requireBoard(id)
    assertRevision(board, input.expectedRevision)
    const previous = clone(board)
    if (input.title !== undefined) board.title = normalizeTitle(input.title)
    if (input.tags !== undefined) board.tags = normalizeTags(input.tags)
    if (input.projectId === null) delete board.projectId
    else if (input.projectId !== undefined) board.projectId = input.projectId
    if (input.thumbnailUrl === null) delete board.thumbnailUrl
    else if (input.thumbnailUrl !== undefined) board.thumbnailUrl = input.thumbnailUrl
    board.revision += 1
    board.updatedAt = now()
    try {
      await this.didChange({ type: 'updated', id })
    } catch (error) {
      this.boards.set(id, previous)
      throw this.writeError(error)
    }
    return toSummary(board)
  }

  async duplicate(id: string, title?: string): Promise<Whiteboard> {
    await this.willAccess()
    const source = this.requireBoard(id)
    return this.create({
      title: title ?? `${source.title} copy`,
      document: source.document,
      tags: source.tags,
      projectId: source.projectId,
      thumbnailUrl: source.thumbnailUrl,
    })
  }

  async archive(id: string, options: WhiteboardMutationOptions = {}): Promise<void> {
    await this.setArchived(id, true, options)
  }

  async restore(id: string, options: WhiteboardMutationOptions = {}): Promise<void> {
    await this.setArchived(id, false, options)
  }

  async remove(id: string, options: WhiteboardMutationOptions = {}): Promise<void> {
    await this.willAccess()
    const board = this.requireBoard(id)
    assertRevision(board, options.expectedRevision)
    const previous = clone(board)
    this.boards.delete(id)
    try {
      await this.didChange({ type: 'removed', id })
    } catch (error) {
      this.boards.set(id, previous)
      throw this.writeError(error)
    }
  }

  protected requireBoard(id: string): Whiteboard {
    const board = this.boards.get(id)
    if (!board) throw new WhiteboardNotFoundError(id)
    return board
  }

  protected async willAccess(): Promise<void> {}

  protected async didChange(change: WhiteboardStorageChange): Promise<void> {
    for (const listener of this.listeners) listener(change)
  }

  protected writeError(error: unknown): Error {
    return error instanceof StorageWriteError
      ? error
      : new StorageWriteError('The whiteboard storage could not be updated.', error)
  }

  private async setArchived(
    id: string,
    archived: boolean,
    options: WhiteboardMutationOptions,
  ): Promise<void> {
    await this.willAccess()
    const board = this.requireBoard(id)
    assertRevision(board, options.expectedRevision)
    const previous = clone(board)
    if (archived) board.archivedAt = now()
    else delete board.archivedAt
    board.revision += 1
    board.updatedAt = now()
    try {
      await this.didChange({ type: archived ? 'archived' : 'restored', id })
    } catch (error) {
      this.boards.set(id, previous)
      throw this.writeError(error)
    }
  }
}

interface PersistedLibrary {
  version: 2
  boards: Whiteboard[]
}

function parseLibrary(raw: string | null): Whiteboard[] {
  if (!raw) return []
  const parsed = JSON.parse(raw) as { version?: number; boards?: unknown[] }
  if ((parsed.version === 1 || parsed.version === 2) && Array.isArray(parsed.boards)) {
    return parsed.boards.map((value) => {
      const board = clone(value) as Whiteboard
      board.document = migrateDocument(board.document)
      return board
    })
  }
  throw new StorageWriteError('The stored RepoCanvas library has an unsupported format.')
}

export class LocalStorageWhiteboardStorageAdapter extends InMemoryWhiteboardStorageAdapter {
  private readonly key: string
  private readonly storageListener?: (event: StorageEvent) => void

  constructor(key = 'repocanvas:whiteboards') {
    let boards: Whiteboard[] = []
    if (typeof window !== 'undefined') {
      try {
        boards = parseLibrary(window.localStorage.getItem(key))
      } catch {
        boards = []
      }
    }
    super(boards)
    this.key = key

    if (typeof window !== 'undefined') {
      this.storageListener = (event: StorageEvent) => {
        if (event.storageArea !== window.localStorage || event.key !== this.key) return
        try {
          this.replaceBoards(parseLibrary(event.newValue))
          void super.didChange({ type: 'reset' })
        } catch {
          // Preserve the last valid in-memory library when another tab writes bad data.
        }
      }
      window.addEventListener('storage', this.storageListener)
    }
  }

  destroy(): void {
    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener)
    }
  }

  protected override async willAccess(): Promise<void> {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(this.key)
    this.replaceBoards(parseLibrary(raw))
  }

  protected override async didChange(change: WhiteboardStorageChange): Promise<void> {
    if (typeof window !== 'undefined') {
      const payload: PersistedLibrary = {
        version: 2,
        boards: [...this.boards.values()],
      }
      try {
        window.localStorage.setItem(this.key, JSON.stringify(payload))
      } catch (error) {
        throw new StorageWriteError('The browser could not persist the whiteboard library.', error)
      }
    }
    await super.didChange(change)
  }

  private replaceBoards(boards: Whiteboard[]): void {
    this.boards.clear()
    for (const board of boards) this.boards.set(board.id, clone(board))
  }
}

export interface IndexedDbWhiteboardStorageAdapterOptions {
  databaseName?: string
  channelName?: string
}

export class IndexedDbWhiteboardStorageAdapter extends InMemoryWhiteboardStorageAdapter {
  private readonly databaseName: string
  private readonly ready: Promise<void>
  private readonly channel?: BroadcastChannel
  private applyingRemoteChange = false

  constructor(options: IndexedDbWhiteboardStorageAdapterOptions = {}) {
    super()
    this.databaseName = options.databaseName ?? 'repocanvas'
    this.ready = this.readDatabase()
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(options.channelName ?? `${this.databaseName}:changes`)
      this.channel.addEventListener('message', () => {
        void this.reloadFromChannel()
      })
    }
  }

  destroy(): void {
    this.channel?.close()
  }

  protected override async willAccess(): Promise<void> {
    await this.ready
  }

  protected override async didChange(change: WhiteboardStorageChange): Promise<void> {
    if (!this.applyingRemoteChange) {
      await this.writeDatabase()
      this.channel?.postMessage(change)
    }
    await super.didChange(change)
  }

  private async reloadFromChannel(): Promise<void> {
    this.applyingRemoteChange = true
    try {
      await this.readDatabase()
      await super.didChange({ type: 'reset' })
    } finally {
      this.applyingRemoteChange = false
    }
  }

  private async readDatabase(): Promise<void> {
    const database = await this.openDatabase()
    const payload = await new Promise<PersistedLibrary | undefined>((resolve, reject) => {
      const transaction = database.transaction('libraries', 'readonly')
      const request = transaction.objectStore('libraries').get('default')
      request.onsuccess = () => resolve(request.result as PersistedLibrary | undefined)
      request.onerror = () => reject(request.error)
    })
    database.close()
    if (!payload) return
    const boards = payload.boards.map((board) => ({
      ...clone(board),
      document: migrateDocument(board.document),
    }))
    this.boards.clear()
    for (const board of boards) this.boards.set(board.id, board)
  }

  private async writeDatabase(): Promise<void> {
    const database = await this.openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('libraries', 'readwrite')
        transaction.objectStore('libraries').put({
          version: 2,
          boards: [...this.boards.values()],
        } satisfies PersistedLibrary, 'default')
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } catch (error) {
      throw new StorageWriteError('IndexedDB could not persist the whiteboard library.', error)
    } finally {
      database.close()
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new StorageWriteError('IndexedDB is not available in this environment.'))
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('libraries')) {
          request.result.createObjectStore('libraries')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
}

export interface FetchWhiteboardStorageAdapterOptions {
  baseUrl: string
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  credentials?: RequestCredentials
}

export class FetchWhiteboardStorageAdapter implements WhiteboardStorageAdapter {
  private readonly baseUrl: string
  private readonly fetcher: typeof globalThis.fetch
  private readonly headers?: FetchWhiteboardStorageAdapterOptions['headers']
  private readonly credentials?: RequestCredentials

  constructor(options: FetchWhiteboardStorageAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.headers = options.headers
    this.credentials = options.credentials
  }

  async list(query: WhiteboardListQuery = {}): Promise<WhiteboardSummary[]> {
    const page = await this.listPage(query)
    return page.items
  }

  async listPage(query: WhiteboardListQuery = {}): Promise<WhiteboardPage> {
    const params = new URLSearchParams()
    if (query.search) params.set('search', query.search)
    if (query.archived !== undefined) params.set('archived', String(query.archived))
    if (query.projectId) params.set('projectId', query.projectId)
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    if (query.cursor) params.set('cursor', query.cursor)
    for (const tag of query.tags ?? []) params.append('tag', tag)
    const suffix = params.size ? `?${params}` : ''
    const result = await this.request<WhiteboardPage | WhiteboardSummary[]>(`/whiteboards${suffix}`)
    return Array.isArray(result) ? { items: result } : result
  }

  create(input: CreateWhiteboardInput): Promise<Whiteboard> {
    return this.request('/whiteboards', { method: 'POST', body: JSON.stringify(input) })
  }

  load(id: string): Promise<Whiteboard> {
    return this.request(`/whiteboards/${encodeURIComponent(id)}`)
  }

  save(input: SaveWhiteboardInput): Promise<Whiteboard> {
    return this.request(`/whiteboards/${encodeURIComponent(input.id)}/document`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  }

  rename(
    id: string,
    title: string,
    options: WhiteboardMutationOptions = {},
  ): Promise<WhiteboardSummary> {
    return this.updateMetadata(id, { title, ...options })
  }

  updateMetadata(
    id: string,
    input: UpdateWhiteboardMetadataInput,
  ): Promise<WhiteboardSummary> {
    return this.request(`/whiteboards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  duplicate(id: string, title?: string): Promise<Whiteboard> {
    return this.request(`/whiteboards/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  async archive(id: string, options: WhiteboardMutationOptions = {}): Promise<void> {
    await this.request(`/whiteboards/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  async restore(id: string, options: WhiteboardMutationOptions = {}): Promise<void> {
    await this.request(`/whiteboards/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  async remove(id: string, options: WhiteboardMutationOptions = {}): Promise<void> {
    const params = options.expectedRevision === undefined
      ? ''
      : `?expectedRevision=${options.expectedRevision}`
    await this.request(`/whiteboards/${encodeURIComponent(id)}${params}`, { method: 'DELETE' })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const configuredHeaders = typeof this.headers === 'function'
      ? await this.headers()
      : this.headers
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: this.credentials,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...configuredHeaders,
        ...init.headers,
      },
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as
        | { message?: string; expectedRevision?: number; actualRevision?: number }
        | undefined
      if (response.status === 404) throw new WhiteboardNotFoundError(path.split('/')[2] ?? path)
      if (response.status === 409) {
        throw new RevisionConflictError(
          payload?.expectedRevision ?? -1,
          payload?.actualRevision ?? -1,
        )
      }
      throw new StorageWriteError(payload?.message ?? `RepoCanvas request failed with status ${response.status}.`)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}

export function createSeedBoard(input: {
  id: string
  title: string
  document?: RepoCanvasDocument
  updatedAt?: string
  tags?: string[]
  projectId?: string
}): Whiteboard {
  const timestamp = input.updatedAt ?? now()
  return {
    id: input.id,
    title: normalizeTitle(input.title),
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    document: input.document ? migrateDocument(input.document) : createEmptyDocument(),
    ...(normalizeTags(input.tags) ? { tags: normalizeTags(input.tags) } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  }
}
