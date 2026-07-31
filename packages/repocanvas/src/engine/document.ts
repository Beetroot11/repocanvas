import {
  REPOCANVAS_FORMAT_VERSION,
  UnsupportedDocumentError,
  type RepoCanvasDocument,
} from '../types'

export function createEmptyDocument(): RepoCanvasDocument {
  return {
    formatVersion: REPOCANVAS_FORMAT_VERSION,
    engine: 'excalidraw',
    engineVersion: '0.18',
    snapshot: null,
  }
}

export function assertSupportedDocument(document: RepoCanvasDocument): void {
  if (
    document.formatVersion !== REPOCANVAS_FORMAT_VERSION ||
    document.engine !== 'excalidraw'
  ) {
    throw new UnsupportedDocumentError()
  }
}

export function createDocumentFromSnapshot(snapshot: unknown): RepoCanvasDocument {
  return {
    formatVersion: REPOCANVAS_FORMAT_VERSION,
    engine: 'excalidraw',
    engineVersion: '0.18',
    snapshot,
  }
}
