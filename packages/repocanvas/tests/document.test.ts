import { describe, expect, it } from 'vitest'
import {
  migrateDocument,
  parseRepoCanvasDocument,
  serializeRepoCanvasDocument,
} from '../src/engine/document'
import { UnsupportedDocumentError } from '../src/types'

describe('RepoCanvas documents', () => {
  it('migrates legacy v1 and ordinary Excalidraw documents', () => {
    const snapshot = { type: 'excalidraw', elements: [], appState: {}, files: {} }
    expect(migrateDocument({ formatVersion: 1, snapshot }).formatVersion).toBe(2)
    expect(migrateDocument(snapshot).snapshot).toEqual(snapshot)
  })

  it('uses deterministic object-key ordering without changing array order', () => {
    const document = migrateDocument({
      formatVersion: 2,
      engine: 'excalidraw',
      snapshot: { files: {}, elements: [{ z: 1, a: 2 }], appState: {} },
    })
    const first = serializeRepoCanvasDocument(document)
    const second = serializeRepoCanvasDocument(JSON.parse(first))
    expect(first).toBe(second)
    expect(first.indexOf('"a"')).toBeLessThan(first.indexOf('"z"'))
  })

  it('reports invalid JSON and malformed snapshots as unsupported', () => {
    expect(() => parseRepoCanvasDocument('{bad')).toThrow(UnsupportedDocumentError)
    expect(() => migrateDocument({
      formatVersion: 2,
      engine: 'excalidraw',
      snapshot: { elements: 'not-an-array' },
    })).toThrow(UnsupportedDocumentError)
  })
})
