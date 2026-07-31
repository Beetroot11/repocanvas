import { describe, expect, it } from 'vitest'
import { InMemoryWhiteboardStorageAdapter } from '../src/persistence/adapters'
import { assertSupportedDocument, createEmptyDocument } from '../src/engine/document'
import { RevisionConflictError, UnsupportedDocumentError } from '../src/types'

describe('InMemoryWhiteboardStorageAdapter', () => {
  it('creates empty Excalidraw documents without seeded content', () => {
    expect(createEmptyDocument()).toEqual({
      formatVersion: 2,
      engine: 'excalidraw',
      engineVersion: '0.18',
      snapshot: null,
    })
  })

  it('supports the complete recoverable library lifecycle', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const created = await storage.create({ title: 'Architecture' })

    expect((await storage.list()).map((board) => board.title)).toEqual(['Architecture'])

    const renamed = await storage.rename(created.id, 'System map')
    expect(renamed.title).toBe('System map')

    const copy = await storage.duplicate(created.id)
    expect(copy.title).toBe('System map copy')

    await storage.archive(created.id)
    expect((await storage.list()).find((board) => board.id === created.id)?.archivedAt).toBeTruthy()

    await storage.restore(created.id)
    expect((await storage.list()).find((board) => board.id === created.id)?.archivedAt).toBeUndefined()
  })

  it('rejects stale saves with an optimistic revision conflict', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({ title: 'Conflict test' })

    await storage.save({
      id: board.id,
      document: board.document,
      expectedRevision: board.revision,
    })

    await expect(
      storage.save({
        id: board.id,
        document: board.document,
        expectedRevision: board.revision,
      }),
    ).rejects.toBeInstanceOf(RevisionConflictError)
  })

  it('returns defensive document copies', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({ title: 'Clone test' })
    const loaded = await storage.load(board.id)

    loaded.document.snapshot = { changedOutsideAdapter: true }

    expect((await storage.load(board.id)).document.snapshot).toBeNull()
  })

  it('rejects documents outside the RepoCanvas engine boundary', () => {
    expect(() => assertSupportedDocument({
      ...createEmptyDocument(),
      formatVersion: 1 as 2,
    })).toThrow(UnsupportedDocumentError)
  })
})
