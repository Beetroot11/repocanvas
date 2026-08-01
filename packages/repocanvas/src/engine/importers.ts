import { createDocumentFromSnapshot } from './document'
import type { RepoCanvasDocument } from '../types'

async function fromSkeletons(
  skeletons: readonly unknown[],
  files: Record<string, unknown> = {},
): Promise<RepoCanvasDocument> {
  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
  const elements = convertToExcalidrawElements(skeletons as never[], { regenerateIds: true })
  return createDocumentFromSnapshot({
    type: 'excalidraw',
    version: 2,
    source: 'repocanvas',
    elements,
    appState: {
      viewBackgroundColor: '#e9f1f5',
      gridSize: 24,
      gridStep: 5,
      gridModeEnabled: true,
      objectsSnapModeEnabled: true,
    },
    files,
  })
}

export async function createDocumentFromMermaid(definition: string): Promise<RepoCanvasDocument> {
  const source = definition.trim()
  if (!source) throw new Error('The Mermaid definition is empty.')
  const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw')
  const result = await parseMermaidToExcalidraw(source, {
    flowchart: { curve: 'linear' },
    maxEdges: 1000,
    maxTextSize: 20_000,
  })
  return fromSkeletons(result.elements, result.files as Record<string, unknown> | undefined)
}

export async function createDocumentFromCode(
  code: string,
  language = 'text',
): Promise<RepoCanvasDocument> {
  const text = code.replace(/\r\n/g, '\n').trimEnd()
  if (!text) throw new Error('The code snippet is empty.')
  return fromSkeletons([{
    type: 'rectangle',
    x: 0,
    y: 0,
    width: Math.min(920, Math.max(420, Math.max(...text.split('\n').map((line) => line.length)) * 9 + 48)),
    height: Math.min(900, Math.max(180, text.split('\n').length * 23 + 76)),
    backgroundColor: '#172832',
    strokeColor: '#415765',
    fillStyle: 'solid',
    roundness: { type: 3 },
    label: {
      text: `${language}\n\n${text}`,
      fontSize: 16,
      fontFamily: 3,
      textAlign: 'left',
      verticalAlign: 'top',
      strokeColor: '#f8faf9',
    },
  }])
}

export async function createDocumentFromMarkdown(markdown: string): Promise<RepoCanvasDocument> {
  const source = markdown.replace(/\r\n/g, '\n').trim()
  if (!source) throw new Error('The Markdown document is empty.')
  const sections = source.split(/(?=^#{1,3}\s+)/m).filter(Boolean)
  const skeletons = sections.map((section, index) => {
    const lines = section.trim().split('\n')
    const heading = lines[0]?.replace(/^#{1,3}\s+/, '') ?? `Section ${index + 1}`
    const content = lines.slice(1).join('\n').trim()
    const column = index % 2
    const row = Math.floor(index / 2)
    return {
      type: 'rectangle',
      x: column * 460,
      y: row * 300,
      width: 410,
      height: 250,
      backgroundColor: index % 3 === 0 ? '#dbeafe' : index % 3 === 1 ? '#dcfce7' : '#fef3c7',
      fillStyle: 'solid',
      roundness: { type: 3 },
      label: {
        text: `${heading}${content ? `\n\n${content}` : ''}`,
        fontSize: 18,
        textAlign: 'left',
        verticalAlign: 'top',
      },
    }
  })
  return fromSkeletons(skeletons)
}
