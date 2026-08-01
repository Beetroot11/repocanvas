'use client'

import { CornersIn, CornersOut } from '@phosphor-icons/react'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  assertSupportedDocument,
  createDocumentFromSnapshot,
  serializeRepoCanvasDocument,
} from '../engine/document'
import type { RepoCanvasDocument, RepoCanvasResource } from '../types'

type ExcalidrawRuntime = typeof import('@excalidraw/excalidraw')
type ExcalidrawComponent = ExcalidrawRuntime['Excalidraw']
type ExcalidrawOnChange = NonNullable<ComponentProps<ExcalidrawComponent>['onChange']>

export type RepoCanvasTheme = 'light' | 'dark' | 'system'
export type RepoCanvasExportFormat = 'json' | 'png' | 'svg'

export interface RepoCanvasGridOptions {
  enabled?: boolean
  size?: number
  step?: number
  snap?: boolean
}

export interface RepoCanvasToolOptions {
  image?: boolean
}

export interface RepoCanvasEditorHandle {
  getDocument(): RepoCanvasDocument
  replaceDocument(document: RepoCanvasDocument): void
  focus(): void
  zoomToFit(): void
  setActiveTool(tool: string): void
  toggleFullscreen(): Promise<void>
  exportBlob(format: RepoCanvasExportFormat): Promise<Blob>
  copyToClipboard(format: RepoCanvasExportFormat): Promise<void>
  download(format: RepoCanvasExportFormat, filename?: string): Promise<void>
  createThumbnail(maxDimension?: number): Promise<string | undefined>
  attachResourceToSelection(resource: RepoCanvasResource): string[]
  removeResourceFromSelection(): string[]
}

export interface RepoCanvasEditorProps {
  document: RepoCanvasDocument
  /** Change this value to intentionally reset the editor history and scene. */
  documentKey?: string | number
  onChange?: (document: RepoCanvasDocument) => void
  onReady?: (handle: RepoCanvasEditorHandle) => void
  onError?: (error: Error) => void
  onResourceOpen?: (resource: RepoCanvasResource, elementId: string) => void
  onLinkOpen?: (link: string, elementId: string) => void
  readOnly?: boolean
  theme?: RepoCanvasTheme
  locale?: string
  grid?: boolean | RepoCanvasGridOptions
  tools?: RepoCanvasToolOptions
  chrome?: 'minimal' | 'none'
  className?: string
  style?: CSSProperties
  name?: string
  autoFocus?: boolean
  pencilMode?: boolean
  renderTopRightUI?: (isMobile: boolean) => ReactNode
}

interface LockPoint {
  x: number
  y: number
}

interface BindableTarget {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

const EMPTY_SCENE: ExcalidrawInitialDataState = {
  elements: [],
  appState: {
    viewBackgroundColor: '#e9f1f5',
    gridSize: 24,
    gridStep: 5,
    gridModeEnabled: true,
    objectsSnapModeEnabled: true,
  },
  files: {},
}

function readableError(error: unknown): Error {
  return error instanceof Error ? error : new Error('The canvas editor encountered an error.')
}

function toInitialData(snapshot: unknown): ExcalidrawInitialDataState {
  if (!snapshot || typeof snapshot !== 'object') return EMPTY_SCENE
  return snapshot as ExcalidrawInitialDataState
}

function getBindableTarget(binding: unknown): BindableTarget | null {
  const candidate = Array.isArray(binding) ? binding[2] : binding
  if (!candidate || typeof candidate !== 'object') return null
  const target = candidate as Partial<BindableTarget>
  if (
    typeof target.x !== 'number' ||
    typeof target.y !== 'number' ||
    typeof target.width !== 'number' ||
    typeof target.height !== 'number'
  ) return null
  return { ...target, angle: typeof target.angle === 'number' ? target.angle : 0 } as BindableTarget
}

function rotatePoint(point: LockPoint, center: LockPoint, angle: number): LockPoint {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const x = point.x - center.x
  const y = point.y - center.y
  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  }
}

function safeFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'whiteboard'
}

export const RepoCanvasEditor = forwardRef<RepoCanvasEditorHandle, RepoCanvasEditorProps>(
  function RepoCanvasEditor({
    document,
    documentKey = 'default',
    onChange,
    onReady,
    onError,
    onResourceOpen,
    onLinkOpen,
    readOnly = false,
    theme = 'light',
    locale,
    grid = true,
    tools = {},
    chrome = 'minimal',
    className,
    style,
    name = 'RepoCanvas',
    autoFocus = true,
    pencilMode = true,
    renderTopRightUI,
  }, forwardedRef) {
    assertSupportedDocument(document)
    const rootRef = useRef<HTMLDivElement>(null)
    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
    const runtimeRef = useRef<ExcalidrawRuntime | null>(null)
    const latestDocumentRef = useRef(document)
    const lastSceneJsonRef = useRef('')
    const initialChangeSeenRef = useRef(false)
    const lastDocumentKeyRef = useRef(documentKey)
    const handleRef = useRef<RepoCanvasEditorHandle | null>(null)
    const [runtime, setRuntime] = useState<ExcalidrawRuntime | null>(null)
    const [loadError, setLoadError] = useState<Error | null>(null)
    const [lockPoints, setLockPoints] = useState<LockPoint[]>([])
    const [activeTool, setActiveToolState] = useState('selection')
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light')

    if (lastDocumentKeyRef.current !== documentKey) {
      lastDocumentKeyRef.current = documentKey
      latestDocumentRef.current = document
      lastSceneJsonRef.current = ''
      initialChangeSeenRef.current = false
    }

    useEffect(() => {
      let active = true
      setLoadError(null)
      void import('@excalidraw/excalidraw')
        .then((loadedRuntime) => {
          if (!active) return
          runtimeRef.current = loadedRuntime
          setRuntime(() => loadedRuntime)
        })
        .catch((error: unknown) => {
          if (!active) return
          const nextError = readableError(error)
          setLoadError(nextError)
          onError?.(nextError)
        })
      return () => {
        active = false
      }
    }, [onError])

    useEffect(() => {
      if (theme !== 'system' || typeof window === 'undefined') return
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const update = () => setSystemTheme(media.matches ? 'dark' : 'light')
      update()
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }, [theme])

    useEffect(() => {
      const api = apiRef.current
      if (!api || latestDocumentRef.current === document) return
      latestDocumentRef.current = document
      const snapshotJson = JSON.stringify(document.snapshot)
      if (snapshotJson === lastSceneJsonRef.current) return
      const next = toInitialData(document.snapshot)
      api.updateScene({ elements: next.elements, appState: next.appState as never })
      if (next.files) api.addFiles(Object.values(next.files))
      lastSceneJsonRef.current = snapshotJson
    }, [document])

    useEffect(() => {
      if (typeof globalThis.document === 'undefined') return
      const update = () => {
        setIsFullscreen(globalThis.document.fullscreenElement === rootRef.current || fallbackFullscreen)
      }
      globalThis.document.addEventListener('fullscreenchange', update)
      return () => globalThis.document.removeEventListener('fullscreenchange', update)
    }, [fallbackFullscreen])

    const capture = useCallback((): RepoCanvasDocument => {
      const api = apiRef.current
      const loadedRuntime = runtimeRef.current
      if (!api || !loadedRuntime) return structuredClone(latestDocumentRef.current)
      const snapshot = JSON.parse(loadedRuntime.serializeAsJSON(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
        'local',
      )) as ExcalidrawInitialDataState
      return createDocumentFromSnapshot(snapshot, latestDocumentRef.current.metadata)
    }, [])

    const emitMetadataChange = useCallback((next: RepoCanvasDocument) => {
      latestDocumentRef.current = next
      onChange?.(next)
    }, [onChange])

    const toggleFullscreen = useCallback(async () => {
      const root = rootRef.current
      if (!root || typeof globalThis.document === 'undefined') return
      if (globalThis.document.fullscreenElement === root) {
        await globalThis.document.exitFullscreen()
        return
      }
      if (fallbackFullscreen) {
        setFallbackFullscreen(false)
        setIsFullscreen(false)
        return
      }
      try {
        if (globalThis.document.fullscreenEnabled) await root.requestFullscreen()
        else {
          setFallbackFullscreen(true)
          setIsFullscreen(true)
        }
      } catch {
        setFallbackFullscreen(true)
        setIsFullscreen(true)
      }
    }, [fallbackFullscreen])

    const exportBlob = useCallback(async (format: RepoCanvasExportFormat): Promise<Blob> => {
      const api = apiRef.current
      const loadedRuntime = runtimeRef.current
      if (format === 'json') {
        return new Blob([serializeRepoCanvasDocument(capture())], { type: 'application/json' })
      }
      if (!api || !loadedRuntime) throw new Error('The canvas is not ready to export.')
      const options = {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
        exportPadding: 24,
      }
      if (format === 'png') return loadedRuntime.exportToBlob({ ...options, mimeType: 'image/png' })
      const svg = await loadedRuntime.exportToSvg(options)
      return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    }, [capture])

    const copyToClipboard = useCallback(async (format: RepoCanvasExportFormat): Promise<void> => {
      const api = apiRef.current
      const loadedRuntime = runtimeRef.current
      if (!api || !loadedRuntime) throw new Error('The canvas is not ready to copy.')
      await loadedRuntime.exportToClipboard({
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
        type: format,
      })
    }, [])

    const download = useCallback(async (format: RepoCanvasExportFormat, filename = name) => {
      if (typeof window === 'undefined') return
      const blob = await exportBlob(format)
      const url = URL.createObjectURL(blob)
      const link = globalThis.document.createElement('a')
      link.href = url
      link.download = `${safeFilename(filename)}.${format}`
      link.click()
      queueMicrotask(() => URL.revokeObjectURL(url))
    }, [exportBlob, name])

    const createThumbnail = useCallback(async (maxDimension = 480): Promise<string | undefined> => {
      const api = apiRef.current
      const loadedRuntime = runtimeRef.current
      if (!api || !loadedRuntime || !api.getSceneElements().length) return undefined
      const blob = await loadedRuntime.exportToBlob({
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
        mimeType: 'image/png',
        maxWidthOrHeight: maxDimension,
        exportPadding: 20,
      })
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    }, [])

    const updateSelectionResources = useCallback((resource?: RepoCanvasResource): string[] => {
      const api = apiRef.current
      if (!api) return []
      const selected = api.getAppState().selectedElementIds
      const selectedIds = Object.keys(selected).filter((id) => selected[id])
      if (!selectedIds.length) return []
      const current = capture()
      const resources = { ...(current.metadata?.resources ?? {}) }
      for (const id of selectedIds) {
        if (resource) resources[id] = resource
        else delete resources[id]
      }
      const metadata = { ...(current.metadata ?? {}) }
      if (Object.keys(resources).length) metadata.resources = resources
      else delete metadata.resources
      const elements = api.getSceneElementsIncludingDeleted().map((element) => {
        if (!selectedIds.includes(element.id)) return element
        return {
          ...element,
          link: resource ? `repocanvas://resource/${encodeURIComponent(element.id)}` : null,
        }
      })
      const snapshot = toInitialData(current.snapshot)
      const next = createDocumentFromSnapshot(
        { ...snapshot, elements },
        Object.keys(metadata).length ? metadata : undefined,
      )
      const loadedRuntime = runtimeRef.current
      if (loadedRuntime) {
        lastSceneJsonRef.current = loadedRuntime.serializeAsJSON(
          elements,
          api.getAppState(),
          api.getFiles(),
          'local',
        )
        initialChangeSeenRef.current = true
      }
      api.updateScene({ elements })
      emitMetadataChange(next)
      return selectedIds
    }, [capture, emitMetadataChange])

    const createHandle = useCallback((): RepoCanvasEditorHandle => ({
      getDocument: capture,
      replaceDocument(nextDocument) {
        assertSupportedDocument(nextDocument)
        latestDocumentRef.current = structuredClone(nextDocument)
        const next = toInitialData(nextDocument.snapshot)
        const loadedRuntime = runtimeRef.current
        if (loadedRuntime) {
          lastSceneJsonRef.current = loadedRuntime.serializeAsJSON(
            next.elements ?? [],
            next.appState ?? {},
            next.files ?? {},
            'local',
          )
          initialChangeSeenRef.current = true
        }
        apiRef.current?.updateScene({ elements: next.elements, appState: next.appState as never })
        if (next.files) apiRef.current?.addFiles(Object.values(next.files))
        emitMetadataChange(structuredClone(nextDocument))
      },
      focus() {
        rootRef.current?.querySelector<HTMLElement>('.excalidraw canvas')?.focus()
      },
      zoomToFit() {
        apiRef.current?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85, animate: true })
      },
      setActiveTool(tool) {
        apiRef.current?.setActiveTool({ type: tool as never })
      },
      toggleFullscreen,
      exportBlob,
      copyToClipboard,
      download,
      createThumbnail,
      attachResourceToSelection(resource) {
        return updateSelectionResources(resource)
      },
      removeResourceFromSelection() {
        return updateSelectionResources()
      },
    }), [capture, copyToClipboard, createThumbnail, download, emitMetadataChange, exportBlob, toggleFullscreen, updateSelectionResources])

    useImperativeHandle(forwardedRef, () => {
      const handle = createHandle()
      handleRef.current = handle
      return handle
    }, [createHandle])

    function handleSceneChange(...args: Parameters<ExcalidrawOnChange>) {
      if (!runtime) return
      const [elements, appState, files] = args
      setActiveToolState(appState.activeTool.type)
      const target = getBindableTarget(appState.suggestedBindings?.[0])
      const editorRect = rootRef.current?.querySelector('.rc-editor__surface')?.getBoundingClientRect()
      if (appState.activeTool.type === 'arrow' && target && editorRect) {
        const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
        const points = [
          { x: center.x, y: target.y },
          { x: target.x + target.width, y: center.y },
          { x: center.x, y: target.y + target.height },
          { x: target.x, y: center.y },
        ].map((point) => rotatePoint(point, center, target.angle))
        setLockPoints(points.map((point) => {
          const viewport = runtime.sceneCoordsToViewportCoords(
            { sceneX: point.x, sceneY: point.y },
            appState,
          )
          return { x: viewport.x - editorRect.left, y: viewport.y - editorRect.top }
        }))
      } else if (lockPoints.length) setLockPoints([])

      const sceneJson = runtime.serializeAsJSON(elements, appState, files, 'local')
      if (!initialChangeSeenRef.current) {
        initialChangeSeenRef.current = true
        lastSceneJsonRef.current = sceneJson
        const initialElements = toInitialData(latestDocumentRef.current.snapshot).elements ?? []
        const firstDocument = createDocumentFromSnapshot(
          JSON.parse(sceneJson),
          latestDocumentRef.current.metadata,
        )
        latestDocumentRef.current = firstDocument
        if (JSON.stringify(initialElements) === JSON.stringify(elements)) return
        onChange?.(firstDocument)
        return
      }
      if (sceneJson === lastSceneJsonRef.current) return
      lastSceneJsonRef.current = sceneJson
      const next = createDocumentFromSnapshot(
        JSON.parse(sceneJson),
        latestDocumentRef.current.metadata,
      )
      latestDocumentRef.current = next
      onChange?.(next)
    }

    function enforcePointerPolicy(event: ReactPointerEvent<HTMLDivElement>) {
      if (!pencilMode || readOnly) return
      const api = apiRef.current
      if (!api) return
      const currentTool = api.getAppState().activeTool.type
      if (event.pointerType === 'pen' && currentTool !== 'freedraw') {
        api.setActiveTool({ type: 'freedraw' })
      } else if (event.pointerType === 'touch' && currentTool === 'freedraw') {
        api.setActiveTool({ type: 'selection' })
      }
    }

    if (loadError) {
      return <div className="rc-canvas-state rc-canvas-state--error" role="alert"><strong>The canvas editor could not be loaded</strong><p>{loadError.message}</p></div>
    }
    if (!runtime) {
      return <div className="rc-canvas-state" aria-live="polite"><span className="rc-spinner" /><strong>Preparing the canvas…</strong></div>
    }

    const Excalidraw = runtime.Excalidraw
    const gridOptions = typeof grid === 'object' ? grid : {}
    const gridEnabled = typeof grid === 'boolean' ? grid : grid.enabled ?? true
    const resolvedTheme = theme === 'system' ? systemTheme : theme

    return (
      <div
        ref={rootRef}
        className={['rc-editor', className].filter(Boolean).join(' ')}
        style={style}
        data-chrome={chrome}
        data-tool={activeTool}
        data-fullscreen-fallback={fallbackFullscreen || undefined}
        onPointerDownCapture={enforcePointerPolicy}
      >
        <div className="rc-editor__surface">
          <Excalidraw
            key={documentKey}
            initialData={toInitialData(document.snapshot)}
            excalidrawAPI={(api) => {
              apiRef.current = api
              const handle = createHandle()
              handleRef.current = handle
              onReady?.(handle)
            }}
            onChange={handleSceneChange}
            onLinkOpen={(element, event) => {
              const resource = latestDocumentRef.current.metadata?.resources?.[element.id]
              if (resource) {
                event.preventDefault()
                onResourceOpen?.(resource, element.id)
              } else if (element.link) onLinkOpen?.(element.link, element.id)
            }}
            autoFocus={autoFocus}
            viewModeEnabled={readOnly}
            gridModeEnabled={gridEnabled}
            objectsSnapModeEnabled={gridOptions.snap ?? gridEnabled}
            handleKeyboardGlobally={false}
            theme={resolvedTheme}
            langCode={locale as ComponentProps<ExcalidrawComponent>['langCode']}
            name={name}
            renderTopRightUI={renderTopRightUI as ComponentProps<ExcalidrawComponent>['renderTopRightUI']}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                clearCanvas: false,
                export: false,
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
                saveAsImage: false,
              },
              tools: { image: tools.image ?? false },
            }}
          />

          {chrome !== 'none' && (
            <button
              className="rc-canvas-fullscreen"
              type="button"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? <CornersIn size={18} /> : <CornersOut size={18} />}
            </button>
          )}

          {chrome !== 'none' && activeTool === 'arrow' && (
            <div className="rc-connector-hint" role="status">
              {lockPoints.length ? 'Release to lock' : 'Targets highlight when the connector locks'}
            </div>
          )}

          {chrome !== 'none' && lockPoints.length > 0 && (
            <div className="rc-lock-points" aria-hidden="true">
              {lockPoints.map((point, index) => (
                <i className="rc-lock-point" key={index} style={{ left: point.x, top: point.y }} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  },
)

RepoCanvasEditor.displayName = 'RepoCanvasEditor'
