import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectPrivacyHosts,referencedHosts} from '../scripts/check-privacy-hosts.mjs';
import {sourceReferences} from '../scripts/privacy-source-references.mjs';
import {backstopHosts} from '../scripts/privacy-backstop.mjs';
import {decodeDataURL} from '../scripts/privacy-data-documents.mjs';
const footer='<footer><a href="privacy.html">Privacy notice</a></footer>';
async function fixture(file,source,base='https://site.invalid/',allowed=['fonts.gstatic.com'],host){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ktp-guard-parity-'));
  await fs.writeFile(path.join(dir,'seo-config.json'),JSON.stringify({base}));
  await fs.writeFile(path.join(dir,'privacy.html'),allowed.map(h=>`<code ${h==='fonts.gstatic.com'?'data-privacy-resource ':''}data-privacy-host="${h}">${h}</code>`).join('')+footer);
  await fs.writeFile(path.join(dir,file),source+(file.endsWith('.html')?footer:''));
  if(host)await fs.writeFile(path.join(dir,'privacy-non-request-mentions.json'),JSON.stringify({version:1,mentions:[{kind:'non-request mention',file,host,reason:'Reviewed inert fixture source.'}]}));
  return dir;
}
const legacy=JSON.parse(await fs.readFile(new URL('./fixtures/privacy-review-regressions.json',import.meta.url),'utf8'));
for(const row of legacy.cases.filter(row=>row.expectedBeforeGuardParity))test('legacy inert case '+row.id+' passes with explicit reviewed mention',async()=>{
  const hosts=[...backstopHosts(row.source,{baseURL:row.base})];
  assert.equal(hosts.length,1);
  const dir=await fixture(row.file,row.source,row.base,row.allowedHosts,hosts[0]);
  assert.deepEqual((await inspectPrivacyHosts(dir)).errors,[]);
});
for(const [file,source,host] of [
  ['site.js',String.raw`const clean = value.replace(/\r/g, '');`,'g'],
  ['site.css','/* First */\n/* Second */','*'],
])test('KT lexer proves normalisation artefacts inert in '+file,async()=>{
  assert.ok(backstopHosts(source).has(host));
  assert.ok((await inspectPrivacyHosts(await fixture(file,source))).errors.length);
  assert.deepEqual((await inspectPrivacyHosts(await fixture(file,source,undefined,undefined,host))).errors,[]);
  const active=source+(file.endsWith('.js')?`\nfetch("https://${host}/x");`:`\na{background:url("https://${host}/x")}`);
  assert.ok((await inspectPrivacyHosts(await fixture(file,active,undefined,undefined,host))).errors.length);
});
test('inert comment joining cannot swallow intervening active code',async()=>{
  const source='/* https://x.com/reference */ a{background:url(https://x.com/x)} /* explanation */';
  assert.ok((await inspectPrivacyHosts(await fixture('site.css',source,undefined,['x.com'],'x.com'))).errors.length);
});
test('KT suppression metadata is a complete literal-only Set, without a host whitelist',async()=>{
  const source='const unavailable = new Set(["https://x.com/a",\n "https://x.com/b",]);';
  assert.deepEqual(sourceReferences(source,'js').requests.map(r=>r.role),['metadata','metadata']);
  assert.deepEqual((await inspectPrivacyHosts(await fixture('site.js',source,undefined,['x.com']))).errors,[]);
  assert.ok((await inspectPrivacyHosts(await fixture('site.js',source+'fetch("https://x.com/x");',undefined,['x.com'],'x.com'))).errors.length);
});
for(const source of ['const target="https://x.com/x";', 'const list=new Set([`https://x.com/x`]);',
  'const list=new Set(["https://x.com/x",unknown]);', 'fetch("https://x.com/x");',
  '<a href="https://x.com/"></a><div unknown-load="https://x.com/x"></div>'])test('metadata/navigation cannot account for active or unclassified KT tokens: '+source,async()=>{
  const file=source.startsWith('<')?'page.html':'site.js';
  assert.ok((await inspectPrivacyHosts(await fixture(file,source,undefined,['x.com'],'x.com'))).errors.length);
});
for(const source of ['<script src="data:,alert(1)"></script>', '<svg><script href="data:application/x-jscript;base64,YQ=="></script></svg>',
  '<link rel="stylesheet" href="da&#9;ta:,body{}">', '<link rel="stylesheet" href="data:application/octet-stream,body{}">'])test('KT data boundaries reject payloads independently of a decoded external host: '+source.slice(0,45),()=>{
  assert.throws(()=>referencedHosts(source,{kind:'html'}));
});
for(const type of ['text/css',' TEXT/CSS ','text/x-javascript','application/x-ecmascript','text/jscript','text/livescript','text/javascript1.5'])test('KT decoder rejects normalised CSS/JS type '+type,()=>{
  assert.throws(()=>decodeDataURL(`data:${type};base64,YQ==`));
});
test('KT retains document bounds, charset and loading reference contracts',()=>{
  const refs=sourceReferences('<iframe src="/frame.html"></iframe><img src="/image.png">','html');
  assert.deepEqual(refs.values,['/frame.html','/image.png']);
  assert.deepEqual(refs.resourceValues,['/frame.html','/image.png']);
  assert.deepEqual(refs.documentURLs,['/frame.html']);
  assert.throws(()=>decodeDataURL('data:application/xml,%3Cx/%3E',{required:true}));
  assert.equal(decodeDataURL('data:image/svg+xml;utf8,%3Csvg/%3E').source,'<svg/>');
});
