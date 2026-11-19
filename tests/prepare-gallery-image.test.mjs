import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {prepareImage} from '../scripts/prepare-gallery-image.mjs';
test('responsive staging preserves original, applies orientation, strips metadata and never overwrites output',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ktp-image-'));
 try {
  const source=path.join(root,'source.jpg'),output=path.join(root,'variants');
  await sharp({create:{width:120,height:80,channels:3,background:'#79a3cb'}}).jpeg().withMetadata({orientation:6}).toFile(source);
  const before=await fs.readFile(source),manifest=await prepareImage(source,output,[40,80,160]);
  assert.deepEqual(await fs.readFile(source),before);
  assert.equal(manifest.variants.length,6);
  for(const v of manifest.variants){const m=await sharp(await fs.readFile(path.join(output,v.file))).metadata();assert.equal(m.width,v.width);assert.equal(m.height,v.height);assert.ok(m.width<=80);assert.equal(m.exif,undefined);assert.equal(m.xmp,undefined);assert.equal(m.orientation,undefined);assert.equal(m.space,'srgb');}
  assert.equal(manifest.srcset.jpeg,'40.jpg 40w, 80.jpg 80w');
  await assert.rejects(prepareImage(source,output,[40]),{code:'EEXIST'});
  await assert.rejects(prepareImage(source,path.join(root,'invalid'),[0]),/Widths/);
 }finally{await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
