import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
const PORT=Number(process.env.PORT||10000);
const BASE=process.env.BASE_URL||`http://localhost:${PORT}`;
const templates=[
['VoltArc 65W GaN USB-C Charger','Electronics','charger',24.99,'Compact fast charger with foldable plug and dual USB-C output.'],
['AeroFold Aluminum Laptop Stand','Computer Accessories','stand',29.99,'Adjustable aluminum stand designed to lift notebooks for a cleaner desk setup.'],
['HaloDock Magnetic Wireless Charger','Phone Accessories','wireless',21.99,'Magnetic charging puck with weighted desktop base and USB-C input.'],
['LumaBar Minimal LED Desk Lamp','Lighting','lamp',34.99,'Slim dimmable task light with touch control and warm-to-cool lighting modes.'],
['NestHub 6-in-1 USB-C Adapter','Computer Accessories','hub',27.99,'USB-C hub with HDMI, USB-A and card-reader expansion for laptops and tablets.'],
['Orbit Mini Tripod + Phone Grip','Phone Accessories','tripod',18.99,'Pocket tripod that converts into a handheld grip for phones and compact cameras.'],
['NomadTech Cable Organizer Kit','Travel','organizer',16.99,'Travel pouch and cable-management set for chargers, adapters and small accessories.'],
['PureSip Insulated Travel Bottle','Travel','bottle',22.99,'Double-wall bottle with leak-resistant lid and carry loop.'],
['PawFlow Portable Pet Water Bottle','Pet Supplies','petbottle',19.99,'One-hand pet water dispenser with integrated drinking tray.'],
['CoreBand Activity Tracker','Sports & Fitness','band',31.99,'Slim activity band concept with step, timer and workout modes.'],
['DriveLock Magnetic Car Phone Mount','Car Accessories','carmount',17.99,'Low-profile magnetic dashboard mount with adjustable viewing angle.'],
['SenseDot Door & Window Sensor','Smart Home','sensor',23.99,'Compact smart-home contact sensor concept for doors, windows and cabinets.'],
['QuietType Compact Wireless Keyboard','Office','keyboard',28.99,'Low-profile compact keyboard concept for desk and travel setups.'],
['CloudRest Memory-Foam Seat Cushion','Home & Living','cushion',32.99,'Contoured seat cushion concept with removable washable cover.'],
['GlowStrip Motion Night Light','Lighting','nightlight',15.99,'Rechargeable magnetic night light concept with motion activation.'],
['FreshSeal Vacuum Storage Set','Home & Living','storage',25.99,'Reusable storage-bag concept with compact hand-pump accessory.']
];
const colors=['#111827','#1e293b','#334155','#0f766e','#4338ca','#7c3aed','#9f1239','#92400e'];
function product(id){id=((Number(id)||1)-1)%30000+1;const t=templates[(id-1)%templates.length];const variant=1+Math.floor((id-1)/templates.length);const suffix=variant===1?'':` · Edition ${variant}`;return {id,title:t[0]+suffix,category:t[1],art:t[2],price:Number((t[3]+((variant-1)%7)*1.5).toFixed(2)),stock:20+(id%80),description:t[4],image:`/art/${t[2]}/${id}.svg`,preview:true};}
const cats=[...new Set(templates.map(t=>t[1]))];
function svg(type,id){const bg=colors[id%colors.length];const accent=['#e2e8f0','#bfdbfe','#fde68a','#bbf7d0','#ddd6fe'][id%5];let shape='';
const common=`fill="none" stroke="#0f172a" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"`;
if(type==='charger')shape=`<rect x="245" y="170" width="210" height="310" rx="55" fill="#fff"/><rect x="285" y="235" width="130" height="46" rx="14" fill="${accent}"/><path d="M310 480v70M390 480v70" ${common}/>`;
else if(type==='stand')shape=`<path d="M190 500h320" ${common}/><path d="M260 470l115-260 125 260" ${common}/><rect x="245" y="175" width="310" height="190" rx="20" fill="#fff" transform="rotate(-8 400 270)"/>`;
else if(type==='wireless')shape=`<circle cx="350" cy="320" r="145" fill="#fff"/><circle cx="350" cy="320" r="92" fill="${accent}"/><path d="M350 228v184M258 320h184" ${common}/>`;
else if(type==='lamp'||type==='nightlight')shape=`<path d="M210 500h280M350 500V285M350 285l120-100" ${common}/><rect x="410" y="145" width="185" height="70" rx="28" fill="#fff"/><circle cx="350" cy="500" r="35" fill="${accent}"/>`;
else if(type==='hub')shape=`<rect x="150" y="245" width="400" height="210" rx="42" fill="#fff"/><rect x="205" y="300" width="70" height="40" rx="10" fill="${accent}"/><rect x="305" y="300" width="70" height="40" rx="10" fill="${accent}"/><rect x="405" y="300" width="90" height="40" rx="10" fill="${accent}"/><path d="M550 350h95" ${common}/>`;
else if(type==='tripod')shape=`<rect x="295" y="110" width="110" height="190" rx="25" fill="#fff"/><path d="M350 300v110M350 410L210 555M350 410l140 145M350 410v160" ${common}/>`;
else if(type==='organizer'||type==='storage')shape=`<rect x="150" y="180" width="400" height="330" rx="50" fill="#fff"/><path d="M150 300h400M300 180v330" ${common}/><circle cx="430" cy="390" r="45" fill="${accent}"/>`;
else if(type==='bottle'||type==='petbottle')shape=`<rect x="270" y="130" width="160" height="410" rx="70" fill="#fff"/><rect x="300" y="85" width="100" height="80" rx="25" fill="${accent}"/><path d="M315 280h70" ${common}/>`;
else if(type==='band')shape=`<rect x="285" y="120" width="130" height="460" rx="65" fill="#fff"/><rect x="300" y="255" width="100" height="120" rx="28" fill="${accent}"/><circle cx="350" cy="315" r="24" fill="${bg}"/>`;
else if(type==='carmount')shape=`<circle cx="350" cy="280" r="120" fill="#fff"/><circle cx="350" cy="280" r="70" fill="${accent}"/><path d="M350 400v80M280 520h140" ${common}/>`;
else if(type==='sensor')shape=`<rect x="245" y="190" width="150" height="300" rx="50" fill="#fff"/><rect x="425" y="220" width="65" height="240" rx="28" fill="${accent}"/><circle cx="320" cy="265" r="22" fill="${bg}"/>`;
else if(type==='keyboard')shape=`<rect x="120" y="235" width="460" height="250" rx="35" fill="#fff"/><g fill="${accent}">${Array.from({length:24},(_,i)=>`<rect x="${155+(i%8)*52}" y="${270+Math.floor(i/8)*55}" width="38" height="35" rx="8"/>`).join('')}</g>`;
else shape=`<rect x="175" y="170" width="350" height="350" rx="90" fill="#fff"/><path d="M245 340h210" ${common}/>`;
return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 700"><rect width="700" height="700" rx="48" fill="#f8fafc"/><circle cx="590" cy="100" r="210" fill="${accent}" opacity=".45"/><circle cx="120" cy="610" r="180" fill="${bg}" opacity=".08"/>${shape}<text x="44" y="645" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#64748b">TYRVE PREVIEW</text></svg>`;}
function send(res,code,data,type='application/json'){res.writeHead(code,{'content-type':type,'cache-control':type.includes('svg')?'public,max-age=86400':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'});res.end(type==='application/json'?JSON.stringify(data):data)}
const index=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,BASE);if(u.pathname==='/')return send(res,200,index,'text/html; charset=utf-8');if(u.pathname==='/api/health')return send(res,200,{ok:true,preview:true,payments:false,catalog:'preview',count:30000});if(u.pathname==='/api/categories')return send(res,200,cats.map(category=>({category,count:Math.floor(30000/cats.length)})));if(u.pathname.startsWith('/art/')){let a=u.pathname.split('/');return send(res,200,svg(a[2],Number(a[3]?.replace('.svg',''))||1),'image/svg+xml');}if(u.pathname.startsWith('/api/product/'))return send(res,200,product(u.pathname.split('/').pop()));if(u.pathname==='/api/products'){let page=Math.max(1,Number(u.searchParams.get('page')||1)),limit=Math.min(48,Math.max(1,Number(u.searchParams.get('limit')||24))),q=(u.searchParams.get('q')||'').toLowerCase(),cat=u.searchParams.get('category')||'',sort=u.searchParams.get('sort')||'featured';let arr=[];for(let i=1;i<=30000;i++){let p=product(i);if(cat&&p.category!==cat)continue;if(q&&!`${p.title} ${p.category}`.toLowerCase().includes(q))continue;arr.push(p)}if(sort==='price_asc')arr.sort((a,b)=>a.price-b.price);if(sort==='price_desc')arr.sort((a,b)=>b.price-a.price);let total=arr.length,start=(page-1)*limit;return send(res,200,{items:arr.slice(start,start+limit),total,page,pages:Math.max(1,Math.ceil(total/limit)),preview:true});}if(u.pathname==='/api/checkout'&&req.method==='POST')return send(res,503,{error:'Checkout is intentionally disabled while Tyrve is using preview products. Connect the real supplier catalog first.'});return send(res,404,{error:'Not found'});}catch(e){send(res,500,{error:'Server error'});}});
server.listen(PORT,'0.0.0.0',()=>console.log(`Tyrve premium preview online on ${PORT}`));