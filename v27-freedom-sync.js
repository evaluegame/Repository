(()=>{
'use strict';
const API='https://profit-auth-api.onrender.com';
const TOKEN='profit_cloud_token_v1';
const GOAL='profitFreedomGoal_v3';
const OLD_GOALS=['profitFreedomGoal_v2','profitFreedomGoal_v1'];
const SYNC_KEYS=['profitEntries_v8','simpleProfit_v3','profitPrefs_v8','profitSettings_v1','profitRecurring_v1','profitExpenseScopeEntries_v1','profitExpenseScopeRules_v1','profitRewards_v1','profitOnboarded_v1','profitExperience_v31','profitDeletedEntries_v1','profitDeletedRules_v1',GOAL];
const $=id=>document.getElementById(id);
const readRaw=k=>{try{return localStorage.getItem(k)}catch{return null}};
const writeRaw=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v))}catch{}};
const parse=(v,d)=>{try{const x=typeof v==='string'?JSON.parse(v):v;return x??d}catch{return d}};
const read=(k,d)=>parse(readRaw(k),d);
const encode=v=>JSON.stringify(v);
const nowDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

function defaultGoal(){return {enabled:false,basis:'assets',target:1000000,invested:0,monthlyContribution:0,annualReturn:7,passiveTargetMonthly:3000,updatedAt:0}}
function migrateGoal(){
  if(readRaw(GOAL)) return;
  for(const key of OLD_GOALS){
    const old=read(key,null);
    if(old&&typeof old==='object'){
      writeRaw(GOAL,encode({...defaultGoal(),...old,enabled:false,updatedAt:Number(old.updatedAt)||0}));
      return;
    }
  }
  writeRaw(GOAL,encode(defaultGoal()));
}
function getGoal(){migrateGoal();return {...defaultGoal(),...read(GOAL,{})}}
function setGoal(next){const g={...defaultGoal(),...next,updatedAt:Date.now()};writeRaw(GOAL,encode(g));renderFreedom();return g}

function getPrefs(){return {lang:'en',currency:'USD',...read('profitSettings_v1',{}),...read('profitPrefs_v8',{})}}
function money(v){const p=getPrefs();try{return new Intl.NumberFormat(p.lang==='th'?'th-TH':'en-US',{style:'currency',currency:p.currency||'USD',maximumFractionDigits:Math.abs(Number(v)||0)>=1000?0:2}).format(Number(v)||0)}catch{return `${p.currency||'USD'} ${(Number(v)||0).toFixed(2)}`}}

function getEntries(){
  const modern=read('profitEntries_v8',[]);
  const legacy=read('simpleProfit_v3',[]);
  if(Array.isArray(modern)&&modern.length) return modern;
  if(Array.isArray(legacy)&&legacy.length){writeRaw('profitEntries_v8',encode(legacy));return legacy}
  return [];
}
function entryKey(x,index){return x&&x.id!=null?`id:${x.id}`:`row:${JSON.stringify(x)}`}
function unionArrays(a,b){const out=[],seen=new Set();[...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].forEach((x,i)=>{const k=entryKey(x,i);if(!seen.has(k)){seen.add(k);out.push(x)}});return out}
function mergeObjects(local,remote){return {...(remote&&typeof remote==='object'&&!Array.isArray(remote)?remote:{}),...(local&&typeof local==='object'&&!Array.isArray(local)?local:{})}}
function localState(){
  const s={};
  for(const k of SYNC_KEYS)s[k]=readRaw(k);
  const entries=getEntries();
  s.profitEntries_v8=encode(entries);
  if(!Array.isArray(parse(s.simpleProfit_v3,[]))||!parse(s.simpleProfit_v3,[]).length)s.simpleProfit_v3=encode(entries);
  return s;
}
function stateEntries(s){return unionArrays(parse(s?.profitEntries_v8,[]),parse(s?.simpleProfit_v3,[]))}
function countEntries(s){return stateEntries(s).length}
function mergeStates(local,cloud){
  local=local||{};cloud=cloud||{};
  const out={...cloud,...Object.fromEntries(Object.entries(local).filter(([,v])=>v!=null))};
  const entries=unionArrays(stateEntries(local),stateEntries(cloud));
  const deletedEntries=mergeObjects(parse(local.profitDeletedEntries_v1,{}),parse(cloud.profitDeletedEntries_v1,{}));
  const deletedRules=mergeObjects(parse(local.profitDeletedRules_v1,{}),parse(cloud.profitDeletedRules_v1,{}));
  out.profitDeletedEntries_v1=encode(deletedEntries);out.profitDeletedRules_v1=encode(deletedRules);
  const keptEntries=entries.filter(e=>!deletedEntries[e.id]);
  out.profitEntries_v8=encode(keptEntries);
  out.simpleProfit_v3=encode(keptEntries);
  out.profitRecurring_v1=encode(unionArrays(parse(local.profitRecurring_v1,[]),parse(cloud.profitRecurring_v1,[])).filter(r=>!deletedRules[r.id]));
  for(const k of ['profitExpenseScopeEntries_v1','profitExpenseScopeRules_v1','profitRewards_v1'])out[k]=encode(mergeObjects(parse(local[k],{}),parse(cloud[k],{})));
  const lg=parse(local[GOAL],{}),cg=parse(cloud[GOAL],{});
  out[GOAL]=encode((Number(lg.updatedAt)||0)>=(Number(cg.updatedAt)||0)?{...defaultGoal(),...cg,...lg}:{...defaultGoal(),...lg,...cg});
  return out;
}
function applyState(s){
  if(!s||typeof s!=='object')return;
  const applying=window.__profitSyncApplying;window.__profitSyncApplying=true;try{
  for(const k of SYNC_KEYS){if(Object.prototype.hasOwnProperty.call(s,k)&&s[k]!=null)writeRaw(k,typeof s[k]==='string'?s[k]:encode(s[k]))}
  const entries=stateEntries(s);
  if(entries.length){writeRaw('profitEntries_v8',encode(entries));writeRaw('simpleProfit_v3',encode(entries))}
  }finally{window.__profitSyncApplying=applying}
}
async function cloud(path,options={}){
  const token=readRaw(TOKEN);if(!token)throw new Error('Sign in first');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),45000);let res;
  try{res=await fetch(API+path,{...options,signal:abort.signal,cache:'no-store',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...(options.headers||{})}})}finally{clearTimeout(timer)}
  let body={};try{body=await res.json()}catch{}
  if(!res.ok){const e=new Error((res.status===401||res.status===403)?'Reconnect your account to sync. Your device progress is safe.':body.error||'Cloud unavailable');e.status=res.status;throw e}
  return body;
}
async function getCloud(){return (await cloud('/data')).data||{}}
async function putCloud(s){await cloud('/data',{method:'POST',body:JSON.stringify({data:s})})}
function setStatus(text,ok=true){const el=$('pf27SyncStatus');if(el){el.textContent=text;el.dataset.ok=ok?'1':'0'}}
function checkpoint(label){
 try{const state=localState();if(!countEntries(state))return;
 const history=read('profitRecoverySnapshots_v1',[]),last=history[0];
 if(last&&JSON.stringify(last.state)===JSON.stringify(state))return;
 history.unshift({at:Date.now(),label,state});writeRaw('profitRecoverySnapshots_v1',encode(history.slice(0,6)));
 }catch{}
}
async function uploadDevice(){return mergeSafe(false)}
async function restoreCloud(){return mergeSafe(true)}
async function mergeSafe(reload=true){
 setStatus('Syncing and checking cloud progress…');
 try{
  // Read local state after the network request so edits made while waiting survive.
  const remote=await getCloud(),local=localState(),merged=mergeStates(local,remote);
  const changed=JSON.stringify(local)!==JSON.stringify(merged);
  if(changed){checkpoint('Before cloud merge');applyState(merged)}
  await putCloud(merged);const n=countEntries(merged);
  setStatus(`Synced ${n} entries ✓`);window.__profitLastSync=Date.now();
  window.dispatchEvent(new CustomEvent('profit:synced',{detail:{entries:n,changed}}));
  if(reload&&changed)setTimeout(()=>location.reload(),300);
  return true;
 }catch(e){setStatus(e.message||'Sync failed. Device progress is safe.',false);window.__profitLastSyncError=e.message;return false}
}

function assetMonths(g){
  const target=Math.max(0,Number(g.target)||0),start=Math.max(0,Number(g.invested)||0),monthly=Math.max(0,Number(g.monthlyContribution)||0),r=Math.max(0,Number(g.annualReturn)||0)/1200;
  if(!target)return Infinity;if(start>=target)return 0;
  if(r===0)return monthly>0?Math.ceil((target-start)/monthly):Infinity;
  if(start<=0&&monthly<=0)return Infinity;
  const den=start+monthly/r,num=target+monthly/r;
  if(den<=0||num<=den)return 0;
  const n=Math.log(num/den)/Math.log(1+r);
  return Number.isFinite(n)?Math.max(0,Math.ceil(n)):Infinity;
}
function passiveMonthly(days=30,offset=0){
  const entries=getEntries(),rules=read('profitRecurring_v1',[]),end=new Date();end.setDate(end.getDate()-offset);const start=new Date(end);start.setDate(start.getDate()-days+1);let total=0;
  for(const e of entries){if(e?.incomeType!=='passive'||!e.date)continue;const d=new Date(e.date+'T12:00:00');if(d>=start&&d<=end)total+=Number(e.revenue)||0}
  for(const r of Array.isArray(rules)?rules:[]){if(!r||r.enabled===false||r.type!=='passive')continue;if(r.frequency==='daily')total+=(Number(r.amount)||0)*days;else if(r.frequency==='monthly')total+=(Number(r.amount)||0)*(days/30)}
  return total*(30/days);
}
function passiveProjection(g){const current=passiveMonthly(30,0),previous=passiveMonthly(30,30),target=Math.max(0,Number(g.passiveTargetMonthly)||0),growth=current-previous;let months=Infinity;if(current>=target&&target>0)months=0;else if(target>0&&growth>0)months=Math.ceil((target-current)/growth);return {current,target,months}}
function duration(months){if(!Number.isFinite(months))return 'Not estimated';if(months<=0)return 'Goal reached';const y=Math.floor(months/12),m=months%12;return [y?`${y}y`:'',m?`${m}m`:''].filter(Boolean).join(' ')||'<1m'}
function targetDate(months){if(!Number.isFinite(months))return 'Not estimated';if(months<=0)return 'Now';const d=new Date();d.setMonth(d.getMonth()+months);return d.toLocaleDateString(undefined,{month:'short',year:'numeric'})}

function renderFreedom(){
  const g=getGoal();let card=$('pf27FreedomCard');
  if(!g.enabled){if(card)card.remove();return}
  if(!card){const sw=document.querySelector('.switch,.sw');if(!sw)return;card=document.createElement('section');card.id='pf27FreedomCard';card.className='pf27-freedom';sw.insertAdjacentElement('afterend',card)}
  if(g.basis==='passive'){
    const p=passiveProjection(g),pct=p.target>0?Math.min(100,p.current/p.target*100):0;
    card.innerHTML=`<div class="pf27-head"><div><b>Freedom Progress</b><small>Passive-income freedom</small></div><strong>${pct.toFixed(1).replace('.0','')}%</strong></div><div class="pf27-bar"><i style="width:${pct}%"></i></div><div class="pf27-stats"><span><small>Passive / month</small><b>${money(p.current)}</b></span><span><small>Target / month</small><b>${money(p.target)}</b></span><span><small>Gap</small><b>${money(Math.max(0,p.target-p.current))}</b></span></div><div class="pf27-dates"><span><small>Estimated date</small><b>${targetDate(p.months)}</b></span><span><small>Time left</small><b>${duration(p.months)}</b></span></div>`;
  }else{
    const months=assetMonths(g),pct=g.target>0?Math.min(100,(Number(g.invested)||0)/(Number(g.target)||1)*100):0;
    card.innerHTML=`<div class="pf27-head"><div><b>Freedom Progress</b><small>Invested-asset freedom</small></div><strong>${pct.toFixed(1).replace('.0','')}%</strong></div><div class="pf27-bar"><i style="width:${pct}%"></i></div><div class="pf27-stats"><span><small>Invested</small><b>${money(g.invested)}</b></span><span><small>Freedom number</small><b>${money(g.target)}</b></span><span><small>Remaining</small><b>${money(Math.max(0,g.target-g.invested))}</b></span></div><div class="pf27-dates"><span><small>Estimated date</small><b>${targetDate(months)}</b></span><span><small>Time left</small><b>${duration(months)}</b></span></div>`;
  }
}

function addStyles(){if($('pf27Style'))return;const s=document.createElement('style');s.id='pf27Style';s.textContent=`
.pf27-section{margin:16px 0;padding:16px;border:1px solid #e2e4df;border-radius:20px;background:#f7f8f5}.pf27-section h3{margin:0 0 5px;font-size:18px}.pf27-section>p{margin:0 0 13px;color:#777;font-size:12px;line-height:1.4}.pf27-toggle{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #e4e6e1}.pf27-toggle b{font-size:13px}.pf27-toggle small{display:block;color:#888;margin-top:2px}.pf27-toggle input{width:22px;height:22px;accent-color:#111}.pf27-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.pf27-field label{display:block;margin:0 0 5px;font-size:9px;font-weight:900;color:#777;text-transform:uppercase}.pf27-field input{width:100%;box-sizing:border-box;border:1px solid #dcdeda;border-radius:12px;background:#fff;padding:11px;font-size:16px;font-weight:800}.pf27-save{width:100%;margin-top:11px;border:0;border-radius:13px;padding:12px;background:#111;color:#fff;font-weight:900}.pf27-sync-title{margin-top:18px;font-size:13px;font-weight:900}.pf27-sync-help{margin:4px 0 8px;color:#777;font-size:11px;line-height:1.4}.pf27-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pf27-actions button{border:1px solid #dde0dc;border-radius:12px;padding:11px;background:#fff;color:#111;font-weight:900}.pf27-actions .merge{grid-column:1/-1;background:#111;color:#fff;border-color:#111}.pf27-status{margin-top:9px;padding:9px 10px;border-radius:11px;background:#eef8f2;color:#15744f;font-size:11px;font-weight:800}.pf27-status[data-ok="0"]{background:#fff0f0;color:#b22f2f}.pf27-freedom{margin:14px 0;padding:15px;border:1px solid #e2e5e1;border-radius:21px;background:#fff;box-shadow:0 8px 24px #0000000a}.pf27-head{display:flex;justify-content:space-between;align-items:flex-start}.pf27-head b{font-size:18px}.pf27-head small{display:block;color:#888;margin-top:2px}.pf27-head>strong{font-size:24px;color:#0b9d67}.pf27-bar{height:8px;margin:11px 0;background:#e8ebe8;border-radius:99px;overflow:hidden}.pf27-bar i{display:block;height:100%;background:#10a66d;border-radius:99px}.pf27-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.pf27-stats span,.pf27-dates span{padding:8px;border-radius:12px;background:#f5f6f4}.pf27-stats small,.pf27-dates small{display:block;color:#858886;font-size:8px;text-transform:uppercase;font-weight:900}.pf27-stats b,.pf27-dates b{display:block;margin-top:3px;font-size:12px}.pf27-dates{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}.pf27-dates span{background:#111;color:#fff}.pf27-dates small{color:#aeb4b0}@media(max-width:390px){.pf27-grid{grid-template-columns:1fr}.pf27-stats{grid-template-columns:1fr 1fr}.pf27-stats span:last-child{grid-column:1/-1}}
`;document.head.appendChild(s)}
function showToast(text){const e=$('toast');if(!e)return;e.textContent=text;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1700)}
function settingsHost(){return document.querySelector('#modal .box')||document.querySelector('#settingsModal .modal')||document.querySelector('#settingsModal .box')||$('#settingsModal')}
function injectSettings(){
  const host=settingsHost();if(!host||$('pf27Section'))return;
  const g=getGoal(),section=document.createElement('section');section.id='pf27Section';section.className='pf27-section';
  section.innerHTML=`<h3>Freedom & cloud</h3><p>Freedom Progress stays hidden unless you enable it here.</p><label class="pf27-toggle"><span><b>Show Freedom Progress</b><small>Optional dashboard card</small></span><input id="pf27Enabled" type="checkbox" ${g.enabled?'checked':''}></label><label class="pf27-toggle"><span><b>Base freedom on passive income</b><small>Off = invested assets · On = passive income</small></span><input id="pf27Passive" type="checkbox" ${g.basis==='passive'?'checked':''}></label><div class="pf27-grid"><div class="pf27-field"><label>Freedom number</label><input id="pf27Target" type="number" min="0" inputmode="decimal" value="${Number(g.target)||0}"></div><div class="pf27-field"><label>Currently invested</label><input id="pf27Invested" type="number" min="0" inputmode="decimal" value="${Number(g.invested)||0}"></div><div class="pf27-field"><label>Invest each month</label><input id="pf27Monthly" type="number" min="0" inputmode="decimal" value="${Number(g.monthlyContribution)||0}"></div><div class="pf27-field"><label>Expected annual return %</label><input id="pf27Return" type="number" min="0" max="30" step="0.1" inputmode="decimal" value="${Number(g.annualReturn)||0}"></div><div class="pf27-field" style="grid-column:1/-1"><label>Passive income target / month</label><input id="pf27PassiveTarget" type="number" min="0" inputmode="decimal" value="${Number(g.passiveTargetMonthly)||0}"></div></div><button id="pf27Save" class="pf27-save" type="button">Save Freedom settings</button><div class="pf27-sync-title">Cloud progress</div><div class="pf27-sync-help">Use Merge safely when both devices may contain progress. It keeps entries from both sides.</div><div class="pf27-actions"><button id="pf27Upload" type="button">Upload this device</button><button id="pf27Restore" type="button">Restore cloud</button><button id="pf27Merge" class="merge" type="button">Merge safely</button></div><div id="pf27SyncStatus" class="pf27-status">Choose Upload, Restore, or Merge safely</div>`;
  const auto=host.querySelector('.auto-section,.auto');if(auto)auto.insertAdjacentElement('beforebegin',section);else{const save=$('saveSettings');save?save.insertAdjacentElement('beforebegin',section):host.appendChild(section)}
}
function bindControls(){
  document.addEventListener('click',e=>{
    const id=e.target?.id;
    if(id==='pf27Save'){
      e.preventDefault();const g=setGoal({enabled:$('pf27Enabled').checked,basis:$('pf27Passive').checked?'passive':'assets',target:Math.max(0,Number($('pf27Target').value)||0),invested:Math.max(0,Number($('pf27Invested').value)||0),monthlyContribution:Math.max(0,Number($('pf27Monthly').value)||0),annualReturn:Math.max(0,Math.min(30,Number($('pf27Return').value)||0)),passiveTargetMonthly:Math.max(0,Number($('pf27PassiveTarget').value)||0)});showToast(g.enabled?'Freedom Progress saved':'Freedom Progress hidden');
    }else if(id==='pf27Upload'){e.preventDefault();uploadDevice()}
    else if(id==='pf27Restore'){e.preventDefault();restoreCloud()}
    else if(id==='pf27Merge'){e.preventDefault();mergeSafe(true)}
  },true);
}
function enhanceBackup(){
  const exp=$('exbtn')||$('exportBtn'),imp=$('imbtn')||$('importBtn');
  if(exp&&!exp.dataset.pf27){exp.dataset.pf27='1';exp.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const data=JSON.stringify({format:'profit-backup-v27',exportedAt:new Date().toISOString(),state:localState()},null,2),name=`profit-backup-${nowDate()}.json`;try{if(window.AndroidProfit?.exportBackup){window.AndroidProfit.exportBackup(data,name);showToast('Choose where to save');return}}catch{}const blob=new Blob([data],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();const u=a.href;a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)},true)}
  if(imp&&!imp.dataset.pf27){imp.dataset.pf27='1';let file=$('pf27ImportFile');if(!file){file=document.createElement('input');file.id='pf27ImportFile';file.type='file';file.accept='.json,application/json';file.hidden=true;document.body.appendChild(file);file.addEventListener('change',async()=>{try{const f=file.files?.[0];if(!f)return;const data=JSON.parse(await f.text());let s=data.state||data;if(Array.isArray(data.entries))s={profitEntries_v8:encode(data.entries),profitPrefs_v8:encode(data.prefs||{}),profitRecurring_v1:encode(data.recurring||[]),profitRewards_v1:encode(data.unlocked||{})};if(!s||typeof s!=='object'||(!countEntries(s)&&!s.profitPrefs_v8))throw new Error();checkpoint('Before backup import');applyState(mergeStates(localState(),s));showToast('Backup restored');setTimeout(()=>location.reload(),250)}catch{showToast('Invalid backup')}finally{file.value=''}})}imp.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();file.click()},true)}
}
function boot(){migrateGoal();getEntries();addStyles();injectSettings();renderFreedom();enhanceBackup();bindControls()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,60),{once:true});else setTimeout(boot,60);
window.__profitV27={getGoal,setGoal,localState,countEntries,mergeStates,uploadDevice,restoreCloud,mergeSafe,renderFreedom,applyState,checkpoint};
})();