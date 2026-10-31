import crypto from 'node:crypto';

const APP_KEY=process.env.ALIEXPRESS_APP_KEY||'';
const APP_SECRET=process.env.ALIEXPRESS_APP_SECRET||'';
const SESSION=process.env.ALIEXPRESS_SESSION||'';
const ENDPOINT=process.env.ALIEXPRESS_API_URL||'https://eco.taobao.com/router/rest';

export function officialConfigured(){return Boolean(APP_KEY&&APP_SECRET&&SESSION)}

function gmt8Timestamp(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function signParams(params){
 const joined=Object.keys(params).filter(k=>k!=='sign'&&params[k]!==undefined&&params[k]!==null).sort().map(k=>`${k}${params[k]}`).join('');
 return crypto.createHmac('md5',APP_SECRET).update(joined,'utf8').digest('hex').toUpperCase();
}

export async function topCall(method,business={},needsSession=true){
 if(!APP_KEY||!APP_SECRET||(needsSession&&!SESSION))throw Object.assign(new Error('Official AliExpress API credentials are not configured'),{code:'ALIEXPRESS_OFFICIAL_NOT_CONFIGURED'});
 const params={method,app_key:APP_KEY,format:'json',v:'2.0',sign_method:'hmac',timestamp:gmt8Timestamp(),partner_id:'tyrve'};
 if(needsSession)params.session=SESSION;
 for(const [k,v] of Object.entries(business))if(v!==undefined&&v!==null)params[k]=typeof v==='object'?JSON.stringify(v):String(v);
 params.sign=signParams(params);
 const body=new URLSearchParams(params);
 const r=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=utf-8'},body,signal:AbortSignal.timeout(20000)});
 const j=await r.json().catch(()=>null);
 if(!r.ok||!j)throw Object.assign(new Error(`AliExpress API HTTP ${r.status}`),{code:'ALIEXPRESS_OFFICIAL_HTTP'});
 if(j.error_response)throw Object.assign(new Error(j.error_response.sub_msg||j.error_response.msg||'AliExpress API error'),{code:String(j.error_response.code||'ALIEXPRESS_API_ERROR'),raw:j.error_response});
 return j;
}

function arr(v){if(!v)return[];return Array.isArray(v)?v:[v]}
function https(s){return String(s||'').replace(/^http:\/\//i,'https://')}

export async function officialProduct(productId){
 const j=await topCall('aliexpress.ds.product.get',{product_id:productId,ship_to_country:'US',target_currency:'USD',target_language:'EN'});
 const root=j.aliexpress_ds_product_get_response?.result||j.result;
 if(!root)throw Object.assign(new Error('AliExpress product result missing'),{code:'ALIEXPRESS_PRODUCT_MISSING'});
 const base=root.ae_item_base_info_dto||{};
 const skuRoot=root.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o;
 const skus=arr(skuRoot).map(s=>{
  const props=arr(s?.ae_sku_property_dtos?.ae_sku_property_d_t_o).map(p=>({name:String(p?.sku_property_name||''),value:String(p?.sku_property_value||p?.property_value_definition_name||''),image:https(p?.sku_image)})).filter(p=>p.name||p.value);
  const supplierPrice=Number(s?.offer_sale_price||s?.sku_price||0)||0;
  const stock=Number(s?.sku_available_stock??s?.ipm_sku_stock??0)||0;
  return {id:String(s?.id||s?.sku_code||''),supplierPrice,stock,active:s?.sku_stock!==false&&stock>0,properties:props,image:props.find(p=>p.image)?.image||''};
 }).filter(s=>s.id&&s.supplierPrice>0);
 const images=String(root.ae_multimedia_info_dto?.image_urls||'').split(';').map(https).filter(Boolean);
 const properties=arr(root.ae_item_properties?.ae_item_property).reduce((o,p)=>{if(p?.attr_name&&p?.attr_value)o[p.attr_name]=p.attr_value;return o},{});
 const store=root.ae_store_info||{};
 const logistics=root.logistics_info_dto||{};
 const status=String(base.product_status_type||'');
 return {
  id:String(base.product_id||productId),title:String(base.subject||''),currency:String(base.currency_code||'USD'),status,
  description:String(base.detail||''),rating:Number(base.avg_evaluation_rating||0)||null,reviews:Number(base.evaluation_count||0)||null,
  images,skus,properties,store:{name:String(store.store_name||''),rating:Number(store.item_as_described_rating||0)||null},
  deliveryDays:Number(logistics.delivery_time||0)||null,shipTo:String(logistics.ship_to_country||'US'),
  url:`https://www.aliexpress.com/item/${base.product_id||productId}.html`,official:true,
  available:status==='onSelling'&&skus.some(s=>s.active)
 };
}

export async function officialFeed({page=1,categoryId='',sort='volumeDesc'}={}){
 const j=await topCall('aliexpress.ds.recommend.feed.get',{country:'US',target_currency:'USD',target_language:'EN',page_size:50,sort,page_no:page,category_id:categoryId||undefined,feed_name:'DS bestseller'});
 const root=j.aliexpress_ds_recommend_feed_get_response?.result||j.result;
 if(!root)throw Object.assign(new Error('AliExpress feed result missing'),{code:'ALIEXPRESS_FEED_MISSING'});
 const products=arr(root.products?.integer).map(p=>({
  id:String(p?.product_id||''),title:String(p?.product_title||''),image:https(p?.product_main_image_url),url:https(p?.product_detail_url)||`https://www.aliexpress.com/item/${p?.product_id}.html`,
  supplierPrice:Number(p?.target_sale_price||p?.sale_price||0)||0,currency:String(p?.target_sale_price_currency||p?.sale_price_currency||'USD'),
  category:String(p?.second_level_category_name||p?.first_level_category_name||'AliExpress'),volume:Number(p?.lastest_volume||0)||0,
  ratingText:String(p?.evaluate_rate||''),deliveryDays:Number(p?.ship_to_days||0)||null,official:true
 })).filter(p=>p.id&&p.title&&p.image&&p.supplierPrice>0);
 return {items:products,total:Number(root.total_record_count||products.length),page:Number(root.current_page_no||page),pages:Number(root.total_page_no||1),finished:Boolean(root.is_finished)};
}

export async function officialFreight({productId,qty=1,price,country='US',sendFrom='CN'}){
 const dto={country_code:country,product_id:Number(productId),product_num:Number(qty),send_goods_country_code:sendFrom,price:String(price||''),price_currency:'USD'};
 const j=await topCall('aliexpress.logistics.buyer.freight.calculate',{param_aeop_freight_calculate_for_buyer_d_t_o:dto});
 const root=j.aliexpress_logistics_buyer_freight_calculate_response?.result||j.result;
 const list=arr(root?.aeop_freight_calculate_result_for_buyer_d_t_o_list?.aeop_freight_calculate_result_for_buyer_dto).filter(x=>x?.success!==false&&Number(x?.error_code||0)===0);
 return list.map(x=>({service:String(x?.service_name||''),estimatedDelivery:String(x?.estimated_delivery_time||''),amount:Number(x?.freight?.amount||0)||0,currency:String(x?.freight?.currency_code||'USD')}));
}
