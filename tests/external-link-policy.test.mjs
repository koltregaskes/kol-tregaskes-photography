import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyExternalResponse as classify} from '../scripts/external-link-policy.mjs';
const url='https://example.org/article';
test('only confirmed gone destinations fail the crawl',()=>{
 for(const status of [404,410])assert.equal(classify(status,url),'broken');
 for(const status of [401,403,429,500,502,503])assert.equal(classify(status,url),'unverified');
 assert.equal(classify(200,url),'ok');
 assert.equal(classify(200,url,'http://example.org/article'),'unverified');
});
