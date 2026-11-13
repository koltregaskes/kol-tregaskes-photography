(() => {
 function assessRoutedFeed(feed, now = Date.now()) {
  const unavailable = {state:'unavailable',articles:[],message:'Latest routed refresh unavailable or invalid. Archive content below, when available, retains its original digest dates.'};
  if(feed?.site!=='Kol Tregaskes Photography'||!Array.isArray(feed.articles))return unavailable;
  const generated=Date.parse(feed.generated);if(!Number.isFinite(generated)||generated>now+300000)return unavailable;
  const articles=feed.articles.filter(article=>{if(!article||typeof article.title!=='string'||!article.title.trim()||typeof article.url!=='string')return false;try{const url=new URL(article.url);const date=Date.parse(article.date);return ['http:','https:'].includes(url.protocol)&&Number.isFinite(date)&&date<=now+300000;}catch{return false;}});
  if(feed.articles.length&&!articles.length)return unavailable;
  const generatedAt=new Date(generated).toISOString(),newestSourceAt=articles.length?new Date(Math.max(...articles.map(a=>Date.parse(a.date)))).toISOString():null;
  const state=now-generated>=86400000?'stale':articles.length?'fresh':'empty';
  const rejected=feed.articles.length-articles.length;
  const message=(state==='stale'?'Latest routed refresh is over 24 hours old. ':state==='empty'?'Latest refresh returned no matching photography stories. ':'Latest routed refresh available. ')+
   'Generated: '+generatedAt+'. '+(newestSourceAt?'Newest source-declared story: '+newestSourceAt+'. ':'No source-story timestamp is claimed. ')+
   (rejected?rejected+(rejected===1?' malformed entry was skipped. ':' malformed entries were skipped. '):'')+'The archive retains its original digest dates.';
  return {state,articles,generatedAt,newestSourceAt,rejected,message};
 }
 globalThis.KTPNewsState=Object.freeze({assessRoutedFeed});
})();
