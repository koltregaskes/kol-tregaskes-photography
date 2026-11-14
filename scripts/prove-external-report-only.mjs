import assert from 'node:assert/strict';
import {checkDestination} from './check-news-links.mjs';
// No server or third-party request: deterministic HTTP 404 exercises the actual checker.
const result=await checkDestination('https://example.invalid/planted-404',async()=>new Response(null,{status:404}));
assert.equal(result.status,'broken');
assert.equal(result.http,404);
console.log('Expected negative control: planted external HTTP 404 is reported as broken.');
process.exitCode=1; // Actions must retain failure outcome but success conclusion via continue-on-error.
