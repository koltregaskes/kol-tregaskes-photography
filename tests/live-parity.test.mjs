import test from 'node:test';
import assert from 'node:assert/strict';
import {compareLive} from '../scripts/check-live.mjs';
import fs from 'node:fs/promises';
const file=new URL('../package.json',import.meta.url);
test('live verification detects byte drift and cannot pass a blocked destination',async()=>{
 const body=await fs.readFile(file),url='https://example.org/robots.txt';
 assert.equal((await compareLive(file,url,async()=>new Response(body))).status,'match');
 assert.equal((await compareLive(file,url,async()=>new Response('different'))).status,'mismatch');
 assert.equal((await compareLive(file,url,async()=>new Response('',{status:403}))).status,'unverified');
 assert.equal((await compareLive(file,url,async()=>{throw Error('offline')})).status,'unverified');
});
