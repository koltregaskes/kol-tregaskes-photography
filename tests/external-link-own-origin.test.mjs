import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectSite} from '../scripts/check-public-links.mjs';

const origin = 'https://koltregaskesphotography.com';
const external = '<a href="https://example.org/live">External</a>';
const moduleUrl = new URL('../scripts/check-external-links.mjs', import.meta.url).href;
function fixture(files, untracked = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ktp-own-origin-'));
    assert.equal(spawnSync('git', ['init', '--quiet', root], {encoding: 'utf8'}).status, 0);
    for (const [name, content] of Object.entries({...files, ...untracked, 'dispositions.json': '[]'})) {
        fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
        fs.writeFileSync(path.join(root, name), content);
    }
    assert.equal(spawnSync('git', ['-C', root, 'add', '--', ...Object.keys(files)], {encoding: 'utf8'}).status, 0);
    return root;
}
function run(root, responses = {}) {
    const source = `import {runCollectedExternalCheck} from ${JSON.stringify(moduleUrl)};
        const calls = [], responses = ${JSON.stringify(responses)};
        await runCollectedExternalCheck({dispositionFile: ${JSON.stringify(path.join(root, 'dispositions.json'))},
            resolveHost: async () => [{address:'93.184.216.34'}],
            fetchImpl: async url => {
                calls.push(url);
                const status = responses[url] ?? (new URL(url).origin === ${JSON.stringify(origin)} ? 404 : 200);
                return typeof status === 'string' ? new Response(null, {status:302,headers:{location:status}}) : new Response(null, {status});
            }});
        console.log(JSON.stringify({calls}));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {cwd: root, encoding: 'utf8'});
    const objects = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    return {...result, report: objects.find(value => 'destinations' in value), calls: objects.find(value => 'calls' in value)?.calls};
}

test('a tracked new page passes internal validation without fetching its not-yet-deployed canonical URL', async () => {
    const root = fixture({
        'index.html': external + '<a href="privacy.html#notice">Privacy</a>',
        'privacy.html': `<link rel="canonical" href="${origin}/privacy.html"><meta property="og:url" content="${origin}/privacy.html"><script type="application/ld+json">{"url":"${origin}/privacy.html"}</script><main id="notice">Privacy</main>`,
    });
    assert.deepEqual((await inspectSite(root)).errors, []);
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, ['https://example.org/live']);
    assert.equal(result.report.destinations, 1);
});

test('an own-origin path with no tracked file is still requested live and its 404 fails', () => {
    for (const untracked of [{}, {'not-tracked.html': '<main>Local file only</main>'}]) {
        const url = `${origin}/not-tracked.html`;
        const root = fixture({'index.html': external + `<a href="${url}">Untracked</a>`}, untracked);
        const result = run(root);
        assert.equal(result.status, 1, result.stderr);
        assert.ok(result.calls.includes(url));
        assert.equal(result.report.broken, 1);
    }
});

test('internal validation really rejects a new-page fragment or missing local resource before handoff', async () => {
    for (const bad of [external + `<a href="${origin}/privacy.html#absent">Missing fragment</a>`,
        external + '<link rel="stylesheet" href="missing.css">']) {
        const root = fixture({
            'index.html': bad,
            'privacy.html': `<link rel="canonical" href="${origin}/privacy.html"><main id="notice">Privacy</main>`,
        });
        assert.ok((await inspectSite(root)).errors.length);
        const result = run(root);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /Internal link validation failed before own-origin handoff/);
        assert.deepEqual(result.calls, []);
    }
});

test('documents excluded by the internal gate never authorise an own-origin handoff', () => {
    for (const files of [
        {'docs/index.html': external + `<a href="${origin}/privacy.html">Privacy</a>`, 'privacy.html': '<main>Privacy</main>'},
        {'index.html': external + `<a href="${origin}/docs/privacy.html">Privacy</a>`, 'docs/privacy.html': '<main>Privacy</main>'},
    ]) {
        const result = run(fixture(files));
        assert.equal(result.status, 1, result.stderr);
        assert.equal(result.report.broken, 1);
        assert.ok(result.calls.some(url => url.startsWith(origin)));
    }
});

test('query, fragment, encoded path, protocol-relative and other-origin URLs retain live checks', () => {
    for (const ref of [origin + '/privacy.html?preview=1', origin + '/privacy.html#notice', origin + '/%70rivacy.html',
        '//koltregaskesphotography.com/privacy.html', 'http://koltregaskesphotography.com/privacy.html',
        'https://www.koltregaskesphotography.com/privacy.html', 'https://koltregaskesphotography.com:444/privacy.html',
        'https://koltregaskesphotography.com.example.org/privacy.html', origin + '/asset.txt']) {
        const root = fixture({'index.html': external + `<a href="${ref}">Reference</a>`, 'privacy.html': '<main id="notice">Privacy</main>'});
        const result = run(root), expected = new URL(ref, origin);
        expected.hash = '';
        assert.ok(result.calls.includes(expected.href), `${ref}: ${result.stderr}`);
    }
});

test('URL credentials and unsafe schemes still fail alongside a handed-off page', () => {
    for (const url of [`https://synthetic@koltregaskesphotography.com/privacy.html`, 'javascript:alert(1)', 'data:text/plain,test', 'file:///local']) {
        const root = fixture({
            'index.html': external + `<a href="${origin}/privacy.html">Privacy</a><a href="${url}">Unsafe</a>`,
            'privacy.html': '<main>Privacy</main>',
        });
        const result = run(root);
        assert.equal(result.status, 1, result.stderr);
        assert.ok(!result.calls.includes(url));
    }
});

test('an own-origin reference inside srcdoc remains live even when its outer counterpart is handed off', () => {
    const url = origin + '/privacy.html';
    const root = fixture({
        'index.html': external + `<link rel="canonical" href="${url}"><iframe srcdoc="&lt;a href=&quot;${url}&quot;&gt;Inner&lt;/a&gt;"></iframe>`,
        'privacy.html': '<main>Privacy</main>',
    });
    const result = run(root);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.calls.includes(url));
    assert.equal(result.report.broken, 1);
});

test('HTML redirect pages remain live and external redirects to a new local page are still followed', () => {
    const redirectUrl = origin + '/redirect.html', destination = 'https://example.org/gone';
    let root = fixture({
        'index.html': `<a href="${redirectUrl}">Redirect</a>`,
        'redirect.html': `<meta http-equiv="refresh" content="0;url=${destination}">`,
    });
    let result = run(root, {[redirectUrl]: destination, [destination]: 404});
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(result.calls, [redirectUrl, destination]);
    assert.equal(result.report.broken, 1);

    const start = 'https://example.org/start', local = origin + '/privacy.html';
    root = fixture({'index.html': `<a href="${start}">External</a><a href="${local}">Privacy</a>`, 'privacy.html': '<main>Privacy</main>'});
    result = run(root, {[start]: local});
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(result.calls, [start, local]);
    assert.equal(result.report.broken, 1);
});

test('an unrelated HTTP 429 stays unverified after a local page handoff', () => {
    const instagram = 'https://www.instagram.com/koltregaskes';
    const root = fixture({'index.html': `<a href="${instagram}">Instagram</a><a href="${origin}/privacy.html">Privacy</a>`, 'privacy.html': '<main>Privacy</main>'});
    const result = run(root, {[instagram]: 429});
    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(result.calls, [instagram]);
    assert.equal(result.report.unverified, 1);
    assert.equal(result.report.results[0].http, 429);
});
