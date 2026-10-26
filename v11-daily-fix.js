(()=>{'use strict';
const E='profitEntries_v8',R='profitRecurring_v1',P='profitPrefs_v8';
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const iso=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const shiftDate=(s,n)=>{const [y,m,d]=s.split('-').map(Number),x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const daysInMonth=m=>{const [y,mo]=m.split('-').map(Number);return new Date(y,mo,0).getDate()};
const dateDiff=(a,b)=>{const [ay,am,ad]=a.split('-').map(Number),[by,bm,bd]=b.split('-').map(Number);return Math.round((new Date(by,bm-1,bd)-new Date(ay,am-1,ad))/86400000)};
const maxDate=(a,b)=>a>b?a:b,minDate=(a,b)=>a<b?a:b;
function prefs(){return {lang:'en',currency:'USD',...read('profitSettings_v1',{}),...read(P,{})}}
function money(v){const p=prefs();try{return new Intl.NumberFormat(p.lang==='th'?'th-TH':'en-US',{style:'currency',currency:p.currency,maximumFractionDigits:Math.abs(v)>=1000?0:2}).format(Number(v)||0)}catch{return `${p.currency} ${(Number(v)||0).toFixed(2)}`}}
function dailyEquivalent(d){
  const entries=read(E,[]),rules=read(R,[]),m=d.slice(0,7),dim=daysInMonth(m);
  let active=0,passive=0,expenses=0;
  if(Array.isArray(entries)) for(const e of entries){
    const rev=Number(e.revenue)||0,exp=Number(e.expenses)||0;
    if((e.mode||'daily')==='daily'&&e.date===d){
      if(e.incomeType==='passive') passive+=rev; else active+=rev;
      expenses+=exp;
    } else if(e.mode==='monthly'&&e.month===m){
      if(e.incomeType==='passive') passive+=rev/dim; else active+=rev/dim;
      expenses+=exp/dim;
    }
  }
  if(Array.isArray(rules)) for(const r of rules){
    if(!r||r.enabled===false) continue;
    const start=r.startDate||d,end=r.endDate||`${m}-${String(dim).padStart(2,'0')}`;
    if(r.frequency==='daily'){
      if(d<start||(r.endDate&&d>r.endDate)) continue;
      const v=Number(r.amount)||0;
      if(r.type==='passive') passive+=v; else if(r.type==='expenses') expenses+=v; else active+=v;
    } else if(r.frequency==='monthly'){
      const monthStart=`${m}-01`,monthEnd=`${m}-${String(dim).padStart(2,'0')}`;
      const activeStart=maxDate(start,monthStart),activeEnd=minDate(r.endDate||monthEnd,monthEnd);
      if(activeStart>activeEnd||d<activeStart||d>activeEnd) continue;
      const activeDays=dateDiff(activeStart,activeEnd)+1,v=(Number(r.amount)||0)/Math.max(1,activeDays);
      if(r.type==='passive') passive+=v; else if(r.type==='expenses') expenses+=v; else active+=v;
    }
  }
  return {active,passive,revenue:active+passive,expenses,profit:active+passive-expenses};
}
function pctChange(cur,prev){if(prev===0)return cur===0?'No change':(cur>0?'+100% more':'-100% less');const x=(cur-prev)/Math.abs(prev)*100;return `${x>=0?'+':'-'}${Math.abs(x).toFixed(1).replace('.0','')}% ${x>=0?'more':'less'}`}
function drawDailyChart(){
  const daily=document.getElementById('daily'); if(!daily||!daily.classList.contains('on')) return;
  const rangeBtn=document.querySelector('#ranges [data-range].on'); const n=Number(rangeBtn?.dataset.range)||7;
  const c=document.getElementById('chart'),ctx=c?.getContext?.('2d'); if(!ctx) return;
  const pts=[],tot={revenue:0,expenses:0,profit:0}; let prev=0;
  for(let i=n-1;i>=0;i--){const v=dailyEquivalent(shiftDate(iso(),-i));pts.push(v.profit);tot.revenue+=v.revenue;tot.expenses+=v.expenses;tot.profit+=v.profit}
  for(let i=n;i<n*2;i++)prev+=dailyEquivalent(shiftDate(iso(),-i)).profit;
  const w=Math.max(c.clientWidth,280),h=170,dpr=window.devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const mn=Math.min(0,...pts),mx=Math.max(0,...pts),span=mx-mn||1,px=i=>8+i*(w-16)/Math.max(1,pts.length-1),py=v=>10+(mx-v)/span*(h-32);
  ctx.strokeStyle='#ececeb';ctx.lineWidth=1;[0,.5,1].forEach(z=>{const y=10+z*(h-32);ctx.beginPath();ctx.moveTo(8,y);ctx.lineTo(w-8,y);ctx.stroke()});
  ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(px(i),py(v)):ctx.moveTo(px(i),py(v)));ctx.strokeStyle='#111';ctx.lineWidth=2.7;ctx.stroke();
  const margin=tot.revenue?tot.profit/tot.revenue*100:0;
  const ct=document.getElementById('ct'),cs=document.getElementById('cs'),cp=document.getElementById('cp');
  if(ct)ct.textContent=`Last ${n} days`; if(cs)cs.textContent=`${money(tot.profit)} · ${margin.toFixed(1).replace('.0','')}%`; if(cp)cp.textContent=`vs previous period · ${pctChange(tot.profit,prev)}`;
}
function apply(){
  const daily=document.getElementById('daily'); if(!daily||!daily.classList.contains('on')) return;
  const v=dailyEquivalent(iso()),pv=dailyEquivalent(shiftDate(iso(),-1));
  const hv=document.getElementById('hv'),rv=document.getElementById('rv'),ev=document.getElementById('ev'),mv=document.getElementById('mv'),cmp=document.getElementById('cmp'),hl=document.getElementById('hl');
  if(hl)hl.textContent='Money left today · incl. monthly avg';
  if(hv){hv.textContent=money(v.profit);hv.className='hv '+(v.profit>0?'pos':v.profit<0?'neg':'')}
  if(rv)rv.textContent=money(v.revenue); if(ev)ev.textContent=money(v.expenses); if(mv)mv.textContent=(v.revenue?v.profit/v.revenue*100:0).toFixed(1).replace('.0','')+'%';
  if(cmp)cmp.textContent=`vs yesterday · ${pctChange(v.profit,pv.profit)}`;
  drawDailyChart();
}
function boot(){setTimeout(apply,0);document.addEventListener('click',()=>setTimeout(apply,0));document.addEventListener('change',()=>setTimeout(apply,0));window.addEventListener('resize',()=>setTimeout(drawDailyChart,0));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();