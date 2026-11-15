import test from 'node:test';
import assert from 'node:assert/strict';
import {crawlExitCode} from '../scripts/link-crawl-acceptance.mjs';
import {checkDestination} from '../scripts/check-news-links.mjs';
import fs from 'node:fs';
import vm from 'node:vm';

const report = changes => ({destinations:2,inactiveSources:0,reachable:2,broken:0,unsafe:0,unverified:0,...changes});
test('only a nonempty, fully reachable crawl is acceptance', () => {
    assert.equal(crawlExitCode(report()),0);
    for (const changes of [{reachable:0,unverified:2},{reachable:1,unverified:1},{reachable:1},{destinations:0,reachable:0},{reachable:1,inactiveSources:1},{unverified:undefined},{reachable:3},{reachable:-1}]) {
        assert.equal(crawlExitCode(report(changes)),2);
    }
});
test('confirmed failures take priority over incomplete coverage', () => {
    for (const changes of [{broken:1,unverified:1},{unsafe:1,unverified:1}]) assert.equal(crawlExitCode(report(changes)),1);
});
test('bot denials and outages stay unverified; confirmed 404/410 fail', async () => {
    for (const status of [401,403,429,500,404,410,200]) {
        const r=await checkDestination('https://example.invalid/',async()=>new Response(null,{status}));
        assert.equal(r.status,[404,410].includes(status)?'broken':status===200?'reachable':'unverified');
    }
    assert.equal((await checkDestination('https://example.invalid/',async()=>{throw Error('offline');})).status,'unverified');
});
test('an insecure initial URL and unsafe intermediate redirect fail without following', async () => {
    let calls=0;
    const fetcher=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://example.invalid/next'}});};
    assert.equal((await checkDestination('http://example.invalid/',fetcher)).status,'unsafe');
    assert.equal(calls,0);
    assert.equal((await checkDestination('https://example.invalid/',fetcher)).status,'unsafe');
    assert.equal(calls,1);
});
test('redirect loops and exhausted request deadlines cannot pass', async () => {
    assert.equal((await checkDestination('https://example.invalid/',async()=>new Response(null,{status:302,headers:{location:'/'}}))).status,'unsafe');
    assert.equal((await checkDestination('https://example.invalid/',async()=>{throw Error('must not fetch');},0)).status,'unverified');
});
test('the CLI sets the real process exit code for acceptance, failure and unverified coverage', async () => {
    const source=fs.readFileSync(new URL('../scripts/check-news-links.mjs',import.meta.url),'utf8');
    const cli=source.slice(source.lastIndexOf('if(process.argv[1]')).replaceAll('import.meta.url','moduleUrl');
    for (const changes of [{},{reachable:0,unverified:2},{reachable:1},{broken:1}]) {
        const context={moduleUrl:'file:///checker.mjs',process:{argv:['node','checker.mjs']},pathToFileURL:()=>({href:'file:///checker.mjs'}),crawlNewsLinks:async()=>report(changes),crawlExitCode,console:{error(){}}};
        await vm.runInNewContext('(async()=>{'+cli+'})()',context);
        assert.equal(context.process.exitCode,crawlExitCode(report(changes)));
    }
});
