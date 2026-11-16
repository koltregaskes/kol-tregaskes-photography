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
const entry = (changes = {}) => ({destination: url, finalDestination: changes.destination ?? url, disposition: 'manually-verified-live',
    evidence: 'Checked by a reviewer in a real browser: the intended page and content are live.',
    verifiedOn: '2026-11-16', expiresOn: '2026-12-16', ...changes});
const options = (status = 403, changes = {}) => ({today, dispositions: [entry()], minimumDestinationBudget: 1,
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
    const report = await crawlExternalLinks([url], options(403, {timeout: 100, fetchImpl: () => {
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

test('seeded production entry point requests every URL and reports the three dispositions separately', () => {
    const moduleUrl = new URL('../scripts/check-external-links.mjs', import.meta.url).href;
    const source = `import assert from 'node:assert/strict';
        import {runCollectedExternalCheck} from ${JSON.stringify(moduleUrl)};
        const blocked=new Set(['https://www.redbubble.com/people/koltregaskes','https://x.com/koltregaskespho','https://www.instagram.com/koltregaskes']);
        const requested=[];
        const report=await runCollectedExternalCheck({today:'2026-11-16',
            resolveHost:async()=>[{address:'93.184.216.34'}],
            fetchImpl:async url=>{requested.push(url);
                return new Response(null,{status:url==='https://www.instagram.com/koltregaskes'?429:blocked.has(url)?403:200});}});
        assert.ok(report.destinations>=3);assert.equal(report.reachable,report.destinations-3);
        assert.equal(report.acceptedByDisposition,3);assert.equal(report.observedUnverified,3);
        assert.equal(report.unverified,0);assert.equal(requested.length,report.destinations);
        for(const url of blocked)assert.ok(requested.includes(url));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout.split('\n')[0]);
    assert.equal(report.dispositionedDestinations.length, 3);
    assert.equal(result.stdout.match(/ACCEPTED BY DISPOSITION:/g)?.length, 3);
});

test('hanging DNS with zero fetches is never dispositionable', async () => {
    let fetches = 0;
    const report = await crawlExternalLinks([url], options(403, {timeout: 15, minimumDestinationBudget: 1,
        resolveHost: () => new Promise(() => {}), fetchImpl: async () => {fetches++; return new Response(null, {status: 403});}}));
    assert.equal(fetches, 0);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a zero per-destination budget is skipped without a fetch or disposition', async () => {
    let fetches = 0;
    const report = await crawlExternalLinks([url], options(403, {timeout: 0,
        fetchImpl: async () => {fetches++; return new Response(null, {status: 403});}}));
    assert.equal(fetches, 0);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(report.results[0].skipped, true);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a late queued destination cannot inherit less than the guaranteed budget', async () => {
    const urls = [...Array.from({length: 6}, (_, i) => `https://example.org/first-${i}`), url];
    let clock = 0, fetches = 0, lateFetches = 0;
    const report = await crawlExternalLinks(urls, options(403, {
        crawlNow: () => clock, minimumDestinationBudget: 10000,
        fetchImpl: async value => {
            if (value === url) {lateFetches++; throw new DOMException('Timed out', 'TimeoutError');}
            if (++fetches === 6) clock = 175000; // Only five seconds of the 180-second crawl remain.
            return new Response(null, {status: 200});
        }
    }));
    assert.equal(report.reachable, 6);
    assert.equal(lateFetches, 0);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(report.results[6].skipped, true);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a final URL changed by a same-host redirect cannot use starting-URL evidence', async () => {
    const report = await crawlExternalLinks([url], options(403, {fetchImpl: async value => value === url ?
        new Response(null, {status: 301, headers: {location: '/parked'}}) : new Response(null, {status: 403})}));
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a redirect to a parked domain denial cannot be dispositioned', async () => {
    let calls = 0;
    const report = await crawlExternalLinks([url], options(403, {fetchImpl: async () => {
        if (++calls === 1) return new Response(null, {status: 301, headers: {location: 'https://parked-domain.example/parking'}});
        return new Response(null, {status: 403});
    }}));
    assert.equal(calls, 2);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a redirect followed by hanging DNS cannot reuse the previous hop fetch', async () => {
    let lookups = 0, fetches = 0;
    const finalDestination = 'https://example.org/final';
    const report = await crawlExternalLinks([url], options(403, {timeout: 100,
        dispositions: [entry({finalDestination})],
        resolveHost: () => ++lookups === 1 ? Promise.resolve([{address: '93.184.216.34'}]) : new Promise(() => {}),
        fetchImpl: async () => {fetches++; return new Response(null, {status: 301, headers: {location: finalDestination}});}
    }));
    assert.equal(fetches, 1);
    assert.equal(report.results[0].finalFetchSent, false);
    assert.notEqual(report.results[0].timeout, true);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a sent final-hop fetch timeout can use matching final-destination evidence', async () => {
    let fetches = 0;
    const finalDestination = 'https://example.org/final';
    const report = await crawlExternalLinks([url], options(403, {timeout: 100,
        dispositions: [entry({finalDestination})], fetchImpl: value => {
            fetches++;
            return value === url ? Promise.resolve(new Response(null, {status: 301, headers: {location: finalDestination}})) : new Promise(() => {});
        }
    }));
    assert.equal(fetches, 2);
    assert.equal(report.results[0].finalFetchSent, true);
    assert.equal(report.results[0].timeout, true);
    assert.equal(report.acceptedByDisposition, 1);
    assert.equal(externalCrawlExitCode(report), 0);
});

test('a matching same-host final URL is accepted with full-URL matching and redacted reporting', async () => {
    for (const finalDestination of ['https://example.org/final', 'https://example.org/final?private=synthetic']) {
        const report = await crawlExternalLinks([url], options(403, {dispositions: [entry({finalDestination})],
            fetchImpl: async value => value === url ? new Response(null, {status: 301, headers: {location: finalDestination}}) : new Response(null, {status: 403})
        }));
        assert.equal(report.acceptedByDisposition, 1);
        assert.equal(report.dispositionedDestinations[0].finalDestination, 'https://example.org/final');
        assert.doesNotMatch(JSON.stringify(report), /synthetic/);
        assert.equal(externalCrawlExitCode(report), 0);
    }
});

test('even a declared parked final URL cannot authorise leaving the starting host', async () => {
    const finalDestination = 'https://parked-domain.example/parking';
    const report = await crawlExternalLinks([url], options(403, {dispositions: [entry({finalDestination})],
        fetchImpl: async value => value === url ? new Response(null, {status: 301, headers: {location: finalDestination}}) : new Response(null, {status: 403})
    }));
    assert.equal(report.results[0].finalDestination, finalDestination);
    assert.equal(report.results[0].stayedOnStartingHost, false);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('a chain that leaves the starting host and later returns remains ineligible', async () => {
    const finalDestination = 'https://example.org/final';
    let fetches = 0;
    const report = await crawlExternalLinks([url], options(403, {dispositions: [entry({finalDestination})], fetchImpl: async () => {
        if (++fetches === 1) return new Response(null, {status: 301, headers: {location: 'https://parked-domain.example/parking'}});
        if (fetches === 2) return new Response(null, {status: 301, headers: {location: finalDestination}});
        return new Response(null, {status: 403});
    }}));
    assert.equal(fetches, 3);
    assert.equal(report.results[0].finalFetchSent, true);
    assert.equal(report.results[0].stayedOnStartingHost, false);
    assert.equal(report.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});

test('hostname changes fail closed across multi-label suffixes, tenant domains and subdomains', async () => {
    for (const [destination, finalDestination] of [
        ['https://a.co.uk/', 'https://b.co.uk/'],
        ['https://tenant-a.github.io/', 'https://tenant-b.github.io/'],
        ['https://www.example.org/', 'https://shop.example.org/']
    ]) {
        const report = await crawlExternalLinks([destination], options(403, {dispositions: [entry({destination, finalDestination})],
            fetchImpl: async value => value === destination ? new Response(null, {status: 301, headers: {location: finalDestination}}) : new Response(null, {status: 403})
        }));
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(report.results[0].stayedOnStartingHost, false);
        assert.equal(externalCrawlExitCode(report), 2);
    }
});

test('finalDestination is required and must be an exact normalised string URL', async () => {
    const missing = entry(); delete missing.finalDestination;
    for (const disposition of [missing, entry({finalDestination: 123}), entry({finalDestination: 'https://EXAMPLE.org/final'}),
        entry({finalDestination: 'https://[invalid'}), entry({finalDestination: url + '#fragment'})]) {
        const report = await crawlExternalLinks([url], options(403, {dispositions: [disposition]}));
        assert.ok(report.dispositionErrors.length);
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), 2);
    }
});

const instagram = 'https://www.instagram.com/koltregaskes';
const login = 'https://www.instagram.com/accounts/login/';
const instagramEntry = (changes = {}) => entry({destination: instagram, ...changes});
const instagramOptions = (changes = {}) => options(429, {dispositions: [instagramEntry()], ...changes});

for (const query of ['', '?next=%2Fkoltregaskes%2F', '?next=synthetic&changed=2']) {
    for (const http of [200, 401, 402, 403, 429]) {
        test(`Instagram one-hop login wall ${http} accepts with query ${query}`, async () => {
            const calls = [];
            const report = await crawlExternalLinks([instagram], instagramOptions({fetchImpl: async value => {
                calls.push(value);
                return value === instagram ? new Response(null, {status: 302, headers: {location: login + query}}) : new Response(null, {status: http});
            }}));
            assert.deepEqual(calls, [instagram, login + query]);
            assert.equal(externalCrawlExitCode(report), 0);
            assert.equal(report.reachable, 0);
            assert.equal(report.observedUnverified, 1);
            assert.equal(report.acceptedByDisposition, 1);
            assert.equal(report.dispositionedDestinations[0].reason, 'bot login wall');
            assert.equal(report.dispositionedDestinations[0].finalDestination, login);
            assert.doesNotMatch(JSON.stringify(report), /synthetic|changed=|next=/);
        });
    }
}

test('Instagram direct 429 accepts only the exact profile with a current entry', async () => {
    const report = await crawlExternalLinks([instagram], instagramOptions());
    assert.equal(externalCrawlExitCode(report), 0);
    assert.equal(report.dispositionedDestinations[0].reason, 'bot rate limit');
    for (const destination of ['https://example.org/other', 'https://www.instagram.com/another',
        instagram + '/', instagram + '?other=1', 'https://instagram.com.evil.example/koltregaskes']) {
        const denied = await crawlExternalLinks([destination], instagramOptions());
        assert.equal(denied.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(denied), 2);
    }
});

test('Instagram exception rejects other origins, paths, schemes and extra hops', async () => {
    for (const target of ['https://example.org/accounts/login/', 'https://instagram.com.evil.example/accounts/login/',
        'https://www.instagram.com.evil.example/accounts/login/', 'https://www.instagram.com:444/accounts/login/',
        'https://www.instagram.com/accounts/login', 'https://www.instagram.com/accounts/login/other',
        'https://www.instagram.com/other', 'http://www.instagram.com/accounts/login/',
        'javascript:alert(1)', 'data:text/plain,test', 'file:///accounts/login/',
        'https://synthetic@www.instagram.com/accounts/login/']) {
        const report = await crawlExternalLinks([instagram], instagramOptions({fetchImpl: async value =>
            value === instagram ? new Response(null, {status: 302, headers: {location: target}}) : new Response(null, {status: 403})}));
        assert.equal(report.acceptedByDisposition, 0, target);
        assert.notEqual(externalCrawlExitCode(report), 0, target);
    }
    for (const middle of ['https://www.instagram.com/intermediate', 'https://example.org/intermediate']) {
        const report = await crawlExternalLinks([instagram], instagramOptions({fetchImpl: async value =>
            new Response(null, value === login ? {status: 403} : {status: 302, headers: {location: value === instagram ? middle : login}})}));
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), 2);
    }
});

test('Instagram login exception requires the exact allowlisted profile and valid evidence', async () => {
    for (const [destination, dispositions, date] of [
        [instagram, [], today], [instagram, [instagramEntry()], '2026-12-16'],
        ['https://www.instagram.com/another', [instagramEntry()], today],
        ['https://www.instagram.com/another', [entry({destination: 'https://www.instagram.com/another', finalDestination: login})], today]
    ]) {
        const report = await crawlExternalLinks([destination], instagramOptions({today: date, dispositions,
            fetchImpl: async value => value === destination ? new Response(null, {status: 302, headers: {location: login + '?next=synthetic'}}) : new Response(null, {status: 403})}));
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), 2);
    }
    const expired429 = await crawlExternalLinks([instagram], instagramOptions({today: '2026-12-16'}));
    assert.equal(expired429.acceptedByDisposition, 0);
    assert.equal(externalCrawlExitCode(expired429), 2);
});

test('Instagram login 404/410, server errors and missing evidence never pass', async () => {
    for (const http of [404, 410, 500]) {
        const report = await crawlExternalLinks([instagram], instagramOptions({fetchImpl: async value =>
            value === instagram ? new Response(null, {status: 302, headers: {location: login}}) : new Response(null, {status: http})}));
        assert.equal(report.acceptedByDisposition, 0);
        assert.equal(externalCrawlExitCode(report), http === 500 ? 2 : 1);
    }
    const report = await crawlExternalLinks([instagram], instagramOptions({dispositions: [], fetchImpl: async value =>
        value === instagram ? new Response(null, {status: 302, headers: {location: login}}) : new Response(null, {status: 200})}));
    assert.equal(report.reachable, 0);
    assert.equal(externalCrawlExitCode(report), 2);
});
