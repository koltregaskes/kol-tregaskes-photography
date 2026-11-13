import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {pathToFileURL} from 'node:url';
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));
export function checkImageMarkup(html){const errors=[];for(const [i,m] of [...html.matchAll(/<img\b[^>]*>/gi)].entries()){const a=attrs(m[0]),prefix='image '+(i+1)+': ';if(!Object.hasOwn(a,'alt'))errors.push(prefix+'missing alt');else if(!a.alt.trim()&&a.role!=='presentation'&&a['aria-hidden']!=='true')errors.push(prefix+'empty alt needs explicit decorative intent');else if(/^(?:img[_ -]?\d+|dsc[_ -]?\d+|photo|image|placeholder)(?:\.[a-z]+)?$/i.test(a.alt.trim())||/\.(?:jpe?g|png|webp|avif)$/i.test(a.alt.trim()))errors.push(prefix+'filename/generic alt is not a description');if(!(Number(a.width)>0&&Number(a.height)>0))errors.push(prefix+'missing positive dimensions');}return errors;}
export function assessImageBudget(images){const errors=[];let total=0;for(const image of images){total+=image.bytes;if(image.bytes>300*1024)errors.push(image.file+': exceeds 300 KiB image budget');if(image.width*image.height>16000000)errors.push(image.file+': exceeds 16 megapixel public image budget');}if(total>2*1024*1024)errors.push('page exceeds 2 MiB raster image budget');return errors;}
export async function auditImages(root=process.cwd()) {
 const pages=(await fs.readdir(root)).filter(p=>p.endsWith('.html')),errors=[],checked=new Set();let inlineImages=0;
 const css=await fs.readFile(path.join(root,'styles.css'),'utf8');
 for(const page of pages){const html=await fs.readFile(path.join(root,page),'utf8');errors.push(...checkImageMarkup(html).map(e=>page+': '+e));inlineImages+=(html.match(/<img\b/gi)||[]).length;
  const refs=new Set([...html.matchAll(/(?:src|href|content)="([^"<>]+\.(?:png|jpe?g|webp|avif)(?:[?#][^"]*)?)"/gi)].map(m=>m[1]));
  for(const m of html.matchAll(/srcset="([^"]+)"/gi))for(const candidate of m[1].split(','))refs.add(candidate.trim().split(/\s+/)[0]);
  for(const m of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))if(/\.(?:png|jpe?g|webp|avif)(?:[?#]|$)/i.test(m[1]))refs.add(m[1]);
  const images=[];
  for(const ref of refs){const url=new URL(ref,'https://koltregaskesphotography.com/'+page);if(url.origin!=='https://koltregaskesphotography.com'){errors.push(page+': external raster requires a reviewed local budget/source policy');continue;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){errors.push(page+': image escapes public root');continue;}try{const {size}=await fs.stat(file),m=await sharp(file).metadata();await sharp(file).stats();images.push({file:path.relative(root,file),bytes:size,width:m.width,height:m.height});checked.add(file);}catch{errors.push(page+': missing or undecodable public raster image');}}
  errors.push(...assessImageBudget(images).map(e=>page+': '+e));
 }
 return {pages:pages.length,inlineImages,referencedRasters:checked.size,errors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await auditImages();console.log('Public images: '+r.pages+' pages, '+r.inlineImages+' inline photographs, '+r.referencedRasters+' referenced rasters, '+r.errors.length+' failures');if(r.errors.length){console.error(r.errors.join('\n'));process.exitCode=1;}}
