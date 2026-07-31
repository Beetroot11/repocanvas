import { createContext, useContext, type PropsWithChildren } from 'react'
import type { WhiteboardStorageAdapter } from './types'

interface RepoCanvasContextValue {
  storage?: WhiteboardStorageAdapter
}

const RepoCanvasContext = createContext<RepoCanvasContextValue>({})

export interface RepoCanvasProviderProps extends PropsWithChildren {
  storage: WhiteboardStorageAdapter
}

export function RepoCanvasProvider({ children, storage }: RepoCanvasProviderProps) {
  return (
    <RepoCanvasContext.Provider value={{ storage }}>
      {children}
    </RepoCanvasContext.Provider>
  )
}

export function useRepoCanvasConfig(
  storage?: WhiteboardStorageAdapter,
): Required<Pick<RepoCanvasContextValue, 'storage'>> {
  const context = useContext(RepoCanvasContext)
  const resolvedStorage = storage ?? context.storage
  if (!resolvedStorage) {
    throw new Error('RepoCanvas requires a storage adapter prop or RepoCanvasProvider.')
  }
  return { storage: resolvedStorage }
}
