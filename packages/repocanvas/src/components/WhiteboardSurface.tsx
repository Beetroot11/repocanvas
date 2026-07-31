import { WhiteboardCanvas, type WhiteboardCanvasProps } from './WhiteboardCanvas'

export interface WhiteboardSurfaceProps extends Omit<WhiteboardCanvasProps, 'chrome' | 'embedded'> {
  /**
   * `minimal` keeps the canvas tools, zoom, fullscreen, and recovery UI.
   * `none` renders only the engine surface for hosts that provide all controls.
   */
  chrome?: 'minimal' | 'none'
}

/**
 * A first-class canvas-only embed. It omits the library, workspace frame, board
 * index, RepoCanvas masthead, and title bar while retaining the same storage,
 * autosave, recovery, Pencil policy, and connector bindings.
 */
export function WhiteboardSurface({ chrome = 'minimal', ...props }: WhiteboardSurfaceProps) {
  return <WhiteboardCanvas {...props} chrome={chrome} embedded />
}
