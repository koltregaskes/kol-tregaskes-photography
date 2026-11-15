import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export function referencedHosts(source) {
    // Include plain, protocol-relative and slash-escaped URLs, including CSS imports.
    const text = source.replaceAll('\\/', '/').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
    const hosts = new Set();
    // Bound candidates at source delimiters, then let URL split the authority at
    // /, ?, # and : while handling userinfo, ports and Unicode/punycode hosts.
    // The relative form must not start inside a scheme or a JS URL-pattern regex.
    const candidates = text.matchAll(/(?:\bhttps?:\/\/|(?<![\w:/])\/\/)[^\s"'`),<>\\;]+/gi);
    for (const [candidate] of candidates) {
        try {
            const url = new URL(candidate.startsWith('//') ? 'https:' + candidate : candidate);
            if (!url.hostname) throw Error('Missing hostname');
            hosts.add(url.hostname);
        } catch {
            // A malformed reference must not turn an incomplete scan into a pass.
            throw Error('Cannot parse an external URL reference in public source');
        }
    }
    return hosts;
}

export async function inspectPrivacyHosts(root) {
    const privacy = await fs.readFile(path.join(root, 'privacy.html'), 'utf8');
    const allowed = new Set([...privacy.matchAll(/<code\b[^>]*data-privacy-host="([a-z0-9.-]+)"[^>]*>\s*\1\s*<\/code>/g)].map(m => m[1]));
    if (!allowed.size) throw Error('Privacy notice must visibly list its external hosts');
    const own = new URL(JSON.parse(await fs.readFile(path.join(root, 'seo-config.json'), 'utf8')).base).hostname;
    const files = [], errors = [];
    async function walk(dir) {
        for (const item of await fs.readdir(dir, {withFileTypes:true})) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;
            const file = path.join(dir, item.name);
            if (item.isSymbolicLink()) throw Error('Unexpected symlink in public output');
            if (item.isDirectory()) await walk(file);
            else if (/\.(html|css|js)$/i.test(item.name)) files.push(file);
        }
    }
    await walk(root);
    for (const file of files) {
        const source = await fs.readFile(file, 'utf8');
        for (const host of referencedHosts(source)) {
            if (host !== own && !allowed.has(host)) errors.push(path.relative(root,file)+': unlisted external host '+host);
        }
        if (file.endsWith('.html') && !/<footer\b[\s\S]*?<a\b[^>]*href="privacy\.html"[^>]*>Privacy notice<\/a>[\s\S]*?<\/footer>/i.test(source)) errors.push(path.relative(root,file)+': missing privacy footer link');
    }
    return {files:files.length, hosts:allowed.size, errors};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const result = await inspectPrivacyHosts(root);
    console.log('Privacy host check: '+result.files+' public HTML/CSS/JS files, '+result.hosts+' listed hosts, '+result.errors.length+' failures');
    if (result.errors.length) {console.error(result.errors.join('\n'));process.exitCode=1;}
}
