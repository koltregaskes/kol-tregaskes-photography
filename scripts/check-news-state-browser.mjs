import { chromium } from '@playwright/test';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd(), browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
let count = 0;
const article = { title: 'A camera release', url: 'https://example.com/camera', source: 'Example', date: new Date().toISOString(), tags: ['camera'], matching_tags: ['camera'] };
// Fictional browser fixtures only; production permissions are never changed.
const registry = { sources: [{ label: 'Example', status: 'link-only', endpoints: [], evidence: 'Fictional browser fixture; permission unverified',
    attribution_required: 'Fixture source and original link', permitted_fields: ['headline', 'link'], max_excerpt_length: 0,
    retention: 'Fixture only', rate_limit: 'Fixture only', takedown_contact: 'Fixture only' }] };
const digest = '# Fixture digest\n**2026-11-12**\n\n---\n\n## [Archived camera release](https://example.com/archive-camera)\n*Example* | 12/11/2026 | Score: 0.90\nTags: camera\n\nFictional archive excerpt, withheld for link-only cards.\n';
const permissionFailures = ['missing-registry', 'invalid-registry', 'missing-policy'];
const permissionMessage = 'Source permissions unavailable. News stories are withheld until the registry can be checked.';

try {
    for (const pageName of ['news.html', 'topics.html']) for (const width of [320, 390]) for (const state of ['fresh', 'empty', 'stale', 'unavailable', 'partial', 'missing-helper', 'missing-helper-unavailable', ...permissionFailures]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.route('**/*', async route => {
            const u = new URL(route.request().url());
            if (u.hostname !== 'ktp.test') return route.abort();
            if (state === 'missing-policy' && u.pathname === '/source-permissions.mjs') return route.fulfill({ status: 404, contentType: 'text/javascript', body: 'Missing policy' });
            if (u.pathname === '/launch/source-permissions.json') {
                if (state === 'missing-registry') return route.fulfill({ status: 404, body: 'Missing registry' });
                return route.fulfill({ json: state === 'invalid-registry' ? { sources: [{}] } : registry });
            }
            if (state.startsWith('missing-helper') && u.pathname === '/news-state.js') return route.fulfill({ status: 404, body: 'Missing helper' });
            if (u.pathname === '/news-digests/news-feed-latest.json') {
                if (state === 'unavailable' || state === 'missing-helper-unavailable') return route.fulfill({ status: 503, body: 'unavailable' });
                return route.fulfill({ json: { site: 'Kol Tregaskes Photography', generated: state === 'stale' ? '2026-01-01T00:00:00Z' : new Date().toISOString(), articles: (state === 'empty' || state === 'missing-helper') ? [] : state === 'partial' ? [null, article] : [article] } });
            }
            if (u.pathname === '/news-digests/index.json') return route.fulfill({ json: { files: ['digest-2026-11-12.md'] } });
            if (u.pathname === '/news-digests/digest-2026-11-12.md') return route.fulfill({ contentType: 'text/plain', body: digest });
            const file = path.resolve(root, '.' + u.pathname);
            if (!file.startsWith(root + path.sep)) return route.abort();
            try {
                await route.fulfill({ path: file, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
            } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
        });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('https://ktp.test/' + pageName);
        await page.waitForFunction(() => document.querySelector('#news-feed-status')?.dataset.state);
        const expected = permissionFailures.includes(state) ? 'unavailable' : state === 'partial' ? 'fresh' : state.startsWith('missing-helper') ? 'unknown' : state;
        assert.equal(await page.locator('#news-feed-status').getAttribute('data-state'), expected);
        assert.ok(await page.locator('#news-feed-status').textContent());
        if (state === 'partial') assert.match(await page.locator('#news-feed-status').textContent(), /1 malformed entry was skipped/);
        if (state.startsWith('missing-helper')) {
            assert.ok(await page.locator('.news-card').count());
            assert.equal(await page.locator('#news-loading').isVisible(), false);
            assert.match(await page.locator('#news-feed-status').textContent(), /unknown/i);
        }
        if (permissionFailures.includes(state)) {
            assert.equal(await page.locator('.news-card').count(), 0);
            assert.equal(await page.locator('#news-loading').isVisible(), false);
            assert.equal(await page.locator('#news-feed-status').isVisible(), true);
            assert.equal(await page.locator('#news-feed-status').textContent(), permissionMessage);
        }
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await context.close();
        count++;
    }
    console.log('News states: ' + count + ' installed Edge cases passed across both views at 320 and 390px');
} finally { await browser.close(); }
