import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {backstopHosts} from '../scripts/privacy-backstop.mjs';
import {decodeDataURL} from '../scripts/privacy-data-documents.mjs';
import {sourceReferences} from '../scripts/privacy-source-references.mjs';
import {referencedHosts,inspectPrivacyHosts} from '../scripts/check-privacy-hosts.mjs';

const attr=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');
const encodeAll=text=>[...Buffer.from(text)].map(byte=>'%'+byte.toString(16).padStart(2,'0')).join('');
const encodings={percent:encodeURIComponent,base64:text=>Buffer.from(text).toString('base64'),fullyPercent:encodeAll};
const media={html:['text/html','<img src="https://evil.invalid/a">'],svg:['image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/a"/></svg>']};
const tags={iframe:url=>`<iframe src="${attr(url)}"></iframe>`,object:url=>`<object data="${attr(url)}"></object>`,embed:url=>`<embed src="${attr(url)}">`};
const dataURL=(type,body,encoding)=>`data:${type}${encoding==='base64'?';base64':''},${encodings[encoding](body)}`;
const footer='<footer><a href="privacy.html">Privacy notice</a></footer>';
function structured(source){return referencedHosts(source,{kind:'html',baseURL:'https://site.invalid/'});}
async function fixture(source){
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'kt-privacy-r6-'));
    await fs.writeFile(path.join(directory,'seo-config.json'),JSON.stringify({base:'https://site.invalid/'}));
    await fs.writeFile(path.join(directory,'privacy.html'),'<code data-privacy-resource data-privacy-host="fonts.gstatic.com">fonts.gstatic.com</code><code data-privacy-host="x.com">x.com</code><code data-privacy-host="www.w3.org">www.w3.org</code>'+footer);
    await fs.writeFile(path.join(directory,'page.html'),source+footer);
    return directory;
}
async function rejected(source){return (await inspectPrivacyHosts(await fixture(source))).errors.length>0;}
async function rejectedWithMention(source){
    const directory=await fixture(source);
    await fs.writeFile(path.join(directory,'privacy-non-request-mentions.json'),JSON.stringify({version:1,mentions:[{kind:'non-request mention',file:'page.html',host:'evil.invalid',reason:'Reviewed inert comment.'}]}));
    return (await inspectPrivacyHosts(directory)).errors.length>0;
}


for(const [tag,render] of Object.entries(tags))for(const [type,[mime,body]] of Object.entries(media))for(const encoding of Object.keys(encodings))test(`${tag} inspects ${type} data document using ${encoding}`,async()=>{
    const source=render(dataURL(mime,body,encoding));
    assert.ok(structured(source).has('evil.invalid'),'structured extraction must see the embedded active host');
    assert.ok(backstopHosts(source).has('evil.invalid'),'backstop must see decoded text independently');
    assert.ok(await rejected(source),'the complete guard must reject the active reference');
});

for(const prefix of ['x_','%22'])test('scheme boundary after '+prefix,()=>assert.ok(backstopHosts(prefix+'https://evil.invalid/a').has('evil.invalid')));
test('the exact reported iframe payload is rejected',async()=>{
    const source='<iframe src="data:text/html,%3Cimg%20src=%22https://evil.invalid/a%22%3E"></iframe>';
    assert.ok(structured(source).has('evil.invalid'));assert.ok(backstopHosts(source).has('evil.invalid'));assert.ok(await rejected(source));
});
test('percent-encoded base64 document bytes are inspected',async()=>{
    const source=tags.object('data:text/html;base64,'+encodeAll(Buffer.from(media.html[1]).toString('base64')));
    assert.ok(structured(source).has('evil.invalid'));assert.ok(await rejected(source));
});
test('the shared extraction API preserves the new loading reference kinds',()=>assert.deepEqual(sourceReferences('<svg><image href="https://x.com/a"/></svg>','html').values,['https://x.com/a']));
test('base64 sweep covers data URLs outside a recognised request attribute',()=>{
    const source='<!-- '+dataURL('text/plain','x_https://evil.invalid/a','base64')+' -->';
    assert.ok(backstopHosts(source).has('evil.invalid'));
});
test('decoded data text receives entity and script escape normalisation',()=>{
    for(const body of ['<img src="https&colon;&sol;&sol;evil.invalid/a">',String.raw`<script>fetch("https:\u002f\u002fevil.invalid/a")</script>`]){
        const source=tags.iframe(dataURL('text/html',body,'base64'));
        assert.ok(backstopHosts(source).has('evil.invalid'));assert.ok(structured(source).has('evil.invalid'));
    }
});
test('nested data documents are decoded recursively',async()=>{
    const inner=tags.embed(dataURL(...media.svg,'base64'));
    const source=tags.iframe(dataURL('text/html',inner,'base64'));
    assert.ok(structured(source).has('evil.invalid'));assert.ok(await rejected(source));
});
for(const [name,source] of [
    ['SVG href','<svg><image href="https://x.com/a"/></svg>'],
    ['SVG xlink href','<svg><image xlink:href="https://x.com/a"/></svg>'],
    ['ping','<a href="/" ping="https://x.com/a">Link</a>'],
    ...['apple-touch-icon','icon','modulepreload','preload','prefetch','manifest','APPLE-TOUCH-ICON','alternate ICON'].map(rel=>['link '+rel,`<link rel="${rel}" href="https://x.com/a">`]),
])test('navigation permission cannot authorise '+name,async()=>assert.ok(await rejected(source)));
test('ordinary reviewed navigation remains valid',async()=>assert.equal(await rejected('<a href="https://x.com/a">Link</a>'),false));
for(const [type,[mime,body]] of Object.entries(media))for(const encoding of Object.keys(encodings))test('reviewed resource inside '+type+' '+encoding+' remains valid',async()=>{
    const source=tags.iframe(dataURL(mime,body.replace('evil.invalid','fonts.gstatic.com'),encoding));
    assert.equal(await rejected(source),false);
});
for(const url of ['data:text/html','data:text/html,%GG','data:text/html,%ff','data:text/html;base64,@@@','data:text/html;base64,Y','data:text/html;base64,YQ===','data:image/svg+xml;charset=iso-8859-1,%ff'])test('undecodable data document fails closed '+url.slice(0,40),async()=>{
    assert.throws(()=>decodeDataURL(url));
    assert.ok(await rejected(tags.iframe(url)));
});
test('depth cap rejects deeply nested data documents',async()=>{
    let source='<p>Local only</p>';
    for(let depth=0;depth<34;depth++)source=tags.iframe(dataURL('text/html',source,'base64'));
    assert.ok(await rejected(source));
});
test('data fragment is not mistaken for document bytes',()=>assert.equal(decodeDataURL('data:text/html,%3Cp%3Eok%3C/p%3E#ignored').source,'<p>ok</p>'));
test('existing SVG utf8 labels and explicit HTML UTF-8 remain supported',()=>{
    assert.equal(decodeDataURL('data:image/svg+xml;utf8,%3Csvg/%3E').source,'<svg/>');
    assert.equal(decodeDataURL('data:text/html;charset=utf-8,%3Cp%3E%C3%A9%3C/p%3E').source,'<p>é</p>');
});
test('ambiguous non-ASCII and NUL document encodings fail closed',()=>{
    for(const value of ['data:text/html,%c3%a9','data:text/html;charset=us-ascii,%c3%a9','data:image/svg+xml,%00','data:image/svg+xml,%3C%3Fxml%20encoding=%22utf-16%22%3F%3E'])assert.throws(()=>decodeDataURL(value));
});
test('a data document cannot inherit a non-request mention exception',async()=>{
    const source=tags.iframe(dataURL('text/html',media.html[1],'base64'));
    assert.ok(await rejectedWithMention(source));
});
