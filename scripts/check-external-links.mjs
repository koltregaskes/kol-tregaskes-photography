import fs from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {checkExternalDestination} from './external-link-policy.mjs';
import {applyDispositions, externalCrawlExitCode, loadDispositions} from './link-dispositions.mjs';

const localBase = 'https://ktp-local.invalid/';
const maxSrcdocDepth = 4; // Outer document is depth 0; deeper content remains unverified.
const incomplete = () => ({status: 'unverified', reason: 'unsupported or unparseable HTML reference'});

function tokeniseHtml(html, executeHelper = spawnSync) {
    const result = executeHelper(process.platform === 'win32' ? 'python' : 'python3',
        ['-B', fileURLToPath(new URL('./external-html-references.py', import.meta.url))],
        {input: html, encoding: 'utf8', timeout: 10000, maxBuffer: 32 * 1024 * 1024, windowsHide: true});
    if (result.error || result.status !== 0) throw new Error('HTML reference helper unavailable');
    let parsed;
    try { parsed = JSON.parse(result.stdout); }
    catch { throw new Error('Invalid HTML reference helper output'); }
    if (!parsed || parsed.version !== 1 || !(parsed.base === null || typeof parsed.base === 'string') ||
        !Number.isSafeInteger(parsed.problems) || parsed.problems < 0 || !Array.isArray(parsed.references) ||
        parsed.references.some(ref => !ref || !['href', 'src', 'srcset', 'imagesrcset', 'srcdoc'].includes(ref.attribute) || typeof ref.value !== 'string')) {
        throw new Error('Invalid HTML reference helper output');
    }
    return parsed;
}

// Follow srcset URL boundaries: commas inside a URL (e.g. data:) are not
// separators. Keep every URL even when its descriptor cannot be interpreted.
function srcsetReferences(value) {
    const references = [];
    let pos = 0;
    while (pos < value.length) {
        while (/[\t\n\f\r ]/.test(value[pos] ?? '') && pos < value.length) pos++;
        if (pos === value.length) break;
        if (value[pos] === ',') { references.push(incomplete()); pos++; continue; }
        const start = pos;
        while (pos < value.length && !/[\t\n\f\r ]/.test(value[pos])) pos++;
        let url = value.slice(start, pos);
        if (url.endsWith(',')) {
            if (url.endsWith(',,')) references.push(incomplete());
            url = url.replace(/,+$/, '');
            references.push(url);
            continue;
        }
        const descriptorStart = pos;
        while (pos < value.length && value[pos] !== ',') pos++;
        const descriptor = value.slice(descriptorStart, pos).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
        references.push(url);
        if (descriptor && !/^(?:[1-9]\d*w|(?:\d+(?:\.\d+)?|\.\d+)x)$/.test(descriptor)) references.push(incomplete());
        if (pos < value.length) pos++;
    }
    return references;
}

export function extractExternalUrls(html, {executeHelper} = {}) {
    const urls = new Set();
    function collectDocument(source, inheritedBase, depth) {
        const parsed = tokeniseHtml(source, executeHelper);
        let base = inheritedBase;
        if (parsed.base !== null) {
            try { base = new URL(parsed.base, inheritedBase ?? undefined); }
            catch { base = null; urls.add(incomplete()); }
        }
        if (parsed.problems) urls.add(incomplete());
        for (const ref of parsed.references) {
            if (ref.attribute === 'srcdoc') {
                if (depth >= maxSrcdocDepth) urls.add(incomplete());
                else collectDocument(ref.value, base, depth + 1);
                continue;
            }
            const values = ['srcset', 'imagesrcset'].includes(ref.attribute) ? srcsetReferences(ref.value) : [ref.value];
            for (const value of values) {
                if (typeof value !== 'string') { urls.add(value); continue; }
                let url, absolute = false;
                try {
                    try { url = new URL(value); absolute = true; }
                    catch { if (!base) throw new Error(); url = new URL(value, base); }
                } catch { urls.add(incomplete()); continue; }
                if (ref.attribute === 'href' && ['mailto:', 'tel:'].includes(url.protocol)) continue;
                if (['http:', 'https:'].includes(url.protocol)) {
                    // Local routes/fragments stay with the separate internal-link gate.
                    if (!absolute && url.origin === new URL(localBase).origin) continue;
                    urls.add(url.href);
                } else if (['javascript:', 'data:', 'file:'].includes(url.protocol)) {
                    urls.add(url.href); // Known unsafe schemes retain the existing exit 1 policy.
                } else urls.add(incomplete());
            }
        }
    }
    collectDocument(html, new URL(localBase), 0);
    return [...urls];
}

export async function collectExternalUrls(options) {
    // Read only tracked HTML, never environment files, credentials or other text.
    const files = execFileSync('git', ['ls-files', '-z', '--', '*.html'], {encoding: 'utf8'}).split('\0').filter(Boolean);
    const urls = new Set();
    for (const file of files) for (const url of extractExternalUrls(await fs.readFile(file, 'utf8'), options)) urls.add(url);
    return [...urls];
}

export async function crawlExternalLinks(urls, options = {}) {
    const queue = [...new Set(urls)], results = [];
    const deadline = Date.now() + (options.crawlTimeout ?? 180000);
    let cursor = 0;
    await Promise.all(Array.from({length: 6}, async () => {
        while (cursor < queue.length) {
            const index = cursor++, url = queue[index];
            const remaining = deadline - Date.now();
            const result = typeof url !== 'string' ? incomplete() : remaining <= 0 ? {status: 'unverified', reason: 'crawl deadline'} :
                await checkExternalDestination(url, {...options, timeout: Math.min(options.timeout ?? 15000, remaining)});
            let destination = '(invalid or non-HTTP(S) URL)';
            try {
                const parsed = new URL(url);
                if (['http:', 'https:'].includes(parsed.protocol)) destination = parsed.origin + parsed.pathname;
            } catch { /* Keep malformed inputs redacted. */ }
            results[index] = {item: index + 1, destination, ...result};
        }
    }));
    return applyDispositions({
        destinations: queue.length, inactiveSources: 0,
        reachable: results.filter(r => r.status === 'reachable').length,
        broken: results.filter(r => r.status === 'broken').length,
        unsafe: results.filter(r => r.status === 'unsafe').length,
        unverified: results.filter(r => r.status === 'unverified').length,
        // No URL queries or response bodies in reports.
        results
    }, queue, options);
}

export async function runExternalCheck(urls, options) {
    const report = await crawlExternalLinks(urls, options);
    console.log(JSON.stringify(report));
    for (const entry of report.dispositionedDestinations) {
        console.log(`ACCEPTED BY DISPOSITION: ${entry.destination}; observed ${entry.http ? 'HTTP ' + entry.http : 'timeout'}; verified ${entry.verifiedOn}; expires ${entry.expiresOn}`);
    }
    for (const error of report.dispositionErrors) console.error(`Disposition rejected${error.entry ? ' at entry ' + error.entry : ''}: ${error.reason}`);
    console.log('Only reachable or validly dispositioned destinations accept; other unverified coverage requires further verification.');
    process.exitCode = externalCrawlExitCode(report);
    return report;
}

export async function runCollectedExternalCheck(options = {}) {
    try {
        const loaded = await loadDispositions(options.dispositionFile);
        return await runExternalCheck(await collectExternalUrls(options), {...options, dispositions: loaded.document, dispositionLoadErrors: loaded.errors});
    }
    catch { console.error('External crawl could not complete; acceptance is unverified.'); process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCollectedExternalCheck();
