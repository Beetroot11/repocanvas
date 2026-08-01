import { describe, expect, it, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
}))

vi.mock('@excalidraw/mermaid-to-excalidraw', () => ({
  parseMermaidToExcalidraw: async () => ({
    elements: [{ type: 'rectangle', label: { text: 'Service' } }],
    files: {},
  }),
}))

import {
  createDocumentFromCode,
  createDocumentFromMarkdown,
  createDocumentFromMermaid,
} from '../src/engine/importers'

describe('developer text importers', () => {
  it('turns code into an editable labelled shape', async () => {
    const document = await createDocumentFromCode('const answer = 42', 'typescript')
    expect(document.formatVersion).toBe(2)
    expect(document.snapshot).toMatchObject({
      elements: [{ type: 'rectangle', label: { text: 'typescript\n\nconst answer = 42' } }],
    })
  })

  it('lays Markdown sections out as separate cards', async () => {
    const document = await createDocumentFromMarkdown('# API\nHTTP boundary\n## Worker\nQueue consumer')
    expect(document.snapshot).toMatchObject({
      elements: [
        { label: { text: 'API\n\nHTTP boundary' } },
        { label: { text: 'Worker\n\nQueue consumer' } },
      ],
    })
  })

  it('converts Mermaid output and rejects empty text inputs', async () => {
    const document = await createDocumentFromMermaid('flowchart LR\nA --> B')
    expect(document.snapshot).toMatchObject({ elements: [{ label: { text: 'Service' } }] })
    await expect(createDocumentFromMermaid('   ')).rejects.toThrow('empty')
    await expect(createDocumentFromCode('')).rejects.toThrow('empty')
    await expect(createDocumentFromMarkdown('')).rejects.toThrow('empty')
  })
})
