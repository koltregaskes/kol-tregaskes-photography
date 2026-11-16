import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import * as policy from '../source-permissions.mjs'
import { refreshRoutedFeed, SITE_SLUG } from '../scripts/refresh-routed-feed.mjs'
import { checkSourcePermissions } from '../scripts/check-source-permissions.mjs'

const entry = (label, status = 'link-only', extra = {}) => ({ label, status,
  endpoints: ['https://example.test/feed'], evidence: 'permission unverified',
  attribution_required: 'Source name and link', permitted_fields: status === 'excluded' ? [] : ['headline', 'link'],
  max_excerpt_length: 0, retention: 'Fixture only', rate_limit: 'Fixture only', takedown_contact: 'Fixture only', ...extra })
const fixture = { sources: [entry('Link fixture'), entry('Excluded fixture', 'excluded'),
  entry('Permitted fixture', 'permitted', { evidence: 'https://example.test/permission - fictional fixture only', permitted_fields: ['headline', 'link', 'excerpt', 'image'], max_excerpt_length: 8 })] }
const registry = policy.compileRegistry(fixture)
const article = { title: 'Camera headline', source: 'Link fixture', url: 'https://example.test/story',
  date: '2026-10-25T00:00:00Z', tags: ['camera'], importance: 1,
  summary: 'Copied excerpt', image: 'https://example.test/photo.jpg', description: 'Alias excerpt', thumbnail: 'Alias image' }

test('fixture field rules strip all copied fields and embedded heading prose; exclude unknown labels', () => {
  const clean = policy.applyFieldRules({ ...article, title: 'Camera headline\nCopied prose' }, registry)
  assert.equal(clean.title, 'Camera headline')
  for (const key of ['summary', 'image', 'description', 'thumbnail']) assert.ok(!(key in clean))
  policy.assertPublishedItem(clean, registry)
  assert.equal(policy.applyFieldRules({ ...article, source: 'Unknown' }, registry), null)
  assert.equal(policy.applyFieldRules({ ...article, source: 'Excluded fixture' }, registry), null)
  const permitted = policy.applyFieldRules({ ...article, source: 'Permitted fixture' }, registry)
  assert.equal(permitted.summary, 'Copied e')
  assert.equal(permitted.image, article.image)
  policy.assertPublishedItem(permitted, registry)
})

test('build guard rejects missing, excluded and disallowed publication fields', () => {
  for (const bad of [article, { ...article, source: 'Unknown' }, { ...article, source: 'Excluded fixture' },
    { ...policy.applyFieldRules(article, registry), content: 'hidden copied content' },
    { ...policy.applyFieldRules(article, registry), image: article.image },
    { ...article, source: 'Permitted fixture', summary: 'Too long for fixture limit' }]) {
    assert.throws(() => policy.assertPublishedItem(bad, registry))
  }
  assert.throws(() => policy.compileRegistry({ sources: [entry('No evidence', 'permitted')] }))
  assert.throws(() => policy.compileRegistry({ sources: [entry('Wrong fields', 'link-only', { permitted_fields: ['headline','excerpt'] })] }))
})

test('acquisition uses exact reviewed endpoints and never calls excluded, unknown or unverified routes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-permissions-'))
  fs.mkdirSync(path.join(root, 'config'))
  fs.writeFileSync(path.join(root, 'site-filters.json'), JSON.stringify({ sites: { [SITE_SLUG]: { name: 'Kol Tregaskes Photography', include_tags: ['camera'] } } }))
  const source = (name, url = 'https://example.test/feed') => ({ id: name, name, url, adapter: 'rss', tags: ['camera'] })
  const config = path.join(root, 'config/sources.json')
  fs.writeFileSync(config, JSON.stringify({ sources: [source('Link fixture'), source('Excluded fixture'), source('Unknown'), source('Link fixture', 'https://example.test/feed?different')] }))
  let calls = 0
  const outputPath = path.join(root, 'feed.json')
  const response = '<rss><channel><item><title>Camera</title><link>https://example.test/story</link><pubDate>Sun, 25 Oct 2026 00:00:00 GMT</pubDate><description>Copied prose</description></item></channel></rss>'
  await refreshRoutedFeed({ pipelineDir: root, registry, outputPath, now: new Date('2026-10-26'), fetchImpl: async () => { calls++; return { ok: true, text: async () => response } } })
  assert.equal(calls, 1)
  const feed = JSON.parse(fs.readFileSync(outputPath))
  assert.equal(feed.articles.length, 1)
  assert.ok(!('summary' in feed.articles[0]))
  const before = fs.readFileSync(outputPath)
  fs.writeFileSync(config, JSON.stringify({ sources: [source('Unknown')] }))
  await assert.rejects(refreshRoutedFeed({ pipelineDir: root, registry, outputPath, fetchImpl: async () => { throw new Error('must not fetch') } }), /No reviewed source endpoints/)
  assert.deepEqual(fs.readFileSync(outputPath), before)
  assert.equal(policy.acquisitionAllowed(source('Link fixture'), policy.compileRegistry({ sources: [entry('Link fixture', 'link-only', { endpoints: [] })] })), false)
})

test('real build check fails on a dirty feed and on an unknown archive source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-permissions-build-'))
  fs.mkdirSync(path.join(root, 'launch')); fs.mkdirSync(path.join(root, 'news-digests'))
  fs.writeFileSync(path.join(root, 'launch/source-permissions.json'), JSON.stringify(fixture))
  const feed = path.join(root, 'news-digests/news-feed-latest.json')
  fs.writeFileSync(feed, JSON.stringify({ articles: [article] }))
  assert.throws(() => checkSourcePermissions(root), /Disallowed/)
  fs.writeFileSync(feed, JSON.stringify({ articles: [policy.applyFieldRules(article, registry)] }))
  checkSourcePermissions(root)
  fs.writeFileSync(path.join(root, 'news-digests/digest-fixture.md'), '*Unknown* | Score: 1\n')
  assert.throws(() => checkSourcePermissions(root), /Archive source missing/)
})

test('both routed and archived public cards use the registry; history bytes are untouched', async () => {
  const archive = fs.readFileSync('tests/fixtures/permissions-archive.md', 'utf8')
  const context = { fixturePolicy: policy, URL, Date, console, document: { addEventListener() {}, createElement: () => ({ set innerHTML(v) { this.value = v }, value: '' }) },
    fetch: async () => ({ ok: true, json: async () => fixture }) }
  vm.createContext(context)
  // Inject the module loader only; execute the actual view loading/merge code.
  vm.runInContext(fs.readFileSync('news-app.js', 'utf8').replace("import('./source-permissions.mjs')", 'Promise.resolve(fixturePolicy)') + '\nglobalThis.NewsClass = PhotographyNewsApp', context)
  const app = Object.create(context.NewsClass.prototype)
  app.loadDigestList = async () => ['fixture.md']
  app.loadDigest = async () => app.parseDigest(archive, 'digest-2026-10-26.md')
  app.loadRoutedArticles = async () => [{ ...article, url: 'https://example.test/routed', date: new Date(article.date), dateKey: '2026-10-25' }]
  app.shouldDisplayArticle = () => true
  app.updateStats = () => {}
  await app.loadArticles()
  assert.equal(app.articles.length, 2)
  assert.ok(app.articles.every(a => a.source === 'Link fixture' && a.summary === '' && a.title === 'Camera headline'
    && !('image' in a) && !('description' in a) && !('thumbnail' in a)))
  assert.equal(fs.readFileSync('tests/fixtures/permissions-archive.md', 'utf8'), archive)
  context.fetch = async () => { throw new Error('registry missing') }
  await app.loadArticles()
  assert.equal(app.articles.length, 0)
})

test('production registry covers exactly the audit labels and grants no excerpt or image reuse', () => {
  const doc = JSON.parse(fs.readFileSync('launch/source-permissions.json'))
  const current = policy.compileRegistry(doc)
  assert.equal(current.size, 40)
  assert.equal(doc.sources.filter(e => e.status === 'permitted').length, 0)
  assert.equal(current.get('DPReview').status, 'excluded')
  assert.equal(current.get('Digital Camera World').status, 'excluded')
  assert.equal(current.get('Fstoppers').status, 'link-only')
  assert.ok(doc.sources.every(e => e.endpoints.length === 0 && e.max_excerpt_length === 0))
})
