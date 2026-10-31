import {writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url=process.env.ALIEXPRESS_MCP_URL||'https://tyrve-aliexpress-reader.onrender.com/mcp';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const blocked=/\b(gun|firearm|rifle|pistol|revolver|ammo|ammunition|bullet|silencer|suppressor|knife|switchblade|dagger|sword|machete|taser|stun gun|pepper spray|mace|brass knuckle|firework|explosive|detonator|poison|toxin|pesticide|vape|vaping|cigarette|cigar|nicotine|tobacco|cbd|thc|marijuana|cannabis|weed|mushroom|psychedelic|alcohol|liquor|wine|beer|vodka|whiskey|steroid|hormone|dnp|diet pill|laxative|porn|adult toy|sex toy|bdsm|casino|gambling|betting|lottery)\b/i;
const brandRisk=/\b(apple|iphone|airpods|samsung|sony|nintendo|playstation|xbox|nike|adidas|puma|gucci|prada|chanel|hermes|louis vuitton|\blv\b|dyson|lego|disney|marvel|pokemon|xiaomi|huawei)\b/i;
const safe=t=>!blocked.test(String(t||''))&&!brandRisk.test(String(t||''));
function parse(r){
 if(r?.isError)throw new Error((r?.content||[]).map(x=>x?.text||'').join(' ')||'MCP error');
 if(r?.structuredContent&&typeof r.structuredContent==='object')return r.structuredContent;
 const text=(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
 if(!text)return {};
 try{return JSON.parse(text)}catch{return {text}}
}
function firstPrice(v){
 if(typeof v==='number'&&Number.isFinite(v))return v;
 const m=String(v??'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);
 return m?Number(m[0]):0;
}
function retail(cost){if(!cost||cost<=0)return 0;const landed=cost+6;return Number((Math.ceil(Math.max(landed*1.65,landed+8))-0.01).toFixed(2))}
const queries=[
 ['Phone Accessories','usb c cable'],
 ['Office & Desk','desk accessories'],
 ['Home & Living','home organization gadgets'],
 ['Travel Accessories','travel organizer accessories'],
 ['Pet Supplies','pet accessories'],
 ['Fitness Accessories','fitness accessories']
];
async function connect(){
 const c=new Client({name:'tyrve-production-smoke',version:'2.0.0'},{capabilities:{}});
 await c.connect(new StreamableHTTPClientTransport(new URL(url)));
 return c;
}
let client=null,last='',all=[];
for(let connectTry=0;connectTry<3&&!client;connectTry++){
 try{client=await connect()}catch(e){last=String(e?.message||e).replace(/\s+/g,' ').slice(0,220);console.error(`TYRVE_CATALOG_SMOKE connect_attempt=${connectTry+1} success=false error=${last}`);if(connectTry<2)await sleep(4000*(connectTry+1))}
}
if(client){
 for(const [category,query] of queries){
  try{
   const out=parse(await client.callTool({name:'search_aliexpress',arguments:{query,page:1,sort:'orders',limit:8}}));
   const rows=(Array.isArray(out?.items)?out.items:[]).filter(x=>x?.id&&x?.title&&x?.image&&safe(x.title));
   for(const x of rows){
    const cost=firstPrice(x.price??x.price_formatted);if(!cost)continue;
    all.push({id:String(x.id),title:String(x.title).slice(0,240),image:String(x.image),url:String(x.url||`https://www.aliexpress.com/item/${x.id}.html`),category,supplier:'AliExpress',supplierCost:cost,price:retail(cost),rating:Number(x.rating||0)||null,orders:x.orders||null,currency:String(x.currency||'USD'),stock:null,real:true,verified:false,official:false});
   }
   console.log(`TYRVE_SNAPSHOT_QUERY success=true category=${category} items=${rows.length}`);
  }catch(e){last=String(e?.message||e).replace(/\s+/g,' ').slice(0,220);console.error(`TYRVE_SNAPSHOT_QUERY success=false category=${category} error=${last}`)}
  await sleep(900);
 }
 try{await client.close()}catch{}
}
const seen=new Set();all=all.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true}).slice(0,48);
if(all.length){
 await writeFile(new URL('./fallback-catalog.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),items:all}),{encoding:'utf8'});
 console.log(`TYRVE_CATALOG_SMOKE success=true items=${all.length} sample=${all[0].id} title=${all[0].title.slice(0,90)} snapshot=true`);
}else console.error(`TYRVE_CATALOG_SMOKE final=false items=0 error=${last||'no products returned'} snapshot=false`);
process.exit(0);
