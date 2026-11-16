import fs from 'node:fs/promises';
import {crawlExitCode} from './link-crawl-acceptance.mjs';

const fields = ['destination', 'disposition', 'evidence', 'verifiedOn', 'expiresOn'];
const dayMs = 86400000;
const denialStatuses = new Set([401, 402, 403, 429]);

export function normaliseDestination(value) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        url.hash = '';
        return url.href;
    } catch { return null; }
}

function dateValue(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export function validateDispositions(document, today = new Date().toISOString().slice(0, 10)) {
    const entries = new Map(), errors = [];
    const now = dateValue(today);
    if (!Number.isFinite(now)) return {entries, errors: [{reason: 'invalid verification clock'}]};
    if (!Array.isArray(document)) return {entries, errors: [{reason: 'disposition file must be an array'}]};
    for (const [index, entry] of document.entries()) {
        let reason;
        if (!entry || Array.isArray(entry) || typeof entry !== 'object' ||
            Object.keys(entry).length !== fields.length || fields.some(field => !Object.hasOwn(entry, field) || typeof entry[field] !== 'string')) {
            reason = 'entry must contain exactly the five required string fields';
        } else if (normaliseDestination(entry.destination) !== entry.destination) {
            reason = 'destination must be an exact normalised HTTP(S) URL without credentials or fragment';
        } else if (entry.disposition !== 'manually-verified-live' || !entry.evidence.trim()) {
            reason = 'entry needs manually-verified-live and non-empty evidence';
        } else {
            const verified = dateValue(entry.verifiedOn), expires = dateValue(entry.expiresOn);
            if (!Number.isFinite(verified) || !Number.isFinite(expires) || expires <= verified || expires - verified > 30 * dayMs) {
                reason = 'dates must be real calendar dates with an expiry within 1 to 30 days';
            } else if (verified > now) reason = 'verification date is in the future';
            else if (now >= expires) reason = 'entry expired; re-verification required';
            else if (entries.has(entry.destination)) reason = 'duplicate destination';
        }
        if (reason) errors.push({entry: index + 1, reason});
        else entries.set(entry.destination, {...entry, entry: index + 1});
    }
    // A malformed/expired list cannot authorise any acceptance exceptions.
    if (errors.length) entries.clear();
    return {entries, errors};
}

export async function loadDispositions(file = new URL('../launch/link-dispositions.json', import.meta.url)) {
    try { return {document: JSON.parse(await fs.readFile(file, 'utf8')), errors: []}; }
    catch { return {document: [], errors: [{reason: 'disposition file unavailable or invalid JSON'}]}; }
}

export function applyDispositions(report, urls, {dispositions = [], dispositionLoadErrors = [], today} = {}) {
    const {entries, errors} = validateDispositions(dispositions, today);
    errors.push(...dispositionLoadErrors);
    if (errors.length) entries.clear();
    const used = new Set(), dispositionedDestinations = [];
    for (const [index, result] of report.results.entries()) {
        const destination = typeof urls[index] === 'string' ? normaliseDestination(urls[index]) : null;
        const entry = entries.get(destination);
        // An ordinary outage, missing DNS answer, incomplete HTML or skipped
        // crawl coverage is not a bot denial or a timed-out check.
        if (!entry || result.status !== 'unverified' || !(denialStatuses.has(result.http) || result.timeout === true)) continue;
        used.add(destination);
        result.observedStatus = 'unverified';
        result.status = 'accepted-by-disposition';
        dispositionedDestinations.push({destination: result.destination, verifiedOn: entry.verifiedOn, expiresOn: entry.expiresOn,
            ...(result.http ? {http: result.http} : {timeout: true})});
    }
    for (const [destination, entry] of entries) {
        if (!used.has(destination)) errors.push({entry: entry.entry, reason: 'unused disposition: no eligible unverified result matched'});
    }
    return {...report,
        observedUnverified: report.unverified,
        unverified: report.unverified - dispositionedDestinations.length,
        acceptedByDisposition: dispositionedDestinations.length,
        dispositionedDestinations, dispositionErrors: errors};
}

export function externalCrawlExitCode(report) {
    // Reuse the merged acceptance semantics, retaining observed reachable and
    // dispositioned counts separately in the public report.
    const count = report.acceptedByDisposition ?? 0;
    const code = crawlExitCode({...report, reachable: report.reachable + count});
    if (code === 1) return 1;
    if (!Number.isSafeInteger(count) || count < 0 || report.dispositionErrors?.length) return 2;
    return code;
}
