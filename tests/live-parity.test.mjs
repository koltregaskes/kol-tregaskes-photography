import test from 'node:test';
import assert from 'node:assert/strict';
import {compareLive,assertArtifactFiles} from '../scripts/check-live.mjs';
import fs from 'node:fs/promises';
const file=new URL('../package.json',import.meta.url);
test('live verification detects byte drift and cannot pass a blocked destination',async()=>{
 const body=await fs.readFile(file),url='https://example.org/robots.txt';
 assert.equal((await compareLive(file,url,async()=>new Response(body))).status,'match');
 assert.equal((await compareLive(file,url,async()=>new Response('different'))).status,'mismatch');
 assert.equal((await compareLive(file,url,async()=>new Response('',{status:403}))).status,'unverified');
 assert.equal((await compareLive(file,url,async()=>{throw Error('offline')})).status,'unverified');
});

test('empty or wrong artifact directories cannot pass',()=>{
 assert.throws(()=>assertArtifactFiles([],'.'),/Artifact/);
 assert.throws(()=>assertArtifactFiles(['package.json'],'.'),/Artifact/);
 assertArtifactFiles(['index.html'],'.');
});
test('requests finishing after the crawl deadline remain unverified',async()=>{
 let now=0,called=false;const body=await fs.readFile(file);
 const result=await compareLive(file,'https://example.org/',async()=>{called=true;now=11;return new Response(body);},{deadline:10,clock:()=>now});
 assert.equal(called,true);assert.equal(result.status,'unverified');assert.equal(result.reason,'deadline');
 called=false;await compareLive(file,'https://example.org/',async()=>{called=true;return new Response(body);},{deadline:10,clock:()=>11});assert.equal(called,false);
});
