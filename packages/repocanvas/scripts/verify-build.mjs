import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const distDirectory = new URL('../dist/', import.meta.url)
const styledEntries = ['index.js', 'editor.js', 'library.js']

for (const filename of styledEntries) {
  const source = await readFile(new URL(filename, distDirectory), 'utf8')
  const entryPreludeEnd = source.indexOf('\nimport ')
  assert.notEqual(entryPreludeEnd, -1, `${filename} must contain an injectable style prelude.`)
  const injectionPrelude = source.slice(0, entryPreludeEnd)
  const appendedNodes = []
  const styleNode = {
    attributes: new Map(),
    children: [],
    nonce: undefined,
    appendChild(node) { this.children.push(node) },
    setAttribute(name, value) { this.attributes.set(name, value) },
  }
  const documentMock = {
    createElement(tagName) {
      assert.equal(tagName, 'style')
      return styleNode
    },
    createTextNode(textContent) { return { textContent } },
    head: {
      appendChild(node) { appendedNodes.push(node) },
      querySelector(selector) {
        assert.equal(selector, 'meta[property=csp-nonce]')
        return { content: 'repocanvas-test-nonce' }
      },
    },
  }
  Function('document', injectionPrelude)(documentMock)
  assert.equal(appendedNodes.length, 1, `${filename} must inject exactly one style node.`)
  assert.equal(styleNode.attributes.get('data-repocanvas-styles'), 'true')
  assert.equal(styleNode.nonce, 'repocanvas-test-nonce')
  const injectedCss = styleNode.children[0]?.textContent ?? ''
  assert.match(injectedCss, /\.rc-library\{/)
  assert.match(injectedCss, /\.rc-editor\{/)
  assert.match(injectedCss, /\.excalidraw\{/)
}

for (const filename of ['core.js', 'testing.js']) {
  const source = await readFile(new URL(filename, distDirectory), 'utf8')
  assert.doesNotMatch(source, /data-repocanvas-styles/, `${filename} must remain style-free.`)
  assert.ok((await stat(new URL(filename, distDirectory))).size < 10_000, `${filename} should remain a small entry facade.`)
}

for (const filename of ['index.d.ts', 'core.d.ts', 'editor.d.ts', 'library.d.ts', 'testing.d.ts']) {
  await stat(new URL(filename, distDirectory))
}

const emittedCssFiles = (await readdir(distDirectory)).filter((name) => name.endsWith('.css'))
assert.deepEqual(emittedCssFiles, [], 'Styles must be embedded in styled entries, not emitted separately.')

console.log(`Verified split RepoCanvas entries and automatic style injection from ${packageRoot}`)
