(() => {
 function makeCoverage(sources) {
  const attempted = sources.length;
  const failed = sources.filter(source => source.outcome === 'failure').length;
  const succeeded = attempted - failed;
  const lostRequired = sources.some(source => source.required && source.outcome === 'failure');
  const status = !attempted || failed >= Math.ceil(attempted / 2) || lostRequired
   ? 'failed' : failed ? 'degraded' : 'healthy';
  return {status, attempted, succeeded, failed, sources};
 }
 function validateCoverage(coverage) {
  if (!coverage || !Array.isArray(coverage.sources)) throw new Error('Invalid source coverage metadata.');
  const ids = new Set();
  for (const source of coverage.sources) {
   if (!source || typeof source.id !== 'string' || !source.id || ids.has(source.id)
    || typeof source.name !== 'string' || !source.name || typeof source.required !== 'boolean'
    || !['success','failure'].includes(source.outcome)) throw new Error('Invalid source outcome metadata.');
   ids.add(source.id);
  }
  const expected = makeCoverage(coverage.sources);
  for (const key of ['status','attempted','succeeded','failed']) {
   if (coverage[key] !== expected[key]) throw new Error('Source coverage totals or status do not match outcomes.');
  }
  return expected;
 }
 function coverageMessage(coverage) {
  if (!coverage) return 'Source availability: not recorded for this feed.';
  const checked = validateCoverage(coverage);
  if (checked.status === 'healthy') return '';
  if (!checked.attempted) return 'Source coverage lost: no sources were configured.';
  return `Some sources unavailable: ${checked.failed} of ${checked.attempted} sources failed during this feed refresh. Coverage is reduced.`;
 }
 function assessRoutedFeed(feed, now = Date.now()) {
  const unavailable = {state:'unavailable',articles:[],message:'Latest routed refresh unavailable or invalid. Archive content below, when available, retains its original digest dates.'};
  if(feed?.site!=='Kol Tregaskes Photography'||!Array.isArray(feed.articles))return unavailable;
  const generated=Date.parse(feed.generated);if(!Number.isFinite(generated)||generated>now+300000)return unavailable;
  let coverage = null;
  try { if (feed.acquisition !== undefined) coverage = validateCoverage(feed.acquisition); }
  catch { return {...unavailable,message:'Source availability metadata is invalid. Latest routed stories are withheld; the dated archive remains below.'}; }
  const articles=feed.articles.filter(article=>{if(!article||typeof article.title!=='string'||!article.title.trim()||typeof article.url!=='string')return false;try{const url=new URL(article.url);const date=Date.parse(article.date);return ['http:','https:'].includes(url.protocol)&&Number.isFinite(date)&&date<=now+300000;}catch{return false;}});
  if(feed.articles.length&&!articles.length)return unavailable;
  const generatedAt=new Date(generated).toISOString(),newestSourceAt=articles.length?new Date(Math.max(...articles.map(a=>Date.parse(a.date)))).toISOString():null;
  const state=coverage?.status==='failed'?'unavailable':now-generated>=86400000?'stale':articles.length?'fresh':'empty';
  const rejected=feed.articles.length-articles.length;
  const availability = coverageMessage(coverage);
  const message=(availability ? availability+' ' : '')+(coverage?.status==='failed'?'Latest routed source coverage is insufficient. ':state==='stale'?'Latest routed refresh is over 24 hours old. ':state==='empty'?'Latest refresh returned no matching photography stories. ':'Latest routed refresh available. ')+
   'Generated: '+generatedAt+'. '+(newestSourceAt?'Newest source-declared story: '+newestSourceAt+'. ':'No source-story timestamp is claimed. ')+
   (rejected?rejected+(rejected===1?' malformed entry was skipped. ':' malformed entries were skipped. '):'')+'The archive retains its original digest dates.';
  return {state,articles,generatedAt,newestSourceAt,rejected,coverage,message};
 }
 globalThis.KTPNewsState=Object.freeze({assessRoutedFeed,makeCoverage,validateCoverage,coverageMessage});
})();
