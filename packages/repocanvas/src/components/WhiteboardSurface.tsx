import { forwardRef } from 'react'
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
  type WhiteboardCanvasProps,
} from './WhiteboardCanvas'

export interface WhiteboardSurfaceProps extends Omit<WhiteboardCanvasProps, 'chrome' | 'embedded'> {
  /**
   * `minimal` keeps canvas tools, zoom, fullscreen, save recovery, and connector locks.
   * `none` renders only the engine surface; use the forwarded handle for host controls.
   */
  chrome?: 'minimal' | 'none'
}

export const WhiteboardSurface = forwardRef<WhiteboardCanvasHandle, WhiteboardSurfaceProps>(
  function WhiteboardSurface({ chrome = 'minimal', ...props }, ref) {
    return <WhiteboardCanvas ref={ref} {...props} chrome={chrome} embedded />
  },
)

WhiteboardSurface.displayName = 'WhiteboardSurface'
