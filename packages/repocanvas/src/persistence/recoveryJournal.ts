import { migrateDocument } from '../engine/document'
import type { RepoCanvasDocument } from '../types'

export interface RecoveryJournalEntry {
  version: 1
  whiteboardId: string
  baseRevision: number
  savedAt: string
  document: RepoCanvasDocument
}

export interface RecoveryJournal {
  load(whiteboardId: string): Promise<RecoveryJournalEntry | undefined>
  save(entry: RecoveryJournalEntry): Promise<void>
  clear(whiteboardId: string): Promise<void>
}

export class BrowserRecoveryJournal implements RecoveryJournal {
  private readonly prefix: string
  private readonly databaseName: string

  constructor(prefix = 'repocanvas:recovery') {
    this.prefix = prefix
    this.databaseName = `${prefix}:journal`
  }

  async load(whiteboardId: string): Promise<RecoveryJournalEntry | undefined> {
    const local = this.readLocal(whiteboardId)
    if (local) return local
    if (typeof indexedDB === 'undefined') return undefined
    try {
      const database = await this.openDatabase()
      const value = await new Promise<RecoveryJournalEntry | undefined>((resolve, reject) => {
        const request = database.transaction('entries', 'readonly').objectStore('entries').get(whiteboardId)
        request.onsuccess = () => resolve(this.parse(request.result))
        request.onerror = () => reject(request.error)
      })
      database.close()
      return value
    } catch {
      return undefined
    }
  }

  async save(entry: RecoveryJournalEntry): Promise<void> {
    this.writeLocal(entry)
    if (typeof indexedDB === 'undefined') return
    try {
      const database = await this.openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('entries', 'readwrite')
        transaction.objectStore('entries').put(entry, entry.whiteboardId)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      database.close()
    } catch {
      // The synchronous local copy remains a best-effort fallback.
    }
  }

  async clear(whiteboardId: string): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(this.key(whiteboardId))
      } catch {
        // IndexedDB may still be available.
      }
    }
    if (typeof indexedDB === 'undefined') return
    try {
      const database = await this.openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('entries', 'readwrite')
        transaction.objectStore('entries').delete(whiteboardId)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      database.close()
    } catch {
      // Clearing recovery data must never break the successful save path.
    }
  }

  private key(whiteboardId: string): string {
    return `${this.prefix}:${whiteboardId}`
  }

  private readLocal(whiteboardId: string): RecoveryJournalEntry | undefined {
    if (typeof window === 'undefined') return undefined
    try {
      return this.parse(JSON.parse(window.localStorage.getItem(this.key(whiteboardId)) ?? 'null'))
    } catch {
      return undefined
    }
  }

  private writeLocal(entry: RecoveryJournalEntry): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(this.key(entry.whiteboardId), JSON.stringify(entry))
    } catch {
      // Large embedded assets may exceed localStorage; IndexedDB is attempted next.
    }
  }

  private parse(value: unknown): RecoveryJournalEntry | undefined {
    if (!value || typeof value !== 'object') return undefined
    const candidate = value as Partial<RecoveryJournalEntry>
    if (
      candidate.version !== 1 ||
      typeof candidate.whiteboardId !== 'string' ||
      typeof candidate.baseRevision !== 'number' ||
      typeof candidate.savedAt !== 'string'
    ) return undefined
    try {
      return {
        ...candidate,
        document: migrateDocument(candidate.document),
      } as RecoveryJournalEntry
    } catch {
      return undefined
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('entries')) {
          request.result.createObjectStore('entries')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
}
