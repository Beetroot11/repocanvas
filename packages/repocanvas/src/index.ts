import './styles.css'

export { RepoCanvasProvider } from './context'
export { WhiteboardCanvas } from './components/WhiteboardCanvas'
export { WhiteboardLibrary } from './components/WhiteboardLibrary'
export { WhiteboardWorkspace } from './components/WhiteboardWorkspace'
export { WhiteboardSurface } from './components/WhiteboardSurface'
export {
  InMemoryWhiteboardStorageAdapter,
  LocalStorageWhiteboardStorageAdapter,
  createSeedBoard,
} from './persistence/adapters'
export { createEmptyDocument } from './engine/document'

export type { RepoCanvasProviderProps } from './context'
export type { WhiteboardCanvasProps } from './components/WhiteboardCanvas'
export type { WhiteboardLibraryProps } from './components/WhiteboardLibrary'
export type { WhiteboardWorkspaceProps } from './components/WhiteboardWorkspace'
export type { WhiteboardSurfaceProps } from './components/WhiteboardSurface'
export type {
  RepoCanvasDocument,
  SaveStatus,
  SaveWhiteboardInput,
  Whiteboard,
  WhiteboardStorageAdapter,
  WhiteboardSummary,
} from './types'
export {
  REPOCANVAS_FORMAT_VERSION,
  RevisionConflictError,
  UnsupportedDocumentError,
  WhiteboardNotFoundError,
} from './types'
