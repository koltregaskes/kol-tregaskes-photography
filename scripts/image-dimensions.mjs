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
let js=await fs.readFile('site.js','utf8');
js=js.replace("lightboxImage.alt = '';", "lightboxImage.alt = '';\n        lightboxImage.width = 1200;\n        lightboxImage.height = 800;");
js=js.replace('lightboxImage.alt = image.alt;', 'lightboxImage.alt = image.alt;\n        lightboxImage.width = image.naturalWidth || image.width;\n        lightboxImage.height = image.naturalHeight || image.height;');
await fs.writeFile('site.js',js);
