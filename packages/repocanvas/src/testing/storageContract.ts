import { createDocumentFromSnapshot } from '../engine/document'
import { RevisionConflictError, type WhiteboardStorageAdapter } from '../types'

export interface StorageContractCheck {
  name: string
  durationMs: number
}

export interface StorageContractReport {
  checks: StorageContractCheck[]
}

export class StorageContractError extends Error {
  readonly check: string

  constructor(check: string, message: string) {
    super(`${check}: ${message}`)
    this.name = 'StorageContractError'
    this.check = check
  }
}

function assert(check: string, condition: unknown, message: string): asserts condition {
  if (!condition) throw new StorageContractError(check, message)
}

/**
 * Framework-neutral conformance suite for custom storage adapters. Use a fresh,
 * isolated adapter from the factory because the suite creates and archives data.
 */
export async function verifyWhiteboardStorageAdapter(
  factory: () => WhiteboardStorageAdapter | Promise<WhiteboardStorageAdapter>,
): Promise<StorageContractReport> {
  const checks: StorageContractCheck[] = []
  const run = async (name: string, task: (storage: WhiteboardStorageAdapter) => Promise<void>) => {
    const started = Date.now()
    await task(await factory())
    checks.push({ name, durationMs: Date.now() - started })
  }

  await run('lifecycle', async (storage) => {
    const created = await storage.create({ title: ' Contract board ' })
    assert('lifecycle', created.title === 'Contract board', 'create should normalize surrounding title whitespace')
    assert('lifecycle', created.revision >= 1, 'create should return a positive revision')
    const loaded = await storage.load(created.id)
    assert('lifecycle', loaded.id === created.id, 'load should return the created board')
    const renamed = await storage.rename(created.id, 'Renamed', { expectedRevision: loaded.revision })
    assert('lifecycle', renamed.title === 'Renamed', 'rename should persist the title')
    const copy = await storage.duplicate(created.id)
    assert('lifecycle', copy.id !== created.id, 'duplicate should create a new id')
    await storage.archive(created.id, { expectedRevision: renamed.revision })
    const archived = (await storage.list({ archived: true })).find((board) => board.id === created.id)
    assert('lifecycle', archived?.archivedAt, 'archive should mark the board as archived')
    await storage.restore(created.id, { expectedRevision: archived.revision })
    assert('lifecycle', (await storage.list({ archived: false })).some((board) => board.id === created.id), 'restore should return the board to active results')
  })

  await run('optimistic concurrency', async (storage) => {
    const board = await storage.create({ title: 'Revision contract' })
    const saved = await storage.save({
      id: board.id,
      document: createDocumentFromSnapshot({ elements: [], appState: {}, files: {} }),
      expectedRevision: board.revision,
    })
    assert('optimistic concurrency', saved.revision > board.revision, 'save should advance the revision')
    let conflict: unknown
    try {
      await storage.save({ id: board.id, document: board.document, expectedRevision: board.revision })
    } catch (error) {
      conflict = error
    }
    assert(
      'optimistic concurrency',
      conflict instanceof RevisionConflictError || (typeof conflict === 'object' && conflict !== null && 'code' in conflict && conflict.code === 'REVISION_CONFLICT'),
      'a stale save should reject with a revision conflict',
    )
  })

  await run('defensive documents', async (storage) => {
    const board = await storage.create({ title: 'Clone contract' })
    const loaded = await storage.load(board.id)
    loaded.document.snapshot = { externallyMutated: true }
    const reloaded = await storage.load(board.id)
    assert('defensive documents', JSON.stringify(reloaded.document.snapshot) !== JSON.stringify(loaded.document.snapshot), 'load should not expose mutable storage state')
  })

  await run('query metadata', async (storage) => {
    const board = await storage.create({ title: 'Searchable architecture', tags: ['architecture', 'api'], projectId: 'contract-project' })
    const results = await storage.list({ search: 'architecture', tags: ['api'], projectId: 'contract-project', archived: false })
    assert('query metadata', results.some((candidate) => candidate.id === board.id), 'list should support combined search, tag, project, and archive filters')
  })

  return { checks }
}
