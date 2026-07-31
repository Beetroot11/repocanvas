import {
  ArrowLeft,
  CornersIn,
  CornersOut,
  Download,
  Warning,
} from '@phosphor-icons/react'
import { Excalidraw, sceneCoordsToViewportCoords, serializeAsJSON } from '@excalidraw/excalidraw'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useRepoCanvasConfig } from '../context'
import { assertSupportedDocument, createDocumentFromSnapshot } from '../engine/document'
import {
  RevisionConflictError,
  type SaveStatus,
  type Whiteboard,
  type WhiteboardStorageAdapter,
} from '../types'
import { LogoMark } from './LogoMark'

export interface WhiteboardCanvasProps {
  whiteboardId: string
  storage?: WhiteboardStorageAdapter
  onBack?: () => void
  onRecoveredCopy?: (whiteboardId: string) => void
  autosaveDelay?: number
  embedded?: boolean
  chrome?: 'full' | 'minimal' | 'none'
  onSaveStatusChange?: (status: SaveStatus) => void
}

type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; board: Whiteboard }
  | { status: 'error'; message: string }

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

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: 'Ready',
  saving: 'Saving…',
  saved: 'Saved',
  offline: 'Offline',
  failed: 'Save failed',
  conflict: 'Save conflict',
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function isRevisionConflict(error: unknown): error is RevisionConflictError {
  return (
    error instanceof RevisionConflictError ||
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 'REVISION_CONFLICT')
  )
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

export function WhiteboardCanvas({
  whiteboardId,
  storage: storageProp,
  onBack,
  onRecoveredCopy,
  autosaveDelay = 1000,
  embedded = false,
  chrome = 'full',
  onSaveStatusChange,
}: WhiteboardCanvasProps) {
  const { storage } = useRepoCanvasConfig(storageProp)
  const [boardState, setBoardState] = useState<BoardState>({ status: 'loading' })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const [title, setTitle] = useState('')
  const [activeTool, setActiveTool] = useState('selection')
  const [lockPoints, setLockPoints] = useState<LockPoint[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const initialDataRef = useRef<ExcalidrawInitialDataState>(EMPTY_SCENE)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const latestSnapshotRef = useRef<ExcalidrawInitialDataState>(EMPTY_SCENE)
  const lastSceneJsonRef = useRef('')
  const revisionRef = useRef(0)
  const changeVersionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const saveInFlightRef = useRef(false)
  const saveBlockedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveNowRef = useRef<() => Promise<void>>(async () => {})

  const captureScene = useCallback((): ExcalidrawInitialDataState => {
    const api = apiRef.current
    if (!api) return latestSnapshotRef.current
    return JSON.parse(serializeAsJSON(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      'local',
    )) as ExcalidrawInitialDataState
  }, [])

  const loadBoard = useCallback(async () => {
    apiRef.current = null
    clearTimeout(saveTimerRef.current)
    setBoardState({ status: 'loading' })
    setSaveStatus('idle')
    saveBlockedRef.current = false
    changeVersionRef.current = 0
    savedVersionRef.current = 0
    try {
      const board = await storage.load(whiteboardId)
      assertSupportedDocument(board.document)
      const initialData = toInitialData(board.document.snapshot)
      revisionRef.current = board.revision
      initialDataRef.current = initialData
      latestSnapshotRef.current = initialData
      lastSceneJsonRef.current = JSON.stringify(initialData)
      setTitle(board.title)
      setBoardState({ status: 'ready', board })
    } catch (error) {
      setBoardState({ status: 'error', message: readableError(error) })
    }
  }, [storage, whiteboardId])

  useEffect(() => {
    void loadBoard()
    return () => clearTimeout(saveTimerRef.current)
  }, [loadBoard])

  useEffect(() => {
    onSaveStatusChange?.(saveStatus)
  }, [onSaveStatusChange, saveStatus])

  saveNowRef.current = async () => {
    if (!apiRef.current || saveInFlightRef.current || saveBlockedRef.current) return
    if (savedVersionRef.current === changeVersionRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('offline')
      return
    }

    const targetVersion = changeVersionRef.current
    const snapshot = captureScene()
    saveInFlightRef.current = true
    setSaveStatus('saving')

    try {
      const saved = await storage.save({
        id: whiteboardId,
        document: createDocumentFromSnapshot(snapshot),
        expectedRevision: revisionRef.current,
      })
      revisionRef.current = saved.revision
      savedVersionRef.current = targetVersion
      setSaveStatus(savedVersionRef.current === changeVersionRef.current ? 'saved' : 'saving')
    } catch (error) {
      if (isRevisionConflict(error)) {
        saveBlockedRef.current = true
        setSaveStatus('conflict')
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSaveStatus('offline')
      } else {
        setSaveStatus('failed')
      }
    } finally {
      saveInFlightRef.current = false
      if (!saveBlockedRef.current && savedVersionRef.current < changeVersionRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => void saveNowRef.current(), 0)
      }
    }
  }

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void saveNowRef.current()
    }
    const handleOffline = () => {
      if (savedVersionRef.current < changeVersionRef.current) setSaveStatus('offline')
    }
    const handleOnline = () => {
      if (savedVersionRef.current < changeVersionRef.current) void saveNowRef.current()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === rootRef.current
      setIsFullscreen(active || fallbackFullscreen)
      if (!document.fullscreenElement && !fallbackFullscreen) {
        rootRef.current?.querySelector<HTMLInputElement>('.rc-canvas-title')?.focus()
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [fallbackFullscreen])

  function handleSceneChange(...args: Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['onChange']>>) {
    const [elements, appState, files] = args
    setActiveTool(appState.activeTool.type)
    const target = getBindableTarget(appState.suggestedBindings[0])
    const editorRect = rootRef.current?.querySelector('.rc-canvas__editor')?.getBoundingClientRect()
    if (appState.activeTool.type === 'arrow' && target && editorRect) {
      const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
      const scenePoints = [
        { x: center.x, y: target.y },
        { x: target.x + target.width, y: center.y },
        { x: center.x, y: target.y + target.height },
        { x: target.x, y: center.y },
      ].map((point) => rotatePoint(point, center, target.angle))
      setLockPoints(scenePoints.map((point) => {
        const viewportPoint = sceneCoordsToViewportCoords(
          { sceneX: point.x, sceneY: point.y },
          appState,
        )
        return { x: viewportPoint.x - editorRect.left, y: viewportPoint.y - editorRect.top }
      }))
    } else if (lockPoints.length) {
      setLockPoints([])
    }
    const sceneJson = serializeAsJSON(elements, appState, files, 'local')
    if (sceneJson === lastSceneJsonRef.current) return
    lastSceneJsonRef.current = sceneJson
    latestSnapshotRef.current = JSON.parse(sceneJson) as ExcalidrawInitialDataState
    changeVersionRef.current += 1
    clearTimeout(saveTimerRef.current)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('offline')
      return
    }
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(() => void saveNowRef.current(), autosaveDelay)
  }

  function enforcePointerPolicy(event: ReactPointerEvent<HTMLDivElement>) {
    const api = apiRef.current
    if (!api) return
    const currentTool = api.getAppState().activeTool.type
    if (event.pointerType === 'pen' && currentTool !== 'freedraw') {
      api.setActiveTool({ type: 'freedraw' })
    } else if (event.pointerType === 'touch' && currentTool === 'freedraw') {
      api.setActiveTool({ type: 'selection' })
    }
  }

  async function commitTitle() {
    if (boardState.status !== 'ready') return
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle === boardState.board.title) {
      setTitle(boardState.board.title)
      return
    }
    try {
      const summary = await storage.rename(whiteboardId, nextTitle)
      setBoardState({ status: 'ready', board: { ...boardState.board, ...summary } })
    } catch {
      setTitle(boardState.board.title)
    }
  }

  async function toggleFullscreen() {
    const root = rootRef.current
    if (!root) return
    if (document.fullscreenElement === root) {
      await document.exitFullscreen()
      return
    }
    if (fallbackFullscreen) {
      setFallbackFullscreen(false)
      setIsFullscreen(false)
      return
    }
    try {
      if (document.fullscreenEnabled) await root.requestFullscreen()
      else {
        setFallbackFullscreen(true)
        setIsFullscreen(true)
      }
    } catch {
      setFallbackFullscreen(true)
      setIsFullscreen(true)
    }
  }

  function exportRecovery() {
    const payload = createDocumentFromSnapshot(captureScene())
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'whiteboard'}-recovery.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function recoverCopy() {
    try {
      const copy = await storage.create({ title: `${title} recovered` })
      const saved = await storage.save({
        id: copy.id,
        document: createDocumentFromSnapshot(captureScene()),
        expectedRevision: copy.revision,
      })
      onRecoveredCopy?.(saved.id)
    } catch {
      exportRecovery()
    }
  }

  if (boardState.status === 'loading') {
    return <div className="rc-canvas-state"><span className="rc-spinner" /><strong>Preparing the canvas…</strong></div>
  }

  if (boardState.status === 'error') {
    return (
      <div className="rc-canvas-state rc-canvas-state--error" role="alert">
        <Warning size={30} />
        <h2>This whiteboard could not be opened</h2>
        <p>{boardState.message}</p>
        <div><button className="rc-button rc-button--primary" type="button" onClick={() => void loadBoard()}>Try again</button>{onBack && <button className="rc-button rc-button--quiet" type="button" onClick={onBack}>Back to library</button>}</div>
      </div>
    )
  }

  return (
    <section
      ref={rootRef}
      className="rc-canvas"
      data-chrome={chrome}
      data-tool={activeTool}
      data-fullscreen-fallback={fallbackFullscreen || undefined}
      data-embedded={embedded || undefined}
      onPointerDownCapture={enforcePointerPolicy}
    >
      {chrome === 'full' && <header className="rc-canvas__header">
        <div className="rc-canvas__identity">
          {onBack && <button type="button" aria-label="Back to whiteboard library" title="Back to library" onClick={onBack}><ArrowLeft size={20} /></button>}
          <LogoMark compact />
          <input
            className="rc-canvas-title"
            aria-label="Whiteboard title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setTitle(boardState.board.title)
                event.currentTarget.blur()
              }
            }}
          />
        </div>
        <div className="rc-canvas__header-meta">
          <span className="rc-canvas__input-note">Pencil draws · touch moves</span>
          <span className="rc-save-status" data-status={saveStatus} role="status" aria-live="polite">
            <span className="rc-status-light" /> {SAVE_LABELS[saveStatus]}
          </span>
        </div>
      </header>}

      <div className="rc-canvas__editor">
        <Excalidraw
          key={whiteboardId}
          initialData={initialDataRef.current}
          excalidrawAPI={(api) => { apiRef.current = api }}
          onChange={handleSceneChange}
          autoFocus
          gridModeEnabled
          objectsSnapModeEnabled
          handleKeyboardGlobally={false}
          theme="light"
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
            tools: { image: false },
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
          <div className="rc-connector-hint" role="status">{lockPoints.length ? 'Release to lock' : 'Targets highlight when the connector locks'}</div>
        )}

        {chrome !== 'none' && lockPoints.length > 0 && (
          <div className="rc-lock-points" aria-hidden="true">
            {lockPoints.map((point, index) => (
              <i className="rc-lock-point" key={index} style={{ left: point.x, top: point.y }} />
            ))}
          </div>
        )}

        {(saveStatus === 'failed' || saveStatus === 'conflict') && (
          <div className="rc-save-recovery" role="alert">
            <Warning size={20} weight="fill" />
            <div>
              <strong>{saveStatus === 'conflict' ? 'A newer revision exists' : 'Your changes are not saved'}</strong>
              <span>{saveStatus === 'conflict' ? 'Keep this work by saving it as a new board.' : 'The local canvas is still intact.'}</span>
            </div>
            {saveStatus === 'failed' && <button type="button" onClick={() => { saveBlockedRef.current = false; void saveNowRef.current() }}>Retry</button>}
            {saveStatus === 'conflict' && <button type="button" onClick={() => void recoverCopy()}>Save as copy</button>}
            <button type="button" onClick={exportRecovery}><Download size={16} /> Export recovery</button>
          </div>
        )}
      </div>
    </section>
  )
}
