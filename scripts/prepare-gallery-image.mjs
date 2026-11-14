import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {pathToFileURL} from 'node:url';

// Explicit input only: never scan a user's photo library or choose photographs.
export async function prepareImage(source, output, widths = [800, 1600, 2400]) {
 const input = await fs.realpath(source);
 const destination = path.resolve(output);
 if (destination === input || destination.startsWith(input + path.sep)) throw new Error('Output must be separate from the original');
 if (!widths.length || widths.some(w => !Number.isInteger(w) || w < 1 || w > 6000)) throw new Error('Widths must be integers from 1 to 6000');
 const metadata = await sharp(input).metadata();
 const rotatedWidth = [5,6,7,8].includes(metadata.orientation) ? metadata.height : metadata.width;
 if (!rotatedWidth) throw new Error('Source dimensions are unavailable');
 const sizes = [...new Set(widths.map(w => Math.min(w, rotatedWidth)))].sort((a,b) => a-b);
 // Exclusive directory creation prevents reruns from overwriting any previous work.
 await fs.mkdir(path.dirname(destination), {recursive:true});
 await fs.mkdir(destination);
 const variants = [];
 for (const width of sizes) {
  for (const format of ['avif', 'webp', 'jpeg']) {
   const filename = `${width}.${format === 'jpeg' ? 'jpg' : format}`;
   // sharp strips source metadata by default; rotate applies EXIF orientation first.
   const info = await sharp(input).rotate().resize({width, withoutEnlargement:true}).toColourspace('srgb')
    .toFormat(format, {quality:format === 'avif' ? 50 : 80}).toFile(path.join(destination, filename));
   variants.push({file:filename, format, width:info.width, height:info.height, bytes:info.size});
  }
 }
 const manifest = {variants, srcset:Object.fromEntries(['avif','webp','jpeg'].map(format=>[format,variants.filter(v=>v.format===format).map(v=>`${v.file} ${v.width}w`).join(', ')]))};
 await fs.writeFile(path.join(destination,'manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag:'wx'});
 return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const [source, output] = process.argv.slice(2);
 if (!source || !output) throw new Error('Usage: node scripts/prepare-gallery-image.mjs images/<approved-file> .local/image-staging/<new-name>');
 const root = await fs.realpath('.');
 const input = await fs.realpath(source);
 const staging = path.resolve(root,'.local','image-staging');
 const destination = path.resolve(output);
 if (!input.startsWith(path.join(root,'images')+path.sep) || !destination.startsWith(staging+path.sep)) throw new Error('CLI requires a repo images input and a new .local/image-staging output directory');
 const manifest = await prepareImage(input,destination);
 console.log(`Prepared ${manifest.variants.length} variants in local staging; original untouched. Publication requires approved selection and a separate PR.`);
}
