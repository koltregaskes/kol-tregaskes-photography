import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const htmlHelper=fileURLToPath(new URL('./privacy-html-references.py',import.meta.url));
const asciiSpace=char=>/[\t\n\f\r ]/.test(char || 'x');
const fail=()=>{throw Error('Cannot extract a complete source reference');};
const isDataURL=value=>/^[\x00-\x20]*data:/i.test(value.replace(/[\t\r\n]/g,''));

function escapeValue(source, index, kind) {
    let i=index+1;
    if(i>=source.length)fail();
    const char=source[i];
    if(char==='\n')return ['',i+1];
    if(char==='\r')return ['',i+1+(source[i+1]==='\n'?1:0)];
    if(kind==='css') {
        const hex=source.slice(i).match(/^[0-9a-f]{1,6}/i)?.[0];
        if(hex){i+=hex.length;const point=parseInt(hex,16);return [point===0||point>0x10ffff||point>=0xd800&&point<=0xdfff?'\ufffd':String.fromCodePoint(point),i+(asciiSpace(source[i])?1:0)+(source[i]==='\r'&&source[i+1]==='\n'?1:0)];}
        return [char,i+1];
    }
    const simple={b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','0':'\0'};
    if(Object.hasOwn(simple,char))return [simple[char],i+1];
    if(char==='x'||char==='u'){
        const braced=char==='u'&&source[i+1]==='{';
        const hex=braced?source.slice(i+2).match(/^[0-9a-f]+(?=})/i)?.[0]:source.slice(i+1,i+1+(char==='x'?2:4));
        if(!hex||!new RegExp('^[0-9a-f]{'+(braced?'1,6':char==='x'?'2':'4')+'}$','i').test(hex))fail();
        const point=parseInt(hex,16);if(point>0x10ffff)fail();
        return [String.fromCodePoint(point),i+1+hex.length+(braced?2:0)];
    }
    return [char,i+1];
}

function stringAt(source,start,kind) {
    const quote=source[start];let value='',i=start+1;
    while(i<source.length){
        if(source[i]===quote)return {value,end:i+1};
        if(source[i]==='\\'){
            if(kind==='raw'){value+=source.slice(i,i+2);i+=2;}
            else {const [part,end]=escapeValue(source,i,kind);value+=part;i=end;}
        }
        else value+=source[i++];
    }
    fail();
}

function skipCommentsAndSpace(source,start) {
    let i=start;
    while(i<source.length){
        if(/\s/.test(source[i]))i++;
        else if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)fail();i=end+2;}
        else break;
    }
    return i;
}

function cssIdentifier(source,start) {
    let i=start,value='';
    while(i<source.length){
        if(source[i]==='\\'){const [part,end]=escapeValue(source,i,'css');value+=part;i=end;}
        else if(/[\w-]/.test(source[i])||source.charCodeAt(i)>=128)value+=source[i++];
        else break;
    }
    return {value,end:i};
}

function cssFunctionEnd(source,start) {
    let i=start,depth=1;
    while(i<source.length){
        if(source.startsWith('/*',i)){i=skipCommentsAndSpace(source,i);continue;}
        if(source[i]==='"'||source[i]==="'"){i=stringAt(source,i,'css').end;continue;}
        if(source[i]==='\\'){i=escapeValue(source,i,'css')[1];continue;}
        if(source[i]==='(')depth++;
        if(source[i]===')'&&!--depth)return i;
        i++;
    }
    fail();
}

function imageSetReferences(body) {
    const values=cssReferences(body);let start=0,i=0;
    while(i<=body.length){
        if(i===body.length||body[i]===','){
            const first=skipCommentsAndSpace(body,start);
            if(body[first]==='"'||body[first]==="'")values.push(stringAt(body,first,'css').value);
            start=++i;continue;
        }
        if(body[i]==='"'||body[i]==="'"){i=stringAt(body,i,'css').end;continue;}
        if(body[i]==='('){i=cssFunctionEnd(body,i+1)+1;continue;}
        if(body.startsWith('/*',i)){i=skipCommentsAndSpace(body,i);continue;}
        i++;
    }
    return values;
}

export function cssReferences(source) {
    const values=[];let i=0,pendingImport=false;
    while(i<source.length){
        i=skipCommentsAndSpace(source,i);if(i>=source.length)break;
        if(source[i]==='"'||source[i]==="'"){i=stringAt(source,i,'css').end;continue;}
        if(source[i]==='@'){
            const name=cssIdentifier(source,i+1);
            if(name.value.toLowerCase()==='import'){pendingImport=true;i=skipCommentsAndSpace(source,name.end);if(source[i]==='"'||source[i]==="'"){const part=stringAt(source,i,'css');if(isDataURL(part.value))fail();values.push(part.value);i=part.end;pendingImport=false;continue;}}
        }
        const name=cssIdentifier(source,i),open=skipCommentsAndSpace(source,name.end);
        if(['image-set','-webkit-image-set'].includes(name.value.toLowerCase())&&source[open]==='('){
            const end=cssFunctionEnd(source,open+1);
            values.push(...imageSetReferences(source.slice(open+1,end)));i=end+1;continue;
        }
        if(name.value.toLowerCase()==='url'&&source[open]==='('){
            i=skipCommentsAndSpace(source,open+1);
            let value='';
            if(source[i]==='"'||source[i]==="'"){const part=stringAt(source,i,'css');value=part.value;i=skipCommentsAndSpace(source,part.end);}
            else {
                while(i<source.length&&source[i]!==')'){
                    if(source[i]==='\\'){const [part,end]=escapeValue(source,i,'css');value+=part;i=end;}
                    else value+=source[i++];
                }
                value=value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,'');
            }
            if(source[i]!==')')fail();
            if(pendingImport&&isDataURL(value))fail();
            pendingImport=false;
            values.push(value);i++;continue;
        }
        i=name.end>i?name.end:i+1;
    }
    return values;
}

// Literal-only Sets are comparison data (KT's source-suppression records).
// Expressions, templates and malformed lists do not acquire metadata status.
// Indirect use of such data at runtime remains outside this static grammar.
function literalSetEnd(source,start) {
    if(!/\bnew\s+Set\s*\(\s*\[\s*$/.test(source.slice(0,start)))return -1;
    let i=start;
    while(source[i]==='"'||source[i]==="'"){
        i=skipCommentsAndSpace(source,stringAt(source,i,'js').end);
        if(source[i]!==',')break;
        i=skipCommentsAndSpace(source,i+1);
    }
    if(source[i]!==']')return -1;
    const end=skipCommentsAndSpace(source,i+1);
    return source[end]===')'?end:-1;
}

export function jsReferences(source, roles=false) {
    const values=[];let i=0,canStartRegex=true,metadataEnd=-1;
    while(i<source.length){
        const char=source[i];
        if(/\s/.test(char)){i++;continue;}
        if(source.startsWith('//',i)){const end=source.indexOf('\n',i+2);i=end<0?source.length:end;continue;}
        if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)fail();i=end+2;continue;}
        if(char==='"'||char==="'"||char==='`'){
            if(i>metadataEnd)metadataEnd=literalSetEnd(source,i);
            const raw=char==='`'&&/\bString\s*\.\s*raw\s*$/.test(source.slice(0,i));
            const part=char==='`'?templateAt(source,i,raw):stringAt(source,i,raw?'raw':'js');
            for(const expression of part.expressions||[])values.push(...jsReferences(expression,roles));
            // Protocol labels in an explicit URL.protocol comparison are data,
            // not attempted requests. Do not exempt the same literal in fetch().
            const protocolComparison=/^https?:$/i.test(part.value)
                && /\[\s*(?:(['"])https?:\1\s*,\s*)*$/.test(source.slice(0,i))
                && /^(?:\s*,\s*(['"])https?:\1)*\s*\]\s*\.\s*includes\s*\(\s*[\w$.]+\.protocol\s*\)/.test(source.slice(part.end));
            if(!protocolComparison)values.push(roles ? {value:part.value,resource:i>metadataEnd} : part.value);
            i=part.end;canStartRegex=false;continue;
        }
        if(char==='/'&&canStartRegex){
            let inClass=false;i++;
            while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='[')inClass=true;if(source[i]===']')inClass=false;if(source[i++]==='/'&&!inClass)break;}
            while(/[a-z]/i.test(source[i]||''))i++;
            canStartRegex=false;continue;
        }
        const word=source.slice(i).match(/^[a-z_$][\w$]*/i)?.[0];
        if(word){i+=word.length;canStartRegex=['return','throw','case','delete','void','typeof','instanceof','in','of','yield','await'].includes(word);continue;}
        canStartRegex=!/[\w)\]}]/.test(char);i++;
    }
    return values;
}

function interpolationEnd(source,start) {
    let i=start,depth=1;
    while(i<source.length){
        if(source.startsWith('//',i)){const end=source.indexOf('\n',i+2);if(end<0)fail();i=end+1;continue;}
        if(source.startsWith('/*',i)){i=skipCommentsAndSpace(source,i);continue;}
        if(source[i]==='"'||source[i]==="'"){i=stringAt(source,i,'js').end;continue;}
        if(source[i]==='`'){i=templateAt(source,i,false).end;continue;}
        if(source[i]==='{')depth++;
        if(source[i]==='}'&&!--depth)return i;
        i++;
    }
    fail();
}

function templateAt(source,start,raw) {
    let i=start+1,value='';const expressions=[];
    while(i<source.length){
        if(source[i]==='`')return {value,end:i+1,expressions};
        if(source.startsWith('${',i)){
            const end=interpolationEnd(source,i+2);expressions.push(source.slice(i+2,end));value+='${}';i=end+1;continue;
        }
        if(source[i]==='\\'){
            if(raw){value+=source.slice(i,i+2);i+=2;}
            else {const [part,end]=escapeValue(source,i,'js');value+=part;i=end;}
        } else value+=source[i++];
    }
    fail();
}

export function srcsetReferences(source) {
    // HTML's candidate collection keeps internal commas in a URL. Only trailing
    // commas or descriptor separators end candidates; do not split URL userinfo.
    const values=[];let i=0;
    while(i<source.length){
        while(i<source.length&&(asciiSpace(source[i])||source[i]===','))i++;
        const start=i;while(i<source.length&&!asciiSpace(source[i]))i++;
        let value=source.slice(start,i);if(!value)break;
        if(value.endsWith(',')){values.push(value.replace(/,+$/,''));continue;}
        values.push(value);
        let parentheses=0;
        while(i<source.length){const char=source[i++];if(char==='(')parentheses++;else if(char===')')parentheses=Math.max(0,parentheses-1);else if(char===','&&!parentheses)break;}
    }
    return values;
}

export function sourceReferences(source,kind) {
    const result=(entries)=>({base:null,source,kind,values:entries.map(entry=>entry.value),
        requests:entries,resourceValues:entries.filter(entry=>entry.role==='load').map(entry=>entry.value),
        documentURLs:entries.filter(entry=>entry.document).map(entry=>entry.value)});
    const entries=(values,role='load',document=false)=>values.map(value=>({value,role,document}));
    if(kind==='css'||kind==='srcset')return result(entries(kind==='css'?cssReferences(source):srcsetReferences(source)));
    if(kind==='js')return result(jsReferences(source,true).map(entry=>({value:entry.value,role:entry.resource?'load':'metadata',document:false})));
    if(kind==='metadata-js')return result(entries(jsReferences(source),'metadata'));
    if(['url','load-url','document-url','navigation-url','metadata-url'].includes(kind))return result(entries([source],kind==='navigation-url'?'navigation':kind==='metadata-url'?'metadata':'load',kind==='document-url'));
    if(kind!=='html')fail();
    const parsed=runHtmlHelper(source);
    const references=parsed.references.filter(ref=>ref.kind!=='html').map(ref=>sourceReferences(ref.value,ref.kind));
    return {base:parsed.base,source,kind,contexts:parsed.contexts,values:references.flatMap(ref=>ref.values),
        requests:references.flatMap(ref=>ref.requests),resourceValues:references.flatMap(ref=>ref.resourceValues),
        documentURLs:references.flatMap(ref=>ref.documentURLs),documents:parsed.references.filter(ref=>ref.kind==='html').map(ref=>ref.value),decodedText:parsed.decodedText};
}

// Only comments and regexp literals proven by the source lexer are inert. Strings/templates and
// unsupported active syntax cannot borrow a non-request mention exception.
export function referenceContexts(references) {
    const initial=references.contexts||[{kind:references.kind,value:references.source}];
    return initial.flatMap(context=>{
        if(!['css','js','metadata-js'].includes(context.kind))return [context];
        const source=context.value,parts=[],masked=source.split('');let i=0,canStartRegex=true;
        const hide=(start,end)=>{
            const previous=parts.at(-1);
            // The independent sweep can manufacture a token across adjacent
            // comment delimiters after removing newlines. Join only inert spans
            // separated entirely by whitespace, never intervening active code.
            if(previous&&/^\s*$/.test(source.slice(previous.end,start))){previous.value+=source.slice(previous.end,end);previous.end=end;}
            else parts.push({kind:'inert',value:source.slice(start,end),end});
            for(let n=start;n<end;n++)masked[n]=' ';
        };
        while(i<source.length){
            if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)fail();hide(i,end+2);i=end+2;continue;}
            if(context.kind!=='css'&&source.startsWith('//',i)){const end=source.indexOf('\n',i+2);const until=end<0?source.length:end;hide(i,until);i=until;continue;}
            const char=source[i];
            if(char==='"'||char==="'"){i=stringAt(source,i,context.kind==='css'?'css':'js').end;canStartRegex=false;continue;}
            if(char==='`'&&context.kind!=='css'){i=templateAt(source,i,/\bString\s*\.\s*raw\s*$/.test(source.slice(0,i))).end;canStartRegex=false;continue;}
            if(context.kind!=='css'&&char==='/'&&canStartRegex){
                const start=i;let inClass=false,closed=false;i++;
                while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='[')inClass=true;if(source[i]===']')inClass=false;if(source[i++]==='/'&&!inClass){closed=true;break;}}
                if(!closed)fail();
                while(/[a-z]/i.test(source[i]||''))i++;
                hide(start,i);
                canStartRegex=false;continue;
            }
            if(/\s/.test(char)){i++;continue;}
            const word=source.slice(i).match(/^[a-z_$][\w$]*/i)?.[0];
            if(word){i+=word.length;canStartRegex=['return','throw','case','delete','void','typeof','instanceof','in','of','yield','await'].includes(word);continue;}
            canStartRegex=!/[\w)\]}]/.test(char);i++;
        }
        return [{kind:context.kind,value:masked.join(''),...(parts.length?{}:{decodedText:context.decodedText})},...parts.map(({kind,value})=>({kind,value}))];
    });
}

const exactKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
export function validateHtmlHelperOutput(parsed,decodeOnly=false) {
    if(!exactKeys(parsed,decodeOnly?['decodedText']:['base','references','contexts','decodedText'])||typeof parsed.decodedText!=='string')fail();
    if(!decodeOnly){
        if(parsed.base!==null&&typeof parsed.base!=='string'||!Array.isArray(parsed.references))fail();
        for(const ref of parsed.references)if(!exactKeys(ref,['kind','value'])||!['url','load-url','document-url','navigation-url','metadata-url','metadata-js','srcset','css','js','html'].includes(ref.kind)||typeof ref.value!=='string')fail();
        if(!Array.isArray(parsed.contexts))fail();
        for(const ref of parsed.contexts)if(!exactKeys(ref,['kind','value','decodedText'])||!['url','load-url','document-url','navigation-url','metadata-url','metadata-js','srcset','css','js','html','inert','unknown'].includes(ref.kind)||typeof ref.value!=='string'||typeof ref.decodedText!=='string')fail();
    }
    return parsed;
}

function runHtmlHelper(source,decodeOnly=false) {
    const result=spawnSync(process.platform==='win32'?'python':'python3',[htmlHelper,...(decodeOnly?['--decode-text']:[])],{input:source,encoding:'utf8',maxBuffer:16*1024*1024});
    if(result.status!==0)throw Error('Cannot extract HTML references; Python 3 is required');
    let parsed;try{parsed=JSON.parse(result.stdout);}catch{fail();}
    validateHtmlHelperOutput(parsed,decodeOnly);
    if(source.length&&parsed.decodedText.length===0)fail();
    return parsed;
}

export const decodeReferenceText=source=>runHtmlHelper(source,true).decodedText;
