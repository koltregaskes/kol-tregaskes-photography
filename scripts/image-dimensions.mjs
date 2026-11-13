import fs from 'node:fs/promises';
import sharp from 'sharp';
for(const file of (await fs.readdir('.')).filter(p=>p.endsWith('.html'))){
 let html=await fs.readFile(file,'utf8');
 for(const match of [...html.matchAll(/<img\b[^>]*>/g)]){
  const src=match[0].match(/src="([^"]+)"/)?.[1];
  if(!src||/^https?:/.test(src))continue;
  const {width,height}=await sharp(src).metadata();
  html=html.replace(match[0],match[0].replace(/\s(?:width|height)="[^"]*"/g,'').replace('<img',`<img width="${width}" height="${height}"`));
 }
 await fs.writeFile(file,html);
}
