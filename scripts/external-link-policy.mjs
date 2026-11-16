import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const redirects = new Set([301, 302, 303, 307, 308]);

export function isPublicAddress(address) {
    if (isIP(address) === 4) {
        const [a, b, c] = address.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)) || (b === 88 && c === 99))) ||
            (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) ||
            (a === 203 && b === 0 && c === 113));
    }
    // Only global-unicast IPv6; reject local, mapped IPv4, documentation and
    // transition ranges rather than letting them conceal a private destination.
    if (isIP(address) === 6) {
        const value = address.toLowerCase();
        const [first, second] = value.split(':').map(part => Number.parseInt(part, 16));
        return first >= 0x2000 && first <= 0x3fff &&
            !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) &&
            first !== 0x2002 && first !== 0x3fff;
    }
    return false;
}

function inspectUrl(value, previous) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('non-HTTP(S) destination');
    if (previous?.protocol === 'https:' && url.protocol !== 'https:') throw new Error('HTTPS downgrade');
    if (url.username || url.password) throw new Error('URL credentials');
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (isIP(host) ? !isPublicAddress(host) :
        !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)) {
        throw new Error('non-public host');
    }
    url.hash = '';
    return url;
}

// Keep PR #24's distinction between confirmed missing pages and bot/network denials.
export function classifyExternalResponse(status, original, destination = original) {
    try {
        const start = inspectUrl(original);
        const end = inspectUrl(destination, start);
        if (end.protocol !== 'https:') return 'unsafe';
    } catch {
        return 'unsafe';
    }
    if (status === 404 || status === 410) return 'broken';
    return status >= 200 && status < 300 ? 'ok' : 'unverified';
}

async function withinDeadline(operation, deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('request deadline');
    let timer;
    try {
        return await Promise.race([
            operation(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('request deadline')), remaining); })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export async function checkExternalDestination(value, {
    fetchImpl = globalThis.fetch,
    resolveHost = host => lookup(host, {all: true}),
    timeout = 15000,
    maxRedirects = 8
} = {}) {
    const deadline = Date.now() + timeout;
    const visited = new Set();
    let current;
    try { current = inspectUrl(value); }
    catch (error) { return {status: 'unsafe', reason: error.message}; }
    try {
        for (let hop = 0; ; hop++) {
            if (visited.has(current.href)) return {status: 'unsafe', reason: 'redirect loop'};
            visited.add(current.href);
            const host = current.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
            if (!isIP(host)) {
                const addresses = await withinDeadline(() => resolveHost(host), deadline);
                if (!addresses.length) return {status: 'unverified', reason: 'no DNS addresses'};
                if (addresses.some(entry => !isPublicAddress(typeof entry === 'string' ? entry : entry.address))) {
                    return {status: 'unsafe', reason: 'host resolves to non-public address'};
                }
            }
            const remaining = Math.max(1, deadline - Date.now());
            const response = await withinDeadline(() => fetchImpl(current.href, {
                redirect: 'manual', signal: AbortSignal.timeout(remaining)
            }), deadline);
            // Body cleanup must not hide a confirmed HTTP or unsafe redirect result.
            response.body?.cancel()?.catch(() => {});
            // A supplied fetch implementation must not conceal an automatic redirect.
            if (response.url && new URL(response.url).href !== current.href) {
                return {status: 'unsafe', reason: 'unexpected automatic redirect'};
            }
            if (redirects.has(response.status)) {
                const location = response.headers?.get('location');
                if (!location) return {status: 'unverified', http: response.status, reason: 'missing redirect location'};
                let next;
                try { next = inspectUrl(new URL(location, current).href, current); }
                catch (error) { return {status: 'unsafe', reason: error.message}; }
                if (hop >= maxRedirects) return {status: 'unsafe', reason: 'redirect hop limit'};
                current = next;
                continue;
            }
            const status = classifyExternalResponse(response.status, value, current.href);
            return {status: status === 'ok' ? 'reachable' : status, http: response.status};
        }
    } catch (error) {
        const timeout = Date.now() >= deadline || error?.name === 'TimeoutError' || error?.message === 'request deadline';
        return {status: 'unverified', reason: 'network, DNS or request deadline failure', ...(timeout ? {timeout: true} : {})};
    }
}
