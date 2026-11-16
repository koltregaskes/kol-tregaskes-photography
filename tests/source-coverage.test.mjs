import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { makeCoverage, validateCoverage, coverageMessage, coverageReport } from '../scripts/source-coverage.mjs'
import { SITE_SLUG, refreshRoutedFeed as refreshWithPermissions } from '../scripts/refresh-routed-feed.mjs'
import { assessRoutedFeedFreshness, formatReport } from '../scripts/check-routed-feed-freshness.mjs'
import { collectFeedProof, DESTINATION } from '../scripts/check-public-feed-proof.mjs'

import { compileRegistry } from '../source-permissions.mjs'
const fixtureRegistry = compileRegistry({ sources: sources().map(source => ({
  label: source.name, endpoints: [source.url], status: 'link-only', evidence: 'permission unverified',
  attribution_required: 'Fixture source and link', permitted_fields: ['headline','link'], max_excerpt_length: 0,
  retention: 'Fixture only', rate_limit: 'Fixture only', takedown_contact: 'Fixture only',
})) })
const refreshRoutedFeed = options => refreshWithPermissions({ ...options, registry: fixtureRegistry })

const cases = JSON.parse(fs.readFileSync('tests/fixtures/source-coverage.json'))
const now = new Date('2026-10-26T06:30:00Z')
function pipeline(sources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-coverage-'))
  fs.mkdirSync(path.join(dir, 'config'))
  fs.writeFileSync(path.join(dir, 'config/sources.json'), JSON.stringify({ sources }))
  fs.writeFileSync(path.join(dir, 'site-filters.json'), JSON.stringify({ sites: { [SITE_SLUG]: { name: 'Kol Tregaskes Photography', include_tags: ['camera'] } } }))
  return dir
}
function sources(count = 4) {
  return Array.from({ length: count }, (_, id) => ({ id: `source-${id}`, name: `Source ${id}`, url: `https://example.test/${id}`, adapter: 'rss', tags: ['camera'] }))
}
const outcome = (failed, required = false) => sources().map((source, id) => ({ id: source.id, name: source.name, required: required && id === 0, outcome: id < failed ? 'failure' : 'success' }))
const response = failed => ({ ok: !failed, status: failed ? 403 : 200, text: async () => failed ? '' : '<rss><channel></channel></rss>' })

for (const fixture of cases) {
  test(`${fixture.failed} of four sources fail: persisted outcomes, public notice, CLI and preservation`, async () => {
    const dir = pipeline(sources()), outputPath = path.join(dir, 'feed.json'), statusPath = path.join(dir, 'status.json')
    const previous = Buffer.from('{"previous":"feed must survive lost coverage"}\n')
    fs.writeFileSync(outputPath, previous)
    let calls = 0
    const result = await refreshRoutedFeed({ pipelineDir: dir, outputPath, statusPath, now, retries: 1,
      fetchImpl: async url => { calls++; return response(Number(url.split('/').at(-1)) < fixture.failed) } })
    assert.equal(calls, 4)
    assert.equal(result.coverage.status, fixture.expected)
    assert.equal(result.coverage.failed, fixture.failed)
    assert.equal(result.coverage.sources.length, 4)
    assert.equal(result.coverage.succeeded, 4 - fixture.failed)
    assert.deepEqual(JSON.parse(fs.readFileSync(statusPath)).coverage, result.coverage)
    assert.equal(validateCoverage(result.coverage).status, fixture.expected)
    const report = coverageReport(result.coverage)
    assert.equal(report.level, fixture.level)
    assert.equal(report.exitCode, fixture.exitCode)
    const cli = spawnSync(process.execPath, ['scripts/report-source-status.mjs', statusPath], { encoding: 'utf8' })
    assert.equal(cli.status, fixture.exitCode)
    assert.match(cli.stdout, new RegExp(`::${fixture.level} title=`))
    if (fixture.failed) assert.match(coverageMessage(result.coverage), /^Some sources unavailable/)
    if (fixture.exitCode) {
      assert.equal(result.wrote, false)
      assert.equal(result.feed, null)
      assert.deepEqual(fs.readFileSync(outputPath), previous)
    } else {
      assert.equal(result.wrote, true)
      const feed = JSON.parse(fs.readFileSync(outputPath))
      assert.equal(feed.article_count, 0)
      assert.equal(feed.newest_source_at, null)
      assert.deepEqual(feed.acquisition, result.coverage)
      const assessment = globalThis.KTPNewsState.assessRoutedFeed(feed, now.getTime())
      assert.equal(assessment.state, 'empty')
      assert.equal(assessment.newestSourceAt, null)
      if (fixture.failed) assert.match(assessment.message, /Some sources unavailable/)
      else assert.doesNotMatch(assessment.message, /Some sources unavailable/)
      const fresh = assessRoutedFeedFreshness(feed, now)
      assert.equal(fresh.newestItemAt, null)
      assert.match(formatReport(fresh), /no source timestamp is claimed/)
      const bytes = Buffer.from(JSON.stringify(feed))
      const proof = await collectFeedProof(bytes, { now, fetchImpl: async () => ({ ok: true, status: 200, url: DESTINATION, arrayBuffer: async () => bytes }) })
      assert.equal(proof.status, 'match')
      assert.equal(proof.coverageStatus, fixture.expected)
      assert.deepEqual(proof.acquisition, feed.acquisition)
      assert.equal(proof.newestSourceAt, null)
    }
    // The public state helper also renders failure metadata if such a feed is supplied.
    const view = globalThis.KTPNewsState.assessRoutedFeed({ site: 'Kol Tregaskes Photography', generated: now.toISOString(), articles: [], acquisition: result.coverage }, now.getTime())
    if (fixture.failed) assert.match(view.message, /^Some sources unavailable/)
    if (fixture.exitCode) {
      assert.equal(view.state, 'unavailable')
      assert.doesNotMatch(view.message, /no matching photography stories/)
      let fetched = false
      const bytes = Buffer.from(JSON.stringify({ generated: now.toISOString(), articles: [], acquisition: result.coverage }))
      const proof = await collectFeedProof(bytes, { now, fetchImpl: async () => { fetched = true } })
      assert.equal(proof.status, 'unverified')
      assert.equal(proof.reason, 'Source coverage lost')
      assert.equal(fetched, false)
    }
  })
}

test('zero configured sources, a lost required source and invalid source responses cannot claim coverage', async () => {
  for (const configured of [[], sources().map((s, i) => ({ ...s, required: i === 0 }))]) {
    const result = await refreshRoutedFeed({ pipelineDir: pipeline(configured), now, write: false, retries: 1, fetchImpl: async url => response(url.endsWith('/0')) })
    assert.equal(result.coverage.status, 'failed')
    assert.equal(result.feed, null)
  }
  const malformed = await refreshRoutedFeed({ pipelineDir: pipeline(sources(1)), write: false, retries: 1,
    fetchImpl: async () => ({ ok: true, text: async () => '<html>Access denied</html>' }) })
  assert.equal(malformed.coverage.failed, 1)
  assert.match(malformed.failures[0], /not an RSS or Atom feed/)
  const missing = spawnSync(process.execPath, ['scripts/report-source-status.mjs', path.join(pipeline([]), 'absent.json')], { encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Source status is missing or invalid/)
})

test('mismatched totals, duplicate IDs, invalid outcomes and forged healthy status are rejected', () => {
  const healthy = makeCoverage(outcome(0))
  for (const invalid of [null, { ...healthy, failed: 1 }, { ...makeCoverage(outcome(1)), status: 'healthy' },
    { ...healthy, sources: [...healthy.sources, healthy.sources[0]] },
    { ...healthy, sources: [{ id: 'unknown', name: 'Unknown', required: false, outcome: 'unknown' }] }]) {
    assert.throws(() => validateCoverage(invalid))
    assert.throws(() => assessRoutedFeedFreshness({ generated: now.toISOString(), articles: [], acquisition: invalid }, now))
    const view = globalThis.KTPNewsState.assessRoutedFeed({ site: 'Kol Tregaskes Photography', generated: now.toISOString(), articles: [], acquisition: invalid }, now.getTime())
    assert.equal(view.state, 'unavailable')
    assert.match(view.message, /metadata is invalid/)
  }
  const legacy = globalThis.KTPNewsState.assessRoutedFeed({ site: 'Kol Tregaskes Photography', generated: now.toISOString(), articles: [] }, now.getTime())
  assert.match(legacy.message, /Source availability: not recorded/)
})

test('a matched source retains its real timestamp while empty feeds claim none', async () => {
  const result = await refreshRoutedFeed({ pipelineDir: pipeline(sources(1)), now, write: false, retries: 1, fetchImpl: async () => ({ ok: true, text: async () => '<rss><channel><item><title>Camera</title><link>https://example.test/story</link><pubDate>Sun, 25 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>' }) })
  assert.equal(result.feed.newest_source_at, '2026-10-25T12:00:00.000Z')
  assert.equal(result.feed.articles[0].date, '2026-10-25T12:00:00.000Z')
})

test('archived cards distinguish source day and digest edition, including missing and invalid source dates', () => {
  const element = tag => ({ tag, children: [], append(...nodes) { this.children.push(...nodes) }, appendChild(node) { this.children.push(node) }, setAttribute() {},
    set innerHTML(v) { this.value = v }, get innerHTML() { return this.value }, value: '' })
  const context = { Date, document: { addEventListener() {}, createElement: element } }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync('news-app.js', 'utf8') + '\nglobalThis.NewsClass=PhotographyNewsApp;', context)
  const app = Object.create(context.NewsClass.prototype)
  const cards = app.parseDigest(fs.readFileSync('tests/fixtures/source-dates.md', 'utf8'), 'digest-2026-10-26.md')
  assert.equal(cards.length, 3)
  assert.equal(cards[0].sourceDate.toISOString(), '2026-10-25T00:00:00.000Z')
  assert.equal(cards[0].sourceDatePrecision, 'day')
  assert.equal(cards[0].digestDate.toISOString().slice(0, 10), '2026-10-26')
  assert.equal(cards[0].dateKey, '2026-10-26')
  assert.equal(cards[1].sourceDate, null)
  assert.equal(cards[2].sourceDate, null)
  assert.match(app.createArticleCard(cards[0]).children[0].innerHTML, /Source: 25 Oct 2026; Digest: 26 Oct 2026/)
  assert.match(app.createArticleCard(cards[1]).children[0].innerHTML, /Source date unavailable; Digest: 26 Oct 2026/)
  assert.match(app.createArticleCard({ ...cards[0], digestDate: null }).children[0].innerHTML, /Source: 25 Oct 2026/)
  assert.doesNotMatch(app.createArticleCard({ ...cards[0], digestDate: null }).children[0].innerHTML, /Digest:/)
  assert.equal(app.parseSourceDate('29/02/2025'), null)
  assert.equal(app.parseSourceDate('29/02/2024').toISOString(), '2024-02-29T00:00:00.000Z')
})

test('workflow always reports the attempt before any publishing step', () => {
  const workflow = fs.readFileSync('.github/workflows/refresh-routed-feed.yml', 'utf8')
  assert.match(workflow, /Report source coverage[^\n]*\n\s+if: always\(\)\n\s+run: node scripts\/report-source-status\.mjs/)
  assert.ok(workflow.indexOf('Report source coverage') < workflow.indexOf('Validate before publishing'))
  assert.doesNotMatch(workflow, /continue-on-error/)
})

test('configured but unpermitted sources have an honest failure report and preserve feed bytes', async () => {
  const configured = sources(1).map(source => ({ ...source, url: 'https://example.test/unreviewed' }))
  const dir = pipeline(configured), outputPath = path.join(dir, 'feed.json'), statusPath = path.join(dir, 'status.json')
  const previous = Buffer.from('previous feed bytes\r\n')
  fs.writeFileSync(outputPath, previous)
  const result = await refreshRoutedFeed({ pipelineDir: dir, outputPath, statusPath, now,
    fetchImpl: async () => { assert.fail('An unreviewed endpoint must not be fetched') } })
  assert.equal(result.coverage.configured, 1)
  assert.equal(result.coverage.attempted, 0)
  assert.equal(result.coverage.status, 'failed')
  assert.equal(result.wrote, false)
  assert.deepEqual(fs.readFileSync(outputPath), previous)
  const message = 'Source coverage lost: sources were configured but none is permitted for acquisition.'
  assert.equal(coverageReport(result.coverage).text, message)
  const cli = spawnSync(process.execPath, ['scripts/report-source-status.mjs', statusPath], { encoding: 'utf8' })
  assert.equal(cli.status, 1)
  assert.ok(cli.stdout.includes(`::error title=Routed feed source coverage::${message}`))
  assert.doesNotMatch(cli.stdout, /no sources were configured/)
  const view = globalThis.KTPNewsState.assessRoutedFeed({ site: 'Kol Tregaskes Photography', generated: now.toISOString(), articles: [], acquisition: result.coverage }, now.getTime())
  assert.equal(view.state, 'unavailable')
  assert.ok(view.message.startsWith(message))
  assert.equal(coverageMessage(makeCoverage([])), 'Source coverage lost: no sources were configured.')
})

test('configured source counts are validated while earlier coverage metadata remains readable', () => {
  const current = makeCoverage(outcome(0))
  const { configured, ...legacy } = current
  assert.equal(validateCoverage(legacy).configured, 4)
  for (const invalid of [-1, 3, 4.5, '4', null]) assert.throws(() => validateCoverage({ ...current, configured: invalid }), /configured source count/)
})
