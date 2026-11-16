import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import * as policy from '../source-permissions.mjs'

const message = 'Source permissions unavailable. News stories are withheld until the registry can be checked.'
const cases = {
  'missing registry': { ok: false },
  'registry request failure': { fetchError: true },
  'invalid registry JSON': { jsonError: true },
  'invalid registry schema': { registry: { sources: [{}] } },
  'policy import failure': { policyError: true },
}

for (const view of ['news', 'topics']) for (const [name, fixture] of Object.entries(cases)) {
  test(`${view}: ${name} settles visibly as unavailable and withholds all cards`, async () => {
    let requests = 0
    const context = { Date, console,
      loadPolicy: () => fixture.policyError ? Promise.reject(new Error('Module load refused')) : Promise.resolve(policy),
      document: { addEventListener() {} },
      fetch: async url => {
        requests++
        assert.equal(url, 'launch/source-permissions.json')
        if (fixture.fetchError) throw new Error('Registry unavailable')
        return { ok: fixture.ok !== false, json: async () => {
          if (fixture.jsonError) throw new SyntaxError('Invalid JSON')
          return fixture.registry || { sources: [] }
        } }
      } }
    vm.createContext(context)
    // Replace only the module loader, so the real load/catch/render path runs.
    vm.runInContext(fs.readFileSync('news-app.js', 'utf8').replace("import('./source-permissions.mjs')", 'loadPolicy()') + '\nglobalThis.NewsClass = PhotographyNewsApp', context)
    const app = Object.create(context.NewsClass.prototype)
    const labels = { strong: {}, span: {} }
    Object.assign(app, {
      viewMode: view, articles: [{ title: 'Previous card' }], filteredArticles: [{ title: 'Previous card' }],
      feedAssessment: { state: 'fresh', message: 'Previous refresh' },
      feedStatus: { dataset: view === 'news' ? {} : { state: 'fresh' }, textContent: 'Checking refresh', hidden: true },
      loading: { hidden: false }, groups: { innerHTML: '<article class="news-card">Previous card</article>' },
      empty: { hidden: true, querySelector: selector => labels[selector] },
    })
    await app.loadArticles()
    app.renderArticles()
    assert.equal(app.feedStatus.dataset.state, 'unavailable')
    assert.equal(app.feedStatus.textContent, message)
    assert.equal(app.feedStatus.hidden, false)
    assert.equal(app.feedAssessment.state, 'unavailable')
    assert.equal(app.feedAssessment.message, message)
    assert.equal(app.loading.hidden, true)
    assert.equal(app.articles.length, 0)
    assert.equal(app.filteredArticles.length, 0)
    assert.equal(app.groups.innerHTML, '')
    assert.equal(app.empty.hidden, false)
    assert.equal(requests, 1, 'No digest or feed is requested before permissions are available')
  })
}
