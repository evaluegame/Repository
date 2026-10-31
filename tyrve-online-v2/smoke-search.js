import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url=process.env.ALIEXPRESS_MCP_URL||'https://tyrve-aliexpress-reader.onrender.com/mcp';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function parse(r){
 if(r?.isError)throw new Error((r?.content||[]).map(x=>x?.text||'').join(' ')||'MCP error');
 if(r?.structuredContent&&typeof r.structuredContent==='object')return r.structuredContent;
 const text=(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
 if(!text)return {};
 try{return JSON.parse(text)}catch{return {text}}
}
async function attempt(){
 const c=new Client({name:'tyrve-production-smoke',version:'1.0.0'},{capabilities:{}});
 await c.connect(new StreamableHTTPClientTransport(new URL(url)));
 const out=parse(await c.callTool({name:'search_aliexpress',arguments:{query:'usb c cable',page:1,sort:'orders',limit:6}}));
 const items=Array.isArray(out?.items)?out.items:[];
 try{await c.close()}catch{}
 if(!items.length)throw new Error('search returned zero products');
 const good=items.filter(x=>x?.id&&x?.title&&x?.image&&(x?.price||x?.price_formatted));
 if(!good.length)throw new Error('search returned no complete product rows');
 return good;
}
let last='';
for(let i=0;i<3;i++){
 try{
  const items=await attempt();
  console.log(`TYRVE_CATALOG_SMOKE success=true items=${items.length} sample=${String(items[0].id)} title=${String(items[0].title).slice(0,90)}`);
  process.exit(0);
 }catch(e){last=String(e?.message||e).replace(/\s+/g,' ').slice(0,220);console.error(`TYRVE_CATALOG_SMOKE attempt=${i+1} success=false error=${last}`);if(i<2)await sleep(4000*(i+1));}
}
console.error(`TYRVE_CATALOG_SMOKE final=false error=${last}`);
process.exit(0);
