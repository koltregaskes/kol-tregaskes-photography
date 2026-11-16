import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {crawlExternalLinks} from '../scripts/check-external-links.mjs';
import {externalCrawlExitCode, loadDispositions, validateDispositions} from '../scripts/link-dispositions.mjs';

const url = 'https://example.org/checked';
const today = '2026-11-16';
const entry = (changes = {}) => ({destination: url, disposition: 'manually-verified-live',
    evidence: 'Checked by a reviewer in a real browser: the intended page and content are live.',
    verifiedOn: '2026-11-16', expiresOn: '2026-12-16', ...changes});
const options = (status = 403, changes = {}) => ({today, dispositions: [entry()],
    resolveHost: async () => [{address: '93.184.216.34'}],
    fetchImpl: async () => new Response(null, {status}), ...changes});

for (const http of [401, 402, 403, 429]) {
    test(`a dispositioned HTTP ${http} is requested and accepted separately`, async () => {
        const requested = [];
        const report = await crawlExternalLinks([url], options(http, {fetchImpl: async value => {
            requested.push(value); return new Response(null, {status: http});
        }}));
        assert.deepEqual(requested, [url]);
        assert.equal(report.reachable, 0);
        assert.equal(report.observedUnverified, 1);
        assert.equal(report.unverified, 0);
        assert.equal(report.acceptedByDisposition, 1);
        assert.equal(report.results[0].status, 'accepted-by-disposition');
        assert.equal(report.results[0].observedStatus, 'unverified');
        assert.equal(report.results[0].http, http);
        assert.equal(report.dispositionedDestinations[0].destination, url);
        assert.equal(externalCrawlExitCode(report), 0);
    });
}

test('a timed-out attempted request can use a disposition', async () => {
    let requests = 0;
    const report = await crawlExternalLinks([url], options(403, {timeout: 10, fetchImpl: () => {
        requests++; return new Promise(() => {});
    }}));
    assert.equal(requests, 1);
    assert.equal(report.acceptedByDisposition, 1);
    assert.equal(report.results[0].timeout, true);
    assert.equal(externalCrawlExitCode(report), 0);
});

test('a disposition expires at the start of expiresOn, including the exact boundary', async () => {
    for (const date of ['2026-12-16', '2026-12-17']) {
        const report = await crawlExternalLinks([url], options(403, {today: date}));
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(report.unverified, 1);
        assert.match(report.dispositionErrors[0].reason, /expired/);
        assert.equal(externalCrawlExitCode(report), 2);
    }
});

for (const http of [404, 410]) {
    test(`HTTP ${http} cannot be dispositioned`, async () => {
        const report = await crawlExternalLinks([url], options(http));
        assert.equal(report.broken, 1);
        assert.equal(report.acceptedByDisposition, 0);
        assert.ok(report.dispositionErrors.length);
        assert.equal(externalCrawlExitCode(report), 1);
    });
}

test('an unsafe destination cannot be dispositioned or fetched', async () => {
    const unsafe = 'https://127.0.0.1/private';
    const report = await crawlExternalLinks([unsafe], options(403, {
        dispositions: [entry({destination: unsafe})], fetchImpl: () => assert.fail('unsafe destination fetched')
    }));
    assert.equal(report.unsafe, 1);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 1);
});

test('a disposition cannot mask an unsafe redirect after a safe initial URL', async () => {
    const report = await crawlExternalLinks([url], options(403, {
        fetchImpl: async () => new Response(null, {status: 302, headers: {location: 'http://example.org/down'} })
    }));
    assert.equal(report.unsafe, 1);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 1);
});

test('a now-reachable destination makes its entry unused and fails acceptance', async () => {
    const report = await crawlExternalLinks([url], options(200));
    assert.equal(report.reachable, 1);
    assert.equal(report.acceptedByDisposition, 0);
    assert.match(report.dispositionErrors[0].reason, /unused/);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('mismatched paths, hosts, trailing slashes and query strings never match', async () => {
    for (const other of [url + '/other', url + '/', url + '?different=1', 'https://other.example.org/checked']) {
        const report = await crawlExternalLinks([other], options());
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(report.unverified, 1);
        assert.match(report.dispositionErrors[0].reason, /unused/);
        assert.equal(externalCrawlExitCode(report), 2);
    }
});

test('malformed entries fail closed, including exact fields, normalisation and real dates', async () => {
    const missing = entry(); delete missing.evidence;
    for (const document of [{}, [missing], [entry({extra: 'not allowed'})], [entry({evidence: ' '})],
        [entry({disposition: 'ignore'})], [entry({destination: 'https://EXAMPLE.org/checked'})],
        [entry({destination: url + '#fragment'})], [entry({verifiedOn: '2026-02-30'})],
        [entry({expiresOn: '2026-12-17'})], [entry({verifiedOn: '2026-11-17'})],
        [entry({expiresOn: today})], [entry({expiresOn: 123})], [entry(), entry()]]) {
        const report = await crawlExternalLinks([url], options(403, {dispositions: document}));
        assert.equal(report.acceptedByDisposition, 0);
        assert.ok(report.dispositionErrors.length);
        assert.equal(externalCrawlExitCode(report), 2);
    }
    assert.equal(validateDispositions([entry()], today).errors.length, 0);
});

for (const http of [302, 500, 503]) {
    test(`unverified HTTP ${http} is not a dispositionable bot denial`, async () => {
        const report = await crawlExternalLinks([url], options(http));
        assert.equal(report.unverified, 1);
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), 2);
    });
}

test('an ordinary network error, skipped crawl or incomplete HTML cannot use evidence', async () => {
    for (const changes of [{fetchImpl: () => {throw new TypeError('offline');}}, {crawlTimeout: 0}]) {
        const report = await crawlExternalLinks([url], options(403, changes));
        assert.equal(report.unverified, 1);
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), 2);
    }
    const report = await crawlExternalLinks([{status: 'unverified'}], options());
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('an invalid entry also prevents other otherwise valid dispositions accepting', async () => {
    const report = await crawlExternalLinks([url], options(403, {dispositions: [entry(), entry({destination: 'invalid'})]}));
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('missing and invalid-JSON disposition files fail after requests are attempted', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ktp-dispositions-r4-'));
    const invalid = path.join(root, 'invalid.json');
    await fs.writeFile(invalid, 'not JSON');
    for (const file of [path.join(root, 'missing.json'), invalid]) {
        const loaded = await loadDispositions(file);
        let requests = 0;
        const report = await crawlExternalLinks([url], options(403, {
            dispositions: loaded.document, dispositionLoadErrors: loaded.errors,
            fetchImpl: async () => {requests++; return new Response(null, {status: 403});}
        }));
        assert.equal(requests, 1);
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), 2);
    }
});

test('matching uses complete normalised URLs while reports redact queries', async () => {
    const destination = url + '?private=synthetic';
    const report = await crawlExternalLinks([destination], options(403, {dispositions: [entry({destination})]}));
    assert.equal(externalCrawlExitCode(report), 0);
    assert.equal(report.dispositionedDestinations[0].destination, url);
    assert.doesNotMatch(JSON.stringify(report), /synthetic/);
    const mismatch = await crawlExternalLinks([url], options(403, {dispositions: [entry({destination})]}));
    assert.equal(externalCrawlExitCode(mismatch), 2);
});

test('seeded production entry point requests every URL and reports the two dispositions separately', () => {
    const moduleUrl = new URL('../scripts/check-external-links.mjs', import.meta.url).href;
    const source = `import assert from 'node:assert/strict';
        import {runCollectedExternalCheck} from ${JSON.stringify(moduleUrl)};
        const blocked=new Set(['https://www.redbubble.com/people/koltregaskes','https://x.com/koltregaskespho']);
        const requested=[];
        const report=await runCollectedExternalCheck({today:'2026-11-16',
            resolveHost:async()=>[{address:'93.184.216.34'}],
            fetchImpl:async url=>{requested.push(url);return new Response(null,{status:blocked.has(url)?403:200});}});
        assert.ok(report.destinations>=2);assert.equal(report.reachable,report.destinations-2);
        assert.equal(report.acceptedByDisposition,2);assert.equal(report.observedUnverified,2);
        assert.equal(report.unverified,0);assert.equal(requested.length,report.destinations);
        for(const url of blocked)assert.ok(requested.includes(url));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout.split('\n')[0]);
    assert.equal(report.dispositionedDestinations.length, 2);
    assert.equal(result.stdout.match(/ACCEPTED BY DISPOSITION:/g)?.length, 2);
});
