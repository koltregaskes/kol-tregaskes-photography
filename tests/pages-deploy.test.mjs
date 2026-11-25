import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build, publicFiles } from '../scripts/build-public.mjs'

const pages = fs.readFileSync('.github/workflows/pages.yml', 'utf8')
const refresh = fs.readFileSync('.github/workflows/refresh-routed-feed.yml', 'utf8')

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktp-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('the allowlist builds the live pages and leaves authoring source out', t => {
  const out = path.join(tmp(t), 'site')
  const files = build(out)
  for (const f of ['index.html', 'news.html', 'site.js', 'news-app.js', 'source-permissions.mjs', 'styles.css', 'CNAME',
    '.nojekyll', '.well-known/security.txt', 'news-digests/index.json', 'news-digests/news-feed-latest.json',
    'launch/source-permissions.json']) {
    assert.ok(files.includes(f), f)
    assert.ok(fs.statSync(path.join(out, f)).isFile(), 'written: ' + f)
  }
  for (const f of files) {
    assert.doesNotMatch(f, /^(docs|design|tests|scripts|\.github)\//i)
    assert.ok(!/\.md$/i.test(f) || f.startsWith('news-digests/'), f)
  }
  assert.ok(!files.includes('package.json') && !files.includes('README.md') && !files.includes('launch/link-dispositions.json'))
})

test('every file the pages, styles and manifest load is in the allowlist', () => {
  const files = new Set(publicFiles())
  const refs = new Set()
  const add = raw => {
    const ref = raw.trim().split(/[?#]/)[0].replace(/^\.?\//, '').replace(/^https:\/\/koltregaskesphotography\.com\//, '')
    if (ref && !/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(ref)) refs.add(ref)
  }
  for (const f of [...files].filter(f => !f.includes('/') && /\.(html|js|mjs|css|webmanifest)$/.test(f))) {
    const text = fs.readFileSync(f, 'utf8')
    for (const m of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(m[1])
    for (const m of text.matchAll(/srcset=["']([^"']+)["']/g)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0])
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1])
    for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) add(m[1])
    for (const m of text.matchAll(/\bimport\s*(?:[\w{}*\s,]+from\s*)?\(?\s*["']([^"']+)["']/g)) add(m[1])
    for (const m of text.matchAll(/fetch\(\s*["']([^"'$`]+)["']/g)) add(m[1])
    if (f.endsWith('.webmanifest')) for (const icon of JSON.parse(text).icons || []) add(icon.src)
  }
  assert.ok(refs.size > 10)
  for (const ref of refs) assert.ok(files.has(ref) || files.has(ref.replace(/\/$/, '') + '/index.html'), 'not published: ' + ref)
})

test('the builder refuses unsafe or authoring entries', t => {
  const root = tmp(t)
  const write = (rel, body = 'x') => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body) }
  write('index.html'); write('docs/note.md'); write('README.MD'); write('package.json'); write('a.YML')
  const refuses = (list, re) => { fs.writeFileSync(path.join(root, 'public-files.txt'), list); assert.throws(() => publicFiles(root), re) }
  refuses('index.html\n../outside.html\n', /Unsafe entry/)
  refuses('index.html\nmissing.html\n', /Missing allowlisted path/)
  refuses('docs/\n', /Authoring source/)
  refuses('./docs/note.md\n', /Authoring source/)
  refuses('README.MD\n', /Authoring source/)
  refuses('./package.json\n', /Authoring source/)
  refuses('a.YML\n', /Authoring source/)
  refuses('index.html\n./index.html\n', /Duplicate/)
  refuses('index.html/\n', /Not a folder/)
  fs.writeFileSync(path.join(root, 'public-files.txt'), 'index.html\n')
  assert.deepEqual(publicFiles(root), ['index.html'])
  const out = path.join(root, 'out'); fs.mkdirSync(out)
  assert.throws(() => build(out, root), /Output already exists/)
  try {
    fs.symlinkSync(path.join(root, 'index.html'), path.join(root, 'link.html'))
    refuses('link.html\n', /Symlink/)
  } catch (e) {
    if (e.code !== 'EPERM') throw e // Windows without symlink rights: covered on CI
  }
})

test('pages.yml deploys after every finished refresh on main, with least privilege', () => {
  const trigger = pages.slice(pages.indexOf('workflow_run:'), pages.indexOf('\npermissions:'))
  assert.match(trigger, /workflows: \["Refresh routed feed"\]/)
  assert.match(trigger, /types: \[completed\]/)
  assert.match(trigger, /branches: \["main"\]/)
  assert.match(pages, /uses: actions\/checkout@v\d+\s+with:\s+ref: main/)
  assert.match(pages, /contains\(fromJSON\('\["success", "failure"\]'\), github\.event\.workflow_run\.conclusion\)/)
  assert.match(pages, /node scripts\/build-public\.mjs --output "\$RUNNER_TEMP\/_site"/)
  assert.match(pages, /chmod -R \+rX "\$RUNNER_TEMP\/_site"/)
  assert.match(pages, /bad=\$\(find \. /)
  const top = pages.slice(pages.indexOf('\npermissions:'), pages.indexOf('\nconcurrency:'))
  assert.doesNotMatch(top, /pages: write|id-token: write/)
  const deploy = pages.slice(pages.indexOf('\n  deploy:'))
  assert.match(deploy, /pages: write/)
  assert.match(deploy, /id-token: write/)
  assert.match(refresh, /^name: Refresh routed feed$/m)
})
