const http=require('http');
const crypto=require('crypto');
const Redis=require('ioredis');

const PORT=Number(process.env.PORT||10000);
const REDIS_URL=process.env.REDIS_URL;
if(!REDIS_URL) throw new Error('REDIS_URL is required');
const redis=new Redis(REDIS_URL,{maxRetriesPerRequest:2,enableReadyCheck:true});
const ALLOWED=new Set([
  'https://profit-tracker-emil.onrender.com',
  'https://profit-tracker-u9ge.onrender.com'
]);
const ITER=210000;
const SESSION_TTL=60*60*24*30;

function cors(req,res){
  const o=req.headers.origin;
  if(o&&ALLOWED.has(o)){
    res.setHeader('Access-Control-Allow-Origin',o);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
}
function json(res,status,obj){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj));}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',d=>{s+=d;if(s.length>16384){reject(new Error('too_large'));req.destroy();}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(new Error('bad_json'))}});req.on('error',reject);});}
function normEmail(v){return String(v||'').trim().toLowerCase();}
function validEmail(v){return /^\S+@\S+\.\S+$/.test(v)&&v.length<=254;}
function hashPassword(password,saltHex){return crypto.pbkdf2Sync(password,Buffer.from(saltHex,'hex'),ITER,32,'sha256').toString('hex');}
function safeEq(a,b){try{return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}catch{return false;}}
function publicUser(u){return {id:u.id,email:u.email,name:u.name||'',createdAt:u.createdAt};}
async function makeSession(user){const token=crypto.randomBytes(32).toString('base64url');await redis.set(`profit:session:${token}`,user.email,'EX',SESSION_TTL);return token;}
async function authed(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))return null;const token=h.slice(7);if(token.length<20)return null;const email=await redis.get(`profit:session:${token}`);if(!email)return null;const raw=await redis.get(`profit:user:${email}`);if(!raw)return null;await redis.expire(`profit:session:${token}`,SESSION_TTL);return {token,user:JSON.parse(raw)};}
async function rate(req,key,limit,seconds){const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();const k=`profit:rate:${key}:${ip}`;const n=await redis.incr(k);if(n===1)await redis.expire(k,seconds);return n<=limit;}

const server=http.createServer(async(req,res)=>{
  cors(req,res);
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  try{
    if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true});

    if(req.method==='POST'&&req.url==='/signup'){
      if(!(await rate(req,'signup',15,3600)))return json(res,429,{error:'Too many attempts.'});
      const b=await readBody(req),email=normEmail(b.email),password=String(b.password||''),name=String(b.name||'').trim().slice(0,40);
      if(!validEmail(email))return json(res,400,{error:'Enter a valid email.'});
      if(password.length<8||password.length>200)return json(res,400,{error:'Password must be at least 8 characters.'});
      const key=`profit:user:${email}`;
      if(await redis.exists(key))return json(res,409,{error:'An account with this email already exists.'});
      const salt=crypto.randomBytes(16).toString('hex');
      const user={id:crypto.randomUUID(),email,name,salt,hash:hashPassword(password,salt),iterations:ITER,createdAt:Date.now()};
      const ok=await redis.set(key,JSON.stringify(user),'NX');
      if(!ok)return json(res,409,{error:'An account with this email already exists.'});
      const token=await makeSession(user);
      return json(res,201,{token,user:publicUser(user)});
    }

    if(req.method==='POST'&&req.url==='/login'){
      if(!(await rate(req,'login',40,900)))return json(res,429,{error:'Too many attempts. Try again later.'});
      const b=await readBody(req),email=normEmail(b.email),password=String(b.password||'');
      if(!validEmail(email)||!password)return json(res,400,{error:'Enter your email and password.'});
      const raw=await redis.get(`profit:user:${email}`);
      if(!raw)return json(res,404,{error:'Account not found.'});
      const user=JSON.parse(raw),actual=hashPassword(password,user.salt);
      if(!safeEq(actual,user.hash))return json(res,401,{error:'Incorrect password.'});
      const token=await makeSession(user);
      return json(res,200,{token,user:publicUser(user)});
    }

    if(req.method==='GET'&&req.url==='/me'){
      const a=await authed(req);if(!a)return json(res,401,{error:'Not signed in.'});
      return json(res,200,{user:publicUser(a.user)});
    }

    if(req.method==='POST'&&req.url==='/logout'){
      const h=String(req.headers.authorization||'');if(h.startsWith('Bearer '))await redis.del(`profit:session:${h.slice(7)}`);
      return json(res,200,{ok:true});
    }

    return json(res,404,{error:'Not found.'});
  }catch(e){console.error(e);return json(res,500,{error:'Server error.'});}
});

server.listen(PORT,()=>console.log(`Profit auth API listening on ${PORT}`));
