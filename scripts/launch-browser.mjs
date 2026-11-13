import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const routes=(await fs.readdir(root)).filter(p=>p.endsWith('.html'));
const browser=await chromium.launch();
const errors=[];
try {
 for(const width of [320,1280]) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='ktp.test')return route.abort();
   const name=decodeURIComponent(u.pathname)==='/'?'index.html':decodeURIComponent(u.pathname).slice(1);
   const file=path.resolve(root,name);
   if(!file.startsWith(root+path.sep))return route.abort();
   try {await route.fulfill({path:file,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
  for(const name of routes){
   const page=await context.newPage();
   await page.goto('https://ktp.test/'+name,{waitUntil:'networkidle'});
   const axe=await new AxeBuilder({page}).analyze();
   const serious=axe.violations.filter(v=>['serious','critical'].includes(v.impact));
   if(serious.length)errors.push(`${name} ${width}: axe ${serious.map(v=>v.id).join(',')}`);
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].filter(i=>!i.hasAttribute('alt')||!Number(i.getAttribute('width'))||!Number(i.getAttribute('height'))).map(i=>i.getAttribute('src'))}));
   if(layout.overflow)errors.push(`${name} ${width}: horizontal overflow`);
   if(layout.images.length)errors.push(`${name} ${width}: missing image alt/dimensions (${layout.images.length})`);
   await page.close();
  }
  await context.close();
 }
}finally{await browser.close();}
assert.deepEqual(errors,[]);
console.log(`Launch browser checks passed: ${routes.length} routes at 320 and 1280px`);
