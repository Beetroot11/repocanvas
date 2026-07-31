import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const distDirectory = new URL('../dist/', import.meta.url)
const entrySource = await readFile(new URL('index.js', distDirectory), 'utf8')
const entryPreludeEnd = entrySource.indexOf('\nimport ')

assert.notEqual(entryPreludeEnd, -1, 'The built entry must contain an injectable prelude.')

const injectionPrelude = entrySource.slice(0, entryPreludeEnd)
const appendedNodes = []
const styleNode = {
  attributes: new Map(),
  children: [],
  nonce: undefined,
  appendChild(node) {
    this.children.push(node)
  },
  setAttribute(name, value) {
    this.attributes.set(name, value)
  },
}
const documentMock = {
  createElement(tagName) {
    assert.equal(tagName, 'style')
    return styleNode
  },
  createTextNode(textContent) {
    return { textContent }
  },
  head: {
    appendChild(node) {
      appendedNodes.push(node)
    },
    querySelector(selector) {
      assert.equal(selector, 'meta[property=csp-nonce]')
      return { content: 'repocanvas-test-nonce' }
    },
  },
}

Function('document', injectionPrelude)(documentMock)

assert.equal(appendedNodes.length, 1, 'The package must inject exactly one style node.')
assert.equal(styleNode.attributes.get('data-repocanvas-styles'), 'true')
assert.equal(styleNode.nonce, 'repocanvas-test-nonce')

const injectedCss = styleNode.children[0]?.textContent ?? ''
assert.match(injectedCss, /\.rc-library\{/)
assert.match(injectedCss, /\.excalidraw\{/)

const emittedCssFiles = (await readdir(distDirectory)).filter((name) => name.endsWith('.css'))
assert.deepEqual(emittedCssFiles, [], 'Styles must be embedded in JavaScript, not emitted separately.')

console.log(`Verified automatic RepoCanvas style injection from ${packageRoot}`)
