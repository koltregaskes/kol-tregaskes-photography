import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {checkExternalDestination} from './external-link-policy.mjs';
import {crawlExitCode} from './external-link-acceptance.mjs';

export function extractExternalUrls(html) {
    const urls = new Set();
    for (const tag of html.matchAll(/<[^>]+>/g)) {
        if (/rel=["'](?:preconnect|dns-prefetch)["']/.test(tag[0])) continue;
        for (const match of tag[0].matchAll(/\s(?:href|src)\s*=\s*["']([^"']+)/gi)) {
            const value = match[1].replaceAll('&amp;', '&').trim();
            if (value.startsWith('//')) urls.add('https:' + value);
            else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^(?:mailto|tel):/i.test(value)) urls.add(value);
        }
    }
    return [...urls];
}

export async function collectExternalUrls() {
    // Read only tracked HTML, never environment files, credentials or other text.
    const files = execFileSync('git', ['ls-files', '-z', '--', '*.html'], {encoding: 'utf8'}).split('\0').filter(Boolean);
    const urls = new Set();
    for (const file of files) for (const url of extractExternalUrls(await fs.readFile(file, 'utf8'))) urls.add(url);
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
            const result = remaining <= 0 ? {status: 'unverified', reason: 'crawl deadline'} :
                await checkExternalDestination(url, {...options, timeout: Math.min(options.timeout ?? 15000, remaining)});
            let destination = '(invalid or non-HTTP(S) URL)';
            try {
                const parsed = new URL(url);
                if (['http:', 'https:'].includes(parsed.protocol)) destination = parsed.origin + parsed.pathname;
            } catch { /* Keep malformed inputs redacted. */ }
            results[index] = {item: index + 1, destination, ...result};
        }
    }));
    return {
        destinations: queue.length, inactiveSources: 0,
        reachable: results.filter(r => r.status === 'reachable').length,
        broken: results.filter(r => r.status === 'broken').length,
        unsafe: results.filter(r => r.status === 'unsafe').length,
        unverified: results.filter(r => r.status === 'unverified').length,
        // No URL queries or response bodies in reports.
        results
    };
}

export async function runExternalCheck(urls, options) {
    const report = await crawlExternalLinks(urls, options);
    console.log(JSON.stringify(report));
    console.log('Bot denials and incomplete coverage require further verification; only exit 0 is accepted.');
    process.exitCode = crawlExitCode(report);
    return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { await runExternalCheck(await collectExternalUrls()); }
    catch { console.error('External crawl could not complete; acceptance is unverified.'); process.exitCode = 2; }
}
