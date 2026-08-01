import { createDocumentFromSnapshot } from './document'
import type { RepoCanvasDocument } from '../types'

export interface RepoCanvasTemplate {
  id: string
  title: string
  description: string
  category: 'architecture' | 'decision' | 'incident' | 'planning' | string
  tags?: string[]
  /** Excalidraw skeletons are intentionally opaque at the public package boundary. */
  elements: readonly unknown[]
}

const box = (id: string, x: number, y: number, text: string, backgroundColor = '#dbeafe') => ({
  id,
  type: 'rectangle',
  x,
  y,
  width: 220,
  height: 96,
  roundness: { type: 3 },
  backgroundColor,
  fillStyle: 'solid',
  label: { text, fontSize: 20 },
})

const arrow = (id: string, startId: string, endId: string, text?: string) => ({
  id,
  type: 'arrow',
  x: 0,
  y: 0,
  start: { id: startId },
  end: { id: endId },
  ...(text ? { label: { text, fontSize: 16 } } : {}),
})

export const DEFAULT_REPOCANVAS_TEMPLATES: readonly RepoCanvasTemplate[] = [
  {
    id: 'system-architecture',
    title: 'System architecture',
    description: 'Map clients, services, data stores, and their connections.',
    category: 'architecture',
    tags: ['architecture'],
    elements: [
      box('client', 0, 100, 'Client', '#dcfce7'),
      box('api', 340, 100, 'API / Service'),
      box('database', 680, 100, 'Data store', '#fef3c7'),
      arrow('client-api', 'client', 'api', 'request'),
      arrow('api-database', 'api', 'database', 'read / write'),
    ],
  },
  {
    id: 'data-flow',
    title: 'Data flow',
    description: 'Trace a payload through ingestion, processing, and output.',
    category: 'architecture',
    tags: ['data-flow'],
    elements: [
      box('source', 0, 80, 'Source', '#dcfce7'),
      box('transform', 320, 80, 'Transform', '#dbeafe'),
      box('sink', 640, 80, 'Destination', '#fef3c7'),
      arrow('source-transform', 'source', 'transform'),
      arrow('transform-sink', 'transform', 'sink'),
    ],
  },
  {
    id: 'architecture-decision',
    title: 'Architecture decision',
    description: 'Compare context, options, decision, and consequences.',
    category: 'decision',
    tags: ['adr'],
    elements: [
      box('context', 0, 0, 'Context', '#e0f2fe'),
      box('options', 300, 0, 'Options', '#fef3c7'),
      box('decision', 600, 0, 'Decision', '#dcfce7'),
      box('consequences', 300, 190, 'Consequences', '#fce7f3'),
      arrow('context-options', 'context', 'options'),
      arrow('options-decision', 'options', 'decision'),
      arrow('decision-consequences', 'decision', 'consequences'),
    ],
  },
  {
    id: 'incident-timeline',
    title: 'Incident timeline',
    description: 'Plot detection, response, mitigation, and follow-up.',
    category: 'incident',
    tags: ['incident'],
    elements: [
      box('detected', 0, 80, 'Detected', '#fee2e2'),
      box('response', 300, 80, 'Response'),
      box('mitigated', 600, 80, 'Mitigated', '#dcfce7'),
      box('follow-up', 900, 80, 'Follow-up', '#fef3c7'),
      arrow('detected-response', 'detected', 'response'),
      arrow('response-mitigated', 'response', 'mitigated'),
      arrow('mitigated-follow-up', 'mitigated', 'follow-up'),
    ],
  },
]

export async function createDocumentFromTemplate(
  template: RepoCanvasTemplate,
): Promise<RepoCanvasDocument> {
  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
  const elements = convertToExcalidrawElements(template.elements as never[], { regenerateIds: true })
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
    files: {},
  }, { templateId: template.id })
}
