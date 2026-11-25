// Build the published site into a NEW directory from public-files.txt.
// Never deploys and never deletes. Fails on a missing entry, a symlink, a path
// outside the repo, or authoring source (docs, tests, scripts, configs, agent
// files, Markdown outside news-digests).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BLOCKED = /^(docs|design|tests|scripts|\.github|\.git|node_modules)\/|^(readme|security|code_of_conduct|design|agent-readiness|agents|claude)\.md$|^package(-lock)?\.json$|(^|\/)\.env|\.(py|ps1|ya?ml|sh)$/i

export function readAllowlist(root = '.') {
  return fs.readFileSync(path.join(root, 'public-files.txt'), 'utf8')
    .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
}

function normalise(entry) {
  const dir = entry.endsWith('/')
  const n = path.posix.normalize(entry).replace(/^\.\//, '').replace(/\/$/, '')
  if (!n || n === '.' || n.startsWith('..') || path.posix.isAbsolute(n) || entry.includes(String.fromCharCode(92)) || entry.includes(':')) {
    throw new Error('Unsafe entry: ' + entry)
  }
  return { rel: n, dir }
}

// Refuse a symlink anywhere on the path, and anything that resolves outside root.
function assertReal(root, rel, wantDir) {
  const realRoot = fs.realpathSync(root)
  let cur = root
  for (const part of rel.split('/')) {
    cur = path.join(cur, part)
    if (!fs.existsSync(cur)) throw new Error('Missing allowlisted path: ' + rel)
    if (fs.lstatSync(cur).isSymbolicLink()) throw new Error('Symlink in public tree: ' + rel)
  }
  const st = fs.lstatSync(cur)
  if (wantDir ? !st.isDirectory() : !st.isFile()) throw new Error((wantDir ? 'Not a folder: ' : 'Not a file: ') + rel)
  const real = fs.realpathSync(cur)
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error('Path escapes the repo: ' + rel)
}

function walk(root, rel) {
  return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap(e => {
    const child = rel + '/' + e.name
    if (e.isSymbolicLink()) throw new Error('Symlink in public tree: ' + child)
    return e.isDirectory() ? walk(root, child) : [child]
  })
}

export function publicFiles(root = '.') {
  const files = []
  for (const entry of readAllowlist(root)) {
    const { rel, dir } = normalise(entry)
    assertReal(root, rel, dir)
    files.push(...(dir ? walk(root, rel) : [rel]))
  }
  for (const f of files) {
    if (BLOCKED.test(f) || (/\.md$/i.test(f) && !f.startsWith('news-digests/'))) throw new Error('Authoring source cannot be published: ' + f)
  }
  if (new Set(files).size !== files.length) throw new Error('Duplicate public file')
  return files.sort()
}

export function build(output, root = '.') {
  if (fs.existsSync(output)) throw new Error('Output already exists; choose a new directory (nothing deleted)')
  const files = publicFiles(root)
  for (const f of files) {
    const target = path.join(output, f)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, f), target)
  }
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--output')
  if (i < 0 || !process.argv[i + 1]) { console.error('Usage: node scripts/build-public.mjs --output <new dir>'); process.exit(2) }
  const files = build(process.argv[i + 1])
  console.log(`Public artifact built: ${files.length} files; no docs, tests, scripts or configs.`)
}
