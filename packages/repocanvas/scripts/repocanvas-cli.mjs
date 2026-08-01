#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [, , command, ...args] = process.argv

function fail(message) {
  process.stderr.write(`RepoCanvas: ${message}\n`)
  process.exitCode = 1
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function migrate(value) {
  if (!isRecord(value)) throw new Error('document must be an object')
  if (value.formatVersion === 2 && value.engine === 'excalidraw') {
    validateSnapshot(value.snapshot)
    return structuredClone(value)
  }
  if (value.formatVersion === 1 && 'snapshot' in value) {
    validateSnapshot(value.snapshot)
    return { formatVersion: 2, engine: 'excalidraw', engineVersion: '0.18', snapshot: value.snapshot }
  }
  if (Array.isArray(value.elements) && (value.type === 'excalidraw' || 'appState' in value || 'files' in value)) {
    return { formatVersion: 2, engine: 'excalidraw', engineVersion: '0.18', snapshot: value }
  }
  throw new Error('unsupported document format')
}

function validateSnapshot(snapshot) {
  if (snapshot === null) return
  if (!isRecord(snapshot)) throw new Error('snapshot must be an object or null')
  if ('elements' in snapshot && !Array.isArray(snapshot.elements)) throw new Error('snapshot elements must be an array')
  if ('files' in snapshot && snapshot.files !== null && !isRecord(snapshot.files)) throw new Error('snapshot files must be an object')
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character])
}

function number(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function renderSvg(document) {
  const snapshot = isRecord(document.snapshot) ? document.snapshot : {}
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements.filter((element) => isRecord(element) && !element.isDeleted) : []
  const minX = Math.min(0, ...elements.map((element) => number(element.x)))
  const minY = Math.min(0, ...elements.map((element) => number(element.y)))
  const maxX = Math.max(800, ...elements.map((element) => number(element.x) + number(element.width)))
  const maxY = Math.max(600, ...elements.map((element) => number(element.y) + number(element.height)))
  const padding = 32
  const body = elements.map((element) => {
    const x = number(element.x)
    const y = number(element.y)
    const width = number(element.width)
    const height = number(element.height)
    const stroke = escapeXml(element.strokeColor ?? '#1b1b1f')
    const fill = element.backgroundColor && element.backgroundColor !== 'transparent'
      ? escapeXml(element.backgroundColor)
      : 'none'
    const common = `stroke="${stroke}" stroke-width="${number(element.strokeWidth, 2)}" fill="${fill}"`
    if (element.type === 'rectangle') return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ${common}/>`
    if (element.type === 'ellipse') return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${Math.abs(width / 2)}" ry="${Math.abs(height / 2)}" ${common}/>`
    if (element.type === 'diamond') return `<polygon points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}" ${common}/>`
    if (element.type === 'text') {
      const lines = String(element.text ?? '').split('\n')
      return `<text x="${x}" y="${y + number(element.fontSize, 20)}" fill="${stroke}" font-family="sans-serif" font-size="${number(element.fontSize, 20)}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? '1.2em' : 0}">${escapeXml(line)}</tspan>`).join('')}</text>`
    }
    if (Array.isArray(element.points)) {
      const points = element.points.map((point) => `${x + number(point?.[0])},${y + number(point?.[1])}`).join(' ')
      return `<polyline points="${points}" ${common} fill="none"${element.type === 'arrow' ? ' marker-end="url(#arrowhead)"' : ''}/>`
    }
    return ''
  }).join('\n')
  const background = escapeXml(snapshot.appState?.viewBackgroundColor ?? '#ffffff')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}">
<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#1b1b1f"/></marker></defs>
<rect x="${minX - padding}" y="${minY - padding}" width="${maxX - minX + padding * 2}" height="${maxY - minY + padding * 2}" fill="${background}"/>
${body}
</svg>\n`
}

async function readDocument(path) {
  return migrate(JSON.parse(await readFile(resolve(path), 'utf8')))
}

async function main() {
  if (command === 'validate') {
    if (!args[0]) throw new Error('usage: repocanvas validate <document.json>')
    const document = await readDocument(args[0])
    const count = Array.isArray(document.snapshot?.elements) ? document.snapshot.elements.length : 0
    process.stdout.write(`Valid RepoCanvas v${document.formatVersion} document (${count} elements).\n`)
    return
  }
  if (command === 'upgrade' || command === 'format') {
    if (!args[0]) throw new Error(`usage: repocanvas ${command} <input.json> [output.json]`)
    const document = await readDocument(args[0])
    const output = resolve(args[1] ?? args[0])
    await writeFile(output, `${JSON.stringify(stable(document), null, 2)}\n`, 'utf8')
    process.stdout.write(`Wrote ${output}\n`)
    return
  }
  if (command === 'render') {
    if (!args[0] || !args[1]) throw new Error('usage: repocanvas render <input.json> <output.svg>')
    const document = await readDocument(args[0])
    const output = resolve(args[1])
    await writeFile(output, renderSvg(document), 'utf8')
    process.stdout.write(`Rendered ${output}\n`)
    return
  }
  process.stdout.write(`RepoCanvas CLI

  repocanvas validate <document.json>
  repocanvas upgrade <input.json> [output.json]
  repocanvas format <input.json> [output.json]
  repocanvas render <input.json> <output.svg>
`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
