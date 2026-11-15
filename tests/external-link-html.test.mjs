import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {crawlExternalLinks, extractExternalUrls} from '../scripts/check-external-links.mjs';
import {crawlExitCode} from '../scripts/link-crawl-acceptance.mjs';

const safe = '<a href="https://example.org/safe">Safe</a>';
const options = {resolveHost: async () => [{address: '93.184.216.34'}], fetchImpl: async () => new Response(null, {status: 200})};
const reproductions = [
    ['review: unquoted href', '<a href=https://127.0.0.1/private>Unsafe</a>'],
    ['review: encoded colon', '<a href="https&#58;//127.0.0.1/private">Unsafe</a>'],
    ['review: anchor preconnect', '<a rel="preconnect" href="https://127.0.0.1/private">Unsafe</a>'],
    ['single-quoted entity', "<a href='https&colon;//127.0.0.1/private'>Unsafe</a>"],
    ['uppercase unquoted attribute', '<A HREF=HTTPS://127.0.0.1/private>Unsafe</A>'],
    ['duplicate attributes retain unsafe second value', '<a href="https://example.org/safe" href=https://127.0.0.1/private>Unsafe</a>'],
    ['named tab inside scheme', '<a href="ht&Tab;tps://127.0.0.1/private">Unsafe</a>'],
    ['srcset candidates', '<img srcset="https://example.org/photo 1x, https://127.0.0.1/private 2x">']
];

for (const [label, html] of reproductions) {
    test(`${label}: unsafe destination cannot disappear from coverage`, async () => {
        const report = await crawlExternalLinks(extractExternalUrls(safe + html), options);
        assert.ok(report.destinations >= 2, 'omitted destination');
        assert.equal(report.unsafe, 1);
        assert.equal(crawlExitCode(report), 1);
    });
}

test('review reproductions work through tracked-HTML collection and actual process exit', () => {
    // Retain fixtures in the OS temporary directory; no deletion is needed.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ktp-html-r2-'));
    assert.equal(spawnSync('git', ['init', '--quiet', root], {encoding: 'utf8'}).status, 0);
    const moduleUrl = new URL('../scripts/check-external-links.mjs', import.meta.url).href;
    for (const [, html] of reproductions.slice(0, 3)) {
        fs.writeFileSync(path.join(root, 'index.html'), safe + html);
        assert.equal(spawnSync('git', ['-C', root, 'add', 'index.html'], {encoding: 'utf8'}).status, 0);
        const source = `import {collectExternalUrls,runExternalCheck} from ${JSON.stringify(moduleUrl)};
            await runExternalCheck(await collectExternalUrls(), {
                resolveHost: async () => [{address:'93.184.216.34'}],
                fetchImpl: async () => new Response(null,{status:200})
            });`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {cwd: root, encoding: 'utf8'});
        assert.equal(result.status, 1, result.stderr);
        const report = JSON.parse(result.stdout.split('\n')[0]);
        assert.equal(report.destinations, 2);
        assert.equal(report.unsafe, 1);
    }
});

test('all character references decode once after quoted attribute boundaries', async () => {
    for (const value of ['https&colon;&sol;&sol;127.0.0.1/private', 'https&#x3a;//127.0.0.1/private',
        'https&#58//127.0.0.1/private', 'https://127&NewLine;.0.0.1/private']) {
        const report = await crawlExternalLinks(extractExternalUrls(safe + `<a href='${value}'>Unsafe</a>`), options);
        assert.equal(report.unsafe, 1);
        assert.equal(crawlExitCode(report), 1);
    }
    assert.deepEqual(extractExternalUrls('<a href="https://example.org/?x=&quot;&y=&NotEqualTilde;&z=&amp;colon;">Link</a>'),
        [new URL('https://example.org/?x="&y=\u2242\u0338&z=&colon;').href]);
    assert.deepEqual(extractExternalUrls('<a href="https://example.org/?x=&notit;&y=&amp=foo">Link</a>'),
        ['https://example.org/?x=&notit;&y=&amp=foo']);
});

test('only actual link resource hints are excluded, using decoded whitespace-separated rel tokens', async () => {
    const hints = `<link rel='PRECONNECT' href=https://127.0.0.1/one>
        <link rel="dns-prefetch" href="https://127.0.0.1/two">
        <link rel="preload" href="https://127.0.0.1/three">
        <link rel="preconnect&Tab;dns-prefetch" href="https://127.0.0.1/four">`;
    assert.deepEqual(extractExternalUrls(safe + hints), ['https://example.org/safe']);
    for (const html of ['<a rel=preload href=https://127.0.0.1/private>Unsafe</a>',
        '<img rel=preconnect src=https://127.0.0.1/private>',
        '<link rel="stylesheet preconnect" href=https://127.0.0.1/private>',
        '<link rel=preload href=https://example.org/ignored src=https://127.0.0.1/private>']) {
        const report = await crawlExternalLinks(extractExternalUrls(safe + html), options);
        assert.equal(report.unsafe, 1);
    }
});

test('tag-like strings in comments, scripts or unrelated attributes are not references', () => {
    assert.deepEqual(extractExternalUrls(`${safe}<!-- <a href=https://127.0.0.1/> -->
        <script>const text = '<a href=https://127.0.0.1/>';</script>
        <a title="a > b and href='https://127.0.0.1/'" href="https://example.org/other">Link</a>`),
    ['https://example.org/safe', 'https://example.org/other']);
});

test('base URLs and WHATWG backslash handling cannot conceal external destinations', async () => {
    for (const html of ['<base href="https://127.0.0.1/"><a href=private>Unsafe</a>',
        '<img src="\\\\127.0.0.1/private">']) {
        const report = await crawlExternalLinks(extractExternalUrls(safe + html), options);
        assert.ok(report.unsafe > 0);
        assert.equal(crawlExitCode(report), 1);
    }
});

test('srcset handles single quotes, uppercase, encoded URLs, width descriptors and data URL commas', async () => {
    for (const html of ["<IMG SRCSET='https://example.org/safe 200w, https&colon;//127.0.0.1/private 400w'>",
        '<source srcset="https://example.org/safe 1x, data:image/png;base64,AAAA 2x">',
        '<link rel=preload imagesrcset="https://example.org/safe 1x, https://127.0.0.1/private 2x">']) {
        const report = await crawlExternalLinks(extractExternalUrls(safe + html), options);
        assert.equal(report.unsafe, 1);
        assert.equal(crawlExitCode(report), 1);
    }
    assert.deepEqual(extractExternalUrls('<img srcset="https://example.org/a,b 1x, https://example.org/c 2x">'),
        ['https://example.org/a,b', 'https://example.org/c']);
});

for (const [label, html] of [
    ['unparseable URL', '<a href="https://[invalid">Unknown</a>'],
    ['unsupported scheme', '<a href="custom:destination">Unknown</a>'],
    ['unparseable src', '<img src="http://[invalid">'],
    ['unsupported srcset descriptor', '<img srcset="https://example.org/photo wrong">'],
    ['empty srcset candidate', '<img srcset=", https://example.org/photo 2x">'],
    ['incomplete tag', '<a href="https://127.0.0.1/private'],
    ['invalid base', '<base href="https://[invalid"><a href=relative>Unknown</a>']
]) {
    test(`${label} is counted as incomplete alongside reachable coverage`, async () => {
        const report = await crawlExternalLinks(extractExternalUrls(safe + html), options);
        assert.ok(report.destinations >= 2);
        assert.ok(report.unverified > 0);
        assert.equal(crawlExitCode(report), 2);
    });
}

test('duplicate URL attributes are retained in either order without double-decoding', () => {
    assert.deepEqual(extractExternalUrls('<a HREF=https://127.0.0.1/private href="https://example.org/safe">Link</a>'),
        ['https://127.0.0.1/private', 'https://example.org/safe']);
    assert.deepEqual(extractExternalUrls('<a href="https&amp;colon;//127.0.0.1/private">Local literal</a>'), []);
});

const malformedHelpers = [
    ['missing executable', {status: null, error: new Error('ENOENT')}],
    ['helper failure', {status: 1, stdout: ''}],
    ['empty output', {status: 0, stdout: ''}],
    ['invalid JSON', {status: 0, stdout: 'not JSON'}],
    ['missing fields', {status: 0, stdout: '{}'}],
    ['wrong version', {status: 0, stdout: JSON.stringify({version: 2, base: null, problems: 0, references: []})}],
    ['invalid reference', {status: 0, stdout: JSON.stringify({version: 1, base: null, problems: 0, references: [{attribute: 'href', value: 42}]})}],
    ['invalid problem count', {status: 0, stdout: JSON.stringify({version: 1, base: null, problems: -1, references: []})}]
];
for (const [label, result] of malformedHelpers) {
    test(`${label}: extraction fails closed`, () => {
        assert.throws(() => extractExternalUrls(safe, {executeHelper: () => result}), /helper/);
    });
}

test('collection entry point exits 2 for unavailable or malformed helper output before fetching', () => {
    const moduleUrl = new URL('../scripts/check-external-links.mjs', import.meta.url).href;
    for (const helper of ["() => ({status: null, error: new Error('ENOENT')})", "() => ({status: 0, stdout: '{}'})"]) {
        const source = `import {runCollectedExternalCheck} from ${JSON.stringify(moduleUrl)};
            await runCollectedExternalCheck({executeHelper: ${helper},
                fetchImpl: () => {throw new Error('unexpected fetch');}});`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
        assert.equal(result.status, 2, result.stderr);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /could not complete; acceptance is unverified/);
        assert.doesNotMatch(result.stderr, /unexpected fetch/);
    }
});
