import {classifyExternalResponse} from './external-link-policy.mjs';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(f=>!/(^|\/)\.env(?:\.|$)/.test(f));
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{36,}/,/AKIA[0-9A-Z]{16}/,/\bsk-[A-Za-z0-9_-]{40,}\b/];
assert(patterns[0].test('-----BEGIN '+'PRIVATE KEY-----'),'Scanner self-test failed');
let findings=0;const urls=new Set();let images=0;
for(const file of files){
 if(/\.(jpg|jpeg|png|webp)$/i.test(file)){
  const m=await sharp(file).metadata();images++;
  // Reject all EXIF so GPS cannot be published, without logging metadata values.
  assert(!m.exif,`Image EXIF metadata must be stripped before publishing: ${file}`);
 }
 if(!/\.(html|js|mjs|json|yml|yaml|md|txt)$/i.test(file)||file==='package-lock.json')continue;
 const text=await fs.readFile(file,'utf8');
 if(patterns.some(p=>p.test(text)))findings++;
 if(file.endsWith('.html'))for(const tag of text.matchAll(/<[^>]+>/g)){if(/rel=["'](?:preconnect|dns-prefetch)["']/.test(tag[0]))continue;for(const m of tag[0].matchAll(/(?:href|src)=["'](https?:\/\/[^"']+)/g))urls.add(m[1].replaceAll('&amp;','&'));}
}
console.log(`Secret pattern scan: ${findings} affected files (values redacted); image metadata: ${images} files checked`);
assert.equal(findings,0,'Secret pattern findings require private investigation');
if(process.argv.includes('--external')){
 let failed=0,unverified=0;
 const list=[...urls];let cursor=0;
 await Promise.all(Array.from({length:6},async()=>{while(cursor<list.length){const url=list[cursor++];try{const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'follow'});await r.body?.cancel();const status=classifyExternalResponse(r.status,url,r.url);if(status==='broken'){failed++;console.log(`BROKEN HTTP ${r.status}: ${url}`);}else if(status==='unverified'){unverified++;console.log(`UNVERIFIED HTTP ${r.status} or redirect: ${url}`);}}catch(e){unverified++;console.log(`External link unavailable: ${url} (${e.name})`);}}}));
 console.log(`External crawl: ${list.length} destinations, ${failed} broken (404/410); ${unverified} unverified. Bot denials need manual verification.`);
 if(failed)process.exitCode=1;
}
