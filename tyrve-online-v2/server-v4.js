import http from 'node:http';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {officialConfigured,officialProduct,officialFeed,officialFreight,officialPlaceOrder} from './aliexpress-official.js';

const PORT=Number(process.env.PORT||10000);
const BASE=process.env.BASE_URL||`http://localhost:${PORT}`;
const ALI_MCP_URL=process.env.ALIEXPRESS_MCP_URL||'https://tyrve-aliexpress-reader.onrender.com/mcp';
const ALI_ORIGIN=new URL(ALI_MCP_URL).origin;
const STRIPE_SECRET_KEY=process.env.STRIPE_SECRET_KEY||'';
const STRIPE_WEBHOOK_SECRET=process.env.STRIPE_WEBHOOK_SECRET||'';

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
const brandRisk=/\b(apple|iphone|airpods|samsung|sony|nintendo|playstation|xbox|nike|adidas|puma|gucci|prada|chanel|hermes|louis vuitton|\blv\b|dyson|lego|disney|marvel|pokemon|xiaomi|huawei)\b/i;
const safeQuery=q=>!blocked.test(String(q||''))&&!brandRisk.test(String(q||''));
const safeProduct=p=>safeQuery(`${p?.title||''} ${typeof p?.store==='string'?p.store:(p?.store?.name||'')} ${p?.category||''}`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const searchCache=new Map(),detailCache=new Map();
const fulfillmentLocks=new Set();
function cacheGet(map,key){const x=map.get(key);if(!x||x.exp<Date.now()){map.delete(key);return null}return x.value}
function cacheSet(map,key,value,ttl){map.set(key,{value,exp:Date.now()+ttl});return value}
function cleanText(s,max=1200){if(s&&typeof s==='object'){try{s=Object.entries(s).slice(0,30).map(([k,v])=>`${k}: ${typeof v==='string'?v:JSON.stringify(v)}`).join(' · ')}catch{s=''}}return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function safeUrl(s){try{const u=new URL(String(s||''));return /^https?:$/.test(u.protocol)?u.toString():''}catch{return ''}}
function numbers(v){if(v==null)return[];if(typeof v==='number')return Number.isFinite(v)?[v]:[];if(typeof v==='string')return (v.replace(/,/g,'').match(/\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite);if(Array.isArray(v))return v.flatMap(numbers);if(typeof v==='object')return Object.values(v).flatMap(numbers);return[]}
function firstPositive(v){return numbers(v).find(n=>n>0&&n<100000)||null}
function retail(cost,ship=null){if(!Number.isFinite(cost)||cost<=0)return null;const landed=cost+(Number.isFinite(ship)?ship:6);return Number((Math.ceil(Math.max(landed*1.65,landed+8))-0.01).toFixed(2))}
function safePublicError(e){const code=String(e?.code||'');if(code==='BLOCKED_SEARCH')return 'That search is not available on Tyrve.';if(code.startsWith('ALIEXPRESS_OFFICIAL'))return 'This product is temporarily unavailable for verification.';if(e?.status===404)return 'This product is no longer available.';return 'The live AliExpress catalog is refreshing. Please try again in a moment.'}

let fallbackCatalog={generatedAt:null,items:[]};
try{fallbackCatalog=JSON.parse(await readFile(new URL('./fallback-catalog.json',import.meta.url),'utf8'))}catch{}
function fallbackSearch(query='',category='AliExpress',page=1){
 const q=String(query||'').toLowerCase().trim();let items=(fallbackCatalog.items||[]).filter(safeProduct);
 if(q)items=items.filter(x=>`${x.title||''} ${x.category||''}`.toLowerCase().includes(q.split(' ')[0]||q));
 if(category&&category!=='AliExpress')items=items.filter(x=>String(x.category||'').toLowerCase().includes(category.toLowerCase().split(' ')[0]));
 const pageSize=48,start=(page-1)*pageSize,paged=items.slice(start,start+pageSize);
 return {items:paged,total:items.length,page,pages:Math.max(1,Math.ceil(items.length/pageSize)),returned:paged.length,source:'AliExpress verified snapshot',real:true,official:false,stale:true,snapshotAt:fallbackCatalog.generatedAt||null};
}

let mcpClient=null,mcpConnecting=null,readerReady=false,readerLastOk=0;
async function warmReader({attempts=5}={}){
 for(let i=0;i<attempts;i++){
  try{
   const r=await fetch(`${ALI_ORIGIN}/`,{headers:{'user-agent':'TyrveCatalog/4.0'},signal:AbortSignal.timeout(12000),redirect:'manual'});
   if(r.status<500){readerReady=true;readerLastOk=Date.now();return true}
  }catch{}
  if(i<attempts-1)await sleep(2500*(i+1));
 }
 readerReady=false;return false;
}
async function connectMcp(){
 const c=new Client({name:'tyrve-commerce',version:'4.0.0'},{capabilities:{}});
 await c.connect(new StreamableHTTPClientTransport(new URL(ALI_MCP_URL)));
 const tools=await c.listTools();const names=(tools.tools||[]).map(x=>x.name);
 if(!names.includes('search_aliexpress')||!names.includes('get_aliexpress_product'))throw new Error('AliExpress reader tools unavailable');
 mcpClient=c;readerReady=true;readerLastOk=Date.now();return c;
}
async function getMcp(){
 if(mcpClient)return mcpClient;if(mcpConnecting)return mcpConnecting;
 mcpConnecting=(async()=>{
  let last;
  for(let i=0;i<4;i++){
   try{if(i===0||!readerReady)await warmReader({attempts:i===0?3:1});return await connectMcp()}catch(e){last=e;mcpClient=null;readerReady=false;if(i<3)await sleep(3000*(i+1))}
  }
  throw last||new Error('AliExpress reader unavailable');
 })();
 try{return await mcpConnecting}finally{mcpConnecting=null}
}
function parseTool(r){if(r?.isError)throw new Error((r?.content||[]).map(x=>x?.text||'').join(' ')||'AliExpress reader error');if(r?.structuredContent&&typeof r.structuredContent==='object')return r.structuredContent;const t=(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();if(!t)return{};try{return JSON.parse(t)}catch{return{text:t}}}
async function callTool(name,args){
 let last;
 for(let attempt=0;attempt<2;attempt++){
  try{const c=await getMcp();const out=parseTool(await c.callTool({name,arguments:args}));if(out?.error)throw new Error(out.error);readerReady=true;readerLastOk=Date.now();return out}
  catch(e){last=e;mcpClient=null;readerReady=false;if(attempt===0){await warmReader({attempts:2});await sleep(1500)}}
 }
 console.error(`ALI_READER_FAILED tool=${name} ${String(last?.message||last).slice(0,240)}`);
 throw Object.assign(new Error('Live catalog unavailable'),{status:503,code:'ALIEXPRESS_UNAVAILABLE'});
}

function normalizeSearch(raw,category='AliExpress'){
 const cost=firstPositive(raw?.price??raw?.sale_price??raw?.supplierPrice),id=String(raw?.id||raw?.product_id||raw?.productId||'');
 return {id,title:cleanText(raw?.title||raw?.name,220),image:safeUrl(raw?.image||raw?.image_url||raw?.imageUrl),url:safeUrl(raw?.url||raw?.product_url||`https://www.aliexpress.com/item/${id}.html`),category,supplier:'AliExpress',supplierCost:cost,price:retail(cost),rating:Number(raw?.rating||0)||null,orders:raw?.orders||raw?.orders_sold||null,currency:String(raw?.currency||'USD'),stock:null,real:true,verified:false,official:Boolean(raw?.official)};
}
function normalizeReaderDetail(raw){
 const cost=firstPositive(raw?.sale_price??raw?.price?.sale_price??raw?.price),images=(raw?.images||[]).map(safeUrl).filter(Boolean),id=String(raw?.id||raw?.product_id||raw?.productId||'');
 const storeName=typeof raw?.store==='string'?raw.store:(raw?.store?.name||'');
 return {id,title:cleanText(raw?.title||raw?.name,260),image:safeUrl(raw?.image)||images[0]||'',images,url:safeUrl(raw?.url||raw?.product_url||`https://www.aliexpress.com/item/${id}.html`),category:cleanText(raw?.category_path||'AliExpress',120),supplier:'AliExpress',supplierCost:cost,shippingCost:null,price:retail(cost),stock:Number.isFinite(Number(raw?.stock))?Number(raw.stock):null,rating:Number(raw?.rating||0)||null,reviews:raw?.review_count||raw?.reviews||null,orders:raw?.orders||null,store:cleanText(storeName,120),description:cleanText(raw?.description||raw?.specs||'',1600),specs:raw?.specs||{},skus:[],shipping:raw?.shipping||null,partial:Boolean(raw?.partial),real:true,verified:false,official:false,available:false};
}
function normalizeOfficialDetail(o){
 const active=(o.skus||[]).filter(s=>s.active&&s.supplierPrice>0&&s.stock>0),minCost=active.length?Math.min(...active.map(s=>s.supplierPrice)):null,images=(o.images||[]).map(safeUrl).filter(Boolean);
 const p={id:String(o.id),title:cleanText(o.title,260),image:images[0]||'',images,url:safeUrl(o.url),category:'AliExpress',supplier:'AliExpress',supplierCost:minCost,shippingCost:null,price:retail(minCost),stock:active.reduce((n,s)=>n+s.stock,0),rating:o.rating,reviews:o.reviews,orders:null,store:cleanText(o.store?.name||'',120),description:cleanText(o.description||o.properties||'',1600),specs:o.properties||{},shipping:o.deliveryDays?{estimated_delivery_days:o.deliveryDays}:null,partial:false,real:true,verified:true,official:true,deliveryDays:o.deliveryDays,skus:active.map(s=>({id:s.id,skuAttr:s.id,stock:s.stock,supplierPrice:s.supplierPrice,price:retail(s.supplierPrice),image:safeUrl(s.image)||images[0]||'',label:(s.properties||[]).map(x=>`${x.name}: ${x.value}`).join(' / ')||'Standard'}))};
 p.available=Boolean(p.id&&p.title&&p.image&&p.url&&safeProduct(p)&&p.skus.length);return p;
}
async function searchAli(query,page=1,sort='orders',category='AliExpress'){
 if(!safeQuery(query))throw Object.assign(new Error('Blocked search'),{status:400,code:'BLOCKED_SEARCH'});
 const key=JSON.stringify({query,page,sort}),hit=cacheGet(searchCache,key);if(hit)return hit;
 try{
  const raw=await callTool('search_aliexpress',{query,page,sort,limit:48});const rows=Array.isArray(raw?.items)?raw.items:[];
  const items=rows.map(x=>normalizeSearch(x,category)).filter(x=>x.id&&x.title&&x.image&&x.url&&x.price&&safeProduct(x));
  if(!items.length)throw new Error('No live items returned');
  return cacheSet(searchCache,key,{items,total:Number(raw?.total||items.length),page:Number(raw?.page||page),pages:Math.max(1,Math.ceil(Number(raw?.total||items.length)/48)),returned:items.length,source:'AliExpress live search',real:true,official:false,stale:false},20*60*1000);
 }catch(e){
  const snap=fallbackSearch(query,category,page);if(snap.items.length)return snap;throw e;
 }
}
async function browseOfficial(page=1,sort='featured'){
 const map={featured:'volumeDesc',orders:'volumeDesc',new:'volumeDesc',price_asc:'priceAsc',price_desc:'priceDesc'},raw=await officialFeed({page,sort:map[sort]||'volumeDesc'});const items=raw.items.map(x=>normalizeSearch({id:x.id,title:x.title,image:x.image,url:x.url,price:x.supplierPrice,currency:x.currency,orders:x.volume,official:true},x.category)).filter(x=>safeProduct(x));return {items,total:raw.total,page:raw.page,pages:raw.pages,returned:items.length,source:'AliExpress official Dropshipper feed',real:true,official:true,stale:false};
}
async function getAliDetail(id){
 const key=String(id),hit=cacheGet(detailCache,key);if(hit)return hit;let p;
 if(officialConfigured()){try{p=normalizeOfficialDetail(await officialProduct(key))}catch(e){throw Object.assign(new Error('Official verification failed'),{status:503,code:'ALIEXPRESS_OFFICIAL_VERIFY_FAILED'})}}
 else{try{p=normalizeReaderDetail(await callTool('get_aliexpress_product',{product:key}))}catch{const snap=(fallbackCatalog.items||[]).find(x=>String(x.id)===key);if(snap)p={...snap,images:[snap.image].filter(Boolean),skus:[],verified:false,official:false,available:false,partial:true,description:'Live supplier verification is refreshing.'};else throw Object.assign(new Error('Product temporarily unavailable'),{status:503})}}
 if(!p.id||!safeProduct(p))throw Object.assign(new Error('Product unavailable'),{status:404});return cacheSet(detailCache,key,p,5*60*1000);
}

function send(res,code,data,type='application/json'){res.writeHead(code,{'content-type':type,'cache-control':type.startsWith('text/html')?'no-cache':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com"});res.end(type==='application/json'?JSON.stringify(data):data)}
function readRaw(req,limit=500000){return new Promise((resolve,reject)=>{const a=[];let n=0;req.on('data',c=>{n+=c.length;if(n>limit){reject(new Error('Request too large'));req.destroy();return}a.push(c)});req.on('end',()=>resolve(Buffer.concat(a)));req.on('error',reject)})}
async function readJson(req){const b=await readRaw(req,300000);try{return b.length?JSON.parse(b.toString('utf8')):{}}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}}

async function stripeRequest(path,{method='GET',body=null}={}){if(!STRIPE_SECRET_KEY)throw Object.assign(new Error('Stripe server connection is not configured'),{status:503});const r=await fetch(`https://api.stripe.com${path}`,{method,headers:{authorization:`Bearer ${STRIPE_SECRET_KEY}`,...(body?{'content-type':'application/x-www-form-urlencoded'}:{})},body:body?new URLSearchParams(body):undefined,signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok)throw Object.assign(new Error(j?.error?.message||`Stripe HTTP ${r.status}`),{status:502});return j}
function verifyStripeSignature(raw,header){if(!STRIPE_WEBHOOK_SECRET||!header)return false;const parts=Object.fromEntries(String(header).split(',').map(x=>x.split('=',2))),t=parts.t,v1=String(header).split(',').filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));if(!t||!v1.length||Math.abs(Date.now()/1000-Number(t))>300)return false;const expected=crypto.createHmac('sha256',STRIPE_WEBHOOK_SECRET).update(`${t}.${raw.toString('utf8')}`).digest('hex');return v1.some(sig=>{try{return crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex'))}catch{return false}})}
async function stripeGetSession(id){return stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(id)}`)}
async function stripeUpdateMetadata(id,metadata){const body={};for(const [k,v] of Object.entries(metadata))body[`metadata[${k}]`]=String(v);return stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(id)}`,{method:'POST',body})}

async function checkoutLine(row){
 if(!officialConfigured())throw Object.assign(new Error('Official supplier verification is not connected.'),{status:503});const qty=Math.max(1,Math.min(5,Number(row.qty)||1)),p=normalizeOfficialDetail(await officialProduct(String(row.id)));if(!p.available)throw Object.assign(new Error(`${p.title||'A product'} is not available now.`),{status:409});let sku=p.skus.find(s=>String(s.id)===String(row.skuId||''));if(!sku&&p.skus.length===1)sku=p.skus[0];if(!sku)throw Object.assign(new Error(`Choose a product option for ${p.title}.`),{status:400});if(sku.stock<qty)throw Object.assign(new Error(`Not enough stock for ${p.title}.`),{status:409});let freightAmount=null,freightService='',eta='';try{const f=await officialFreight({productId:p.id,qty,price:sku.supplierPrice,country:'US'});if(f.length){const best=[...f].sort((a,b)=>a.amount-b.amount)[0];freightAmount=best.amount;freightService=best.service;eta=best.estimatedDelivery}}catch(e){console.error(`FREIGHT_LOOKUP_FAILED ${p.id} ${e.message}`)}return {p,sku,qty,price:retail(sku.supplierPrice,freightAmount),freightAmount,freightService,eta};
}
async function createCheckout(items){
 if(!STRIPE_SECRET_KEY)throw Object.assign(new Error('Secure checkout is temporarily unavailable.'),{status:503});if(!STRIPE_WEBHOOK_SECRET)throw Object.assign(new Error('Order processing is temporarily unavailable.'),{status:503});if(!Array.isArray(items)||!items.length||items.length>8)throw Object.assign(new Error('Your bag must contain 1–8 products.'),{status:400});const verified=[];for(const row of items)verified.push(await checkoutLine(row));const ref=`TYR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,form=new URLSearchParams();form.set('mode','payment');form.set('success_url',`${BASE}/?paid=1&session_id={CHECKOUT_SESSION_ID}`);form.set('cancel_url',`${BASE}/?checkout=cancelled`);form.set('client_reference_id',ref);form.set('customer_creation','always');form.set('billing_address_collection','auto');form.set('phone_number_collection[enabled]','true');form.set('shipping_address_collection[allowed_countries][0]','US');form.set('metadata[order_ref]',ref);form.set('metadata[supplier]','AliExpress');form.set('metadata[fulfillment_status]','awaiting_payment');verified.forEach(({p,sku,qty,price,freightAmount,freightService,eta},i)=>{form.set(`line_items[${i}][price_data][currency]`,'usd');form.set(`line_items[${i}][price_data][unit_amount]`,String(Math.round(price*100)));form.set(`line_items[${i}][price_data][product_data][name]`,p.title.slice(0,120));if(sku.image||p.image)form.set(`line_items[${i}][price_data][product_data][images][0]`,sku.image||p.image);form.set(`line_items[${i}][price_data][product_data][metadata][aliexpress_id]`,p.id);form.set(`line_items[${i}][price_data][product_data][metadata][sku_attr]`,sku.skuAttr||sku.id);form.set(`line_items[${i}][quantity]`,String(qty));form.set(`metadata[item_${i}]`,`${p.id}|${sku.skuAttr||sku.id}|${qty}`.slice(0,500));form.set(`metadata[ship_${i}]`,`${freightService}|${freightAmount??''}|${eta}`.slice(0,500))});const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':crypto.randomUUID()},body:form});const j=await r.json();if(!r.ok||!j?.url)throw Object.assign(new Error('Secure checkout could not be created.'),{status:502});return {url:j.url,id:j.id,reference:ref};
}
function parseFulfillmentItems(meta){const out=[];for(let i=0;i<8;i++){const raw=meta?.[`item_${i}`];if(!raw)continue;const [productId,skuAttr,qty]=String(raw).split('|');const [service]=String(meta?.[`ship_${i}`]||'').split('|');if(productId&&skuAttr&&Number(qty)>0)out.push({productId,skuAttr,qty:Number(qty),logisticsServiceName:service||''})}return out}
async function fulfillStripeSession(sessionId){if(fulfillmentLocks.has(sessionId))return {status:'processing'};fulfillmentLocks.add(sessionId);try{const session=await stripeGetSession(sessionId),meta=session.metadata||{};if(meta.fulfillment_status==='ordered')return {status:'ordered',orderIds:String(meta.aliexpress_order_ids||'').split(',').filter(Boolean)};if(meta.fulfillment_status==='processing')return {status:'processing'};if(session.payment_status!=='paid')return {status:'unpaid'};if(!officialConfigured())throw new Error('Official AliExpress authorization is missing');const ship=session.collected_information?.shipping_details||session.shipping_details,addr=ship?.address;if(!addr?.line1||!addr?.country)throw new Error('Paid session has no shipping address');const items=parseFulfillmentItems(meta);if(!items.length)throw new Error('Paid session has no fulfillment items');await stripeUpdateMetadata(sessionId,{fulfillment_status:'processing'});try{const order=await officialPlaceOrder({address:{line1:addr.line1,line2:addr.line2,city:addr.city,state:addr.state,postalCode:addr.postal_code,country:addr.country,name:ship?.name||session.customer_details?.name||'Customer',phone:session.customer_details?.phone||'',phoneCountry:addr.country==='US'?'+1':''},items});const ids=order.orderIds.join(',');await stripeUpdateMetadata(sessionId,{fulfillment_status:'ordered',aliexpress_order_ids:ids,fulfillment_error:''});return {status:'ordered',orderIds:order.orderIds}}catch(e){try{await stripeUpdateMetadata(sessionId,{fulfillment_status:'failed',fulfillment_error:String(e.message||e).slice(0,400)})}catch{}throw e}}finally{fulfillmentLocks.delete(sessionId)}}
async function handleStripeEvent(event){if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event?.type))return {ignored:true};const s=event?.data?.object;if(!s?.id)return {ignored:true};if(event.type==='checkout.session.completed'&&s.payment_status!=='paid')return {waiting:true};return fulfillStripeSession(s.id)}

const index=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
let healthCache={value:null,exp:0};
async function health({fresh=false}={}){
 if(!fresh&&healthCache.value&&healthCache.exp>Date.now())return healthCache.value;let browseConnected=readerReady&&Date.now()-readerLastOk<15*60*1000,officialConnected=false,message='',sampleId='';
 try{if(officialConfigured()){const sample=await browseOfficial(1,'featured');browseConnected=sample.items.length>0;sampleId=sample.items[0]?.id||'';if(sampleId){const d=normalizeOfficialDetail(await officialProduct(sampleId));officialConnected=Boolean(d.available)}}else if(!browseConnected){const ok=await warmReader({attempts:2});browseConnected=ok}}
 catch(e){message=safePublicError(e)}
 const payments=Boolean(STRIPE_SECRET_KEY),webhook=Boolean(STRIPE_WEBHOOK_SECRET),fallback=Boolean((fallbackCatalog.items||[]).length);const value={ok:true,supplierConnected:browseConnected||fallback,catalog:browseConnected?'AliExpress live':fallback?'AliExpress snapshot':'offline',liveCatalog:browseConnected,fallbackCatalog:fallback,realOnly:true,officialConfigured:officialConfigured(),officialConnected,payments,webhook,fulfillmentReady:Boolean(officialConnected&&payments&&webhook),checkoutReady:Boolean(officialConnected&&payments&&webhook),market:'US',currency:'USD',sampleId,message};healthCache={value,exp:Date.now()+60*1000};return value;
}

const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,BASE);
 if(u.pathname==='/api/stripe/webhook'&&req.method==='POST'){const raw=await readRaw(req);if(!verifyStripeSignature(raw,req.headers['stripe-signature']))return send(res,400,{error:'Invalid Stripe signature'});let event;try{event=JSON.parse(raw.toString('utf8'))}catch{return send(res,400,{error:'Invalid event JSON'})}try{return send(res,200,{received:true,result:await handleStripeEvent(event)})}catch(e){console.error(`FULFILLMENT_FAILED event=${event.id||''} ${e.message}`);return send(res,500,{error:'Fulfillment failed; Stripe may retry the event.'})}}
 if(u.pathname==='/')return send(res,200,index,'text/html; charset=utf-8');
 if(u.pathname==='/api/health')return send(res,200,await health({fresh:u.searchParams.get('fresh')==='1'}));
 if(u.pathname==='/api/categories')return send(res,200,CATEGORIES);
 if(u.pathname==='/api/products'){const page=Math.max(1,Math.min(100,Number(u.searchParams.get('page')||1))),category=CATEGORIES.find(x=>x.id===(u.searchParams.get('category')||'')),q=(u.searchParams.get('q')||'').trim(),sort=u.searchParams.get('sort')||'featured';try{if(officialConfigured()&&!q&&!category)return send(res,200,await browseOfficial(page,sort));const map={featured:'orders',orders:'orders',new:'newest',price_asc:'price_asc',price_desc:'price_desc'};return send(res,200,await searchAli(q||(category?.query||'useful home gadgets'),page,map[sort]||'orders',category?.name||'AliExpress'))}catch(e){return send(res,e.status||503,{error:safePublicError(e),code:e.code||'CATALOG_REFRESHING'})}}
 if(u.pathname.startsWith('/api/product/')){try{return send(res,200,await getAliDetail(decodeURIComponent(u.pathname.split('/').pop())))}catch(e){return send(res,e.status||503,{error:safePublicError(e),code:e.code||'PRODUCT_REFRESHING'})}}
 if(u.pathname==='/api/checkout'&&req.method==='POST'){const body=await readJson(req);try{return send(res,200,await createCheckout(body.items))}catch(e){return send(res,e.status||503,{error:cleanText(e.message||'Checkout unavailable',180)})}}
 if(u.pathname==='/api/order-status'&&req.method==='GET'){const id=u.searchParams.get('session_id')||'';if(!/^cs_/.test(id))return send(res,400,{error:'Invalid session'});const s=await stripeGetSession(id);return send(res,200,{payment:s.payment_status,fulfillment:s.metadata?.fulfillment_status||'unknown',orderRef:s.client_reference_id||s.metadata?.order_ref||'',supplierOrders:String(s.metadata?.aliexpress_order_ids||'').split(',').filter(Boolean)})}
 if(u.pathname==='/api/policy/shipping')return send(res,200,{title:'Shipping & Delivery',body:'Tyrve launches to United States delivery addresses. Product stock and supplier shipping are rechecked before payment when checkout is available. Delivery timing depends on the supplier and destination.'});
 if(u.pathname==='/api/policy/returns')return send(res,200,{title:'Returns & Refunds',body:'If an item arrives damaged, materially different from the listing, or does not arrive, use the order reference from your payment receipt when contacting Tyrve support. Eligible refunds are returned to the original payment method after review.'});
 if(u.pathname==='/api/policy/privacy')return send(res,200,{title:'Privacy',body:'Tyrve collects information needed to process orders and provide support. Payment data is handled by Stripe Checkout. Shipping details are used for fulfillment. Tyrve does not sell customer personal data.'});
 if(u.pathname==='/api/policy/terms')return send(res,200,{title:'Terms',body:'Product price, SKU stock and availability are re-verified before payment. Orders may be canceled and refunded if fulfillment becomes impossible after purchase. Tyrve blocks restricted, unsafe and high-risk merchandise.'});
 return send(res,404,{error:'Not found'});
 }catch(e){console.error(`SERVER_ERROR ${String(e?.message||e).slice(0,300)}`);send(res,e.status||500,{error:'Something went wrong. Please try again.'})}});
server.listen(PORT,'0.0.0.0',()=>{console.log(`Tyrve v4 on ${PORT}; official=${officialConfigured()} payments=${Boolean(STRIPE_SECRET_KEY)} webhook=${Boolean(STRIPE_WEBHOOK_SECRET)} fallback=${(fallbackCatalog.items||[]).length}`);warmReader({attempts:5}).then(async ok=>{healthCache.exp=0;const h=await health({fresh:true});console.log(`TYRVE_SELFTEST browse=${h.liveCatalog} fallback=${h.fallbackCatalog} official=${h.officialConnected} payments=${h.payments} webhook=${h.webhook} checkoutReady=${h.checkoutReady} warm=${ok}`)}).catch(e=>console.error(`TYRVE_WARM_FAILED ${e.message}`))});