import fs from 'node:fs/promises';import path from 'node:path';
export const WIDTHS = [320,390,1280];
export async function discoverRoutes(root) {
 const routes=[];
 async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){if(e.name.startsWith('.')||['node_modules','design','docs','scripts','tests'].includes(e.name))continue;const name=path.join(dir,e.name);if(e.isDirectory())await walk(name);else if(e.name.endsWith('.html'))routes.push(name.replaceAll('\\','/'));}}
 await walk('');return routes.sort();
}
