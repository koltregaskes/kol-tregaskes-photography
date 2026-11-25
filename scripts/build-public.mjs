// Build the published site into a NEW directory from public-files.txt.
// Never deploys and never deletes. Fails on a missing entry or on authoring
// source (docs, tests, scripts, configs, Markdown outside news-digests).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BLOCKED = /^(docs|design|tests|scripts|\.github)\/|^(README|SECURITY|CODE_OF_CONDUCT|DESIGN|AGENT-READINESS)\.md$|^package(-lock)?\.json$|\.(py|ps1|ya?ml)$/

export function readAllowlist(root = '.') {
  return fs.readFileSync(path.join(root, 'public-files.txt'), 'utf8')
    .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
}

function walk(dir, base) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isSymbolicLink()) throw new Error('Symlink in public tree: ' + full)
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')]
  })
}

export function publicFiles(root = '.') {
  const files = []
  for (const entry of readAllowlist(root)) {
    if (entry.includes('..') || path.isAbsolute(entry) || entry.includes(String.fromCharCode(92))) throw new Error('Unsafe entry: ' + entry)
    const full = path.join(root, entry)
    if (!fs.existsSync(full)) throw new Error('Missing allowlisted path: ' + entry)
    if (entry.endsWith('/')) files.push(...walk(full, root))
    else files.push(entry)
  }
  for (const f of files) {
    if (BLOCKED.test(f) || (f.endsWith('.md') && !f.startsWith('news-digests/'))) throw new Error('Authoring source cannot be published: ' + f)
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
