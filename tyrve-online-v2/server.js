import http from 'node:http';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT=Number(process.env.PORT||10000);
const BASE=process.env.BASE_URL||`http://localhost:${PORT}`;
const ALI_MCP_URL=process.env.ALIEXPRESS_MCP_URL||'https://tyrve-aliexpress-reader.onrender.com/mcp';
const STRIPE_SECRET_KEY=process.env.STRIPE_SECRET_KEY||'';

const CATEGORIES=[
 {id:'phone',name:'Phone Accessories',query:'phone accessories'},
 {id:'computer',name:'Computer Accessories',query:'computer accessories'},
 {id:'home',name:'Home & Living',query:'home organization gadgets'},
 {id:'lighting',name:'Lighting',query:'led home lighting'},
 {id:'office',name:'Office & Desk',query:'office desk accessories'},
 {id:'travel',name:'Travel Accessories',query:'travel accessories organizer'},
 {id:'pet',name:'Pet Supplies',query:'pet accessories'},
 {id:'fitness',name:'Fitness Accessories',query:'fitness accessories'},
 {id:'car',name:'Car Accessories',query:'car interior accessories'},
 {id:'storage',name:'Storage & Organization',query:'storage organization'},
 {id:'kitchen',name:'Kitchen Accessories',query:'kitchen accessories'},
 {id:'smart',name:'Smart Home',query:'smart home accessories'}
];

const blocked=/\b(gun|firearm|rifle|pistol|revolver|ammo|ammunition|bullet|silencer|suppressor|knife|switchblade|dagger|sword|machete|taser|stun gun|pepper spray|mace|brass knuckle|firework|explosive|detonator|poison|toxin|pesticide|vape|vaping|cigarette|cigar|nicotine|tobacco|cbd|thc|marijuana|cannabis|weed|mushroom|psychedelic|alcohol|liquor|wine|beer|vodka|whiskey|steroid|hormone|dnp|diet pill|laxative|porn|adult toy|sex toy|bdsm|casino|gambling|betting|lottery)\b/i;
const brandRisk=/\b(apple|iphone|airpods|samsung|sony|nintendo|playstation|xbox|nike|adidas|puma|gucci|prada|chanel|hermes|louis vuitton|lv|dyson|lego|disney|marvel|pokemon|xiaomi|huawei)\b/i;
const safeQuery=q=>!blocked.test(String(q||''))&&!brandRisk.test(String(q||''));
const safeProduct=p=>safeQuery(`${p?.title||''} ${p?.name||''} ${typeof p?.store==='string'?p.store:(p?.store?.name||'')} ${p?.category||''}`);

const searchCache=new Map();
const detailCache=new Map();
function cacheGet(map,key){const x=map.get(key);if(!x||x.exp<Date.now()){map.delete(key);return null}return x.value}
function cacheSet(map,key,value,ttl){map.set(key,{value,exp:Date.now()+ttl});return value}

let mcpClient=null;
let mcpConnecting=null;
async function getMcp(){
 if(mcpClient)return mcpClient;
 if(mcpConnecting)return mcpConnecting;
 mcpConnecting=(async()=>{
  const client=new Client({name:'tyrve-commerce',version:'2.1.0'},{capabilities:{}});
  const transport=new StreamableHTTPClientTransport(new URL(ALI_MCP_URL));
  await client.connect(transport);
  const tools=await client.listTools();
  const names=(tools.tools||[]).map(x=>x.name);
  if(!names.includes('search_aliexpress')||!names.includes('get_aliexpress_product'))throw new Error('AliExpress reader tools are unavailable');
  mcpClient=client;
  return client;
 })();
 try{return await mcpConnecting}finally{mcpConnecting=null}
}
function parseToolResult(r){
 if(r?.isError)throw new Error((r?.content||[]).map(x=>x?.text||'').join(' ')||'AliExpress reader returned an error');
 if(r?.structuredContent&&typeof r.structuredContent==='object')return r.structuredContent;
 const text=(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
 if(!text)return {};
 try{return JSON.parse(text)}catch{return {text}}
}
async function callTool(name,args){
 try{
  const client=await getMcp();
  const r=await client.callTool({name,arguments:args});
  const out=parseToolResult(r);
  if(out?.error)throw new Error(out.error);
  return out;
 }catch(e){
  mcpClient=null;
  throw Object.assign(new Error(`AliExpress connection failed: ${e.message}`),{status:503,code:'ALIEXPRESS_UNAVAILABLE'});
 }
}

function parseNumbers(v){
 if(v===null||v===undefined)return [];
 if(typeof v==='number')return Number.isFinite(v)?[v]:[];
 if(typeof v==='string')return (v.replace(/,/g,'').match(/\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite);
 if(Array.isArray(v))return v.flatMap(parseNumbers);
 if(typeof v==='object')return Object.values(v).flatMap(parseNumbers);
 return [];
}
function firstPositive(v){return parseNumbers(v).find(n=>Number.isFinite(n)&&n>0&&n<100000)||null}
function pickCost(raw){
 const preferred=[raw?.sale_price,raw?.salePrice,raw?.price?.sale_price,raw?.price?.salePrice,raw?.selected_price,raw?.selectedPrice,raw?.price,raw?.sku_price,raw?.skuPrice];
 for(const v of preferred){const n=firstPositive(v);if(n)return n}
 const variants=raw?.variants_pricing||raw?.variantsPricing||[];
 for(const v of variants){const n=firstPositive(v?.sale_price||v?.salePrice);if(n)return n}
 return null;
}
function pickStock(raw){
 for(const key of ['stock','inventory','quantity','available_quantity','availableQuantity']){
  const v=raw?.[key];
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='string'&&/^\d+$/.test(v.trim()))return Number(v);
 }
 return null;
}
function pickShippingCost(raw){
 const s=raw?.shipping;
 if(!s)return null;
 if(typeof s==='string'&&/free/i.test(s))return 0;
 if(typeof s==='object'){
  for(const key of ['amount','displayAmount','shippingFee','fee','cost']){
   if(s[key]!==undefined){
    if(typeof s[key]==='string'&&/free/i.test(s[key]))return 0;
    const n=firstPositive(s[key]);if(n!==null)return n;
   }
  }
 }
 const vals=[];
 const walk=(obj,depth=0)=>{
  if(depth>4||obj===null||obj===undefined)return;
  if(typeof obj==='object'&&!Array.isArray(obj)){
   for(const [k,v] of Object.entries(obj)){
    if(/fee|cost|price|amount/i.test(k))vals.push(...parseNumbers(v));
    else if(typeof v==='object')walk(v,depth+1);
   }
  }else if(Array.isArray(obj))obj.forEach(v=>walk(v,depth+1));
 };
 walk(s);
 const clean=vals.filter(n=>n>=0&&n<500);
 return clean.length?Math.min(...clean):null;
}
function retail(cost,ship=null){
 if(!Number.isFinite(cost)||cost<=0)return null;
 const landed=cost+(Number.isFinite(ship)?ship:6);
 const raw=Math.max(landed*1.65,landed+8);
 return Number((Math.ceil(raw)-0.01).toFixed(2));
}
function cleanText(s,max=1200){
 if(s&&typeof s==='object'){
  try{s=Object.entries(s).slice(0,30).map(([k,v])=>`${k}: ${typeof v==='string'?v:JSON.stringify(v)}`).join(' · ')}catch{s=''}
 }
 return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function safeUrl(s){try{const u=new URL(String(s||''));return /^https?:$/.test(u.protocol)?u.toString():''}catch{return ''}}
function normalizeSearch(raw,category='AliExpress'){
 const cost=pickCost(raw);
 const image=safeUrl(raw?.image||raw?.image_url||raw?.imageUrl||raw?.main_image||raw?.mainImage);
 const id=String(raw?.id||raw?.product_id||raw?.productId||'');
 const url=safeUrl(raw?.url||raw?.product_url||raw?.productUrl||`https://www.aliexpress.com/item/${id}.html`);
 return {
  id,title:cleanText(raw?.title||raw?.name,220),image,url,category,
  supplier:'AliExpress',supplierCost:cost,price:retail(cost),
  rating:Number(raw?.rating||0)||null,orders:raw?.orders||raw?.orders_sold||raw?.ordersSold||null,
  currency:String(raw?.currency||'USD'),stock:null,real:true,verified:false
 };
}
function normalizeDetail(raw){
 const cost=pickCost(raw);
 const ship=pickShippingCost(raw);
 const images=(raw?.images||raw?.image_urls||raw?.imageUrls||[]).map(safeUrl).filter(Boolean);
 const image=safeUrl(raw?.image||raw?.image_url||raw?.main_image)||images[0]||'';
 const id=String(raw?.id||raw?.product_id||raw?.productId||'');
 const stock=pickStock(raw);
 const partial=Boolean(raw?.partial);
 const storeName=typeof raw?.store==='string'?raw.store:(raw?.store?.name||raw?.store_name||'');
 const p={
  id,title:cleanText(raw?.title||raw?.name,260),image,images,
  url:safeUrl(raw?.url||raw?.product_url||`https://www.aliexpress.com/item/${id}.html`),
  category:cleanText(raw?.category_path||'AliExpress',120),supplier:'AliExpress',supplierCost:cost,shippingCost:ship,
  price:retail(cost,ship),stock,rating:Number(raw?.rating||0)||null,reviews:raw?.review_count||raw?.reviews||null,
  orders:raw?.orders||null,store:cleanText(storeName,120),description:cleanText(raw?.description||raw?.specs||'',1600),
  specs:raw?.specs||{},variants:raw?.sku_options||raw?.variants||[],shipping:raw?.shipping||null,
  partial,real:true,verified:!partial
 };
 p.available=Boolean(p.id&&p.title&&p.image&&p.price&&p.url&&!partial&&(stock===null||stock>0)&&safeProduct(p));
 return p;
}

async function searchAli(query,page=1,sort='orders',category='AliExpress'){
 if(!safeQuery(query))throw Object.assign(new Error('That search is not available on Tyrve.'),{status:400,code:'BLOCKED_SEARCH'});
 const key=JSON.stringify({query,page,sort});
 const cached=cacheGet(searchCache,key);if(cached)return cached;
 const raw=await callTool('search_aliexpress',{query,page,sort,limit:48});
 const rows=Array.isArray(raw?.items)?raw.items:[];
 const items=rows.map(x=>normalizeSearch(x,category)).filter(x=>x.id&&x.title&&x.image&&x.url&&x.price&&safeProduct(x));
 if(!items.length&&rows.length)throw Object.assign(new Error('AliExpress returned listings but none passed Tyrve availability and safety checks.'),{status:503,code:'NO_ELIGIBLE_PRODUCTS'});
 return cacheSet(searchCache,key,{items,total:Number(raw?.total||items.length),page:Number(raw?.page||page),returned:items.length,source:'AliExpress',real:true},10*60*1000);
}
async function getAliDetail(id){
 const key=String(id);
 const cached=cacheGet(detailCache,key);if(cached)return cached;
 const raw=await callTool('get_aliexpress_product',{product:key});
 const p=normalizeDetail(raw);
 if(!p.id||!safeProduct(p))throw Object.assign(new Error('Product is not available'),{status:404,code:'PRODUCT_UNAVAILABLE'});
 return cacheSet(detailCache,key,p,20*60*1000);
}

function send(res,code,data,type='application/json'){
 res.writeHead(code,{
  'content-type':type,
  'cache-control':type.startsWith('text/html')?'no-cache':'no-store',
  'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin',
  'content-security-policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com"
 });
 res.end(type==='application/json'?JSON.stringify(data):data);
}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>300000){reject(new Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}

async function createCheckout(items){
 if(!STRIPE_SECRET_KEY)throw Object.assign(new Error('Secure payment connection still needs to be activated on the server.'),{status:503,code:'PAYMENTS_NOT_CONNECTED'});
 if(!Array.isArray(items)||!items.length||items.length>8)throw Object.assign(new Error('Your bag must contain 1–8 products.'),{status:400});
 const verified=[];
 for(const row of items){
  const qty=Math.max(1,Math.min(5,Number(row.qty)||1));
  const p=await getAliDetail(row.id);
  if(!p.available)throw Object.assign(new Error(`${p.title||'A product'} cannot be verified for sale right now.`),{status:409});
  verified.push({p,qty});
 }
 const form=new URLSearchParams();
 form.set('mode','payment');
 form.set('success_url',`${BASE}/?paid=1&session_id={CHECKOUT_SESSION_ID}`);
 form.set('cancel_url',`${BASE}/?checkout=cancelled`);
 form.set('customer_creation','always');
 form.set('billing_address_collection','auto');
 form.set('phone_number_collection[enabled]','true');
 form.set('shipping_address_collection[allowed_countries][0]','US');
 form.set('metadata[supplier]','AliExpress');
 form.set('metadata[fulfillment_mode]','manual_verified');
 verified.forEach(({p,qty},i)=>{
  const cents=Math.round(p.price*100);
  form.set(`line_items[${i}][price_data][currency]`,'usd');
  form.set(`line_items[${i}][price_data][unit_amount]`,String(cents));
  form.set(`line_items[${i}][price_data][product_data][name]`,p.title.slice(0,120));
  if(p.image)form.set(`line_items[${i}][price_data][product_data][images][0]`,p.image);
  form.set(`line_items[${i}][price_data][product_data][metadata][aliexpress_id]`,p.id);
  form.set(`line_items[${i}][quantity]`,String(qty));
  form.set(`metadata[item_${i}]`,`${p.id}|${qty}|${p.url}`.slice(0,500));
  form.set(`payment_intent_data[metadata][item_${i}]`,`${p.id}|${qty}`);
 });
 const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':crypto.randomUUID()},body:form});
 const j=await r.json();
 if(!r.ok||!j?.url)throw Object.assign(new Error(j?.error?.message||'Stripe checkout could not be created'),{status:502,code:'STRIPE_ERROR'});
 return {url:j.url,id:j.id};
}

const index=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
let healthCache={value:null,exp:0};
async function health(){
 if(healthCache.value&&healthCache.exp>Date.now())return healthCache.value;
 let supplierConnected=false,message='',sampleId='';
 try{
  const sample=await searchAli('usb c cable',1,'orders','Phone Accessories');
  supplierConnected=sample.items.length>0;
  sampleId=sample.items[0]?.id||'';
  if(!supplierConnected)message='AliExpress search returned no eligible products';
 }catch(e){message=e.message}
 const value={ok:true,supplierConnected,catalog:supplierConnected?'AliExpress':'offline',realOnly:true,payments:Boolean(STRIPE_SECRET_KEY),market:'US',currency:'USD',sampleId,message};
 healthCache={value,exp:Date.now()+5*60*1000};return value;
}

const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,BASE);
  if(u.pathname==='/')return send(res,200,index,'text/html; charset=utf-8');
  if(u.pathname==='/api/health')return send(res,200,await health());
  if(u.pathname==='/api/categories')return send(res,200,CATEGORIES);
  if(u.pathname==='/api/products'){
   const page=Math.max(1,Math.min(100,Number(u.searchParams.get('page')||1)));
   const categoryId=u.searchParams.get('category')||'';
   const category=CATEGORIES.find(x=>x.id===categoryId);
   const q=(u.searchParams.get('q')||'').trim();
   const query=q||(category?.query||'useful home gadgets');
   const sortMap={featured:'orders',orders:'orders',new:'newest',price_asc:'price_asc',price_desc:'price_desc'};
   return send(res,200,await searchAli(query,page,sortMap[u.searchParams.get('sort')]||'orders',category?.name||'AliExpress'));
  }
  if(u.pathname.startsWith('/api/product/'))return send(res,200,await getAliDetail(decodeURIComponent(u.pathname.split('/').pop())));
  if(u.pathname==='/api/checkout'&&req.method==='POST'){
   const body=await readBody(req);
   return send(res,200,await createCheckout(body.items));
  }
  if(u.pathname==='/api/policy/shipping')return send(res,200,{title:'Shipping & Delivery',body:'Tyrve currently launches to United States delivery addresses. Products are sourced after purchase from verified AliExpress listings. Delivery timing varies by item and destination. Tracking is provided when the supplier makes it available.'});
  if(u.pathname==='/api/policy/returns')return send(res,200,{title:'Returns & Refunds',body:'If an item arrives damaged, materially different from the listing, or does not arrive, contact Tyrve support using the order details on your payment receipt. Eligible refunds are returned to the original payment method after review.'});
  if(u.pathname==='/api/policy/privacy')return send(res,200,{title:'Privacy',body:'Tyrve collects only information needed to process orders and provide support. Payment data is handled by Stripe Checkout. Shipping details are used for order fulfillment. Tyrve does not sell customer personal data.'});
  if(u.pathname==='/api/policy/terms')return send(res,200,{title:'Terms',body:'Product availability and supplier pricing are re-verified before checkout. Orders may be canceled and refunded if a supplier listing becomes unavailable before fulfillment. Tyrve may refuse restricted or high-risk merchandise.'});
  return send(res,404,{error:'Not found'});
 }catch(e){send(res,e.status||500,{error:e.message||'Server error',code:e.code||'SERVER_ERROR'});}
});

server.listen(PORT,'0.0.0.0',()=>{
 console.log(`Tyrve AliExpress commerce online on ${PORT}; payments=${Boolean(STRIPE_SECRET_KEY)}`);
 setTimeout(async()=>{
  try{
   const h=await health();
   let detail=null;
   if(h.sampleId){try{detail=await getAliDetail(h.sampleId)}catch(e){console.error(`TYRVE_DETAIL_SELFTEST_FAILED ${e.message}`)}}
   console.log(`TYRVE_SELFTEST supplier=${h.supplierConnected} payments=${h.payments} sample=${h.sampleId||'none'} detail=${Boolean(detail?.id)} sellable=${Boolean(detail?.available)} title=${(detail?.title||'').slice(0,80)}`);
  }catch(e){console.error(`TYRVE_SELFTEST_FAILED ${e.message}`)}
 },2500);
});
