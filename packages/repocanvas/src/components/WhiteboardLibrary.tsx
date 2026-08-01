import {
  Archive,
  ArrowClockwise,
  CopySimple,
  DotsThreeVertical,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Tag,
  Tray,
  Warning,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRepoCanvasConfig } from '../context'
import { createDocumentFromTemplate, DEFAULT_REPOCANVAS_TEMPLATES, type RepoCanvasTemplate } from '../engine/templates'
import type { WhiteboardStorageAdapter, WhiteboardSummary } from '../types'
import { LogoMark } from './LogoMark'

export interface WhiteboardLibraryProps {
  storage?: WhiteboardStorageAdapter
  onOpen: (whiteboardId: string) => void
  title?: string
  variant?: 'full' | 'index'
  selectedWhiteboardId?: string
  projectId?: string
  templates?: readonly RepoCanvasTemplate[]
  productName?: string
  tagline?: string
  libraryStatusLabel?: string
  footerLabel?: string
  logo?: ReactNode
  className?: string
  style?: CSSProperties
  onError?: (error: Error) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

interface TagEditorState {
  boardId: string
  boardTitle: string
  expectedRevision: number
  tags: string[]
}

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

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function WhiteboardLibrary({
  storage: storageProp,
  onOpen,
  title = 'Whiteboards',
  variant = 'full',
  selectedWhiteboardId,
  projectId,
  templates = DEFAULT_REPOCANVAS_TEMPLATES,
  productName = 'RepoCanvas',
  tagline = 'Your project memory, mapped.',
  libraryStatusLabel = 'Library ready',
  footerLabel = 'Project whiteboard library',
  logo,
  className,
  style,
  onError,
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
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [createTemplateId, setCreateTemplateId] = useState('')
  const [tagEditor, setTagEditor] = useState<TagEditorState>()
  const [tagDraft, setTagDraft] = useState('')
  const [tagEditorError, setTagEditorError] = useState<string>()
  const createInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const tagDialogRef = useRef<HTMLDivElement>(null)
  const tagReturnFocusRef = useRef<HTMLElement | null>(null)
  const renameInFlightRef = useRef<string | undefined>(undefined)
  const titleId = useId()
  const createTitleId = `${titleId}-new-board-title`
  const tagDialogTitleId = `${titleId}-tag-dialog-title`
  const tagInputId = `${titleId}-tag-input`

  const refresh = useCallback(async () => {
    setLoadState({ status: 'loading' })
    try {
      const nextBoards = await storage.list({ projectId })
      setBoards(nextBoards)
      setSelectedId((current) => current ?? nextBoards.find((board) => !board.archivedAt)?.id)
      setLoadState({ status: 'ready' })
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
      onError?.(error instanceof Error ? error : new Error(readableError(error)))
    }
  }, [onError, projectId, storage])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => storage.subscribe?.(() => {
    void refresh()
  }), [refresh, storage])

  useEffect(() => {
    if (creating) createInputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (tagEditor) tagInputRef.current?.focus()
  }, [tagEditor])

  useEffect(() => {
    if (selectedWhiteboardId) setSelectedId(selectedWhiteboardId)
  }, [selectedWhiteboardId])

  const visibleBoards = useMemo(
    () => {
      const needle = search.trim().toLocaleLowerCase()
      const requiredTag = tagFilter.trim().toLocaleLowerCase()
      return boards.filter((board) => {
        if (Boolean(board.archivedAt) !== showArchived) return false
        if (requiredTag && !(board.tags ?? []).some((tag) => tag.toLocaleLowerCase() === requiredTag)) return false
        if (!needle) return true
        return `${board.title} ${(board.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(needle)
      })
    },
    [boards, search, showArchived, tagFilter],
  )
  const availableTags = useMemo(
    () => [...new Set(boards.flatMap((board) => board.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    [boards],
  )
  const selectedBoard = boards.find((board) => board.id === selectedId)

  useEffect(() => {
    if (visibleBoards.length && !visibleBoards.some((board) => board.id === selectedId)) {
      setSelectedId(visibleBoards[0]?.id)
    }
  }, [selectedId, visibleBoards])

  async function createBoard(event: FormEvent) {
    event.preventDefault()
    if (!createTitle.trim()) return
    setBusyId('create')
    try {
      const template = templates.find((candidate) => candidate.id === createTemplateId)
      const document = template ? await createDocumentFromTemplate(template) : undefined
      const board = await storage.create({
        title: createTitle,
        document,
        tags: template?.tags,
        projectId,
      })
      setCreateTitle('')
      setCreating(false)
      setCreateTemplateId('')
      onOpen(board.id)
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
      onError?.(error instanceof Error ? error : new Error(readableError(error)))
    } finally {
      setBusyId(undefined)
    }
  }

  async function commitRename(id: string) {
    if (!editingTitle.trim() || renameInFlightRef.current === id) return
    renameInFlightRef.current = id
    setBusyId(id)
    try {
      const board = boards.find((candidate) => candidate.id === id)
      await storage.rename(id, editingTitle, { expectedRevision: board?.revision })
      setEditingId(undefined)
      await refresh()
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
      onError?.(error instanceof Error ? error : new Error(readableError(error)))
    } finally {
      renameInFlightRef.current = undefined
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
      onError?.(error instanceof Error ? error : new Error(readableError(error)))
    } finally {
      setBusyId(undefined)
    }
  }

  async function toggleArchive(board: WhiteboardSummary) {
    setBusyId(board.id)
    try {
      if (board.archivedAt) await storage.restore(board.id, { expectedRevision: board.revision })
      else await storage.archive(board.id, { expectedRevision: board.revision })
      await refresh()
    } catch (error) {
      setLoadState({ status: 'error', message: readableError(error) })
      onError?.(error instanceof Error ? error : new Error(readableError(error)))
    } finally {
      setBusyId(undefined)
    }
  }

  function openTagEditor(board: WhiteboardSummary, returnFocus: HTMLElement) {
    if (!storage.updateMetadata) return
    tagReturnFocusRef.current = returnFocus
    setTagDraft('')
    setTagEditorError(undefined)
    setTagEditor({
      boardId: board.id,
      boardTitle: board.title,
      expectedRevision: board.revision,
      tags: [...(board.tags ?? [])],
    })
  }

  function closeTagEditor() {
    setTagEditor(undefined)
    setTagDraft('')
    setTagEditorError(undefined)
    queueMicrotask(() => tagReturnFocusRef.current?.focus())
  }

  function addDraftTag() {
    const draft = tagDraft.trim()
    if (!draft || !tagEditor) return
    if (draft.length > 40) {
      setTagEditorError('Tags must be 40 characters or fewer.')
      return
    }
    setTagEditor((current) => current
      ? { ...current, tags: normalizeTags([...current.tags, draft]) }
      : current)
    setTagDraft('')
    setTagEditorError(undefined)
  }

  function handleTagDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && tagEditor && busyId !== tagEditor.boardId) {
      event.preventDefault()
      closeTagEditor()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(tagDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  async function saveTags(event: FormEvent) {
    event.preventDefault()
    if (!storage.updateMetadata || !tagEditor) return
    if (tagDraft.trim().length > 40) {
      setTagEditorError('Tags must be 40 characters or fewer.')
      return
    }
    const nextTags = normalizeTags([...tagEditor.tags, tagDraft])
    setBusyId(tagEditor.boardId)
    setTagEditorError(undefined)
    let saved = false
    try {
      await storage.updateMetadata(tagEditor.boardId, {
        tags: nextTags,
        expectedRevision: tagEditor.expectedRevision,
      })
      await refresh()
      setTagEditor(undefined)
      setTagDraft('')
      saved = true
    } catch (error) {
      setTagEditorError(readableError(error))
      onError?.(error instanceof Error ? error : new Error(readableError(error)))
    } finally {
      setBusyId(undefined)
      if (saved) queueMicrotask(() => tagReturnFocusRef.current?.focus())
    }
  }

  return (
    <section className={`rc-library rc-library--${variant}${className ? ` ${className}` : ''}`} style={style} aria-labelledby={titleId}>
      {variant === 'full' && <header className="rc-library__masthead">
        <div className="rc-library__brand">
            {logo ?? <LogoMark />}
            <div>
              <span className="rc-library__product">{productName}</span>
              <span className="rc-library__tagline">{tagline}</span>
          </div>
        </div>
        <div className="rc-library__sync" aria-label="Library synced">
          <span className="rc-status-light" />
          {libraryStatusLabel}
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
              <h1 id={titleId}>{title}</h1>
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

          <div className="rc-library__filters" role="search">
            <label>
              <MagnifyingGlass size={16} aria-hidden="true" />
              <span className="rc-visually-hidden">Search whiteboards</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search boards and tags" />
            </label>
            {availableTags.length > 0 && (
              <select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="">All tags</option>
                {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            )}
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
                      <span>Revision {board.revision}{board.tags?.length ? ` · ${board.tags.join(' · ')}` : ''}</span>
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
                        {storage.updateMetadata && (
                          <button type="button" aria-label={`Edit tags for ${board.title}`} title="Edit tags" disabled={busyId === board.id} onClick={(event) => openTagEditor(board, event.currentTarget)}>
                            <Tag size={17} />
                          </button>
                        )}
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
                    <details className="rc-board-row__overflow">
                      <summary role="button" aria-label={`More actions for ${board.title}`} aria-haspopup="menu" title="More actions"><DotsThreeVertical size={18} /></summary>
                      <div>
                        {!board.archivedAt && <button type="button" onClick={() => { setEditingId(board.id); setEditingTitle(board.title) }}><PencilSimple size={16} /> Rename</button>}
                        {!board.archivedAt && <button type="button" onClick={() => void duplicateBoard(board)}><CopySimple size={16} /> Duplicate</button>}
                        {!board.archivedAt && storage.updateMetadata && <button type="button" onClick={(event) => openTagEditor(board, event.currentTarget)}><Tag size={16} /> Edit tags</button>}
                        <button type="button" onClick={() => void toggleArchive(board)}>{board.archivedAt ? <ArrowClockwise size={16} /> : <Archive size={16} />}{board.archivedAt ? 'Restore' : 'Archive'}</button>
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!showArchived && (
            creating ? (
              <form className="rc-create-board" onSubmit={(event) => void createBoard(event)}>
                <Plus size={20} />
                <label htmlFor={createTitleId}>Name this whiteboard</label>
                <input
                  ref={createInputRef}
                  id={createTitleId}
                  placeholder="e.g. Authentication flow"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setCreating(false)
                  }}
                />
                <select aria-label="Starting template" value={createTemplateId} onChange={(event) => setCreateTemplateId(event.target.value)}>
                  <option value="">Empty canvas</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                </select>
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
            <span>{footerLabel}</span>
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
                {selectedBoard.thumbnailUrl ? (
                  <img className="rc-board-thumbnail" src={selectedBoard.thumbnailUrl} alt={`Preview of ${selectedBoard.title}`} />
                ) : <div className="rc-board-cover">
                  <LogoMark />
                  <span>Whiteboard</span>
                  <strong>{selectedBoard.title}</strong>
                  <small>Revision {String(selectedBoard.revision).padStart(2, '0')}</small>
                </div>}
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

      {tagEditor && typeof globalThis.document !== 'undefined' && createPortal(
        <div
          className="rc-dialog-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busyId !== tagEditor.boardId) closeTagEditor()
          }}
        >
          <div
            ref={tagDialogRef}
            className="rc-dialog rc-tag-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby={tagDialogTitleId}
            onKeyDown={handleTagDialogKeyDown}
          >
            <header className="rc-dialog__header">
              <span className="rc-dialog__symbol" aria-hidden="true"><Tag size={20} /></span>
              <div>
                <h2 id={tagDialogTitleId}>Edit tags</h2>
                <p>{tagEditor.boardTitle}</p>
              </div>
              <button
                className="rc-dialog__close"
                type="button"
                aria-label="Close tag editor"
                disabled={busyId === tagEditor.boardId}
                onClick={closeTagEditor}
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={(event) => void saveTags(event)}>
              <label htmlFor={tagInputId}>Tags</label>
              <div className="rc-tag-editor__field" onClick={() => tagInputRef.current?.focus()}>
                {tagEditor.tags.map((tag) => (
                  <button
                    className="rc-tag-chip"
                    type="button"
                    key={tag.toLocaleLowerCase()}
                    aria-label={`Remove ${tag} tag`}
                    title={`Remove ${tag}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setTagEditor((current) => current
                        ? { ...current, tags: current.tags.filter((candidate) => candidate !== tag) }
                        : current)
                    }}
                  >
                    {tag}<X size={12} />
                  </button>
                ))}
                <input
                  ref={tagInputRef}
                  id={tagInputId}
                  aria-describedby={`${tagInputId}-hint`}
                  aria-invalid={Boolean(tagEditorError)}
                  value={tagDraft}
                  placeholder={tagEditor.tags.length ? 'Add another tag' : 'Add a tag'}
                  maxLength={41}
                  onChange={(event) => {
                    setTagDraft(event.target.value.replace(',', ''))
                    setTagEditorError(undefined)
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ',') && tagDraft.trim()) {
                      event.preventDefault()
                      addDraftTag()
                    } else if (event.key === 'Backspace' && !tagDraft && tagEditor.tags.length) {
                      setTagEditor((current) => current
                        ? { ...current, tags: current.tags.slice(0, -1) }
                        : current)
                    }
                  }}
                />
              </div>
              <p className="rc-dialog__hint" id={`${tagInputId}-hint`}>Press Enter or comma to add a tag. Select a tag to remove it.</p>
              {tagEditorError && <p className="rc-dialog__error" role="alert">{tagEditorError}</p>}
              <footer className="rc-dialog__actions">
                <button className="rc-button rc-button--quiet" type="button" disabled={busyId === tagEditor.boardId} onClick={closeTagEditor}>Cancel</button>
                <button className="rc-button rc-button--primary" type="submit" disabled={busyId === tagEditor.boardId}>
                  {busyId === tagEditor.boardId ? 'Saving…' : 'Save tags'}
                </button>
              </footer>
            </form>
          </div>
        </div>,
        globalThis.document.body,
      )}
    </section>
  )
}
