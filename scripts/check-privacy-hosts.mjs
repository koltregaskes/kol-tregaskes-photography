import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {sourceReferences} from './privacy-source-references.mjs';
import {backstopHosts,validateMentions} from './privacy-backstop.mjs';
import {decodeDataURL,MAX_DOCUMENT_DEPTH} from './privacy-data-documents.mjs';

export function referencedHosts(source, {kind='url',baseURL='https://koltregaskesphotography.com/'}={}) {
    const references=sourceReferences(source,kind);
    return structuredReferenceHosts(references,{baseURL});
}

function structuredReferenceHosts(references,{baseURL},depth=0,resources=new Set()) {
    if(depth>MAX_DOCUMENT_DEPTH)throw Error('Nested HTML exceeds the inspection limit');
    let base;
    try {base=new URL(references.base ?? baseURL,baseURL);} catch {throw Error('Cannot parse the page base reference');}
    const hosts = new Set();
    for (const value of references.values) {
        // WHATWG URL handles internal ASCII tabs/newlines, C0/space trimming,
        // backslashes, userinfo, ports, IDNs and relative references as a unit.
        const clean=value.replace(/[\t\n\r]/g,'').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g,'');
        try {
            const url=new URL(value,base);
            if(!url.hostname&&/^(?:https?:|[\\/]{2})/i.test(clean))throw Error('Missing hostname');
            if(url.hostname){hosts.add(url.hostname);if(references.resourceValues?.includes(value))resources.add(url.hostname);}
        } catch {
            throw Error('Cannot parse an external URL reference in public source');
        }
    }
    for(const value of references.documentURLs||[]){
        const url=new URL(value,base);
        if(url.protocol!=='data:')continue;
        const embedded=decodeDataURL(url.href);
        if(embedded.kind)for(const host of structuredReferenceHosts(sourceReferences(embedded.source,embedded.kind),{baseURL:base.href},depth+1,resources))hosts.add(host);
    }
    for(const document of references.documents||[]){
        for(const host of structuredReferenceHosts(sourceReferences(document,'html'),{baseURL:base.href},depth+1,resources))hosts.add(host);
    }
    return hosts;
}

export async function inspectPrivacyHosts(root) {
    const privacy = await fs.readFile(path.join(root, 'privacy.html'), 'utf8');
    const allowed = new Set([...privacy.matchAll(/<code\b[^>]*data-privacy-host="([a-z0-9.-]+)"[^>]*>\s*\1\s*<\/code>/g)].map(m => m[1]));
    if (!allowed.size) throw Error('Privacy notice must visibly list its external hosts');
    const resourceHosts=new Set([...privacy.matchAll(/<code\b(?=[^>]*\bdata-privacy-resource(?:\s|=|>))[^>]*data-privacy-host="([a-z0-9.-]+)"[^>]*>\s*\1\s*<\/code>/g)].map(match=>match[1]));
    const siteBase = new URL(JSON.parse(await fs.readFile(path.join(root, 'seo-config.json'), 'utf8')).base);
    const own = siteBase.hostname;
    const files = [], errors = [];
    let mentions=[];
    try {mentions=validateMentions(JSON.parse(await fs.readFile(path.join(root,'privacy-non-request-mentions.json'),'utf8')));}catch(error){if(error.code!=='ENOENT')throw Error('Cannot validate non-request mention allowlist');}
    const usedMentions=new Set();
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
        try {
            const kind=path.extname(file).slice(1).toLowerCase();
            const baseURL=new URL(path.relative(root,file).split(path.sep).map(encodeURIComponent).join('/'),siteBase).href;
            const extracted=sourceReferences(source,kind);
            const resources=new Set();
            const structured=structuredReferenceHosts(extracted,{baseURL},0,resources);
            for (const host of structured) {
                if (host !== own && !allowed.has(host)) errors.push(path.relative(root,file)+': unlisted external host '+host);
            }
            for(const host of resources)if(host!==own&&!resourceHosts.has(host))errors.push(path.relative(root,file)+': navigation host cannot authorise a resource load '+host);
            for(const host of backstopHosts(source,{baseURL,decodedText:extracted.decodedText})){
                if(host===own||allowed.has(host))continue;
                const relative=path.relative(root,file).split(path.sep).join('/');
                const mention=mentions.find(entry=>entry.file===relative&&entry.host===host);
                if(mention&&!structured.has(host))usedMentions.add(mention);
                else if(!structured.has(host))errors.push(relative+': backstop found unlisted host '+host);
            }
        } catch {errors.push(path.relative(root,file)+': cannot parse complete public references');}
        if (file.endsWith('.html') && !/<footer\b[\s\S]*?<a\b[^>]*href="privacy\.html"[^>]*>Privacy notice<\/a>[\s\S]*?<\/footer>/i.test(source)) errors.push(path.relative(root,file)+': missing privacy footer link');
    }
    for(const mention of mentions)if(!usedMentions.has(mention))errors.push(mention.file+': unused or active non-request mention entry');
    return {files:files.length, hosts:allowed.size, errors};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
        const result = await inspectPrivacyHosts(root);
        console.log('Privacy host check: '+result.files+' public HTML/CSS/JS files, '+result.hosts+' listed hosts, '+result.errors.length+' failures');
        if (result.errors.length) {console.error(result.errors.join('\n'));process.exitCode=1;}
    } catch {
        console.error('Privacy host check failed: cannot inspect public references');
        process.exitCode=1;
    }
}
