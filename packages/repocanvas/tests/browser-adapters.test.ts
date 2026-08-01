// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FetchWhiteboardStorageAdapter,
  IndexedDbWhiteboardStorageAdapter,
  LocalStorageWhiteboardStorageAdapter,
} from '../src/persistence/adapters'
import { RevisionConflictError, StorageWriteError } from '../src/types'

describe('browser storage adapters', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('rolls an in-memory mutation back when localStorage rejects the write', async () => {
    const storage = new LocalStorageWhiteboardStorageAdapter('quota-test')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    await expect(storage.create({ title: 'Should roll back' })).rejects.toBeInstanceOf(StorageWriteError)
    expect(await storage.list()).toEqual([])
    storage.destroy()
  })

  it('detects stale cross-instance localStorage saves', async () => {
    const first = new LocalStorageWhiteboardStorageAdapter('cross-tab')
    const second = new LocalStorageWhiteboardStorageAdapter('cross-tab')
    const board = await first.create({ title: 'Shared' })
    const stale = await second.load(board.id)
    await first.save({ id: board.id, document: board.document, expectedRevision: board.revision })

    await expect(second.save({
      id: stale.id,
      document: stale.document,
      expectedRevision: stale.revision,
    })).rejects.toBeInstanceOf(RevisionConflictError)
    first.destroy()
    second.destroy()
  })

  it('reflects a library cleared by another browser context', async () => {
    const storage = new LocalStorageWhiteboardStorageAdapter('cleared-library')
    await storage.create({ title: 'Temporary' })
    window.localStorage.removeItem('cleared-library')

    expect(await storage.list()).toEqual([])
    storage.destroy()
  })

  it('persists boards in IndexedDB', async () => {
    const databaseName = `repocanvas-test-${crypto.randomUUID()}`
    const first = new IndexedDbWhiteboardStorageAdapter({ databaseName })
    const board = await first.create({ title: 'Indexed' })
    first.destroy()

    const second = new IndexedDbWhiteboardStorageAdapter({ databaseName })
    expect((await second.load(board.id)).title).toBe('Indexed')
    second.destroy()
  })

  it('serializes fetch filters and maps revision conflicts', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        expectedRevision: 2,
        actualRevision: 3,
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }))
    const storage = new FetchWhiteboardStorageAdapter({
      baseUrl: 'https://example.test/api/',
      fetch: fetcher,
      headers: { Authorization: 'Bearer test' },
    })

    await storage.listPage({ search: 'API map', tags: ['backend', 'v2'], limit: 20 })
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://example.test/api/whiteboards?search=API+map&limit=20&tag=backend&tag=v2',
    )
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test' })

    await expect(storage.save({
      id: 'board-1',
      document: { formatVersion: 2, engine: 'excalidraw', snapshot: { elements: [], appState: {}, files: {} } },
      expectedRevision: 2,
    })).rejects.toMatchObject({
      name: 'RevisionConflictError',
      expectedRevision: 2,
      actualRevision: 3,
    })
  })
})
