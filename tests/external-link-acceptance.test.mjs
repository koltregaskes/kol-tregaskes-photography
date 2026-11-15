import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {crawlExternalLinks, extractExternalUrls} from '../scripts/check-external-links.mjs';
import {crawlExitCode} from '../scripts/external-link-acceptance.mjs';

const reachable = {destinations: 1, inactiveSources: 0, reachable: 1, broken: 0, unsafe: 0, unverified: 0};
const options = status => ({resolveHost: async () => [{address: '93.184.216.34'}], fetchImpl: async () => new Response(null, {status})});

test('only non-empty, fully reachable coverage accepts; reuse the PR #39 exit table', () => {
    assert.equal(crawlExitCode(reachable), 0);
    for (const report of [
        {...reachable, destinations: 0, reachable: 0},
        {...reachable, reachable: 0},
        {...reachable, destinations: 2},
        {...reachable, reachable: 0, unverified: 1},
        {...reachable, inactiveSources: 1},
        {...reachable, destinations: undefined},
        {...reachable, destinations: -1}
    ]) assert.equal(crawlExitCode(report), 2);
    assert.equal(crawlExitCode({...reachable, broken: 1, unverified: 1}), 1);
    assert.equal(crawlExitCode({...reachable, unsafe: 1, unverified: 1}), 1);
});

test('empty crawl is not accepted and performs no network work', async () => {
    const report = await crawlExternalLinks([], {fetchImpl: () => assert.fail('must not fetch')});
    assert.equal(report.destinations, 0);
    assert.equal(crawlExitCode(report), 2);
});

test('all bot-denied coverage and mixed reachable/unverified coverage remain unaccepted', async () => {
    const report = await crawlExternalLinks(['https://example.org/one', 'https://example.org/two'], options(403));
    assert.equal(report.unverified, 2);
    assert.equal(report.reachable, 0);
    assert.equal(crawlExitCode(report), 2);
    const mixed = await crawlExternalLinks(['https://example.org/one', 'https://example.org/two'], {
        ...options(200), fetchImpl: async url => new Response(null, {status: url.endsWith('/one') ? 200 : 403})
    });
    assert.equal(mixed.reachable, 1);
    assert.equal(mixed.unverified, 1);
    assert.equal(crawlExitCode(mixed), 2);
});

test('crawl deadline accounts for every queued destination as unverified', async () => {
    const report = await crawlExternalLinks(['https://example.org/one', 'https://example.org/two'], {
        crawlTimeout: 0, fetchImpl: () => assert.fail('must not fetch')
    });
    assert.equal(report.destinations, 2);
    assert.equal(report.unverified, 2);
    assert.equal(crawlExitCode(report), 2);
});

test('a planted 404 is reported per destination and forces failure alongside bot denials', async () => {
    const report = await crawlExternalLinks(['https://example.org/gone?hidden=query', 'https://example.org/denied'], {
        ...options(200), fetchImpl: async url => new Response(null, {status: url.includes('/gone') ? 404 : 403})
    });
    assert.equal(report.broken, 1);
    assert.equal(report.unverified, 1);
    assert.equal(crawlExitCode(report), 1);
    assert.deepEqual(report.results[0], {item: 1, destination: 'https://example.org/gone', status: 'broken', http: 404});
    assert.ok(!JSON.stringify(report).includes('hidden=query'));
});

test('HTML extraction keeps public links, resources and unsafe schemes; skips local/mail/preconnect links', () => {
    assert.deepEqual(extractExternalUrls(`<a href="https://example.org/?a=1&amp;b=2">Link</a>
        <a href="https://example.org/?a=1&amp;b=2">Duplicate</a>
        <img src="//images.example.org/photo.jpg"><a href="javascript:alert(1)">Unsafe</a>
        <a href="data:text/plain,test">Unsafe</a><a href="mailto:hello@example.org">Mail</a>
        <a href="/about.html">Local</a><a href="#top">Fragment</a>
        <link rel="preconnect" href="https://fonts.example.org">`),
    ['https://example.org/?a=1&b=2', 'https://images.example.org/photo.jpg', 'javascript:alert(1)', 'data:text/plain,test']);
});

for (const [label, urls, status, exit] of [
    ['reachable', ['https://example.org/'], 200, 0],
    ['planted 404', ['https://example.org/'], 404, 1],
    ['unsafe', ['https://127.0.0.1/'], 200, 1],
    ['bot denial', ['https://example.org/'], 403, 2],
    ['empty', [], 200, 2]
]) {
    test(`the acceptance entry point exits ${exit} for ${label}`, () => {
        // Child process exercises the actual process exit, with DNS/fetch mocked.
        const moduleUrl = new URL('../scripts/check-external-links.mjs', import.meta.url).href;
        const source = `import {runExternalCheck} from ${JSON.stringify(moduleUrl)};
            await runExternalCheck(${JSON.stringify(urls)}, {
                resolveHost: async () => [{address: '93.184.216.34'}],
                fetchImpl: async () => new Response(null, {status: ${status}})
            });`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
        assert.equal(result.status, exit, result.stderr);
        assert.equal(JSON.parse(result.stdout.split('\n')[0]).destinations, urls.length);
    });
}
