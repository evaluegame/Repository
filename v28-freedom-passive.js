(()=>{
'use strict';
const GOAL='profitFreedomGoal_v3';
const MIG='profitFreedomV28Migrated_v1';
const E='profitEntries_v8',LEGACY='simpleProfit_v3',R='profitRecurring_v1',P='profitPrefs_v8',S='profitSettings_v1',W='profitRewards_v1';
const $=id=>document.getElementById(id);
const read=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:(JSON.parse(v)??d)}catch{return d}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const prefs=()=>({lang:'en',currency:'USD',...read(S,{}),...read(P,{})});
const money=v=>{const p=prefs();try{return new Intl.NumberFormat(p.lang==='th'?'th-TH':'en-US',{style:'currency',currency:p.currency||'USD',maximumFractionDigits:Math.abs(Number(v)||0)>=1000?0:2}).format(Number(v)||0)}catch{return `${p.currency||'USD'} ${(Number(v)||0).toFixed(2)}`}};
const iso=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shift=(s,n)=>{const [y,m,d]=s.split('-').map(Number),x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return iso(x)};
const dim=m=>{const [y,mo]=m.split('-').map(Number);return new Date(y,mo,0).getDate()};
const defaultGoal=()=>({enabled:false,basis:'assets',target:1000000,invested:0,monthlyContribution:0,annualReturn:7,updatedAt:0});
function goal(){return {...defaultGoal(),...read(GOAL,{})}}
function migrate(){
  const g=goal();
  if(!read(MIG,false)){
    write(GOAL,{...g,enabled:false,basis:'assets',updatedAt:Date.now()});
    write(MIG,true);
  }else if(g.basis!=='assets') write(GOAL,{...g,basis:'assets',updatedAt:Date.now()});
}
function saveGoal(g){write(GOAL,{...defaultGoal(),...g,basis:'assets',updatedAt:Date.now()});renderFreedom()}
function assetMonths(g){
  const target=Math.max(0,+g.target||0),start=Math.max(0,+g.invested||0),monthly=Math.max(0,+g.monthlyContribution||0),r=Math.max(0,+g.annualReturn||0)/1200;
  if(!target)return Infinity;if(start>=target)return 0;if(!r)return monthly>0?Math.ceil((target-start)/monthly):Infinity;if(start<=0&&monthly<=0)return Infinity;
  const den=start+monthly/r,num=target+monthly/r;if(den<=0||num<=den)return 0;const n=Math.log(num/den)/Math.log(1+r);return Number.isFinite(n)?Math.max(0,Math.ceil(n)):Infinity;
}
function durationMonths(n){if(!Number.isFinite(n))return 'Add monthly investment';if(n<=0)return 'Goal reached';const y=Math.floor(n/12),m=n%12;return [y?`${y}y`:'',m?`${m}m`:''].filter(Boolean).join(' ')||'<1m'}
function freedomDate(n){if(!Number.isFinite(n))return 'Not estimated';if(n<=0)return 'Now';const d=new Date();d.setMonth(d.getMonth()+n);return d.toLocaleDateString(undefined,{month:'short',year:'numeric'})}
function addStyle(){if($('pf28Style'))return;const s=document.createElement('style');s.id='pf28Style';s.textContent=`
#pf27FreedomCard,#freedomProgressCard,#pf27Section,#freedomSettings{display:none!important}.pf28-freedom{margin:14px 0;padding:15px;border:1px solid #e2e5e1;border-radius:21px;background:#fff;box-shadow:0 8px 24px #0000000a}.pf28-fhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.pf28-fhead b{font-size:18px}.pf28-fhead small{display:block;color:#888;margin-top:2px}.pf28-fhead>strong{font-size:24px;color:#0b9d67}.pf28-bar{height:8px;margin:11px 0;background:#e8ebe8;border-radius:99px;overflow:hidden}.pf28-bar i{display:block;height:100%;background:#10a66d;border-radius:99px}.pf28-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.pf28-stats span,.pf28-dates span{padding:8px;border-radius:12px;background:#f5f6f4}.pf28-stats small,.pf28-dates small{display:block;color:#858886;font-size:8px;text-transform:uppercase;font-weight:900}.pf28-stats b,.pf28-dates b{display:block;margin-top:3px;font-size:12px}.pf28-dates{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}.pf28-dates span{background:#111;color:#fff}.pf28-dates small{color:#aeb4b0}.pf28-section{margin:14px 0;padding:14px;border:1px solid #e2e4df;border-radius:18px;background:#f7f8f5}.pf28-section h3{margin:0 0 4px;font-size:17px}.pf28-section>p{margin:0 0 12px;color:#777;font-size:11px;line-height:1.4}.pf28-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0}.pf28-toggle b{font-size:13px}.pf28-toggle small{display:block;color:#888;font-size:10px;margin-top:2px}.pf28-toggle input{width:22px;height:22px;accent-color:#111}.pf28-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.pf28-field label{display:block;font-size:8px;text-transform:uppercase;color:#858a87;font-weight:950;margin:0 0 5px 2px}.pf28-field input{width:100%;box-sizing:border-box;border:1px solid #dfe3de;background:#fff;border-radius:11px;padding:10px;font-weight:850}.pf28-save{width:100%;margin-top:9px;border:0;border-radius:12px;background:#111;color:#fff;padding:11px;font-weight:950}.pf28-sync{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}.pf28-sync button{border:1px solid #dfe2de;background:#fff;border-radius:11px;padding:10px;font-size:10px;font-weight:900}.pf28-sync .merge{grid-column:1/-1;background:#111;color:#fff;border-color:#111}.pf28-sync-status{margin-top:7px;font-size:9px;color:#777;font-weight:800}.pf28-passive-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.pf28-passive-metrics>div{background:#f6f7f5;border-radius:12px;padding:9px}.pf28-passive-metrics span{display:block;font-size:8px;color:#888;text-transform:uppercase;font-weight:900}.pf28-passive-metrics b{display:block;font-size:12px;margin-top:3px}.pf28-passive-note{font-size:9px;color:#888;line-height:1.35;margin-top:8px}.pf28-next-line{font-weight:850!important;color:#444!important}@media(max-width:390px){.pf28-grid{grid-template-columns:1fr}.pf28-stats,.pf28-passive-metrics{grid-template-columns:1fr 1fr}.pf28-stats span:last-child,.pf28-passive-metrics>div:last-child{grid-column:1/-1}}
`;document.head.appendChild(s)}
function settingsHost(){return document.querySelector('#modal .box')||document.querySelector('#settingsModal .modal')||document.querySelector('#settingsModal .box')||$('#settingsModal')}
function renderFreedom(){
  const g=goal();document.querySelectorAll('#pf27FreedomCard,#freedomProgressCard').forEach(x=>x.style.display='none');let card=$('pf28FreedomCard');
  if(!g.enabled){card?.remove();return}
  if(!card){const sw=document.querySelector('.sw,.switch');if(!sw)return;card=document.createElement('section');card.id='pf28FreedomCard';card.className='pf28-freedom';sw.insertAdjacentElement('afterend',card)}
  const months=assetMonths(g),pct=g.target>0?Math.min(100,(+g.invested||0)/(+g.target||1)*100):0;
  card.innerHTML=`<div class="pf28-fhead"><div><b>Freedom Progress</b><small>Investment freedom · separate from passive income</small></div><strong>${pct.toFixed(1).replace('.0','')}%</strong></div><div class="pf28-bar"><i style="width:${pct}%"></i></div><div class="pf28-stats"><span><small>Invested</small><b>${money(g.invested)}</b></span><span><small>Freedom number</small><b>${money(g.target)}</b></span><span><small>Remaining</small><b>${money(Math.max(0,g.target-g.invested))}</b></span></div><div class="pf28-dates"><span><small>Freedom date</small><b>${freedomDate(months)}</b></span><span><small>Time left</small><b>${durationMonths(months)}</b></span></div>`;
}
function ensureFreedomSettings(){
  document.querySelectorAll('#pf27Section,#freedomSettings').forEach(x=>x.style.display='none');
  const host=settingsHost();if(!host||$('pf28FreedomSettings'))return;const g=goal(),sec=document.createElement('section');sec.id='pf28FreedomSettings';sec.className='pf28-section';
  sec.innerHTML=`<h3>Freedom goal</h3><p>Freedom Progress is only your investment/Freedom Number plan. Passive income has its own reward progress on the dashboard.</p><label class="pf28-toggle"><span><b>Show Freedom Progress</b><small>Optional dashboard card</small></span><input id="pf28Enabled" type="checkbox" ${g.enabled?'checked':''}></label><div class="pf28-grid"><div class="pf28-field"><label>Freedom number</label><input id="pf28Target" type="number" min="0" inputmode="decimal" value="${+g.target||0}"></div><div class="pf28-field"><label>Currently invested</label><input id="pf28Invested" type="number" min="0" inputmode="decimal" value="${+g.invested||0}"></div><div class="pf28-field"><label>Invest each month</label><input id="pf28Monthly" type="number" min="0" inputmode="decimal" value="${+g.monthlyContribution||0}"></div><div class="pf28-field"><label>Expected annual return %</label><input id="pf28Return" type="number" min="0" max="30" step="0.1" inputmode="decimal" value="${+g.annualReturn||0}"></div></div><button id="pf28Save" class="pf28-save" type="button">Save Freedom goal</button><div class="pf28-sync"><button id="pf28Upload" type="button">Upload this device</button><button id="pf28Restore" type="button">Restore cloud</button><button id="pf28Merge" class="merge" type="button">Merge safely</button></div><div id="pf28SyncStatus" class="pf28-sync-status">Cloud sync is separate from Freedom calculations.</div>`;
  const auto=host.querySelector('.auto,.auto-section');if(auto)auto.insertAdjacentElement('beforebegin',sec);else host.appendChild(sec);
}
function entries(){const a=read(E,null),b=read(LEGACY,[]);return Array.isArray(a)&&a.length?a:(Array.isArray(b)?b:[])}
function rules(){const a=read(R,[]);return Array.isArray(a)?a:[]}
function activeRule(r,d){return r&&r.enabled!==false&&(!r.startDate||d>=r.startDate)&&(!r.endDate||d<=r.endDate)}
function passiveForDay(d){
  const month=d.slice(0,7),days=dim(month);let value=0;
  for(const e of entries()){
    if(e?.incomeType!=='passive')continue;
    if((e.mode||'daily')==='daily'&&e.date===d)value+=+e.revenue||0;
    else if(e.mode==='monthly'&&e.month===month)value+=(+e.revenue||0)/days;
  }
  for(const r of rules()){
    if(r?.type!=='passive'||!activeRule(r,d))continue;const amount=+r.amount||0;
    if(r.frequency==='daily')value+=amount;
    else if(r.frequency==='monthly')value+=amount/days;
  }
  return value;
}
function passiveAverage(days,offset=0){let total=0;for(let i=offset;i<offset+days;i++)total+=passiveForDay(shift(iso(),-i));return total/Math.max(1,days)}
const REWARDS=[
 ['p1',1,1,'🌱','First Passive Dollar'],['p10',10,3,'✨','Passive Spark'],['p25',25,7,'☕','Weekend Paid'],['p50',50,7,'🧾','Bills Helper'],['p100',100,14,'⚡','Passive Momentum'],['p200',200,30,'🛋️','Work Is Optional'],['p446',446.34,30,'🏅','Top 10% U.S. Income Pace',1],['p619',618.91,30,'🥇','Top 5% U.S. Income Pace',1],['p1000',1000,30,'💎','Four-Figure Passive Day'],['p1389',1389.32,60,'👑','Top 1% U.S. Income Pace',1],['p2050',2050,60,'🚀','Freedom Engine'],['p5000',5000,90,'🌌','Elite Passive Engine'],['p10000',10000,90,'🏆','Eight-Figure Annual Pace']
];
function daysText(n){if(!Number.isFinite(n))return 'Need a positive trend';if(n<=0)return 'Ready now';if(n<30)return `${Math.max(1,Math.round(n))} day${Math.round(n)===1?'':'s'}`;const months=Math.floor(n/30),days=Math.round(n-months*30);if(months<12)return `${months} mo${days?` ${days}d`:''}`;const years=Math.floor(months/12),mo=months%12;return `${years}y${mo?` ${mo}m`:''}`}
function renderPassiveProgress(){
  const head=$('rhead'),sub=$('rsub'),pav=$('pav'),nextEl=$('nxt'),bar=$('prog');if(!head||!sub||!pav||!nextEl||!bar)return false;
  head.textContent=prefs().lang==='th'?'สร้างรายรับพาสซีฟ':'Build your passive income';sub.textContent=prefs().lang==='th'?'ความคืบหน้าไปยังรางวัลถัดไปจากประวัติรายรับพาสซีฟของคุณ':'Progress to your next reward from your actual passive-income history';
  const unlocked=read(W,{});const available=REWARDS.filter(r=>!r[5]||prefs().currency==='USD');const next=available.find(r=>!unlocked?.[r[0]]);const avg30=passiveAverage(30,0),prev30=passiveAverage(30,30),trend=avg30-prev30;
  pav.textContent=`${money(avg30)}/day`;
  let metrics=$('pf28PassiveMetrics');if(!metrics){metrics=document.createElement('div');metrics.id='pf28PassiveMetrics';metrics.className='pf28-passive-metrics';bar.parentElement.insertBefore(metrics,bar.nextSibling);const note=document.createElement('div');note.id='pf28PassiveNote';note.className='pf28-passive-note';metrics.insertAdjacentElement('afterend',note)}
  if(!next){bar.style.width='100%';nextEl.classList.add('pf28-next-line');nextEl.textContent='🏆 All passive-income rewards unlocked';metrics.innerHTML='<div><span>Next reward</span><b>Complete</b></div><div><span>Progress</span><b>100%</b></div><div><span>Time left</span><b>0 days</b></div>';$('pf28PassiveNote').textContent='All current passive-income milestones are complete.';return true}
  const current=passiveAverage(next[2],0),gap=Math.max(0,next[1]-current),pct=Math.max(0,Math.min(100,current/next[1]*100));let eta=Infinity;if(gap<=0)eta=0;else if(trend>0)eta=Math.ceil(gap/trend*30);
  nextEl.classList.add('pf28-next-line');nextEl.textContent=`Next reward: ${next[3]} ${next[4]} · ${pct.toFixed(1).replace('.0','')}% complete · ${money(gap)}/day left`;bar.style.width=`${pct}%`;
  metrics.innerHTML=`<div><span>Progress</span><b>${pct.toFixed(1).replace('.0','')}%</b></div><div><span>Time left</span><b>${daysText(eta)}</b></div><div><span>30d trend</span><b>${trend>=0?'+':''}${money(trend)}/day</b></div>`;
  $('pf28PassiveNote').textContent=`ETA uses your last 30 days of passive-income pace compared with the previous 30 days. This reward needs ${money(next[1])}/day for ${next[2]} day${next[2]===1?'':'s'}.`;
  return true;
}
function syncStatus(text){const el=$('pf28SyncStatus');if(el)el.textContent=text}
function bind(){
  document.addEventListener('click',e=>{
    const id=e.target?.id;
    if(id==='pf28Save'){
      e.preventDefault();saveGoal({enabled:$('pf28Enabled').checked,target:Math.max(0,+$('pf28Target').value||0),invested:Math.max(0,+$('pf28Invested').value||0),monthlyContribution:Math.max(0,+$('pf28Monthly').value||0),annualReturn:Math.max(0,Math.min(30,+$('pf28Return').value||0))});
    }else if(id==='pf28Upload'){e.preventDefault();syncStatus('Uploading…');Promise.resolve(window.__profitV27?.uploadDevice?.()).then(ok=>syncStatus(ok===false?'Upload failed':'Uploaded ✓')).catch(()=>syncStatus('Upload failed'))}
    else if(id==='pf28Restore'){e.preventDefault();syncStatus('Restoring…');Promise.resolve(window.__profitV27?.restoreCloud?.()).then(ok=>syncStatus(ok===false?'Restore failed':'Restored ✓')).catch(()=>syncStatus('Restore failed'))}
    else if(id==='pf28Merge'){e.preventDefault();syncStatus('Merging safely…');Promise.resolve(window.__profitV27?.mergeSafe?.(true)).then(ok=>syncStatus(ok===false?'Merge failed':'Merged ✓')).catch(()=>syncStatus('Merge failed'))}
    setTimeout(()=>{renderFreedom();renderPassiveProgress()},180);
  },true);
  document.addEventListener('change',()=>setTimeout(()=>{renderFreedom();renderPassiveProgress()},180),true);
}
function init(){migrate();addStyle();ensureFreedomSettings();renderFreedom();renderPassiveProgress();bind();window.__profitV28={goal,saveGoal,assetMonths,passiveAverage,renderFreedom,renderPassiveProgress}}
let tries=0;const timer=setInterval(()=>{tries++;if((window.__profitStarted||document.querySelector('.sw,.switch'))&&document.querySelector('.sw,.switch')&&settingsHost()&&$('rhead')){clearInterval(timer);init()}else if(tries>80)clearInterval(timer)},250);
})();