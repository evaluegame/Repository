const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {URL}=require('url');

const PORT=Number(process.env.PORT||8787);
const ROOT=__dirname;
const DATA=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(ROOT,'runtime');
const UPLOADS=path.join(DATA,'uploads');
const STATE=path.join(DATA,'state.json');
const MAX=Number(process.env.MAX_UPLOAD_BYTES||2147483648);
const AYR=String(process.env.AYRSHARE_API_KEY||'').trim();
const PROFILE=String(process.env.AYRSHARE_PROFILE_KEY||'').trim();
const BASE=String(process.env.APP_BASE_URL||'').replace(/\/$/,'');
const LIVE=!!AYR;
const PLATFORMS=[['youtube','YouTube'],['tiktok','TikTok'],['instagram','Instagram'],['facebook','Facebook'],['twitter','X'],['linkedin','LinkedIn'],['threads','Threads'],['pinterest','Pinterest'],['bluesky','Bluesky'],['telegram','Telegram'],['snapchat','Snapchat']];

fs.mkdirSync(UPLOADS,{recursive:true});
if(!fs.existsSync(STATE))fs.writeFileSync(STATE,JSON.stringify({uploads:[],jobs:[]},null,2));
const read=()=>{try{return JSON.parse(fs.readFileSync(STATE,'utf8'))}catch{return {uploads:[],jobs:[]}}};
const write=s=>fs.writeFileSync(STATE,JSON.stringify(s,null,2));
const json=(res,code,obj)=>{const b=JSON.stringify(obj);res.writeHead(code,{'content-type':'application/json','content-length':Buffer.byteLength(b),'cache-control':'no-store'});res.end(b)};
const safe=n=>String(n||'video.mp4').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-140)||'video.mp4';
const parse=req=>new Promise((ok,bad)=>{let d='';req.on('data',c=>{d+=c;if(d.length>5e6){bad(new Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{ok(d?JSON.parse(d):{})}catch(e){bad(e)}});req.on('error',bad)});
const mediaUrl=(req,r)=>`${BASE||`https://${req.headers['x-forwarded-host']||req.headers.host}`}/media/${r.id}/${r.token}/${encodeURIComponent(r.name)}`;

async function ayr(endpoint,opt={}){
 const headers={'Authorization':`Bearer ${AYR}`,'Content-Type':'application/json'};if(PROFILE)headers['Profile-Key']=PROFILE;
 const r=await fetch(`https://api.ayrshare.com/api${endpoint}`,{...opt,headers:{...headers,...(opt.headers||{})}});const d=await r.json().catch(()=>({}));
 if(!r.ok||d.status==='error')throw new Error(d.message||d.error||`Publishing provider error ${r.status}`);return d;
}
function serveMedia(req,res,u){
 const p=u.pathname.split('/').filter(Boolean);if(p.length<4)return json(res,404,{error:'Not found'});const [,id,token]=p;const s=read();const r=s.uploads.find(x=>x.id===id&&x.token===token);if(!r)return json(res,404,{error:'Not found'});
 const file=path.join(UPLOADS,r.stored);let st;try{st=fs.statSync(file)}catch{return json(res,404,{error:'Not found'})}
 const h={'content-type':r.mime||'application/octet-stream','accept-ranges':'bytes','x-omnipost-original':'true','cache-control':'public,max-age=3600'};const range=req.headers.range;
 if(range){const m=/bytes=(\d*)-(\d*)/.exec(range);if(!m){res.writeHead(416);return res.end()}const a=m[1]?+m[1]:0,b=m[2]?+m[2]:st.size-1;if(a>b||b>=st.size){res.writeHead(416,{'content-range':`bytes */${st.size}`});return res.end()}res.writeHead(206,{...h,'content-length':b-a+1,'content-range':`bytes ${a}-${b}/${st.size}`});if(req.method==='HEAD')return res.end();return fs.createReadStream(file,{start:a,end:b}).pipe(res)}
 res.writeHead(200,{...h,'content-length':st.size});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
}
function serveIndex(res){const f=path.join(ROOT,'index.html');res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});fs.createReadStream(f).pipe(res)}

async function handler(req,res){
 try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(u.pathname==='/api/health')return json(res,200,{ok:true,version:'6.0.0',mode:LIVE?'live':'demo',platforms:PLATFORMS.map(([id,name])=>({id,name}))});
  if(u.pathname==='/api/state')return json(res,200,read());
  if(u.pathname.startsWith('/media/'))return serveMedia(req,res,u);
  if(req.method==='POST'&&u.pathname==='/api/upload'){
   const name=safe(req.headers['x-filename']),mime=String(req.headers['content-type']||'');if(!mime.startsWith('video/'))return json(res,415,{error:'Please choose a video file'});
   const id=crypto.randomUUID(),token=crypto.randomBytes(20).toString('hex'),stored=`${id}-${name}`,target=path.join(UPLOADS,stored),hash=crypto.createHash('sha256');let size=0,stopped=false;const out=fs.createWriteStream(target);
   req.on('data',c=>{size+=c.length;hash.update(c);if(size>MAX&&!stopped){stopped=true;req.destroy();out.destroy();try{fs.unlinkSync(target)}catch{}}});req.pipe(out);
   out.on('finish',()=>{if(stopped)return;const s=read(),r={id,token,name,stored,mime,size,sha256:hash.digest('hex'),originalQuality:true,transcoded:false,createdAt:new Date().toISOString()};s.uploads.unshift(r);s.uploads=s.uploads.slice(0,30);write(s);json(res,201,{ok:true,upload:{id,name,mime,size,sha256:r.sha256,originalQuality:true,transcoded:false}})});out.on('error',()=>{if(!res.headersSent)json(res,500,{error:'Upload failed'})});return;
  }
  if(req.method==='POST'&&u.pathname==='/api/publish'){
   const b=await parse(req),s=read(),r=s.uploads.find(x=>x.id===b.uploadId);if(!r)return json(res,400,{error:'Upload a video first'});const p=(b.platforms||[]).filter(x=>PLATFORMS.some(y=>y[0]===x));if(!p.length)return json(res,400,{error:'Choose at least one platform'});
   const job={id:crypto.randomUUID(),title:String(b.title||'').slice(0,150),caption:String(b.caption||'').slice(0,5000),platforms:p,status:LIVE?'publishing':'published',createdAt:new Date().toISOString(),quality:'original'};s.jobs.unshift(job);s.jobs=s.jobs.slice(0,100);write(s);
   if(!LIVE)return json(res,201,{ok:true,mode:'demo',job});
   try{const result=await ayr('/post',{method:'POST',body:JSON.stringify({post:job.caption||job.title,platforms:p,mediaUrls:[mediaUrl(req,r)]})});const s2=read(),q=s2.jobs.find(x=>x.id===job.id);if(q){q.status=result.status||'submitted';q.provider=result;write(s2)}return json(res,201,{ok:true,mode:'live',job:q||job})}catch(e){const s2=read(),q=s2.jobs.find(x=>x.id===job.id);if(q){q.status='failed';q.error=e.message;write(s2)}return json(res,502,{error:e.message})}
  }
  if(u.pathname==='/'||u.pathname==='/index.html')return serveIndex(res);
  return json(res,404,{error:'Not found'});
 }catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'Server error'})}
}
http.createServer(handler).listen(PORT,()=>console.log(`OmniPost v6 online on ${PORT} (${LIVE?'LIVE':'DEMO'})`));
