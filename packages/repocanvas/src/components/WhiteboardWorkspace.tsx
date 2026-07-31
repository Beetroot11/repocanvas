import { lazy, Suspense, useState } from 'react'
import type { WhiteboardStorageAdapter } from '../types'
import { LogoMark } from './LogoMark'
import { WhiteboardLibrary } from './WhiteboardLibrary'

const LazyWhiteboardCanvas = lazy(async () => {
  const module = await import('./WhiteboardCanvas')
  return { default: module.WhiteboardCanvas }
})

export interface WhiteboardWorkspaceProps {
  storage: WhiteboardStorageAdapter
  initialWhiteboardId?: string
  libraryTitle?: string
}

export function WhiteboardWorkspace({
  storage,
  initialWhiteboardId,
  libraryTitle,
}: WhiteboardWorkspaceProps) {
  const [whiteboardId, setWhiteboardId] = useState(initialWhiteboardId)

  if (whiteboardId) {
    return (
      <section className="rc-workspace">
        <header className="rc-workspace__masthead">
          <div className="rc-library__brand">
            <LogoMark />
            <div>
              <span className="rc-library__product">RepoCanvas</span>
              <span className="rc-library__tagline">Your project memory, mapped.</span>
            </div>
          </div>
          <span className="rc-workspace__bearing">BRG 045° · FIELD 01</span>
        </header>
        <div className="rc-workspace__body">
          <WhiteboardLibrary
            storage={storage}
            title={libraryTitle ?? 'Boards'}
            variant="index"
            selectedWhiteboardId={whiteboardId}
            onOpen={setWhiteboardId}
          />
          <div className="rc-workspace__field">
            <Suspense fallback={<div className="rc-canvas-state"><span className="rc-spinner" /><strong>Preparing the canvas…</strong></div>}>
              <LazyWhiteboardCanvas
                whiteboardId={whiteboardId}
                storage={storage}
                embedded
                onBack={() => setWhiteboardId(undefined)}
                onRecoveredCopy={setWhiteboardId}
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
      storage={storage}
      title={libraryTitle}
      onOpen={setWhiteboardId}
    />
  )
}
