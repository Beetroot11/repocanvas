import { describe, expect, it } from 'vitest'
import { InMemoryWhiteboardStorageAdapter } from '../src/persistence/adapters'
import { assertSupportedDocument, createDocumentFromSnapshot, createEmptyDocument } from '../src/engine/document'
import { RevisionConflictError, UnsupportedDocumentError } from '../src/types'
import { verifyWhiteboardStorageAdapter } from '../src/testing/storageContract'

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

  it('supports metadata search and revision-aware metadata changes', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({
      title: 'API architecture',
      tags: ['Architecture', 'api', 'API'],
      projectId: 'project-a',
    })

    expect(board.tags).toEqual(['Architecture', 'api'])
    const updated = await storage.updateMetadata(board.id, {
      tags: ['backend'],
      expectedRevision: board.revision,
    })
    expect(updated.revision).toBe(board.revision + 1)
    expect(await storage.list({ search: 'backend', tags: ['BACKEND'], projectId: 'project-a' }))
      .toHaveLength(1)

    await expect(storage.rename(board.id, 'Stale rename', {
      expectedRevision: board.revision,
    })).rejects.toBeInstanceOf(RevisionConflictError)
  })

  it('serializes subscription notifications after successful mutations', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const changes: string[] = []
    const unsubscribe = storage.subscribe((change) => changes.push(change.type))
    const board = await storage.create({ title: 'Events' })
    await storage.save({
      id: board.id,
      expectedRevision: board.revision,
      document: createDocumentFromSnapshot({ elements: [], appState: {}, files: {} }),
    })
    unsubscribe()
    expect(changes).toEqual(['created', 'updated'])
  })

  it('passes the reusable storage adapter contract', async () => {
    const report = await verifyWhiteboardStorageAdapter(
      () => new InMemoryWhiteboardStorageAdapter(),
    )
    expect(report.checks.map((check) => check.name)).toEqual([
      'lifecycle',
      'optimistic concurrency',
      'defensive documents',
      'query metadata',
    ])
  })
})
