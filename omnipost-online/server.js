const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {URL}=require('url');

const PORT=Number(process.env.PORT||8787);
const DATA=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'runtime');
const UPLOADS=path.join(DATA,'uploads');
const STATE=path.join(DATA,'state.json');
const MAX=Number(process.env.MAX_UPLOAD_BYTES||2147483648);
const AYR=String(process.env.AYRSHARE_API_KEY||'').trim();
const PROFILE=String(process.env.AYRSHARE_PROFILE_KEY||'').trim();
const BASE=String(process.env.APP_BASE_URL||'').replace(/\/$/,'');
const LIVE=!!AYR;
const INDEX=path.join(__dirname,'index.html');

fs.mkdirSync(UPLOADS,{recursive:true});
if(!fs.existsSync(STATE))fs.writeFileSync(STATE,JSON.stringify({uploads:[],jobs:[]},null,2));

const platforms=[
 ['youtube','YouTube'],['tiktok','TikTok'],['instagram','Instagram'],['facebook','Facebook'],
 ['twitter','X'],['linkedin','LinkedIn'],['threads','Threads'],['pinterest','Pinterest'],
 ['bluesky','Bluesky'],['telegram','Telegram'],['snapchat','Snapchat']
].map(([id,name])=>({id,name}));

const read=()=>{try{return JSON.parse(fs.readFileSync(STATE,'utf8'))}catch{return {uploads:[],jobs:[]}}};
const write=s=>fs.writeFileSync(STATE,JSON.stringify(s,null,2));
const json=(res,code,obj)=>{const b=JSON.stringify(obj);res.writeHead(code,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(b),'cache-control':'no-store'});res.end(b)};
const safe=n=>String(n||'video.mp4').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-140)||'video.mp4';
const mediaUrl=(req,u)=>`${BASE||`https://${req.headers['x-forwarded-host']||req.headers.host}`}/media/${u.id}/${u.token}/${encodeURIComponent(u.name)}`;
const parse=req=>new Promise((ok,bad)=>{let d='';req.on('data',c=>{d+=c;if(d.length>5e6){bad(new Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{ok(d?JSON.parse(d):{})}catch(e){bad(e)}});req.on('error',bad)});

async function ayr(endpoint,opt={}){
  const headers={'Authorization':`Bearer ${AYR}`,'Content-Type':'application/json'};
  if(PROFILE)headers['Profile-Key']=PROFILE;
  const r=await fetch(`https://api.ayrshare.com/api${endpoint}`,{...opt,headers:{...headers,...(opt.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.status==='error')throw new Error(d.message||d.error||`Publishing provider error ${r.status}`);
  return d;
}

function serveMedia(req,res,u){
  const parts=u.pathname.split('/').filter(Boolean);
  if(parts.length<4)return json(res,404,{error:'Not found'});
  const [,id,token]=parts;
  const st=read();
  const rec=st.uploads.find(x=>x.id===id&&x.token===token);
  if(!rec)return json(res,404,{error:'Not found'});
  const file=path.join(UPLOADS,rec.stored);
  let stat;try{stat=fs.statSync(file)}catch{return json(res,404,{error:'Not found'})}
  const h={'content-type':rec.mime||'application/octet-stream','accept-ranges':'bytes','x-omnipost-original':'true','x-content-sha256':rec.sha256,'cache-control':'public,max-age=3600'};
  const range=req.headers.range;
  if(range){
    const m=/bytes=(\d*)-(\d*)/.exec(range);
    if(!m){res.writeHead(416);return res.end()}
    const start=m[1]?+m[1]:0,end=m[2]?+m[2]:stat.size-1;
    if(start>end||end>=stat.size){res.writeHead(416,{'content-range':`bytes */${stat.size}`});return res.end()}
    res.writeHead(206,{...h,'content-length':end-start+1,'content-range':`bytes ${start}-${end}/${stat.size}`});
    if(req.method==='HEAD')return res.end();
    return fs.createReadStream(file,{start,end}).pipe(res);
  }
  res.writeHead(200,{...h,'content-length':stat.size});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try{
    if((req.method==='GET'||req.method==='HEAD')&&u.pathname.startsWith('/media/'))return serveMedia(req,res,u);

    if(req.method==='GET'&&u.pathname==='/api/health'){
      return json(res,200,{
        ok:true,version:'6.1.0',mode:LIVE?'live':'demo',platforms,
        quality:{originalBytes:true,recompression:false,sha256:true,maxUploadBytes:MAX},
        ai:{mode:'browser-vision',free:true,filenameFallback:false,model:'Xenova/vit-gpt2-image-captioning'}
      });
    }

    if(req.method==='GET'&&u.pathname==='/api/state'){
      const st=read();
      return json(res,200,{uploads:st.uploads.slice(-10).reverse(),jobs:st.jobs.slice(-20).reverse()});
    }

    if(req.method==='POST'&&u.pathname==='/api/upload'){
      const len=Number(req.headers['content-length']||0);
      if(len&&len>MAX)return json(res,413,{error:`Video exceeds ${Math.round(MAX/1024/1024)} MB upload limit`});
      const mime=String(req.headers['content-type']||'application/octet-stream');
      if(!mime.startsWith('video/'))return json(res,415,{error:'Please upload a video file'});
      const name=safe(decodeURIComponent(String(req.headers['x-filename']||'video.mp4')));
      const id=crypto.randomUUID(),token=crypto.randomBytes(18).toString('hex');
      const stored=`${id}-${name}`,dest=path.join(UPLOADS,stored),temp=dest+'.part';
      const hash=crypto.createHash('sha256');let size=0,failed=false;
      const out=fs.createWriteStream(temp,{flags:'wx'});
      req.on('data',chunk=>{size+=chunk.length;if(size>MAX&&!failed){failed=true;req.destroy(new Error('Upload too large'));return}hash.update(chunk)});
      req.pipe(out);
      out.on('finish',()=>{
        if(failed)return;
        fs.renameSync(temp,dest);
        const sha256=hash.digest('hex'),st=read();
        const rec={id,token,name,stored,mime,size,sha256,createdAt:new Date().toISOString(),originalBytes:true};
        st.uploads.push(rec); if(st.uploads.length>50)st.uploads=st.uploads.slice(-50);write(st);
        json(res,200,{upload:{...rec,stored:undefined,token:undefined,mediaUrl:mediaUrl(req,rec)}});
      });
      out.on('error',e=>{try{fs.unlinkSync(temp)}catch{};if(!res.headersSent)json(res,500,{error:e.message||'Upload failed'})});
      req.on('error',e=>{try{out.destroy();fs.unlinkSync(temp)}catch{};if(!res.headersSent)json(res,500,{error:e.message||'Upload failed'})});
      return;
    }

    if(req.method==='POST'&&u.pathname==='/api/publish'){
      const body=await parse(req);
      const st=read();
      const rec=st.uploads.find(x=>x.id===body.uploadId);
      if(!rec)return json(res,404,{error:'Uploaded video no longer exists. Upload it again.'});
      const requested=Array.isArray(body.platforms)?body.platforms.filter(x=>platforms.some(p=>p.id===x)):[];
      if(!requested.length)return json(res,400,{error:'Select at least one destination'});
      const title=String(body.title||'').trim().slice(0,150);
      const caption=String(body.caption||'').trim().slice(0,5000);
      if(!title&&!caption)return json(res,400,{error:'Generate or enter a title/caption before publishing'});
      const job={id:crypto.randomUUID(),uploadId:rec.id,title:title||caption.slice(0,100),platforms:requested,status:LIVE?'sending':'demo-complete',createdAt:new Date().toISOString(),quality:'original'};
      if(LIVE){
        try{
          const postText=caption||title;
          const result=await ayr('/post',{method:'POST',body:JSON.stringify({post:postText,platforms:requested,mediaUrls:[mediaUrl(req,rec)],title:title||undefined})});
          job.status='submitted';job.providerResult=result;
        }catch(e){job.status='failed';job.error=e.message}
      }
      st.jobs.push(job);if(st.jobs.length>100)st.jobs=st.jobs.slice(-100);write(st);
      return json(res,job.status==='failed'?502:200,{ok:job.status!=='failed',mode:LIVE?'live':'demo',job});
    }

    if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html')){
      const html=fs.readFileSync(INDEX);
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':html.length,'cache-control':'no-cache'});
      return res.end(html);
    }

    return json(res,404,{error:'Not found'});
  }catch(e){
    console.error(e);
    if(!res.headersSent)json(res,500,{error:e.message||'Server error'});
  }
});

server.on('clientError',(_,socket)=>{try{socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')}catch{}});
server.listen(PORT,'0.0.0.0',()=>console.log(`OmniPost v6.1 listening on ${PORT}`));
