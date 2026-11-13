import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync('site-config.json','utf8').replace(/^\uFEFF/,''));
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.contactEmail))throw Error('Invalid contact email');
const check=process.argv.includes('--check');
for(const file of [...fs.readdirSync('.').filter(p=>p.endsWith('.html')),'site.js','.well-known/security.txt']){
 const before=fs.readFileSync(file,'utf8');
 const after=before.replace(/(?:contact@koltregaskesphotography\.com|kol@koltregaskes\.com)/g,cfg.contactEmail);
 if(check&&before!==after)throw Error(`Stale contact config in ${file}`);
 if(!check)fs.writeFileSync(file,after);
}
console.log('Contact configuration checked');
