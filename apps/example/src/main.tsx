import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  LocalStorageWhiteboardStorageAdapter,
  WhiteboardWorkspace,
} from '@beetroot11/repocanvas'
import './example.css'

const storage = new LocalStorageWhiteboardStorageAdapter('repocanvas:example:v3')

function ExampleApp() {
  return (
    <main className="example-shell">
      <WhiteboardWorkspace storage={storage} />
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ExampleApp /></React.StrictMode>,
)
