import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const decode = value => String(value).replace(/&(?:amp|quot|apos|lt|gt);/g,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x])).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(all,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return Number.isInteger(n)&&n>=0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):all});
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
export async function inspectSite(directory='.',origin='https://koltregaskesphotography.com') {
 const root=path.resolve(directory),files=[],documents=new Map(),errors=[];
 async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.')||['node_modules','design','docs','scripts','tests'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.html'))files.push(p)}}await walk(root);
 for(const file of files){const html=await fs.readFile(file,'utf8'),ids=new Set(),refs=[];let redirect=null;
  for(const match of html.replace(/<!--[\s\S]*?-->/g,'').replace(/(<(?:script|style)\b[^>]*>)[\s\S]*?<\/(?:script|style)>/gi,'$1</script>').matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)){const tag=match[1].toLowerCase(),a=attrs(match[0]);if(a.id)ids.add(a.id);if(tag==='a'&&a.name)ids.add(a.name);
   for(const key of ['href','src','poster','action'])if(a[key])refs.push({value:a[key],allowData:key==='src' && ['img','source','video','audio'].includes(tag)});
   if(a['http-equiv']?.toLowerCase()==='refresh'){const m=a.content?.match(/^\s*\d+(?:\.\d+)?\s*;\s*url\s*=\s*(.+?)\s*$/i);if(!m)errors.push(path.relative(root,file)+': invalid redirect');else redirect=m[1].replace(/^['"]|['"]$/g,'');}
  }documents.set(file,{ids,refs,redirect});
 }
 async function resolve(url,source,visited=new Set(),allowData=false){
  if(!['http:','https:'].includes(url.protocol)){if(['mailto:','tel:'].includes(url.protocol)||(allowData && /^data:(image|audio|video)\//i.test(url.href)))return null;throw Error('unsafe destination protocol '+url.protocol);}
  if(url.origin!==origin)return null;
  if(visited.has(url.href))throw Error('redirect loop');if(visited.size>=8)throw Error('redirect chain exceeds eight hops');visited.add(url.href);
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))throw Error('target escapes site root');
  const stat=await fs.stat(file);const target=stat.isDirectory()?path.join(file,'index.html'):file;await fs.access(target);
  const doc=documents.get(target);if(doc?.redirect){const next=new URL(doc.redirect,url);if(url.protocol==='https:'&&next.protocol!=='https:')throw Error('HTTPS redirect downgrade');return resolve(next,source,visited);}
  if(url.hash&&doc&&!doc.ids.has(decodeURIComponent(url.hash.slice(1))))throw Error('missing fragment '+decodeURIComponent(url.hash.slice(1)));
  return target;
 }
 for(const [file,doc] of documents){const source=path.relative(root,file).replaceAll('\\','/'),base=new URL(source,origin+'/');for(const ref of doc.refs){try{await resolve(new URL(ref.value,base),source,new Set(),ref.allowData)}catch(error){errors.push(source+': '+error.message)}}if(doc.redirect){try{const next=new URL(doc.redirect,base);if(next.protocol!=='https:')throw Error('unsafe redirect protocol');await resolve(next,source,new Set([base.href]));}catch(error){errors.push(source+': '+error.message)}}}
 return {pages:files.length,errors:[...new Set(errors)]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=await inspectSite();console.log('Internal targets, fragments and redirects: '+report.pages+' pages; '+report.errors.length+' failures.');if(report.errors.length){console.error(report.errors.slice(0,40).join('\n'));process.exitCode=1}}
