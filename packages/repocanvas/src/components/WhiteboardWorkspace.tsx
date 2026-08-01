import { SidebarSimple } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useRepoCanvasConfig } from '../context'
import type { WhiteboardStorageAdapter } from '../types'
import { LogoMark } from './LogoMark'
import { WhiteboardLibrary, type WhiteboardLibraryProps } from './WhiteboardLibrary'
import type { WhiteboardCanvasProps } from './WhiteboardCanvas'

const LazyWhiteboardCanvas = lazy(async () => {
  const module = await import('./WhiteboardCanvas')
  return { default: module.WhiteboardCanvas }
})

export interface WhiteboardWorkspaceProps {
  storage?: WhiteboardStorageAdapter
  initialWhiteboardId?: string
  libraryTitle?: string
  initialLibraryCollapsed?: boolean
  persistLayoutKey?: string
  showLibraryToggle?: boolean
  onLibraryCollapsedChange?: (collapsed: boolean) => void
  libraryProps?: Omit<WhiteboardLibraryProps, 'storage' | 'onOpen' | 'title' | 'variant' | 'selectedWhiteboardId'>
  canvasProps?: Omit<WhiteboardCanvasProps, 'storage' | 'whiteboardId' | 'onBack' | 'embedded'>
  className?: string
  style?: CSSProperties
}

export function WhiteboardWorkspace({
  storage: storageProp,
  initialWhiteboardId,
  libraryTitle,
  initialLibraryCollapsed,
  persistLayoutKey = 'repocanvas:workspace:library-collapsed',
  showLibraryToggle = true,
  onLibraryCollapsedChange,
  libraryProps,
  canvasProps,
  className,
  style,
}: WhiteboardWorkspaceProps) {
  const { storage } = useRepoCanvasConfig(storageProp)
  const [whiteboardId, setWhiteboardId] = useState(initialWhiteboardId)
  const [libraryCollapsed, setLibraryCollapsed] = useState(() => {
    if (initialLibraryCollapsed !== undefined) return initialLibraryCollapsed
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(persistLayoutKey) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(persistLayoutKey, String(libraryCollapsed))
    } catch {
      // Layout persistence is optional.
    }
    onLibraryCollapsedChange?.(libraryCollapsed)
  }, [libraryCollapsed, onLibraryCollapsedChange, persistLayoutKey])

  useEffect(() => {
    if (!showLibraryToggle || !whiteboardId || typeof window === 'undefined') return
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === 'l') {
        event.preventDefault()
        setLibraryCollapsed((value) => !value)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [showLibraryToggle, whiteboardId])

  if (whiteboardId) {
    return (
      <section
        className={['rc-workspace', className].filter(Boolean).join(' ')}
        style={style}
        data-library-collapsed={libraryCollapsed || undefined}
      >
        <header className="rc-workspace__masthead">
          <div className="rc-library__brand">
            <LogoMark />
            <div>
              <span className="rc-library__product">{libraryProps?.productName ?? 'RepoCanvas'}</span>
              <span className="rc-library__tagline">{libraryProps?.tagline ?? 'Your project memory, mapped.'}</span>
            </div>
          </div>
          <div className="rc-workspace__masthead-actions">
            <span className="rc-workspace__bearing">BRG 045° · FIELD 01</span>
            {showLibraryToggle && (
              <button
                className="rc-workspace__library-toggle"
                type="button"
                aria-label={libraryCollapsed ? 'Show whiteboard list' : 'Hide whiteboard list'}
                aria-expanded={!libraryCollapsed}
                aria-keyshortcuts="Control+Shift+L Meta+Shift+L"
                title={`${libraryCollapsed ? 'Show' : 'Hide'} whiteboard list (Ctrl/⌘+Shift+L)`}
                onClick={() => setLibraryCollapsed((value) => !value)}
              >
                <SidebarSimple size={19} weight={libraryCollapsed ? 'regular' : 'fill'} />
                <span>{libraryCollapsed ? 'Show boards' : 'Hide boards'}</span>
              </button>
            )}
          </div>
        </header>
        <div className="rc-workspace__body">
          {!libraryCollapsed && (
            <WhiteboardLibrary
              {...libraryProps}
              storage={storage}
              title={libraryTitle ?? 'Boards'}
              variant="index"
              selectedWhiteboardId={whiteboardId}
              onOpen={setWhiteboardId}
            />
          )}
          <div className="rc-workspace__field">
            <Suspense fallback={<div className="rc-canvas-state"><span className="rc-spinner" /><strong>Preparing the canvas…</strong></div>}>
              <LazyWhiteboardCanvas
                {...canvasProps}
                whiteboardId={whiteboardId}
                storage={storage}
                embedded
                onBack={() => setWhiteboardId(undefined)}
                onRecoveredCopy={(copyId) => {
                  canvasProps?.onRecoveredCopy?.(copyId)
                  setWhiteboardId(copyId)
                }}
              />
            </Suspense>
            <div className="rc-workspace__scale" aria-hidden="true"><span>0</span><span>1</span><span>2</span><span>3</span></div>
          </div>
        </div>
        <i className="rc-fastener rc-fastener--nw" aria-hidden="true" />
        <i className="rc-fastener rc-fastener--ne" aria-hidden="true" />
        <i className="rc-fastener rc-fastener--sw" aria-hidden="true" />
        <i className="rc-fastener rc-fastener--se" aria-hidden="true" />
      </section>
    )
  }

  return (
    <WhiteboardLibrary
      {...libraryProps}
      storage={storage}
      title={libraryTitle}
      onOpen={setWhiteboardId}
    />
  )
}
