import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {sourceReferences,referenceContexts} from './privacy-source-references.mjs';
import {backstopHosts,validateMentions} from './privacy-backstop.mjs';
import {decodeDataURL,MAX_DOCUMENT_DEPTH} from './privacy-data-documents.mjs';

export function referencedHosts(source, {kind='url',baseURL='https://koltregaskesphotography.com/'}={}) {
    const references=sourceReferences(source,kind);
    return new Set(referenceEvidence(references,{baseURL}).hosts.keys());
}

function referenceEvidence(references,{baseURL,sweep=false},depth=0) {
    if(depth>MAX_DOCUMENT_DEPTH)throw Error('Nested document exceeds the inspection limit');
    let base;
    try {base=new URL(references.base ?? baseURL,baseURL);} catch {throw Error('Cannot parse the page base reference');}
    const hosts = new Map(), backstop = new Set(), accounted = new Set(), inert = new Set(), unaccounted = new Set();
    const merge=child=>{
        for(const [host,roles] of child.hosts){if(!hosts.has(host))hosts.set(host,new Set());for(const role of roles)hosts.get(host).add(role);}
        for(const host of child.backstop)backstop.add(host);
        for(const host of child.accounted)accounted.add(host);
        for(const host of child.inert)inert.add(host);
        for(const host of child.unaccounted)unaccounted.add(host);
    };
    if(sweep&&references.decodedText!==undefined)for(const host of backstopHosts(references.decodedText,{baseURL:base.href,decodedText:references.decodedText}))backstop.add(host);
    for (const request of references.requests) {
        const {value,role}=request;
        // WHATWG URL handles internal ASCII tabs/newlines, C0/space trimming,
        // backslashes, userinfo, ports, IDNs and relative references as a unit.
        const clean=value.replace(/[\t\n\r]/g,'').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g,'');
        try {
            const url=new URL(value,base);
            if(!url.hostname&&/^(?:https?:|[\\/]{2})/i.test(clean))throw Error('Missing hostname');
            if(url.hostname){if(!hosts.has(url.hostname))hosts.set(url.hostname,new Set());hosts.get(url.hostname).add(role);}
            if(url.protocol==='data:'){
                const document=decodeDataURL(url.href,{required:request.document});
                if(document.kind)merge(referenceEvidence(sourceReferences(document.source,document.kind),{baseURL:base.href,sweep},depth+1));
            }
        } catch {
            throw Error('Cannot parse an external URL reference in public source');
        }
    }
    for(const document of references.documents||[]){
        merge(referenceEvidence(sourceReferences(document,'html'),{baseURL:base.href,sweep},depth+1));
    }
    if(sweep)for(const context of referenceContexts(references)){
        if(context.kind==='html')continue; // Recursed above as its own document.
        const hits=backstopHosts(context.value,{baseURL:base.href,decodedText:context.decodedText});
        for(const host of hits)backstop.add(host);
        if(context.kind==='inert'){for(const host of hits)inert.add(host);continue;}
        if(context.kind==='unknown'){for(const host of hits)unaccounted.add(host);continue;}
        const primary=referenceEvidence(sourceReferences(context.value,context.kind),{baseURL:base.href},depth);
        merge(primary); // Recovered references must carry their roles into policy validation.
        for(const host of hits){
            // Matching roles are established within THIS source context, not by
            // an unrelated anchor or metadata reference elsewhere in the file.
            if(primary.hosts.has(host))accounted.add(host);
            else unaccounted.add(host);
        }
    }
    return {hosts,backstop,accounted,inert,unaccounted};
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
            const evidence=referenceEvidence(extracted,{baseURL,sweep:true});
            for(const host of backstopHosts(source,{baseURL,decodedText:extracted.decodedText}))evidence.backstop.add(host);
            for(const [host,roles] of evidence.hosts){
                if(host===own)continue;
                if(!allowed.has(host))errors.push(path.relative(root,file)+': unlisted external host '+host);
                else if(roles.has('load')&&!resourceHosts.has(host))errors.push(path.relative(root,file)+': navigation host cannot authorise a resource load '+host);
            }
            for(const host of evidence.backstop){
                const relative=path.relative(root,file).split(path.sep).join('/');
                const mention=mentions.find(entry=>entry.file===relative&&entry.host===host);
                if(evidence.unaccounted.has(host)||!evidence.accounted.has(host)&&!evidence.inert.has(host))errors.push(relative+': backstop found unaccounted active host '+host);
                else if(mention&&evidence.inert.has(host))usedMentions.add(mention);
                else if(!evidence.accounted.has(host))errors.push(relative+': backstop found unlisted host '+host);
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
