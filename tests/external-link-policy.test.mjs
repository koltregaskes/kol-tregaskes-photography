import test from 'node:test';
import assert from 'node:assert/strict';
import {checkExternalDestination, classifyExternalResponse, isPublicAddress} from '../scripts/external-link-policy.mjs';

const start = 'https://example.org/article';
const publicDns = async () => [{address: '93.184.216.34'}];
function mockOptions(handler, overrides = {}) {
    return {
        resolveHost: publicDns,
        fetchImpl: async (url, options) => {
            assert.equal(options.redirect, 'manual');
            assert.ok(options.signal instanceof AbortSignal);
            return handler(url, options);
        },
        ...overrides
    };
}
const redirect = location => new Response(null, {status: 302, headers: {location}});

for (const [http, expected] of [[200, 'reachable'], [204, 'reachable'], [404, 'broken'], [410, 'broken'],
    [401, 'unverified'], [403, 'unverified'], [429, 'unverified'], [500, 'unverified'], [503, 'unverified']]) {
    test(`HTTP ${http} is ${expected}`, async () => {
        const result = await checkExternalDestination(start, mockOptions(() => new Response(null, {status: http})));
        assert.deepEqual(result, {status: expected, http});
    });
}

test('PR #24 policy keeps bot denial distinct and makes downgrade unsafe even with a 404', () => {
    assert.equal(classifyExternalResponse(404, start), 'broken');
    assert.equal(classifyExternalResponse(403, start), 'unverified');
    assert.equal(classifyExternalResponse(200, start), 'ok');
    assert.equal(classifyExternalResponse(404, start, 'http://example.org/gone'), 'unsafe');
});

test('a timeout is unverified and bounded even when a fetch implementation stalls', async () => {
    const result = await checkExternalDestination(start, mockOptions(() => new Promise(() => {}), {timeout: 10}));
    assert.equal(result.status, 'unverified');
    assert.match(result.reason, /deadline/);
});

test('DNS timeout is unverified before any fetch', async () => {
    const result = await checkExternalDestination(start, mockOptions(() => assert.fail('must not fetch'), {
        timeout: 10, resolveHost: () => new Promise(() => {})
    }));
    assert.equal(result.status, 'unverified');
});

test('network failure is unverified', async () => {
    const result = await checkExternalDestination(start, mockOptions(() => { throw new TypeError('offline'); }));
    assert.equal(result.status, 'unverified');
});

test('initial HTTP may upgrade to HTTPS', async () => {
    const seen = [];
    const result = await checkExternalDestination('http://example.org/article', mockOptions(url => {
        seen.push(url);
        return seen.length === 1 ? redirect(start) : new Response(null, {status: 200});
    }));
    assert.equal(result.status, 'reachable');
    assert.deepEqual(seen, ['http://example.org/article', start]);
});

test('an initial HTTP destination that never upgrades is unsafe', async () => {
    const result = await checkExternalDestination('http://example.org/article', mockOptions(() => new Response(null, {status: 200})));
    assert.equal(result.status, 'unsafe');
});

for (const downgradeHop of [1, 2]) {
    test(`HTTPS downgrade at redirect hop ${downgradeHop} is rejected before fetching HTTP`, async () => {
        let calls = 0;
        const result = await checkExternalDestination(start, mockOptions(() => {
            calls++;
            return redirect(calls === downgradeHop ? 'http://example.org/final' : '/middle');
        }));
        assert.equal(calls, downgradeHop);
        assert.deepEqual(result, {status: 'unsafe', reason: 'HTTPS downgrade'});
    });
}

test('relative HTTPS redirects are reachable', async () => {
    let calls = 0;
    const result = await checkExternalDestination(start, mockOptions(url => {
        if (++calls === 1) return redirect('/final');
        assert.equal(url, 'https://example.org/final');
        return new Response(null, {status: 200});
    }));
    assert.equal(result.status, 'reachable');
});

test('a redirect loop is unsafe, including fragment-only self redirects', async () => {
    for (const location of [start, '#fragment']) {
        let calls = 0;
        const result = await checkExternalDestination(start, mockOptions(() => { calls++; return redirect(location); }));
        assert.equal(result.status, 'unsafe');
        assert.equal(result.reason, 'redirect loop');
        assert.equal(calls, 1);
    }
});

test('eight redirects are allowed and a ninth is unsafe', async () => {
    for (const redirects of [8, 9]) {
        let calls = 0;
        const result = await checkExternalDestination(start, mockOptions(() => {
            calls++;
            return calls <= redirects ? redirect(`/hop-${calls}`) : new Response(null, {status: 200});
        }));
        assert.equal(result.status, redirects === 8 ? 'reachable' : 'unsafe');
        assert.equal(calls, 9);
    }
});

for (const target of ['https://127.0.0.1/', 'https://10.2.3.4/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/',
    'https://localhost/', 'https://service.local/', 'javascript:alert(1)', 'data:text/plain,hello', 'file:///local']) {
    test(`unsafe start and redirect target ${target} are never fetched`, async () => {
        const initial = await checkExternalDestination(target, mockOptions(() => assert.fail('unsafe start fetched')));
        assert.equal(initial.status, 'unsafe');
        let calls = 0;
        const redirected = await checkExternalDestination(start, mockOptions(() => { calls++; return redirect(target); }));
        assert.equal(redirected.status, 'unsafe');
        assert.equal(calls, 1);
    });
}

test('private DNS answers are blocked initially and at a new redirect host', async () => {
    for (const answers of [[{address: '10.0.0.7'}], [{address: '93.184.216.34'}, {address: '127.0.0.1'}]]) {
        let calls = 0;
        const options = mockOptions(() => { calls++; return redirect('https://private.example.org/'); }, {
            resolveHost: async host => host === 'example.org' ? await publicDns() : answers
        });
        const result = await checkExternalDestination(start, options);
        assert.equal(result.status, 'unsafe');
        assert.equal(calls, 1);
        calls = 0;
        assert.equal((await checkExternalDestination('https://private.example.org/', options)).status, 'unsafe');
        assert.equal(calls, 0);
    }
});

test('IPv4 alternative notation and local IPv6 are blocked', async () => {
    for (const host of ['2130706433', '0x7f000001', '127.1', '[fc00::1]', '[fe80::1]']) {
        assert.equal((await checkExternalDestination(`https://${host}/`, mockOptions(() => assert.fail('private address fetched')))).status, 'unsafe');
    }
    assert.equal(isPublicAddress('93.184.216.34'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('missing redirect location remains unverified', async () => {
    const result = await checkExternalDestination(start, mockOptions(() => new Response(null, {status: 302})));
    assert.equal(result.status, 'unverified');
});

test('a fetch that concealed redirects cannot be accepted', async () => {
    const result = await checkExternalDestination(start, mockOptions(() => ({status: 200, url: 'https://example.org/final'})));
    assert.equal(result.status, 'unsafe');
});
