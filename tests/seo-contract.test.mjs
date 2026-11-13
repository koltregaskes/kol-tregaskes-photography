import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd();const python=process.env.PYTHON || (process.platform==='win32'?'python':'python3');
function fixture(){const dir=fs.mkdtempSync(path.join(root,'.local/seo-'));for(const name of fs.readdirSync(root)){if(name.startsWith('.')||['node_modules','design','docs','scripts','tests'].includes(name))continue;const p=path.join(root,name);if(fs.statSync(p).isFile())fs.copyFileSync(p,path.join(dir,name));}fs.mkdirSync(path.join(dir,'scripts'));fs.copyFileSync('scripts/seo.mjs',path.join(dir,'scripts/seo.mjs'));fs.mkdirSync(path.join(dir,'news-digests')); fs.copyFileSync('news-digests/index.json',path.join(dir,'news-digests/index.json'));return dir;}
function check(dir){return spawnSync(process.execPath,[path.join(dir,'scripts/seo.mjs'),'--check'],{cwd:dir,encoding:'utf8',env:{...process.env,KTP_SEO_ROOT:dir}});}
// The generator is rooted beside itself until this regression is fixed; the
// stronger verifier accepts an explicit public output root without generating it.
function verify(dir){if(!fs.existsSync('scripts/check-seo-contract.py'))return check(dir);return spawnSync(python,['scripts/check-seo-contract.py',dir],{cwd:root,encoding:'utf8'});}
fs.mkdirSync('.local',{recursive:true});
test('real public output passes strict SEO contract',()=>{const r=verify(root);assert.equal(r.status,0,r.stderr+r.stdout);});
for(const [name,mutate] of [
 ['missing sitemap route',dir=>{const p=path.join(dir,'sitemap.xml');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/<url>[\s\S]*?<\/url>/,''));}],
 ['corrupt PNG pixels',dir=>{const p=path.join(dir,'social-preview.png');const b=fs.readFileSync(p);b[45]^=255;fs.writeFileSync(p,b);}],
 ['duplicate JSON-LD graph',dir=>{const p=path.join(dir,'index.html');let s=fs.readFileSync(p,'utf8');s=s.replace('</head>',s.match(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/)[0]+'</head>');fs.writeFileSync(p,s);}],
 ['broken llms destination',dir=>fs.appendFileSync(path.join(dir,'llms.txt'),'\n- [Missing](/missing-route.html)\n')]
])test('SEO rejects '+name,()=>{const dir=fixture();mutate(dir);const r=verify(dir);assert.notEqual(r.status,0,'gate accepted '+name);});
