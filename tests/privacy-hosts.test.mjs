import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {referencedHosts,inspectPrivacyHosts} from '../scripts/check-privacy-hosts.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
async function fixture(file, source) {
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ktp-privacy-'));
    await fs.writeFile(path.join(dir,'seo-config.json'),'{"base":"https://site.invalid/"}');
    await fs.writeFile(path.join(dir,'privacy.html'),'<code data-privacy-host="fonts.gstatic.com">fonts.gstatic.com</code><footer><a href="privacy.html">Privacy notice</a></footer>');
    await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});
    await fs.writeFile(path.join(dir,file),source);
    return dir;
}
test('the real public files and every footer match the notice',async()=>assert.deepEqual((await inspectPrivacyHosts(root)).errors,[]));
for(const [file,source] of [
    ['page.html','<script src="https://surprise.invalid/code.js"></script><footer><a href="privacy.html">Privacy notice</a></footer>'],
    ['assets/site.css','@import "//surprise.invalid/fonts.css";'],
    ['assets/site.js','fetch("https:\\/\\/surprise.invalid/collect")'],
    ['assets/nested/site.css','a{background:url(https://surprise.invalid/a.png)}'],
])test('an undeclared host fails in '+file,async()=>assert.ok((await inspectPrivacyHosts(await fixture(file,source))).errors.some(e=>e.includes('surprise.invalid'))));
test('declared fonts and same-origin references pass',async()=>{
    assert.deepEqual((await inspectPrivacyHosts(await fixture('site.css','@import url(https://fonts.gstatic.com/font.css);a{background:url(https://site.invalid/local.png)}'))).errors,[]);
});
test('numeric HTML entities cannot conceal a new external host',()=>assert.ok(referencedHosts('https:&#47;&#47;surprise.invalid/a').has('surprise.invalid')));
test('a public HTML page missing its footer privacy link fails',async()=>assert.ok((await inspectPrivacyHosts(await fixture('page.html','<main>Missing link</main>'))).errors.some(e=>e.includes('footer'))));
