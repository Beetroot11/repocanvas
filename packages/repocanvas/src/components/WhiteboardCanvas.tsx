'use client'

import {
  ArrowLeft,
  Download,
  FileArrowUp,
  LinkSimple,
  Warning,
} from '@phosphor-icons/react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from 'react'
import { useRepoCanvasConfig } from '../context'
import {
  assertSupportedDocument,
  parseRepoCanvasDocument,
  serializeRepoCanvasDocument,
} from '../engine/document'
import {
  createDocumentFromCode,
  createDocumentFromMarkdown,
  createDocumentFromMermaid,
} from '../engine/importers'
import {
  BrowserRecoveryJournal,
  type RecoveryJournal,
} from '../persistence/recoveryJournal'
import {
  RevisionConflictError,
  type RepoCanvasDocument,
  type RepoCanvasResource,
  type SaveStatus,
  type SaveStatusDetail,
  type Whiteboard,
  type WhiteboardStorageAdapter,
} from '../types'
import { LogoMark } from './LogoMark'
import {
  RepoCanvasEditor,
  type RepoCanvasEditorHandle,
  type RepoCanvasExportFormat,
  type RepoCanvasGridOptions,
  type RepoCanvasTheme,
  type RepoCanvasToolOptions,
} from './RepoCanvasEditor'

export interface WhiteboardCanvasHandle extends RepoCanvasEditorHandle {
  save(): Promise<boolean>
  retrySave(): Promise<boolean>
  saveAsCopy(): Promise<string | undefined>
  exportRecovery(): Promise<void>
  getSaveStatus(): SaveStatusDetail
}

export interface WhiteboardCanvasProps {
  whiteboardId: string
  storage?: WhiteboardStorageAdapter
  onBack?: () => void
  onRecoveredCopy?: (whiteboardId: string) => void
  onDocumentChange?: (document: RepoCanvasDocument) => void
  onSaveStatusChange?: (status: SaveStatus) => void
  onSaveStatusDetailChange?: (detail: SaveStatusDetail) => void
  onError?: (error: Error) => void
  onReady?: (handle: WhiteboardCanvasHandle) => void
  onResourceOpen?: (resource: RepoCanvasResource, elementId: string) => void
  onLinkOpen?: (link: string, elementId: string) => void
  autosaveDelay?: number
  maxAutomaticRetries?: number
  retryBaseDelay?: number
  recoveryJournal?: boolean | RecoveryJournal
  embedded?: boolean
  chrome?: 'full' | 'minimal' | 'none'
  readOnly?: boolean
  theme?: RepoCanvasTheme
  locale?: string
  grid?: boolean | RepoCanvasGridOptions
  tools?: RepoCanvasToolOptions
  generateThumbnails?: boolean
  pencilMode?: boolean
  className?: string
  style?: CSSProperties
}

type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; board: Whiteboard; document: RepoCanvasDocument }
  | { status: 'error'; message: string }

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: 'Ready',
  dirty: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  offline: 'Offline',
  failed: 'Save failed',
  conflict: 'Save conflict',
}

function readableError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Something went wrong.')
}

function isRevisionConflict(error: unknown): error is RevisionConflictError {
  return error instanceof RevisionConflictError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'REVISION_CONFLICT'
  )
}

function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'whiteboard'
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvas({
    whiteboardId,
    storage: storageProp,
    onBack,
    onRecoveredCopy,
    onDocumentChange,
    onSaveStatusChange,
    onSaveStatusDetailChange,
    onError,
    onReady,
    onResourceOpen,
    onLinkOpen,
    autosaveDelay = 1000,
    maxAutomaticRetries = 5,
    retryBaseDelay = 1000,
    recoveryJournal = true,
    embedded = false,
    chrome = 'full',
    readOnly = false,
    theme = 'light',
    locale,
    grid = true,
    tools,
    generateThumbnails = true,
    pencilMode = true,
    className,
    style,
  }, forwardedRef) {
    const { storage } = useRepoCanvasConfig(storageProp)
    const editorRef = useRef<RepoCanvasEditorHandle>(null)
    const importInputRef = useRef<HTMLInputElement>(null)
    const latestDocumentRef = useRef<RepoCanvasDocument | null>(null)
    const whiteboardIdRef = useRef(whiteboardId)
    const revisionRef = useRef(0)
    const changeVersionRef = useRef(0)
    const savedVersionRef = useRef(0)
    const sessionRef = useRef(0)
    const savePromiseRef = useRef<Promise<boolean> | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const retryAttemptRef = useRef(0)
    const conflictBlockedRef = useRef(false)
    const mountedRef = useRef(true)
    const saveNowRef = useRef<(manual?: boolean) => Promise<boolean>>(async () => true)
    const [boardState, setBoardState] = useState<BoardState>({ status: 'loading' })
    const [saveDetail, setSaveDetail] = useState<SaveStatusDetail>({ status: 'idle' })
    const saveDetailRef = useRef(saveDetail)
    const [title, setTitle] = useState('')
    const [recoveryNotice, setRecoveryNotice] = useState<string>()

    const journal = useMemo<RecoveryJournal | undefined>(() => {
      if (!recoveryJournal) return undefined
      if (recoveryJournal === true) return new BrowserRecoveryJournal()
      return recoveryJournal
    }, [recoveryJournal])

    useEffect(() => {
      saveDetailRef.current = saveDetail
      onSaveStatusChange?.(saveDetail.status)
      onSaveStatusDetailChange?.(saveDetail)
    }, [onSaveStatusChange, onSaveStatusDetailChange, saveDetail])

    const updateStatus = useCallback((status: SaveStatus, error?: Error) => {
      if (!mountedRef.current) return
      const detail: SaveStatusDetail = {
        status,
        revision: revisionRef.current || undefined,
        retryAttempt: retryAttemptRef.current || undefined,
        ...(error ? { error } : {}),
      }
      saveDetailRef.current = detail
      setSaveDetail(detail)
    }, [])

    const clearTimers = useCallback(() => {
      clearTimeout(saveTimerRef.current)
      clearTimeout(retryTimerRef.current)
    }, [])

    const saveNow = useCallback(async (manual = false): Promise<boolean> => {
      if (readOnly) return true
      if (manual) {
        clearTimeout(retryTimerRef.current)
        retryAttemptRef.current = 0
      }
      if (conflictBlockedRef.current) return false
      if (savedVersionRef.current === changeVersionRef.current) return true
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        updateStatus('offline')
        return false
      }
      if (savePromiseRef.current) {
        const currentResult = await savePromiseRef.current
        if (!currentResult || savedVersionRef.current === changeVersionRef.current) return currentResult
      }

      const document = latestDocumentRef.current
      if (!document) return true
      const targetVersion = changeVersionRef.current
      const targetSession = sessionRef.current
      const targetId = whiteboardIdRef.current
      const expectedRevision = revisionRef.current
      updateStatus('saving')

      const request = (async () => {
        try {
          const thumbnailUrl = generateThumbnails
            ? await editorRef.current?.createThumbnail().catch(() => undefined)
            : undefined
          const saved = await storage.save({
            id: targetId,
            document,
            expectedRevision,
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
          })
          if (targetSession !== sessionRef.current) return true
          revisionRef.current = saved.revision
          savedVersionRef.current = targetVersion
          retryAttemptRef.current = 0
          if (savedVersionRef.current === changeVersionRef.current) {
            await journal?.clear(targetId)
            updateStatus('saved')
          } else {
            updateStatus('dirty')
            queueMicrotask(() => void saveNowRef.current())
          }
          if (mountedRef.current) {
            setBoardState((current) => current.status === 'ready' && current.board.id === targetId
              ? { ...current, board: { ...current.board, revision: saved.revision, updatedAt: saved.updatedAt } }
              : current)
          }
          return true
        } catch (unknownError) {
          if (targetSession !== sessionRef.current) return false
          const error = readableError(unknownError)
          onError?.(error)
          if (isRevisionConflict(unknownError)) {
            conflictBlockedRef.current = true
            updateStatus('conflict', error)
            return false
          }
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            updateStatus('offline', error)
            return false
          }

          retryAttemptRef.current += 1
          updateStatus('failed', error)
          if (retryAttemptRef.current <= maxAutomaticRetries) {
            const delay = Math.min(30_000, retryBaseDelay * 2 ** (retryAttemptRef.current - 1))
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = setTimeout(() => void saveNowRef.current(), delay)
          }
          return false
        }
      })()

      savePromiseRef.current = request
      try {
        return await request
      } finally {
        if (savePromiseRef.current === request) savePromiseRef.current = null
      }
    }, [generateThumbnails, journal, maxAutomaticRetries, onError, readOnly, retryBaseDelay, storage, updateStatus])

    saveNowRef.current = saveNow

    const loadBoard = useCallback(async (targetSession: number) => {
      setBoardState({ status: 'loading' })
      setRecoveryNotice(undefined)
      updateStatus('idle')
      conflictBlockedRef.current = false
      retryAttemptRef.current = 0
      changeVersionRef.current = 0
      savedVersionRef.current = 0
      try {
        const board = await storage.load(whiteboardId)
        if (targetSession !== sessionRef.current) return
        assertSupportedDocument(board.document)
        let nextDocument = board.document
        const recovered = await journal?.load(whiteboardId)
        if (targetSession !== sessionRef.current) return
        if (
          recovered &&
          serializeRepoCanvasDocument(recovered.document, 0) !== serializeRepoCanvasDocument(board.document, 0)
        ) {
          nextDocument = recovered.document
          changeVersionRef.current = 1
          if (recovered.baseRevision === board.revision) {
            updateStatus('dirty')
            setRecoveryNotice('Recovered unsaved browser-local changes.')
          } else {
            conflictBlockedRef.current = true
            updateStatus('conflict', new RevisionConflictError(recovered.baseRevision, board.revision))
            setRecoveryNotice('Recovered local changes conflict with a newer saved revision.')
          }
        }
        revisionRef.current = board.revision
        latestDocumentRef.current = nextDocument
        whiteboardIdRef.current = whiteboardId
        setTitle(board.title)
        setBoardState({ status: 'ready', board, document: nextDocument })
      } catch (unknownError) {
        if (targetSession !== sessionRef.current) return
        const error = readableError(unknownError)
        onError?.(error)
        setBoardState({ status: 'error', message: error.message })
      }
    }, [journal, onError, storage, updateStatus, whiteboardId])

    useEffect(() => {
      mountedRef.current = true
      clearTimers()
      const targetSession = ++sessionRef.current
      whiteboardIdRef.current = whiteboardId
      void loadBoard(targetSession)
      return () => {
        clearTimers()
        if (savedVersionRef.current < changeVersionRef.current && !conflictBlockedRef.current) {
          void saveNowRef.current()
        }
        sessionRef.current += 1
      }
    }, [clearTimers, loadBoard, whiteboardId])

    useEffect(() => () => {
      mountedRef.current = false
    }, [])

    useEffect(() => {
      if (boardState.status !== 'ready') return
      if (savedVersionRef.current < changeVersionRef.current && !conflictBlockedRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => void saveNowRef.current(), autosaveDelay)
      }
    }, [autosaveDelay, boardState.status])

    useEffect(() => {
      if (typeof window === 'undefined' || typeof globalThis.document === 'undefined') return
      const handleVisibility = () => {
        if (globalThis.document.visibilityState === 'hidden') void saveNowRef.current()
      }
      const handleOffline = () => {
        if (savedVersionRef.current < changeVersionRef.current) updateStatus('offline')
      }
      const handleOnline = () => {
        if (savedVersionRef.current < changeVersionRef.current && !conflictBlockedRef.current) {
          void saveNowRef.current(true)
        }
      }
      globalThis.document.addEventListener('visibilitychange', handleVisibility)
      window.addEventListener('offline', handleOffline)
      window.addEventListener('online', handleOnline)
      return () => {
        globalThis.document.removeEventListener('visibilitychange', handleVisibility)
        window.removeEventListener('offline', handleOffline)
        window.removeEventListener('online', handleOnline)
      }
    }, [updateStatus])

    const handleDocumentChange = useCallback((document: RepoCanvasDocument) => {
      if (readOnly) return
      latestDocumentRef.current = document
      changeVersionRef.current += 1
      retryAttemptRef.current = 0
      clearTimeout(saveTimerRef.current)
      clearTimeout(retryTimerRef.current)
      onDocumentChange?.(document)
      updateStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'dirty')
      void journal?.save({
        version: 1,
        whiteboardId: whiteboardIdRef.current,
        baseRevision: revisionRef.current,
        savedAt: new Date().toISOString(),
        document,
      })
      if (typeof navigator === 'undefined' || navigator.onLine) {
        saveTimerRef.current = setTimeout(() => void saveNowRef.current(), autosaveDelay)
      }
    }, [autosaveDelay, journal, onDocumentChange, readOnly, updateStatus])

    async function commitTitle() {
      if (boardState.status !== 'ready' || readOnly) return
      const nextTitle = title.trim()
      if (!nextTitle || nextTitle === boardState.board.title) {
        setTitle(boardState.board.title)
        return
      }
      if (!(await saveNow(true))) return
      try {
        const summary = await storage.rename(whiteboardId, nextTitle, {
          expectedRevision: revisionRef.current,
        })
        revisionRef.current = summary.revision
        setBoardState({
          ...boardState,
          board: { ...boardState.board, ...summary },
        })
        updateStatus('saved')
      } catch (unknownError) {
        const error = readableError(unknownError)
        if (isRevisionConflict(unknownError)) {
          conflictBlockedRef.current = true
          updateStatus('conflict', error)
        } else updateStatus('failed', error)
        onError?.(error)
        setTitle(boardState.board.title)
      }
    }

    const exportRecovery = useCallback(async () => {
      if (editorRef.current) {
        await editorRef.current.download('json', `${title} recovery`)
        return
      }
      if (typeof window === 'undefined' || !latestDocumentRef.current) return
      const blob = new Blob([serializeRepoCanvasDocument(latestDocumentRef.current)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = globalThis.document.createElement('a')
      link.href = url
      link.download = `${safeFilename(title)}-recovery.json`
      link.click()
      queueMicrotask(() => URL.revokeObjectURL(url))
    }, [title])

    const recoverCopy = useCallback(async (): Promise<string | undefined> => {
      const document = latestDocumentRef.current
      if (!document) return undefined
      try {
        const copy = await storage.create({ title: `${title} recovered`, document })
        await journal?.clear(whiteboardIdRef.current)
        setRecoveryNotice(`Recovered as “${copy.title}”.`)
        onRecoveredCopy?.(copy.id)
        return copy.id
      } catch (unknownError) {
        const error = readableError(unknownError)
        onError?.(error)
        await exportRecovery()
        return undefined
      }
    }, [exportRecovery, journal, onError, onRecoveredCopy, storage, title])

    const createCanvasHandle = useCallback((): WhiteboardCanvasHandle => ({
      getDocument: () => latestDocumentRef.current ?? editorRef.current?.getDocument() ?? (() => { throw new Error('The canvas is not ready.') })(),
      replaceDocument(document) {
        assertSupportedDocument(document)
        latestDocumentRef.current = document
        if (editorRef.current) editorRef.current.replaceDocument(document)
        else handleDocumentChange(document)
      },
      focus: () => editorRef.current?.focus(),
      zoomToFit: () => editorRef.current?.zoomToFit(),
      setActiveTool: (tool) => editorRef.current?.setActiveTool(tool),
      toggleFullscreen: () => editorRef.current?.toggleFullscreen() ?? Promise.resolve(),
      exportBlob: (format) => {
        if (!editorRef.current) throw new Error('The canvas is not ready.')
        return editorRef.current.exportBlob(format)
      },
      copyToClipboard: (format) => {
        if (!editorRef.current) throw new Error('The canvas is not ready.')
        return editorRef.current.copyToClipboard(format)
      },
      download: (format, filename) => {
        if (!editorRef.current) throw new Error('The canvas is not ready.')
        return editorRef.current.download(format, filename)
      },
      createThumbnail: (maxDimension) => editorRef.current?.createThumbnail(maxDimension) ?? Promise.resolve(undefined),
      attachResourceToSelection: (resource) => editorRef.current?.attachResourceToSelection(resource) ?? [],
      removeResourceFromSelection: () => editorRef.current?.removeResourceFromSelection() ?? [],
      save: () => saveNow(true),
      retrySave: () => saveNow(true),
      saveAsCopy: recoverCopy,
      exportRecovery,
      getSaveStatus: () => saveDetailRef.current,
    }), [exportRecovery, handleDocumentChange, recoverCopy, saveNow])

    useImperativeHandle(forwardedRef, createCanvasHandle, [createCanvasHandle])

    async function handleBack() {
      if (await saveNow(true)) onBack?.()
    }

    async function handleImport(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        const source = await file.text()
        const extension = file.name.split('.').at(-1)?.toLocaleLowerCase()
        const document = extension === 'mmd' || extension === 'mermaid'
          ? await createDocumentFromMermaid(source)
          : extension === 'md' || extension === 'markdown'
            ? await createDocumentFromMarkdown(source)
            : extension === 'json' || extension === 'excalidraw'
              ? parseRepoCanvasDocument(source)
              : await createDocumentFromCode(source, extension ?? 'text')
        editorRef.current?.replaceDocument(document)
      } catch (unknownError) {
        const error = readableError(unknownError)
        onError?.(error)
        updateStatus('failed', error)
      }
    }

    async function handleExport(format: RepoCanvasExportFormat) {
      if (!format) return
      try {
        await editorRef.current?.download(format, title)
      } catch (unknownError) {
        const error = readableError(unknownError)
        onError?.(error)
      }
    }

    function attachResource() {
      if (typeof window === 'undefined') return
      const uri = window.prompt('File, symbol, issue, route, commit, or URL to attach to the selection:')?.trim()
      if (!uri) return
      const kind: RepoCanvasResource['kind'] = /^https?:\/\//i.test(uri) ? 'url' : 'file'
      const ids = editorRef.current?.attachResourceToSelection({ kind, uri }) ?? []
      if (!ids.length) setRecoveryNotice('Select one or more shapes before attaching a resource.')
      else setRecoveryNotice(`Attached a resource to ${ids.length} selected ${ids.length === 1 ? 'shape' : 'shapes'}.`)
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
          <div>
            <button className="rc-button rc-button--primary" type="button" onClick={() => void loadBoard(++sessionRef.current)}>Try again</button>
            {onBack && <button className="rc-button rc-button--quiet" type="button" onClick={onBack}>Back to library</button>}
          </div>
        </div>
      )
    }

    return (
      <section
        className={['rc-canvas', className].filter(Boolean).join(' ')}
        style={style}
        data-chrome={chrome}
        data-embedded={embedded || undefined}
      >
        {chrome === 'full' && (
          <header className="rc-canvas__header">
            <div className="rc-canvas__identity">
              {onBack && (
                <button type="button" aria-label="Back to whiteboard library" title="Back to library" onClick={() => void handleBack()}>
                  <ArrowLeft size={20} />
                </button>
              )}
              <LogoMark compact />
              <input
                className="rc-canvas-title"
                aria-label="Whiteboard title"
                value={title}
                readOnly={readOnly}
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

            <div className="rc-canvas__header-actions">
              {!readOnly && (
                <>
                  <button type="button" title="Import JSON, Mermaid, Markdown, or code" aria-label="Import a document or code" onClick={() => importInputRef.current?.click()}>
                    <FileArrowUp size={17} />
                  </button>
                  <input ref={importInputRef} className="rc-visually-hidden" type="file" accept="application/json,.json,.excalidraw,.mmd,.mermaid,.md,.markdown,.txt,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.cs,.sql" onChange={(event) => void handleImport(event)} />
                  <button type="button" title="Attach a developer resource to selected shapes" aria-label="Attach resource" onClick={attachResource}>
                    <LinkSimple size={17} />
                  </button>
                </>
              )}
              <label className="rc-export-control" title="Export whiteboard">
                <Download size={16} aria-hidden="true" />
                <span className="rc-visually-hidden">Export whiteboard</span>
                <select aria-label="Export whiteboard" defaultValue="" onChange={(event) => {
                  const format = event.target.value as RepoCanvasExportFormat
                  event.target.value = ''
                  if (format) void handleExport(format)
                }}>
                  <option value="" disabled>Export</option>
                  <option value="png">PNG image</option>
                  <option value="svg">SVG image</option>
                  <option value="json">RepoCanvas JSON</option>
                </select>
              </label>
            </div>

            <div className="rc-canvas__header-meta">
              <span className="rc-canvas__input-note">{readOnly ? 'Read-only review' : 'Pencil draws · touch moves'}</span>
              <span className="rc-save-status" data-status={saveDetail.status} role="status" aria-live="polite">
                <span className="rc-status-light" /> {readOnly ? 'Read only' : SAVE_LABELS[saveDetail.status]}
              </span>
            </div>
          </header>
        )}

        <div className="rc-canvas__editor">
          <RepoCanvasEditor
            ref={editorRef}
            document={boardState.document}
            documentKey={whiteboardId}
            onChange={handleDocumentChange}
            onError={onError}
            onResourceOpen={onResourceOpen}
            onLinkOpen={onLinkOpen}
            onReady={() => {
              const handle = createCanvasHandle()
              onReady?.(handle)
            }}
            readOnly={readOnly}
            theme={theme}
            locale={locale}
            grid={grid}
            tools={tools}
            chrome={chrome === 'none' ? 'none' : 'minimal'}
            name={title}
            pencilMode={pencilMode}
          />

          {recoveryNotice && (
            <div className="rc-canvas-notice" role="status">
              <span>{recoveryNotice}</span>
              <button type="button" aria-label="Dismiss notice" onClick={() => setRecoveryNotice(undefined)}>×</button>
            </div>
          )}

          {(saveDetail.status === 'failed' || saveDetail.status === 'conflict') && (
            <div className="rc-save-recovery" role="alert">
              <Warning size={20} weight="fill" />
              <div>
                <strong>{saveDetail.status === 'conflict' ? 'A newer revision exists' : 'Your changes are not saved'}</strong>
                <span>
                  {saveDetail.status === 'conflict'
                    ? 'Keep this work by saving it as a new board.'
                    : retryAttemptRef.current <= maxAutomaticRetries
                      ? `The local canvas is intact. Retry ${retryAttemptRef.current} of ${maxAutomaticRetries} is scheduled.`
                      : 'The local canvas is intact. Automatic retries have stopped.'}
                </span>
              </div>
              {saveDetail.status === 'failed' && <button type="button" onClick={() => void saveNow(true)}>Retry</button>}
              {saveDetail.status === 'conflict' && <button type="button" onClick={() => void recoverCopy()}>Save as copy</button>}
              <button type="button" onClick={() => void exportRecovery()}><Download size={16} />Export recovery</button>
            </div>
          )}
        </div>
      </section>
    )
  },
)

WhiteboardCanvas.displayName = 'WhiteboardCanvas'
