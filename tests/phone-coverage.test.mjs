import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import { WIDTHS, discoverRoutes } from '../scripts/launch-routes.mjs';
test('coverage includes both phone widths and discovers every public HTML route',async()=>{
 assert.ok(WIDTHS.includes(320)&&WIDTHS.includes(390)&&WIDTHS.includes(1280));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ktp-routes-'));
 for(const file of ['index.html','404.html','nested/page.html','design/draft.html','.local/proof.html']){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),'');}
 assert.deepEqual(await discoverRoutes(root),['404.html','index.html','nested/page.html']);
});
