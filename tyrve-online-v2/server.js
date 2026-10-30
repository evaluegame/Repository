import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';

const PORT=Number(process.env.PORT||10000);
const BASE=process.env.BASE_URL||`http://localhost:${PORT}`;
const CJ_API_KEY=process.env.CJ_API_KEY||'';
const CJ_ROOT='https://developers.cjdropshipping.com/api2.0/v1';
let tokenCache={token:'',expires:0};
let categoryCache={items:[],expires:0};

const blocked=/\b(gun|firearm|rifle|pistol|ammo|ammunition|knife|switchblade|sword|taser|pepper spray|mace|vape|cigarette|nicotine|cbd|thc|marijuana|cannabis|alcohol|liquor|wine|beer|steroid|porn|sex toy|gambling)\b/i;
const safeProduct=p=>!blocked.test(`${p?.nameEn||''} ${p?.oneCategoryName||''} ${p?.twoCategoryName||''} ${p?.threeCategoryName||''} ${p?.description||''}`);
const retail=n=>{const c=Number(n||0);if(!Number.isFinite(c)||c<=0)return null;const raw=Math.max(c*1.75,c+6);return Math.floor(raw)+0.99};
const cleanHtml=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200);

function send(res,code,data,type='application/json'){
 res.writeHead(code,{
  'content-type':type,
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'strict-origin-when-cross-origin'
 });
 res.end(type==='application/json'?JSON.stringify(data):data);
}

async function getToken(){
 if(!CJ_API_KEY) throw Object.assign(new Error('CJ supplier account is not connected'),{status:503,code:'CJ_NOT_CONNECTED'});
 if(tokenCache.token && Date.now()<tokenCache.expires-3600000)return tokenCache.token;
 const r=await fetch(`${CJ_ROOT}/authentication/getAccessToken`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:CJ_API_KEY})});
 const j=await r.json();
 if(!r.ok||!j?.result||!j?.data?.accessToken)throw Object.assign(new Error(j?.message||'CJ authentication failed'),{status:502,code:'CJ_AUTH_FAILED'});
 tokenCache={token:j.data.accessToken,expires:Date.parse(j.data.accessTokenExpiryDate)||Date.now()+150*86400000};
 return tokenCache.token;
}

async function cjGet(path,params={}){
 const token=await getToken();
 const u=new URL(`${CJ_ROOT}${path}`);
 for(const [k,v] of Object.entries(params)){
  if(v===undefined||v===null||v==='')continue;
  if(Array.isArray(v))v.forEach(x=>u.searchParams.append(k,x)); else u.searchParams.set(k,String(v));
 }
 const r=await fetch(u,{headers:{'CJ-Access-Token':token}});
 const j=await r.json();
 if(!r.ok||j?.result===false||j?.success===false)throw Object.assign(new Error(j?.message||'CJ request failed'),{status:r.status||502,code:'CJ_API_ERROR'});
 return j.data;
}

function mapProduct(p){
 const cost=Number(p.discountPrice||p.nowPrice||p.sellPrice||0);
 return {
  id:p.id,
  sku:p.sku||p.spu||'',
  title:p.nameEn||'Untitled product',
  image:p.bigImage||'',
  category:p.oneCategoryName||p.twoCategoryName||p.threeCategoryName||'Other',
  subcategory:p.threeCategoryName||p.twoCategoryName||'',
  categoryId:p.categoryId||'',
  supplier:p.supplierName||'CJdropshipping',
  supplierCost:cost,
  price:retail(cost),
  stock:Number(p.totalVerifiedInventory||p.warehouseInventoryNum||0),
  verifiedStock:Number(p.totalVerifiedInventory||0),
  deliveryCycle:p.deliveryCycle||'',
  description:cleanHtml(p.description),
  freeShipping:Number(p.addMarkStatus||0)===1,
  real:true
 };
}

async function realCategories(){
 if(categoryCache.items.length&&Date.now()<categoryCache.expires)return categoryCache.items;
 const data=await cjGet('/product/getCategory');
 const out=[];
 for(const first of Array.isArray(data)?data:[]){
  for(const second of first.categoryFirstList||[]){
   for(const third of second.categorySecondList||[]){
    const name=`${first.categoryFirstName||''} ${second.categorySecondName||''} ${third.categoryName||''}`;
    if(!blocked.test(name))out.push({id:third.categoryId,name:third.categoryName,group:first.categoryFirstName,section:second.categorySecondName});
   }
  }
 }
 categoryCache={items:out,expires:Date.now()+6*3600000};
 return out;
}

async function listProducts(u){
 const page=Math.max(1,Math.min(1000,Number(u.searchParams.get('page')||1)));
 const size=Math.max(1,Math.min(48,Number(u.searchParams.get('limit')||24)));
 const q=u.searchParams.get('q')||'';
 const categoryId=u.searchParams.get('categoryId')||'';
 const sort=u.searchParams.get('sort')||'featured';
 const params={page,size,keyWord:q,categoryId,features:['enable_category','enable_description'],verifiedWarehouse:1,startWarehouseInventory:1};
 if(sort==='price_asc'){params.orderBy=2;params.sort='asc'}
 if(sort==='price_desc'){params.orderBy=2;params.sort='desc'}
 if(sort==='new'){params.orderBy=3;params.sort='desc'}
 if(sort==='stock'){params.orderBy=4;params.sort='desc'}
 const data=await cjGet('/product/listV2',params);
 const raw=(data?.content||[]).flatMap(x=>x.productList||[]);
 const items=raw.filter(safeProduct).map(mapProduct).filter(x=>x.id&&x.image&&x.price&&x.stock>0);
 return {items,total:Number(data?.totalRecords||items.length),page:Number(data?.pageNumber||page),pages:Number(data?.totalPages||1),source:'CJdropshipping',real:true};
}

async function detail(id){
 const data=await cjGet('/product/query',{pid:id});
 const p=data?.productInfo||data;
 if(!p)return null;
 const normalized={
  id:p.pid||p.id||id,
  sku:p.productSku||p.sku||'',
  nameEn:p.productNameEn||p.nameEn||'Product',
  bigImage:p.productImage||p.bigImage||'',
  sellPrice:p.sellPrice,
  nowPrice:p.nowPrice,
  discountPrice:p.discountPrice,
  categoryId:p.categoryId,
  oneCategoryName:p.categoryName?.split('/')?.[0]?.trim()||p.oneCategoryName,
  twoCategoryName:p.twoCategoryName,
  threeCategoryName:p.threeCategoryName,
  description:p.description||p.productDescription||'',
  warehouseInventoryNum:p.warehouseInventoryNum,
  totalVerifiedInventory:p.totalVerifiedInventory,
  supplierName:p.supplierName,
  deliveryCycle:p.deliveryCycle,
  addMarkStatus:p.addMarkStatus
 };
 if(!safeProduct(normalized))return null;
 return mapProduct(normalized);
}

const index=await readFile(new URL('./public/index.html',import.meta.url),'utf8');

const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,BASE);
  if(u.pathname==='/')return send(res,200,index,'text/html; charset=utf-8');
  if(u.pathname==='/api/health'){
   if(!CJ_API_KEY)return send(res,200,{ok:true,supplierConnected:false,catalog:'offline',realOnly:true,payments:false});
   try{await getToken();return send(res,200,{ok:true,supplierConnected:true,catalog:'CJdropshipping',realOnly:true,payments:Boolean(process.env.STRIPE_SECRET_KEY)});}catch(e){return send(res,200,{ok:true,supplierConnected:false,catalog:'authorization_error',realOnly:true,payments:false,message:e.message});}
  }
  if(u.pathname==='/api/categories'){
   const rows=await realCategories();
   const groups=new Map();
   for(const x of rows){if(!groups.has(x.group))groups.set(x.group,{category:x.group,count:0,ids:[]});const g=groups.get(x.group);g.count++;g.ids.push(x.id)}
   return send(res,200,[...groups.values()]);
  }
  if(u.pathname==='/api/products')return send(res,200,await listProducts(u));
  if(u.pathname.startsWith('/api/product/')){
   const p=await detail(decodeURIComponent(u.pathname.split('/').pop()));
   return p?send(res,200,p):send(res,404,{error:'Product not found'});
  }
  if(u.pathname==='/api/checkout'&&req.method==='POST'){
   if(!process.env.STRIPE_SECRET_KEY)return send(res,503,{error:'Payments are not connected yet.'});
   return send(res,503,{error:'Checkout will be enabled only after the supplier feed and fulfillment verification pass.'});
  }
  return send(res,404,{error:'Not found'});
 }catch(e){
  const status=e.status||500;
  send(res,status,{error:e.message||'Server error',code:e.code||'SERVER_ERROR'});
 }
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Tyrve real-supplier backend online on ${PORT}; CJ connected=${Boolean(CJ_API_KEY)}`));