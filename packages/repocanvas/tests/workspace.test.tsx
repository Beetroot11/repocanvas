// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryWhiteboardStorageAdapter } from '../src/persistence/adapters'
import { WhiteboardLibrary } from '../src/components/WhiteboardLibrary'
import { WhiteboardWorkspace } from '../src/components/WhiteboardWorkspace'

vi.mock('../src/components/WhiteboardCanvas', async () => {
  const React = await import('react')
  return {
    WhiteboardCanvas: React.forwardRef(function MockCanvas() {
      return <div data-testid="mock-canvas">Canvas</div>
    }),
  }
})

describe('workspace and library', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => cleanup())

  it('hides, restores, shortcuts, and persists the whiteboard list', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({ title: 'Architecture' })
    const onCollapsed = vi.fn()
    const { container } = render(
      <WhiteboardWorkspace
        storage={storage}
        initialWhiteboardId={board.id}
        onLibraryCollapsedChange={onCollapsed}
      />,
    )
    await screen.findByTestId('mock-canvas')
    expect(screen.getByText('Architecture')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Hide whiteboard list' }))
    expect(container.querySelector('.rc-workspace')?.getAttribute('data-library-collapsed')).toBe('true')
    expect(screen.queryByText('Architecture')).toBeNull()
    expect(window.localStorage.getItem('repocanvas:workspace:library-collapsed')).toBe('true')

    fireEvent.keyDown(window, { key: 'L', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide whiteboard list' })).not.toBeNull())
    expect(screen.getByText('Architecture')).not.toBeNull()
    expect(onCollapsed).toHaveBeenCalled()
  })

  it('searches titles and tags and shows real thumbnail previews', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    await storage.create({ title: 'API architecture', tags: ['backend'], thumbnailUrl: 'data:image/png;base64,AA==' })
    await storage.create({ title: 'Incident review', tags: ['incident'] })
    render(<WhiteboardLibrary storage={storage} onOpen={() => undefined} />)
    const boardList = await screen.findByLabelText('Active whiteboards')
    const architecture = within(boardList).getByText('API architecture')
    fireEvent.mouseEnter(architecture.closest('article')!)
    expect(screen.getByAltText('Preview of API architecture')).not.toBeNull()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Search boards and tags'), 'incident')
    expect(within(boardList).queryByText('API architecture')).toBeNull()
    expect(within(boardList).getByText('Incident review')).not.toBeNull()
  })

  it('edits tags in an accessible RepoCanvas dialog without using window.prompt', async () => {
    const storage = new InMemoryWhiteboardStorageAdapter()
    const board = await storage.create({ title: 'API architecture', tags: ['backend'] })
    const prompt = vi.spyOn(window, 'prompt')
    const user = userEvent.setup()
    render(<WhiteboardLibrary storage={storage} onOpen={() => undefined} />)
    await user.click(await screen.findByRole('button', { name: 'Edit tags for API architecture' }))
    expect(prompt).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Edit tags' })
    expect(within(dialog).getByRole('button', { name: 'Remove backend tag' })).not.toBeNull()

    await user.type(within(dialog).getByRole('textbox', { name: 'Tags' }), 'platform{Enter}')
    await user.click(within(dialog).getByRole('button', { name: 'Save tags' }))

    await waitFor(async () => {
      expect((await storage.load(board.id)).tags).toEqual(['backend', 'platform'])
    })
    expect(screen.queryByRole('dialog', { name: 'Edit tags' })).toBeNull()
  })
})
