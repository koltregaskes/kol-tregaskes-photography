import '../news-link-status.js';
import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';
export function extractNewsUrls(text){return [...new Set([...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map(m=>m[0].replaceAll('&amp;','&').replace(/[.,;]+$/,'')))];}
export async function checkDestination(url,fetchImpl=fetch,timeout=12000){
 const deadline=Date.now()+timeout,visited=new Set();let current=url;
 try{for(let hop=0;hop<8;hop++){
  if(visited.has(current))return{status:'unsafe',reason:'redirect loop'};visited.add(current);
  const remaining=deadline-Date.now();if(remaining<=0)return{status:'unverified',reason:'request deadline'};
  const r=await fetchImpl(current,{redirect:'manual',signal:AbortSignal.timeout(Math.max(1,remaining))});await r.body?.cancel();
  if([301,302,303,307,308].includes(r.status)){
   const location=r.headers?.get('location');if(!location)return{status:'unverified',http:r.status};
   const next=new URL(location,current);if(next.protocol!=='https:')return{status:'unsafe',http:r.status};current=next.href;continue;
  }
  if(new URL(r.url||current).protocol!=='https:')return{status:'unsafe',http:r.status};
  if([404,410].includes(r.status))return{status:'broken',http:r.status};return{status:r.ok?'reachable':'unverified',http:r.status};
 }return{status:'unsafe',reason:'redirect chain exceeds eight hops'};}catch{return{status:'unverified',reason:'network or redirect failure'};}
}

export async function crawlNewsLinks(){const urls=new Set();for(const file of await fs.readdir('news-digests'))if(file.endsWith('.md'))for(const url of extractNewsUrls(await fs.readFile('news-digests/'+file,'utf8')))urls.add(url);const feed=JSON.parse(await fs.readFile('news-digests/news-feed-latest.json','utf8'));for(const article of feed.articles||[])if(/^https?:\/\//i.test(article?.url||''))urls.add(article.url);
 const queue=[...urls].filter(url=>!globalThis.KTPSourceStatus.isUnavailable(url)),results=[],deadline=Date.now()+180000;let index=0;
 await Promise.all(Array.from({length:8},async()=>{while(index<queue.length){const url=queue[index++];const result=Date.now()<deadline?await checkDestination(url,fetch,Math.min(12000,deadline-Date.now())):{status:'unverified',reason:'crawl deadline'};results.push(result);if(['broken','unsafe'].includes(result.status)){const parsed=new URL(url);console.log(JSON.stringify({destination:parsed.origin+parsed.pathname,...result}));}}}));
 const report={destinations:urls.size,inactiveSources:urls.size-queue.length,reachable:results.filter(r=>r.status==='reachable').length,broken:results.filter(r=>r.status==='broken').length,unsafe:results.filter(r=>r.status==='unsafe').length,unverified:results.filter(r=>r.status==='unverified').length};console.log(JSON.stringify(report));return report;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await crawlNewsLinks();if(r.broken||r.unsafe)process.exitCode=1;}
