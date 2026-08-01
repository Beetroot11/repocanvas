import {
  REPOCANVAS_FORMAT_VERSION,
  UnsupportedDocumentError,
  type RepoCanvasDocument,
  type RepoCanvasDocumentMetadata,
} from '../types'

const ENGINE_VERSION = '0.18'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateSnapshot(snapshot: unknown): void {
  if (snapshot === null) return
  if (!isRecord(snapshot)) {
    throw new UnsupportedDocumentError('The whiteboard snapshot must be an object or null.')
  }
  if ('elements' in snapshot && !Array.isArray(snapshot.elements)) {
    throw new UnsupportedDocumentError('The whiteboard snapshot elements must be an array.')
  }
  if ('appState' in snapshot && snapshot.appState !== null && !isRecord(snapshot.appState)) {
    throw new UnsupportedDocumentError('The whiteboard snapshot appState must be an object.')
  }
  if ('files' in snapshot && snapshot.files !== null && !isRecord(snapshot.files)) {
    throw new UnsupportedDocumentError('The whiteboard snapshot files must be an object.')
  }
}

function validateMetadata(metadata: unknown): asserts metadata is RepoCanvasDocumentMetadata | undefined {
  if (metadata === undefined) return
  if (!isRecord(metadata)) {
    throw new UnsupportedDocumentError('The whiteboard metadata must be an object.')
  }
  if (metadata.resources !== undefined && !isRecord(metadata.resources)) {
    throw new UnsupportedDocumentError('The whiteboard resources must be an object.')
  }
}

export function createEmptyDocument(metadata?: RepoCanvasDocumentMetadata): RepoCanvasDocument {
  return {
    formatVersion: REPOCANVAS_FORMAT_VERSION,
    engine: 'excalidraw',
    engineVersion: ENGINE_VERSION,
    snapshot: null,
    ...(metadata ? { metadata } : {}),
  }
}

export function assertSupportedDocument(document: RepoCanvasDocument): void {
  if (!isRecord(document)) throw new UnsupportedDocumentError()
  if (
    document.formatVersion !== REPOCANVAS_FORMAT_VERSION ||
    document.engine !== 'excalidraw'
  ) {
    throw new UnsupportedDocumentError()
  }
  validateSnapshot(document.snapshot)
  validateMetadata(document.metadata)
}

/**
 * Upgrades legacy RepoCanvas v1 envelopes and ordinary Excalidraw JSON exports.
 * Arrays retain their order; unknown Excalidraw fields are deliberately preserved.
 */
export function migrateDocument(input: unknown): RepoCanvasDocument {
  if (!isRecord(input)) throw new UnsupportedDocumentError()

  if (input.formatVersion === REPOCANVAS_FORMAT_VERSION) {
    const document = input as unknown as RepoCanvasDocument
    assertSupportedDocument(document)
    return structuredClone(document)
  }

  if (input.formatVersion === 1 && 'snapshot' in input) {
    return createDocumentFromSnapshot(input.snapshot)
  }

  if (
    Array.isArray(input.elements) &&
    (input.type === 'excalidraw' || 'appState' in input || 'files' in input)
  ) {
    return createDocumentFromSnapshot(input)
  }

  throw new UnsupportedDocumentError()
}

export function parseRepoCanvasDocument(json: string): RepoCanvasDocument {
  try {
    return migrateDocument(JSON.parse(json))
  } catch (error) {
    if (error instanceof UnsupportedDocumentError) throw error
    throw new UnsupportedDocumentError('The selected file is not valid JSON.')
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  )
}

/** Deterministic JSON for source control, exports, fixtures, and cache keys. */
export function serializeRepoCanvasDocument(
  document: RepoCanvasDocument,
  space: number | string = 2,
): string {
  assertSupportedDocument(document)
  return JSON.stringify(stableValue(document), null, space)
}

export function createDocumentFromSnapshot(
  snapshot: unknown,
  metadata?: RepoCanvasDocumentMetadata,
): RepoCanvasDocument {
  validateSnapshot(snapshot)
  validateMetadata(metadata)
  return {
    formatVersion: REPOCANVAS_FORMAT_VERSION,
    engine: 'excalidraw',
    engineVersion: ENGINE_VERSION,
    snapshot,
    ...(metadata ? { metadata } : {}),
  }
}
