import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspaceRoot = resolve(packageRoot, '..', '..')
const npmCli = process.env.npm_execpath
let tempDirectory
let tarballPath

try {
  const packExecutable = npmCli ? process.execPath : 'npm'
  const packArguments = npmCli
    ? [npmCli, 'pack', '--ignore-scripts', '--json']
    : ['pack', '--ignore-scripts', '--json']
  const packOutput = execFileSync(packExecutable, packArguments, {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  const packed = JSON.parse(packOutput)
  const packResult = Array.isArray(packed) ? packed[0] : Object.values(packed)[0]
  const { filename } = packResult
  tarballPath = resolve(packageRoot, filename)
  tempDirectory = await mkdtemp(join(workspaceRoot, '.repocanvas-consumer-'))
  execFileSync('tar', ['-xzf', tarballPath, '-C', tempDirectory])

  const extractedRoot = join(tempDirectory, 'package')
  const manifest = JSON.parse(await readFile(join(extractedRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.version, '0.2.0')
  assert.ok(manifest.exports['./core'])
  assert.ok(manifest.exports['./editor'])
  assert.ok(manifest.exports['./library'])
  assert.ok(manifest.exports['./testing'])
  assert.equal(manifest.bin.repocanvas, 'scripts/repocanvas-cli.mjs')

  const core = await import(pathToFileURL(join(extractedRoot, 'dist', 'core.js')).href)
  assert.equal(typeof core.createEmptyDocument, 'function')
  assert.equal(typeof core.IndexedDbWhiteboardStorageAdapter, 'function')
  const entry = await import(pathToFileURL(join(extractedRoot, 'dist', 'index.js')).href)
  assert.equal(typeof entry.RepoCanvasEditor, 'object')
  assert.equal(typeof entry.WhiteboardWorkspace, 'function')

  const fixturePath = join(tempDirectory, 'fixture.json')
  await writeFile(fixturePath, JSON.stringify(core.createEmptyDocument()), 'utf8')
  const cliOutput = execFileSync(process.execPath, [
    join(extractedRoot, 'scripts', 'repocanvas-cli.mjs'),
    'validate',
    fixturePath,
  ], { encoding: 'utf8' })
  assert.match(cliOutput, /Valid RepoCanvas v2 document/)
  const svgPath = join(tempDirectory, 'fixture.svg')
  execFileSync(process.execPath, [
    join(extractedRoot, 'scripts', 'repocanvas-cli.mjs'),
    'render',
    fixturePath,
    svgPath,
  ])
  assert.match(await readFile(svgPath, 'utf8'), /<svg/)
  console.log('Verified packed RepoCanvas from a consumer directory, including subpaths and CLI rendering.')
} finally {
  if (tempDirectory) {
    const allowedPrefix = `${workspaceRoot}${sep}.repocanvas-consumer-`
    assert.ok(tempDirectory.startsWith(allowedPrefix), 'Refusing to remove an unexpected consumer directory.')
    await rm(tempDirectory, { recursive: true, force: true })
  }
  if (tarballPath) {
    assert.ok(tarballPath.startsWith(`${packageRoot}${sep}`), 'Refusing to remove an unexpected tarball.')
    await rm(tarballPath, { force: true })
  }
}
