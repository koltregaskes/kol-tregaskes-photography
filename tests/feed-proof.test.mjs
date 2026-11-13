import test from 'node:test';import assert from 'node:assert/strict';import {assessRoutedFeedFreshness} from '../scripts/check-routed-feed-freshness.mjs';
const now=new Date('2026-11-13T06:30:00Z');
test('future refresh timestamps cannot pass the daily canary',()=>assert.throws(()=>assessRoutedFeedFreshness({generated:'2026-11-14T00:00:00Z',articles:[]},now),/future/i));

import { collectFeedProof, DESTINATION } from '../scripts/check-public-feed-proof.mjs';
const payload = value => Buffer.from(JSON.stringify(value));
const feed = {generated:'2026-11-13T06:00:00Z',articles:[{date:'2026-11-13T05:50:00Z'}]};
const response = (body,status=200) => ({ok:status===200,status,url:DESTINATION,arrayBuffer:async()=>body});
test('proof requires exact public payload and keeps original source timestamp', async()=>{
 const bytes=payload(feed), result=await collectFeedProof(bytes,{now,fetchImpl:async()=>response(bytes)});
 assert.equal(result.status,'match');assert.equal(result.newestSourceAt,'2026-11-13T05:50:00.000Z');assert.equal(result.committedSha256,result.publicSha256);
});
test('stale, mismatched, redirected and unavailable feeds cannot produce proof',async()=>{
 for(const fetchImpl of [async()=>response(payload({...feed,articles:[]})),async()=>response('',404),async()=>({...response(payload(feed)),url:'http://example.com/'}),async()=>{throw Error('private diagnostic must not leak')}]) {
  const result=await collectFeedProof(payload(feed),{now,fetchImpl});assert.equal(result.status,'unverified');assert.ok(!JSON.stringify(result).includes('private diagnostic'));
 }
 let fetched=false;const stale=await collectFeedProof(payload({...feed,generated:'2026-11-10T00:00:00Z'}),{now,fetchImpl:async()=>{fetched=true}});assert.equal(stale.status,'unverified');assert.equal(fetched,false);
});
test('empty readback reports no source timestamp rather than inventing one',async()=>{
 const bytes=payload({...feed,articles:[]});const result=await collectFeedProof(bytes,{now,fetchImpl:async()=>response(bytes)});assert.equal(result.status,'match');assert.equal(result.empty,true);assert.equal(result.newestSourceAt,null);
});
