import {
  Archive,
  ArrowClockwise,
  CopySimple,
  PencilSimple,
  Plus,
  Tray,
  Warning,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRepoCanvasConfig } from '../context'
import type { WhiteboardStorageAdapter, WhiteboardSummary } from '../types'
import { LogoMark } from './LogoMark'

export interface WhiteboardLibraryProps {
  storage?: WhiteboardStorageAdapter
  onOpen: (whiteboardId: string) => void
  title?: string
  variant?: 'full' | 'index'
  selectedWhiteboardId?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function formatRelativeDate(value: string): string {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

export function WhiteboardLibrary({
  storage: storageProp,
  onOpen,
  title = 'Whiteboards',
  variant = 'full',
  selectedWhiteboardId,
}: WhiteboardLibraryProps) {
  const { storage } = useRepoCanvasConfig(storageProp)
  const [boards, setBoards] = useState<WhiteboardSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [showArchived, setShowArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedWhiteboardId)
  const [creating, setCreating] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [editingId, setEditingId] = useState<string>()
  const [editingTitle, setEditingTitle] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const createInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoadState({ status: 'loading' })
    try {
      const nextBoards = await storage.list()
      setBoards(nextBoards)
      setSelectedId((current) => current ?? nextBoards.find((board) => !board.archivedAt)?.id)
      setLoadState({ status: 'ready' })
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
    }
  }, [storage])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (creating) createInputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (selectedWhiteboardId) setSelectedId(selectedWhiteboardId)
  }, [selectedWhiteboardId])

  const visibleBoards = useMemo(
    () => boards.filter((board) => Boolean(board.archivedAt) === showArchived),
    [boards, showArchived],
  )
  const selectedBoard = boards.find((board) => board.id === selectedId)

  async function createBoard(event: FormEvent) {
    event.preventDefault()
    if (!createTitle.trim()) return
    setBusyId('create')
    try {
      const board = await storage.create({ title: createTitle })
      setCreateTitle('')
      setCreating(false)
      onOpen(board.id)
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
    } finally {
      setBusyId(undefined)
    }
  }

  async function commitRename(id: string) {
    if (!editingTitle.trim()) return
    setBusyId(id)
    try {
      await storage.rename(id, editingTitle)
      setEditingId(undefined)
      await refresh()
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
    } finally {
      setBusyId(undefined)
    }
  }

  async function duplicateBoard(board: WhiteboardSummary) {
    setBusyId(board.id)
    try {
      const copy = await storage.duplicate(board.id)
      await refresh()
      setSelectedId(copy.id)
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
    } finally {
      setBusyId(undefined)
    }
  }

  async function toggleArchive(board: WhiteboardSummary) {
    setBusyId(board.id)
    try {
      if (board.archivedAt) await storage.restore(board.id)
      else await storage.archive(board.id)
      await refresh()
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <section className={`rc-library rc-library--${variant}`} aria-labelledby="rc-library-title">
      {variant === 'full' && <header className="rc-library__masthead">
        <div className="rc-library__brand">
          <LogoMark />
          <div>
            <span className="rc-library__product">RepoCanvas</span>
            <span className="rc-library__tagline">Your project memory, mapped.</span>
          </div>
        </div>
        <div className="rc-library__sync" aria-label="Library synced">
          <span className="rc-status-light" />
          Library ready
        </div>
      </header>}

      <div className="rc-library__body">
        {variant === 'full' && <aside className="rc-library__rail" aria-label="Library sections">
          <LogoMark compact />
          <span className="rc-library__rail-line" />
          <span className="rc-library__rail-label">RC / LIB</span>
        </aside>}

        <main className="rc-library__manifest">
          <div className="rc-library__heading-row">
            <div>
              <h1 id="rc-library-title">{title}</h1>
              <p>{showArchived ? 'Recover boards kept out of the active library.' : 'A board for each part of the project.'}</p>
            </div>
            <button
              className="rc-segmented-toggle"
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              <Archive size={16} />
              {showArchived ? 'Active boards' : 'Archived'}
              <span>{boards.filter((board) => Boolean(board.archivedAt) === !showArchived).length}</span>
            </button>
          </div>

          {loadState.status === 'loading' && (
            <div className="rc-state" aria-live="polite">
              <span className="rc-spinner" />
              <strong>Reading the library…</strong>
            </div>
          )}

          {loadState.status === 'error' && (
            <div className="rc-state rc-state--error" role="alert">
              <Warning size={26} />
              <div>
                <strong>The library could not be loaded</strong>
                <p>{loadState.message}</p>
              </div>
              <button className="rc-button rc-button--quiet" type="button" onClick={() => void refresh()}>
                <ArrowClockwise size={17} /> Retry
              </button>
            </div>
          )}

          {loadState.status === 'ready' && visibleBoards.length === 0 && !creating && (
            <div className="rc-empty-state">
              <div className="rc-empty-state__symbol" aria-hidden="true"><Tray size={32} /></div>
              <h2>{showArchived ? 'The archive is empty' : 'Start with one whiteboard'}</h2>
              <p>{showArchived ? 'Boards you archive will wait here until you restore them.' : 'Give the first thread of this project somewhere to live.'}</p>
              {!showArchived && (
                <button className="rc-button rc-button--primary" type="button" onClick={() => setCreating(true)}>
                  <Plus size={18} weight="bold" /> Create whiteboard
                </button>
              )}
            </div>
          )}

          {loadState.status === 'ready' && visibleBoards.length > 0 && (
            <div className="rc-board-list" aria-label={showArchived ? 'Archived whiteboards' : 'Active whiteboards'}>
              {visibleBoards.map((board, index) => (
                <article
                  className="rc-board-row"
                  data-selected={selectedId === board.id || undefined}
                  key={board.id}
                  onMouseEnter={() => setSelectedId(board.id)}
                >
                  <div
                    className="rc-board-row__open"
                    role={editingId === board.id ? undefined : 'button'}
                    tabIndex={editingId === board.id ? undefined : 0}
                    onClick={() => {
                      if (editingId !== board.id) onOpen(board.id)
                    }}
                    onKeyDown={(event) => {
                      if (editingId !== board.id && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        onOpen(board.id)
                      }
                    }}
                  >
                    <span className="rc-board-row__index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="rc-board-row__main">
                      {editingId === board.id ? (
                        <input
                          aria-label="Whiteboard title"
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            event.stopPropagation()
                            if (event.key === 'Enter') void commitRename(board.id)
                            if (event.key === 'Escape') setEditingId(undefined)
                          }}
                          onBlur={() => void commitRename(board.id)}
                          autoFocus
                        />
                      ) : (
                        <strong>{board.title}</strong>
                      )}
                      <span>Revision {board.revision}</span>
                    </span>
                    <span className="rc-board-row__date">{formatRelativeDate(board.updatedAt)}</span>
                  </div>
                  <div className="rc-board-row__actions" aria-label={`Actions for ${board.title}`}>
                    {!board.archivedAt && (
                      <>
                        <button
                          type="button"
                          aria-label={`Rename ${board.title}`}
                          title="Rename"
                          onClick={() => {
                            setEditingId(board.id)
                            setEditingTitle(board.title)
                          }}
                        >
                          <PencilSimple size={17} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate ${board.title}`}
                          title="Duplicate"
                          disabled={busyId === board.id}
                          onClick={() => void duplicateBoard(board)}
                        >
                          <CopySimple size={17} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={board.archivedAt ? `Restore ${board.title}` : `Archive ${board.title}`}
                      title={board.archivedAt ? 'Restore' : 'Archive'}
                      disabled={busyId === board.id}
                      onClick={() => void toggleArchive(board)}
                    >
                      {board.archivedAt ? <ArrowClockwise size={17} /> : <Archive size={17} />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!showArchived && (
            creating ? (
              <form className="rc-create-board" onSubmit={(event) => void createBoard(event)}>
                <Plus size={20} />
                <label htmlFor="rc-new-board-title">Name this whiteboard</label>
                <input
                  ref={createInputRef}
                  id="rc-new-board-title"
                  placeholder="e.g. Authentication flow"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setCreating(false)
                  }}
                />
                <button className="rc-button rc-button--primary" type="submit" disabled={!createTitle.trim() || busyId === 'create'}>
                  {busyId === 'create' ? 'Creating…' : 'Create & open'}
                </button>
                <button className="rc-button rc-button--quiet" type="button" onClick={() => setCreating(false)}>Cancel</button>
              </form>
            ) : visibleBoards.length > 0 && (
              <button className="rc-create-board-trigger" type="button" onClick={() => setCreating(true)}>
                <Plus size={20} weight="bold" />
                <span><strong>Create whiteboard</strong><small>Start with an empty, endless canvas</small></span>
              </button>
            )
          )}

          <footer className="rc-library__footer">
            <span><span className="rc-status-light" /> {visibleBoards.length} {showArchived ? 'archived' : 'active'} {visibleBoards.length === 1 ? 'whiteboard' : 'whiteboards'}</span>
            <span>Local project library</span>
          </footer>
        </main>

        {variant === 'full' && <aside className="rc-library__preview" aria-label="Selected board preview">
          {selectedBoard && !selectedBoard.archivedAt ? (
            <>
              <div className="rc-library__preview-header">
                <div>
                  <span>Selected board</span>
                  <strong>{selectedBoard.title}</strong>
                </div>
                <button className="rc-button rc-button--primary" type="button" onClick={() => onOpen(selectedBoard.id)}>Open board</button>
              </div>
              <div className="rc-library__preview-canvas">
                <div className="rc-board-cover">
                  <LogoMark />
                  <span>Whiteboard</span>
                  <strong>{selectedBoard.title}</strong>
                  <small>Revision {String(selectedBoard.revision).padStart(2, '0')}</small>
                </div>
              </div>
              <dl className="rc-library__preview-meta">
                <div><dt>Last changed</dt><dd>{formatRelativeDate(selectedBoard.updatedAt)}</dd></div>
                <div><dt>Revision</dt><dd>{String(selectedBoard.revision).padStart(2, '0')}</dd></div>
              </dl>
            </>
          ) : (
            <div className="rc-library__preview-empty">
              <span className="rc-library__preview-datum" aria-hidden="true" />
              <strong>Nothing plotted yet</strong>
              <span>Create a whiteboard to begin.</span>
            </div>
          )}
        </aside>}
      </div>
    </section>
  )
}
