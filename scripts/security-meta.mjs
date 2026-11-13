import fs from 'node:fs';
for(const file of fs.readdirSync('.').filter(p=>p.endsWith('.html'))){
 let html=fs.readFileSync(file,'utf8').replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/gi,'').replace(/\s*<meta name="referrer"[^>]*>/gi,'');
 const policy=`default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' mailto:; upgrade-insecure-requests`;
 html=html.replace('<head>',`<head>\n<meta http-equiv="Content-Security-Policy" content="${policy}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`);
 fs.writeFileSync(file,html);
}
