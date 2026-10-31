(()=>{'use strict';
const API='https://profit-auth-api.onrender.com',PREF='profitExperience_v31';
const $=id=>document.getElementById(id),read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
let syncing=false,again=false,timer,started=false;
const user=()=>read('profit_cloud_user_v1',{});
const prefs=()=>({freedomPopup:false,...read(PREF,{})});
function status(text,error=false){const e=$('profitCloudStatus');if(e){e.textContent=text;e.style.color=error?'#b42318':'#24704e'}}
function announce(text){const e=$('toast');if(e){e.textContent=text;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3000)}}
async function sync(manual=false){
 if(syncing){again=true;return false}if(!navigator.onLine){status('Offline · progress saved on this device');return false}
 if(!localStorage.getItem('profit_cloud_token_v1')){status('Reconnect your account to sync',true);return false}
 syncing=true;const button=$('profitSyncNow');if(button)button.disabled=true;status('Syncing your progress…');
 try{
  const before=window.__profitV27.localState();
  const ok=await window.__profitV27.mergeSafe(false);
  if(ok){status('Synced · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
   const after=window.__profitV27.localState();
   if(before.profitEntries_v8!==after.profitEntries_v8||before.profitRecurring_v1!==after.profitRecurring_v1){
    // Rehydrate the in-memory ledger without interrupting a form or opening Settings.
    window.__profitDashboard?.refresh();status('Progress restored and synced');
    window.__profitV28?.renderFreedom();window.__profitV29?.render();
   }else{window.__profitV28?.renderFreedom();window.__profitV29?.render()}
   if(manual)announce('Progress synced safely');
  }else{const msg=window.__profitLastSyncError||'Could not sync. Your device progress is safe.';status(msg,true);if(manual)announce(msg)}
  return ok;
 }finally{syncing=false;if(button)button.disabled=false;if(again){again=false;schedule()}}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>sync(false),1200)}
function popup(){
 if($('profitFreedomPopup'))return;const g=window.__profitV28.goal(),pct=g.target>0?Math.max(0,Math.min(100,(+g.invested||0)/g.target*100)):0;
 const months=window.__profitV28.assetMonths(g),date=new Date();if(Number.isFinite(months))date.setMonth(date.getMonth()+months);
 const currency=read('profitPrefs_v8',{}).currency||'USD',money=v=>new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:0}).format(+v||0);
 const overlay=document.createElement('div');overlay.id='profitFreedomPopup';overlay.style.cssText='position:fixed;inset:0;z-index:80000;background:#0009;display:grid;place-items:center;padding:20px';
 overlay.innerHTML='<section role="dialog" aria-modal="true" aria-label="Financial freedom" style="background:#fff;color:#111;border-radius:25px;padding:25px;width:min(420px,100%);box-sizing:border-box"><h2 style="margin:0 0 8px">Financial freedom</h2><p id="profitFreedomSummary" style="line-height:1.6"></p><p id="profitFreedomEstimate" style="color:#666;font-size:13px"></p><label style="display:flex;gap:10px;align-items:center;font-size:13px"><input id="profitPopupEnabled" type="checkbox">Show this popup when Profit opens</label><button id="profitPopupClose" type="button" style="width:100%;padding:13px;border:0;border-radius:13px;background:#111;color:#fff;font-weight:800;margin-top:18px">Continue to Profit</button></section>';
 document.body.appendChild(overlay);$('profitFreedomSummary').textContent=`${pct.toFixed(1)}% of your goal · ${money(g.invested)} invested · ${money(Math.max(0,g.target-g.invested))} remaining.`;
 $('profitFreedomEstimate').textContent=Number.isFinite(months)?`Estimated freedom date: ${months===0?'Goal reached':date.toLocaleDateString(undefined,{month:'long',year:'numeric'})}. Based on your saved assumptions.`:'Set your investment target and monthly contribution in Settings to estimate a freedom date.';
 $('profitPopupEnabled').checked=prefs().freedomPopup;$('profitPopupEnabled').onchange=e=>{localStorage.setItem(PREF,JSON.stringify({...prefs(),freedomPopup:e.target.checked}));if($('profitFreedomPopupSetting'))$('profitFreedomPopupSetting').checked=e.target.checked};
 $('profitPopupClose').onclick=()=>overlay.remove();$('profitPopupClose').focus();
}
function reconnect(){
 if($('profitReconnect'))return;const wrap=document.createElement('div');wrap.id='profitReconnect';wrap.style.cssText='position:fixed;inset:0;z-index:90000;background:#0009;display:grid;place-items:center;padding:20px';
 wrap.innerHTML='<form style="background:#fff;padding:24px;border-radius:22px;width:min(420px,100%);box-sizing:border-box"><h2>Reconnect cloud sync</h2><p id="profitReconnectEmail"></p><p style="font-size:12px;color:#777">Your local records stay available. Enter your password to reconnect this account.</p><label>Password<input type="password" required autocomplete="current-password" style="display:block;padding:12px;width:100%;box-sizing:border-box;margin:8px 0"></label><div role="alert" id="profitReconnectError" style="color:#b42318;font-size:13px"></div><button type="submit" class="btn dark" style="margin-top:12px">Reconnect</button><button type="button" id="profitReconnectCancel" class="btn soft">Cancel</button></form>';
 document.body.appendChild(wrap);$('profitReconnectEmail').textContent=user().email||'';$('profitReconnectCancel').onclick=()=>wrap.remove();
 wrap.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=wrap.querySelector('button[type=submit]');b.disabled=true;b.textContent='Connecting…';const abort=new AbortController(),t=setTimeout(()=>abort.abort(),45000);
  try{const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user().email,password:wrap.querySelector('input').value}),signal:abort.signal});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not reconnect');if(d.user.email!==user().email)throw new Error('Account does not match');localStorage.setItem('profit_cloud_token_v1',d.token);localStorage.setItem('profit_cloud_user_v1',JSON.stringify(d.user));window.__profitCloudAuthRequired=false;wrap.remove();sync(true)}
  catch(ex){$('profitReconnectError').textContent=ex.name==='AbortError'?'Connection timed out. Please try again.':ex.message}
  finally{clearTimeout(t);b.disabled=false;b.textContent='Reconnect'}
 };
}
function settings(){
 const host=document.querySelector('#modal .box')||document.querySelector('#settingsModal .modal');if(!host||$('profitReliabilitySettings'))return;
 const sec=document.createElement('section');sec.id='profitReliabilitySettings';sec.className='pf28-section';
 sec.innerHTML='<h3>Account & sync</h3><p id="profitAccountEmail"></p><div role="status" aria-live="polite" id="profitCloudStatus" style="font-size:12px;padding:8px 0">Progress saved on this device</div><button id="profitSyncNow" type="button" class="btn dark">Sync now · merge safely</button><button id="profitReconnectButton" type="button" class="btn soft">Reconnect account</button><p style="font-size:11px">Sync keeps records from both devices. You stay signed in when the app closes or the connection drops.</p><h3 style="margin-top:18px">Financial freedom</h3><label class="pf28-toggle"><span><b>Show financial freedom popup</b><small>When the app opens · optional</small></span><input id="profitFreedomPopupSetting" type="checkbox"></label><button id="profitViewFreedom" type="button" class="btn soft">View financial freedom</button><h3 style="margin-top:18px">Recover earlier progress</h3><p>Missing records after an update? Sync first to recover this account’s cloud history. An older Profit installation may have separate device storage.</p><button id="profitOpenPrevious" type="button" class="btn soft" hidden>Open previous Profit app</button><p id="profitRecoveryHelp" style="font-size:11px">In the older app or browser, sign in to the same account and choose Sync now, or export a backup and import it here. Keep the older app installed until your records are recovered.</p><label style="font-size:12px">Local recovery copies<select id="profitRecoveryCopies" style="width:100%;padding:10px;margin:8px 0"></select></label><button id="profitRecoverCopy" type="button" class="btn soft">Merge selected recovery copy</button><p style="font-size:11px">Recovery copies are created before cloud merges and backup imports. Recovering adds records without replacing your current history.</p><button id="profitExplicitLogout" type="button" class="btn soft">Log out</button>';
 const anchor=host.querySelector('.auto,.auto-section');anchor?anchor.before(sec):host.appendChild(sec);$('profitAccountEmail').textContent=user().email||'Saved account';const version=document.createElement('p');version.style.cssText='font-size:11px;color:#888';version.textContent='Profit '+((navigator.userAgent.match(/ProfitNative\/([\d.]+)/)||[])[1]||'web · latest');sec.appendChild(version);
 $('profitSyncNow').onclick=()=>sync(true);$('profitReconnectButton').onclick=reconnect;
 $('profitFreedomPopupSetting').checked=prefs().freedomPopup;$('profitFreedomPopupSetting').onchange=e=>localStorage.setItem(PREF,JSON.stringify({...prefs(),freedomPopup:e.target.checked}));$('profitViewFreedom').onclick=popup;
 if(window.AndroidProfit?.hasPreviousProfit?.()){const b=$('profitOpenPrevious');b.hidden=false;b.onclick=()=>window.AndroidProfit.openPreviousProfit()}
 const copies=read('profitRecoverySnapshots_v1',[]),select=$('profitRecoveryCopies');
 if(!copies.length){select.add(new Option('No recovery copies yet',''));$('profitRecoverCopy').disabled=true}
 copies.forEach((x,i)=>select.add(new Option(`${new Date(x.at).toLocaleString()} · ${window.__profitV27.countEntries(x.state)} records`,String(i))));
 $('profitRecoverCopy').onclick=()=>{const copy=copies[Number(select.value)];if(!copy)return;window.__profitV27.checkpoint('Before recovery');const current=window.__profitV27.localState(),deleted=read('profitDeletedEntries_v1',{});for(const row of JSON.parse(copy.state.profitEntries_v8||'[]'))delete deleted[row.id];current.profitDeletedEntries_v1=JSON.stringify(deleted);const recovery={...copy.state,profitDeletedEntries_v1:'{}'};window.__profitV27.applyState(window.__profitV27.mergeStates(current,recovery));location.reload()};
 $('profitExplicitLogout').onclick=()=>{if(!confirm('Log out of this account? Your saved records will stay on this device.'))return;const t=localStorage.getItem('profit_cloud_token_v1');if(t)fetch(API+'/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(()=>{});for(const k of ['profit_cloud_token_v1','profit_cloud_user_v1','profit_cloud_storage_v1','profit_auth_session_v1'])localStorage.removeItem(k);location.reload()};
}
function boot(){
 if(started)return;started=true;settings();window.__profitV27.checkpoint('App opened');
 window.addEventListener('profit:datachanged',e=>{if(!['profitRecoverySnapshots_v1','profitFreedomV28Migrated_v1'].includes(e.detail?.key))schedule()});
 window.addEventListener('online',()=>sync(false));window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});window.addEventListener('profit:cloudstatus',()=>{if(window.__profitCloudAuthRequired)status('Reconnect your account to sync. Local progress is safe.',true)});
 setInterval(()=>{if(!document.hidden)sync(false)},60000);
 if(prefs().freedomPopup)popup();sync(false);
 window.__profitReliability={sync,popup,reconnect};
}
const waiting=setInterval(()=>{if(window.__profitV28&&window.__profitV27&&document.querySelector('#modal .box')){clearInterval(waiting);boot()}},100);
})();
