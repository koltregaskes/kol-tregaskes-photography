import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';
export function inspectPublicHtml(html,file){const errors=[];const policies=[...html.matchAll(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/gi)].map(m=>m[1]);if(policies.length!==1)errors.push('exactly one CSP meta policy required');const policy=policies[0]||'';
 for(const directive of ["default-src 'self'","script-src 'self'","object-src 'none'","base-uri 'self'"])if(!policy.includes(directive))errors.push('missing '+directive);
 if(/'unsafe-inline'|'unsafe-eval'|frame-ancestors|report-uri|sandbox/i.test(policy))errors.push('unsafe or ignored CSP meta directive');
 if(!/<meta\b[^>]*name="referrer"[^>]*content="strict-origin-when-cross-origin"/i.test(html))errors.push('referrer meta policy missing');
 if(/<meta\b[^>]*http-equiv="(?:Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options)"/i.test(html))errors.push('response-header-only protection cannot be supplied by meta');
 for(const form of html.matchAll(/<form\b[^>]*>/gi))if(file!=='contact.html'||!form[0].includes('id="contact-form"')||/\b(?:action|method)=/i.test(form[0]))errors.push('unexpected collection form or endpoint');
 if(/<input\b[^>]*type="password"/i.test(html))errors.push('password collection is outside the static site boundary');
 for(const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){const src=tag[1].match(/\bsrc="([^"]+)"/i)?.[1];if(src){const u=new URL(src,'https://koltregaskesphotography.com/');if(u.origin!=='https://koltregaskesphotography.com')errors.push('remote executable script requires review');}else if(!/\btype="application\/ld\+json"/i.test(tag[1])&&tag[2].trim())errors.push('inline executable script blocked by CSP');}
 return errors;}
export async function checkPublicBoundary(){const errors=[];let pages=0;for(const file of(await fs.readdir('.')).filter(f=>f.endsWith('.html'))){pages++;errors.push(...inspectPublicHtml(await fs.readFile(file,'utf8'),file).map(e=>file+': '+e));}
 for(const file of(await fs.readdir('.')).filter(f=>f.endsWith('.js'))){const source=await fs.readFile(file,'utf8');if(/sendBeacon\s*\(|document\.cookie\s*=|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(source))errors.push(file+': new telemetry or write API needs boundary review');}
 return {pages,errors};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await checkPublicBoundary();console.log('Static public boundary: '+r.pages+' HTML pages, '+r.errors.length+' failures');if(r.errors.length){console.error(r.errors.join('\n'));process.exitCode=1;}}
