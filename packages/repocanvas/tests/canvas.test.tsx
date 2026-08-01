// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryWhiteboardStorageAdapter } from '../src/persistence/adapters'
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
} from '../src/components/WhiteboardCanvas'

const excalidraw = vi.hoisted(() => ({
  props: null as Record<string, any> | null,
  elements: [] as Record<string, unknown>[],
  api: null as Record<string, any> | null,
}))

vi.mock('@excalidraw/excalidraw', async () => {
  const React = await import('react')
  function Excalidraw(props: Record<string, any>) {
    excalidraw.props = props
    const appState = {
      activeTool: { type: 'selection' },
      selectedElementIds: {},
      suggestedBindings: [],
      viewBackgroundColor: '#fff',
    }
    const api = {
      getSceneElementsIncludingDeleted: () => excalidraw.elements,
      getSceneElements: () => excalidraw.elements,
      getAppState: () => appState,
      getFiles: () => ({}),
      updateScene: vi.fn((scene: { elements?: Record<string, unknown>[] }) => {
        if (scene.elements) excalidraw.elements = scene.elements
      }),
      addFiles: vi.fn(),
      scrollToContent: vi.fn(),
      setActiveTool: vi.fn(),
    }
    excalidraw.api = api
    React.useEffect(() => {
      props.excalidrawAPI?.(api)
      props.onChange?.([], appState, {})
    }, [])
    return <div data-testid="mock-excalidraw" />
  }
  return {
    Excalidraw,
    serializeAsJSON: (elements: unknown, appState: unknown, files: unknown) => JSON.stringify({
      type: 'excalidraw', elements, appState, files,
    }),
    sceneCoordsToViewportCoords: ({ sceneX, sceneY }: { sceneX: number; sceneY: number }) => ({ x: sceneX, y: sceneY }),
    exportToBlob: async () => new Blob(['png'], { type: 'image/png' }),
    exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    exportToClipboard: async () => undefined,
    convertToExcalidrawElements: (elements: unknown[]) => elements,
  }
})

class FailingStorage extends InMemoryWhiteboardStorageAdapter {
  saves = 0

  override async save(): Promise<never> {
    this.saves += 1
    throw new Error('network unavailable')
  }
}

function emitChange() {
  const appState = {
    activeTool: { type: 'selection' },
    selectedElementIds: {},
    suggestedBindings: [],
    viewBackgroundColor: '#fff',
  }
  excalidraw.elements = [{ id: 'shape-1', type: 'rectangle', x: 0, y: 0, width: 100, height: 80 }]
  act(() => {
    excalidraw.props?.onChange?.(excalidraw.elements, appState, {})
  })
}

describe('WhiteboardCanvas persistence', () => {
  beforeEach(() => {
    excalidraw.props = null
    excalidraw.elements = []
    window.localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => cleanup())

  it('backs failed saves off and stops after the configured retries', async () => {
    const storage = new FailingStorage()
    const board = await storage.create({ title: 'Retry board' })
    render(
      <WhiteboardCanvas
        storage={storage}
        whiteboardId={board.id}
        autosaveDelay={100}
        retryBaseDelay={1000}
        maxAutomaticRetries={2}
        generateThumbnails={false}
      />,
    )
    await screen.findByTestId('mock-excalidraw')
    vi.useFakeTimers()
    emitChange()

    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(storage.saves).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(storage.saves).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(storage.saves).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(storage.saves).toBe(3)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(storage.saves).toBe(3)
  })

  it('flushes a dirty document before internal back navigation', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({ title: 'Navigation board' })
    const save = vi.spyOn(storage, 'save')
    const onBack = vi.fn()
    render(
      <WhiteboardCanvas
        storage={storage}
        whiteboardId={board.id}
        autosaveDelay={60_000}
        generateThumbnails={false}
        onBack={onBack}
      />,
    )
    await screen.findByTestId('mock-excalidraw')
    emitChange()
    fireEvent.click(screen.getByRole('button', { name: /back to whiteboard library/i }))

    await waitFor(() => expect(onBack).toHaveBeenCalledOnce())
    expect(save).toHaveBeenCalledOnce()
    expect((await storage.load(board.id)).revision).toBeGreaterThan(board.revision)
  })

  it('persists developer-resource metadata and shape links together', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({ title: 'Linked board' })
    let handle: WhiteboardCanvasHandle | undefined
    render(
      <WhiteboardCanvas
        storage={storage}
        whiteboardId={board.id}
        generateThumbnails={false}
        onReady={(nextHandle) => { handle = nextHandle }}
      />,
    )
    await screen.findByTestId('mock-excalidraw')
    excalidraw.elements = [{ id: 'shape-1', type: 'rectangle' }]
    const appState = excalidraw.api?.getAppState() as { selectedElementIds: Record<string, boolean> }
    appState.selectedElementIds['shape-1'] = true

    act(() => {
      handle?.attachResourceToSelection({ kind: 'symbol', uri: 'src/auth.ts#validate' })
    })
    expect(handle?.getDocument()).toMatchObject({
      snapshot: { elements: [{ id: 'shape-1', link: 'repocanvas://resource/shape-1' }] },
      metadata: { resources: { 'shape-1': { kind: 'symbol', uri: 'src/auth.ts#validate' } } },
    })

    act(() => {
      handle?.removeResourceFromSelection()
    })
    const unlinked = handle?.getDocument()
    expect(unlinked?.snapshot).toMatchObject({ elements: [{ id: 'shape-1', link: null }] })
    expect(unlinked?.metadata?.resources).toBeUndefined()
  })
})
