import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function submit(overrides={}){
 const fields={'#contact-name':{value:'Test Reader'},'#contact-reply':{value:'reader@example.invalid'},'#contact-subject':{value:'Archive question'},'#contact-message':{value:'A test draft only'},'#contact-company':{value:''},'#contact-human-confirm':{checked:true},...overrides};let handler;
 const status={dataset:{}},location={};const form={querySelector:id=>fields[id],addEventListener:(_,fn)=>{handler=fn}};
 const document={getElementById:id=>id==='contact-form'?form:id==='contact-form-status'?status:null,addEventListener:()=>{}};
 const context={document,window:{location},console,encodeURIComponent};vm.createContext(context);vm.runInContext(fs.readFileSync('site.js','utf8')+'\ninitContactForm();',context);handler({preventDefault(){}});return {status,location};
}
test('mail draft cannot open without the checked human confirmation',()=>{const r=submit({'#contact-human-confirm':{checked:false}});assert.equal(r.location.href,undefined);assert.equal(r.status.dataset.state,'error');});
test('mail draft rejects subject newlines and oversized fields',()=>{for(const changes of [{'#contact-subject':{value:'Hi\r\nBcc: other@example.invalid'}},{'#contact-message':{value:'x'.repeat(10000)}}])assert.equal(submit(changes).location.href,undefined);});
test('valid draft is encoded locally and makes no delivery claim',()=>{const r=submit({'#contact-subject':{value:'A & B?'}});assert.match(r.location.href,/^mailto:/);assert.ok(r.location.href.includes('A%20%26%20B%3F'));assert.ok(!r.status.textContent.toLowerCase().includes('sent'));});
test('the form starts disabled until its prevent-default handler is installed',()=>{const html=fs.readFileSync('contact.html','utf8');assert.match(html,/<fieldset[^>]*id="contact-form-fields"[^>]*disabled/);assert.match(html,/<noscript>/);});
