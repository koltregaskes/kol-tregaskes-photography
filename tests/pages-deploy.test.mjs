import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build, publicFiles } from '../scripts/build-public.mjs'

const pages = fs.readFileSync('.github/workflows/pages.yml', 'utf8')
const refresh = fs.readFileSync('.github/workflows/refresh-routed-feed.yml', 'utf8')

test('the allowlist builds the live pages and leaves authoring source out', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ktp-')), 'site')
  const files = build(out)
  for (const f of ['index.html', 'news.html', 'site.js', 'news-app.js', 'source-permissions.mjs', 'CNAME',
    '.nojekyll', '.well-known/security.txt', 'news-digests/index.json', 'news-digests/news-feed-latest.json',
    'launch/source-permissions.json']) assert.ok(files.includes(f), f)
  for (const f of files) {
    assert.doesNotMatch(f, /^(docs|design|tests|scripts|\.github)\//)
    assert.ok(!f.endsWith('.md') || f.startsWith('news-digests/'), f)
  }
  assert.ok(!files.includes('package.json') && !files.includes('README.md') && !files.includes('launch/link-dispositions.json'))
})

test('every file the pages load is in the allowlist', () => {
  const files = new Set(publicFiles())
  const refs = new Set()
  for (const f of [...files].filter(f => /\.(html|js|mjs)$/.test(f) && !f.includes('/'))) {
    const text = fs.readFileSync(f, 'utf8')
    for (const m of text.matchAll(/(?:src|href)="(?!https?:|mailto:|#|data:)([^"?#]+)"|fetch\('([^'`$]+)'|import\('\.\/([^']+)'\)/g)) {
      const ref = (m[1] || m[2] || m[3]).replace(/^\.?\//, '')
      if (ref) refs.add(ref)
    }
  }
  for (const ref of refs) assert.ok(files.has(ref) || files.has(ref + 'index.html'), 'not published: ' + ref)
})

test('pages.yml deploys after every finished refresh on main', () => {
  const trigger = pages.slice(pages.indexOf('workflow_run:'), pages.indexOf('\npermissions:'))
  assert.match(trigger, /workflows: \["Refresh routed feed"\]/)
  assert.match(trigger, /types: \[completed\]/)
  assert.match(trigger, /branches: \["main"\]/)
  assert.match(pages, /uses: actions\/checkout@v\d+\s+with:\s+ref: main/)
  assert.match(pages, /contains\(fromJSON\('\["success", "failure"\]'\), github\.event\.workflow_run\.conclusion\)/)
  assert.match(pages, /node scripts\/build-public\.mjs --output "\$RUNNER_TEMP\/_site"/)
  assert.match(pages, /chmod -R \+rX "\$RUNNER_TEMP\/_site"/)
  assert.match(pages, /bad=\$\(find \. /)
  assert.match(refresh, /^name: Refresh routed feed$/m)
})
