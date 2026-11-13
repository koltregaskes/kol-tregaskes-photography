import { WIDTHS, discoverRoutes } from './launch-routes.mjs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const routes=await discoverRoutes(root);
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'});
const errors=[];
try {
 for(const width of WIDTHS) {
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
   await page.evaluate(()=>document.fonts.ready);
   if(await page.locator('main').count()!==1||await page.locator('h1').count()!==1)errors.push(name+' '+width+': one main and one h1 required');
   await page.keyboard.press('Tab');
   if(!await page.evaluate(()=>document.activeElement?.classList.contains('skip-link')))errors.push(name+' '+width+': first keyboard stop must be skip link');
   else { await page.keyboard.press('Enter'); if(!await page.evaluate(()=>document.activeElement?.id==='main-content'))errors.push(name+' '+width+': skip link did not move focus to main'); }
   const toggle=page.locator('#nav-toggle');
   if(width<768 && await toggle.count() && await toggle.isVisible()) {
    await toggle.focus();await page.keyboard.press('Enter');
    if(await toggle.getAttribute('aria-expanded')!=='true'||!await page.evaluate(()=>document.querySelector('#nav')?.contains(document.activeElement)))errors.push(name+' '+width+': menu did not open with focus');
    await page.keyboard.press('Escape');
    if(await toggle.getAttribute('aria-expanded')!=='false'||!await toggle.evaluate(el=>el===document.activeElement))errors.push(name+' '+width+': menu failed Escape/focus return');
   }
   const axe=await new AxeBuilder({page}).analyze();
   const unknownContrast=axe.incomplete.filter(v=>v.id==='color-contrast').reduce((sum,v)=>sum+v.nodes.length,0);
   if(unknownContrast)console.log(name+' '+width+': '+unknownContrast+' contrast nodes require human review');
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
console.log(`Launch browser checks passed: ${routes.length} routes at ${WIDTHS.join(", ")}px`);
