import {spawn} from 'node:child_process';

const port=Number(process.env.PORT||10000);
const origin=`http://127.0.0.1:${port}`;
const readerOrigin=new URL(process.env.ALIEXPRESS_MCP_URL||'https://tyrve-aliexpress-reader.onrender.com/mcp').origin;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const child=spawn(process.execPath,['server-v4.js'],{stdio:'inherit',env:process.env});
let childExit=null;
child.on('exit',(code,signal)=>{childExit={code,signal}});

async function fetchWithTimeout(url,timeout=90000,headers={}){
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),timeout);
 try{return await fetch(url,{signal:ctl.signal,headers})}finally{clearTimeout(timer)}
}
async function get(path,timeout=90000){return fetchWithTimeout(origin+path,timeout,{'user-agent':'TyrveE2E/1.0'})}

let homepageOk=false,apiOk=false,last='';
for(let i=0;i<20&&!homepageOk;i++){
 if(childExit)break;
 try{
  const r=await get('/',10000),text=await r.text();
  homepageOk=r.ok&&text.includes('Less clutter.')&&text.includes('Shop Tyrve')&&!text.includes('/styles.css')&&!text.includes('/app.js');
  if(!homepageOk)last=`homepage status=${r.status} bytes=${text.length}`;
 }catch(e){last=String(e?.message||e)}
 if(!homepageOk)await sleep(1500);
}
if(homepageOk)console.log('TYRVE_E2E homepage=true inline_assets=true');
else console.error(`TYRVE_E2E homepage=false error=${last.slice(0,220)}`);

if(homepageOk){
 for(let i=0;i<3&&!apiOk;i++){
  try{
   const r=await get('/api/products?page=1&sort=featured',90000),j=await r.json();
   const items=Array.isArray(j?.items)?j.items:[];
   apiOk=r.ok&&items.length>0&&items.every(x=>x?.id&&x?.title&&x?.image&&Number(x?.price)>0);
   if(apiOk)console.log(`TYRVE_E2E products=true items=${items.length} source=${String(j.source||'unknown')} stale=${Boolean(j.stale)} sample=${items[0].id}`);
   else last=`products status=${r.status} items=${items.length} error=${j?.error||''}`;
  }catch(e){last=String(e?.message||e)}
  if(!apiOk&&i<2)await sleep(3000*(i+1));
 }
}
if(!apiOk)console.error(`TYRVE_E2E products=false error=${last.replace(/\s+/g,' ').slice(0,220)}`);
console.log(`TYRVE_E2E_RESULT ready_for_browsing=${homepageOk&&apiOk}`);

async function keepReaderWarm(){
 try{
  const r=await fetchWithTimeout(readerOrigin+'/',12000,{'user-agent':'TyrveReaderKeepalive/1.0'});
  if(r.status>=500)console.error(`TYRVE_READER_KEEPALIVE ok=false status=${r.status}`);
 }catch(e){console.error(`TYRVE_READER_KEEPALIVE ok=false error=${String(e?.message||e).slice(0,160)}`)}
}
const keepalive=setInterval(keepReaderWarm,8*60*1000);
keepalive.unref?.();

await new Promise(resolve=>child.on('exit',resolve));
clearInterval(keepalive);
process.exit(childExit?.code??0);
