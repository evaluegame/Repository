(()=>{'use strict';
const API='https://profit-auth-api.onrender.com';
const ACC='profit_auth_accounts_v1',LOCAL_SESSION='profit_auth_session_v1',MIG='profit_auth_legacy_migrated_v1';
const CLOUD_TOKEN='profit_cloud_token_v1',CLOUD_USER='profit_cloud_user_v1',CLOUD_STORAGE='profit_cloud_storage_v1';
const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
const rawGet=k=>nativeGet.call(localStorage,k),rawSet=(k,v)=>nativeSet.call(localStorage,k,v),rawRemove=k=>nativeRemove.call(localStorage,k);
const enc=new TextEncoder();
const ALIASES='profit_auth_storage_aliases_v1';
function busy(text){let el=document.getElementById('profitBootStatus');if(!el){el=document.createElement('div');el.id='profitBootStatus';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.style.cssText='position:fixed;inset:0;z-index:100000;background:#f6f6f4;display:grid;place-items:center;font:700 18px system-ui';document.body.appendChild(el)}el.textContent=text}
function ready(){document.getElementById('profitBootStatus')?.remove()}
function storageIdFor(user,preferred){let aliases={};try{aliases=JSON.parse(rawGet(ALIASES)||'{}')}catch{}const cached=cachedCloudUser();const sid=aliases[user.email]||preferred||(cached?.email===user.email?rawGet(CLOUD_STORAGE):null)||user.id;aliases[user.email]=sid;rawSet(ALIASES,JSON.stringify(aliases));return sid}
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function localAccounts(){try{const a=JSON.parse(rawGet(ACC)||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
async function derive(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},key,256);return b64(bits)}
function appKey(k){return k==='simpleProfit_v3'||(k.startsWith('profit')&&!k.startsWith('profit_user_')&&!k.startsWith('profit_auth_')&&!k.startsWith('profit_cloud_'))}
function scoped(user,k){return `profit_user_${user}_${k}`}
function migrateLegacy(user){if(rawGet(MIG))return;const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&appKey(k))keys.push(k)}for(const k of keys){const v=rawGet(k),dst=scoped(user,k);if(v!==null&&rawGet(dst)===null)rawSet(dst,v)}rawSet(MIG,user)}
function patchStorage(user){
 if(window.__profitStoragePatched)return;window.__profitStoragePatched=true;
 const map=k=>appKey(String(k))?scoped(user,String(k)):String(k);
 Storage.prototype.getItem=function(k){return nativeGet.call(this,this===localStorage?map(k):k)};
 Storage.prototype.setItem=function(k,v){
  if(this!==localStorage)return nativeSet.call(this,k,v);
  const key=String(k),before=nativeGet.call(this,map(key));
  if(['profitEntries_v8','profitRecurring_v1'].includes(key)&&before!==String(v)){
   try{const old=JSON.parse(before||'[]'),next=JSON.parse(v);if(Array.isArray(old)&&Array.isArray(next)){
    const kept=new Set(next.map(x=>String(x.id)));const tombKey=key==='profitEntries_v8'?'profitDeletedEntries_v1':'profitDeletedRules_v1';
    const tomb=JSON.parse(nativeGet.call(this,map(tombKey))||'{}');
    for(const x of old)if(x.id!=null&&!kept.has(String(x.id)))tomb[x.id]=Date.now();
    nativeSet.call(this,map(tombKey),JSON.stringify(tomb));
   }}catch{}
  }
  nativeSet.call(this,map(key),v);
  if(appKey(key)&&before!==String(v)&&!window.__profitSyncApplying)window.dispatchEvent(new CustomEvent('profit:datachanged',{detail:{key}}));
 };
 Storage.prototype.removeItem=function(k){return nativeRemove.call(this,this===localStorage?map(k):k)};
 window.__profitStorageId=user;
}
async function request(path,opt={}){
 const headers={'Content-Type':'application/json',...(opt.headers||{})};const token=rawGet(CLOUD_TOKEN);
 if(token&&!headers.Authorization)headers.Authorization=`Bearer ${token}`;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 let r;try{r=await fetch(API+path,{...opt,headers,cache:'no-store',signal:controller.signal})}
 catch(ex){const e=new Error(ex.name==='AbortError'?'The server is taking too long. Please try again.':'Cloud service unavailable. Check your internet connection.');e.status=0;throw e}
 finally{clearTimeout(timeout)}
 let data={};try{data=await r.json()}catch{}
 if(!r.ok){const e=new Error(data.error||'Request failed.');e.status=r.status;throw e}return data;
}
function style(){const s=document.createElement('style');s.id='profit-auth-style';s.textContent=`body.auth-locked{overflow:hidden}.auth-locked>.app,.auth-locked>#welcomeModal,.auth-locked>#settingsModal,.auth-locked>#toast{visibility:hidden!important}#profitAuthRoot{position:fixed;inset:0;z-index:99999;background:#f6f6f4;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#111;overflow:auto}.pa-card{width:min(430px,100%);background:#fff;border:1px solid #e8e8e5;border-radius:28px;padding:24px;box-shadow:0 20px 60px #00000014}.pa-logo{width:52px;height:52px;border-radius:16px;background:#111;color:#fff;display:grid;place-items:center;font-size:25px;font-weight:950;margin-bottom:18px}.pa-card h1{font-size:28px;letter-spacing:-.8px;margin:0}.pa-card p{color:#74747b;line-height:1.45;font-size:14px;margin:8px 0 18px}.pa-upgrade{background:#effbe9;border:1px solid #cceebd;color:#246516;border-radius:14px;padding:11px 12px;font-size:12px;font-weight:800;margin-bottom:14px}.pa-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;background:#f0f0ee;padding:5px;border-radius:15px;margin-bottom:16px}.pa-tabs button{border:0;background:transparent;border-radius:11px;padding:10px;font-weight:900;color:#777}.pa-tabs button.on{background:#111;color:#fff}.pa-form{display:grid;gap:10px}.pa-field label{display:block;font-size:11px;text-transform:uppercase;font-weight:850;color:#85858b;margin:0 0 6px 2px}.pa-field input{width:100%;border:1px solid #e5e5e2;border-radius:14px;padding:13px 14px;font-size:16px;outline:none;background:#fafaf9}.pa-main{width:100%;border:0;border-radius:16px;background:#111;color:#fff;padding:14px;font-size:15px;font-weight:900;margin-top:3px}.pa-error{min-height:18px;color:#c93434;font-size:12px;font-weight:750}.pa-note{font-size:11px!important;color:#999!important;margin:14px 2px 0!important}.pa-hidden{display:none!important}.profit-account-btn{width:40px;height:40px;border:1px solid #e9e9e6;background:#fff;border-radius:14px;font-size:17px;cursor:pointer}`;document.head.appendChild(s)}
function saveCloud(data,storageId){storageId=storageIdFor(data.user,storageId);rawSet(CLOUD_TOKEN,data.token);rawSet(CLOUD_USER,JSON.stringify(data.user));rawSet(CLOUD_STORAGE,storageId||data.user.id);rawRemove(LOCAL_SESSION)}
async function verifyLocal(a,password){try{return (await derive(password,unb64(a.salt)))===a.hash}catch{return false}}
function gate(prefill='',upgrade=false){ready();document.body.classList.add('auth-locked');style();const root=document.createElement('div');root.id='profitAuthRoot';root.innerHTML=`<div class="pa-card"><div class="pa-logo">P</div><h1>Welcome to Profit</h1><p>Create an account or log in to use your private Profit dashboard on any device.</p>${upgrade?'<div class="pa-upgrade">Existing account found on this device. Log in once to upgrade it to your cloud account.</div>':''}<div class="pa-tabs"><button id="paLoginTab" class="on" type="button">Log in</button><button id="paSignupTab" type="button">Create account</button></div><form id="paLogin" class="pa-form"><div class="pa-field"><label>Email</label><input id="paLoginEmail" type="email" autocomplete="email" required value="${String(prefill).replace(/"/g,'&quot;')}"></div><div class="pa-field"><label>Password</label><input id="paLoginPassword" type="password" autocomplete="current-password" required></div><div id="paLoginError" class="pa-error" role="alert" aria-live="polite"></div><button class="pa-main" type="submit">Log in</button></form><form id="paSignup" class="pa-form pa-hidden"><div class="pa-field"><label>Name</label><input id="paName" type="text" maxlength="40" autocomplete="name" placeholder="Optional"></div><div class="pa-field"><label>Email</label><input id="paEmail" type="email" autocomplete="email" required></div><div class="pa-field"><label>Password</label><input id="paPassword" type="password" minlength="8" autocomplete="new-password" required></div><div class="pa-field"><label>Confirm password</label><input id="paConfirm" type="password" minlength="8" autocomplete="new-password" required></div><div id="paSignupError" class="pa-error" role="alert" aria-live="polite"></div><button class="pa-main" type="submit">Create account</button></form><p class="pa-note">Your account stays signed in on this device unless you choose Log out. Your Profit data can be synced from Settings.</p></div>`;document.body.appendChild(root);
const loginTab=root.querySelector('#paLoginTab'),signupTab=root.querySelector('#paSignupTab'),login=root.querySelector('#paLogin'),signup=root.querySelector('#paSignup');function tab(which){const l=which==='login';loginTab.classList.toggle('on',l);signupTab.classList.toggle('on',!l);login.classList.toggle('pa-hidden',!l);signup.classList.toggle('pa-hidden',l)}loginTab.onclick=()=>tab('login');signupTab.onclick=()=>tab('signup');
const submitLogin=async e=>{e.preventDefault();const email=root.querySelector('#paLoginEmail').value.trim().toLowerCase(),password=root.querySelector('#paLoginPassword').value,err=root.querySelector('#paLoginError');err.textContent='';try{const data=await request('/login',{method:'POST',body:JSON.stringify({email,password})});const local=localAccounts().find(x=>x.email===email);saveCloud(data,local?.id||data.user.id);return start({...data.user,storageId:local?.id||data.user.id});}catch(ex){if(ex.status!==404){err.textContent=ex.message;return}const local=localAccounts().find(x=>x.email===email);if(!local){err.textContent='Account not found.';return}if(!(await verifyLocal(local,password))){err.textContent='Incorrect password.';return}try{const data=await request('/signup',{method:'POST',body:JSON.stringify({email,password,name:local.name||''})});saveCloud(data,local.id);start({...data.user,storageId:local.id});}catch(m){if(m.status===409){try{const data=await request('/login',{method:'POST',body:JSON.stringify({email,password})});saveCloud(data,local.id);start({...data.user,storageId:local.id});}catch(x){err.textContent=x.message}}else err.textContent=m.message}}};
const submitSignup=async e=>{e.preventDefault();const name=root.querySelector('#paName').value.trim(),email=root.querySelector('#paEmail').value.trim().toLowerCase(),password=root.querySelector('#paPassword').value,confirm=root.querySelector('#paConfirm').value,err=root.querySelector('#paSignupError');err.textContent='';if(localAccounts().some(x=>x.email===email)){err.textContent='This account already exists on this device. Use Log in to upgrade it.';return}if(password!==confirm){err.textContent='Passwords do not match.';return}try{const data=await request('/signup',{method:'POST',body:JSON.stringify({name,email,password})});saveCloud(data,data.user.id);start({...data.user,storageId:data.user.id})}catch(ex){err.textContent=ex.message}};
function submitting(form,handler,label){form.onsubmit=async e=>{
 e.preventDefault();const button=form.querySelector('button[type="submit"]');if(button.disabled)return;
 button.disabled=true;button.textContent=label;form.setAttribute('aria-busy','true');
 const note=document.createElement('div');note.className='pa-request-status';note.setAttribute('role','status');note.style.cssText='font-size:12px;color:#666';note.textContent=label;button.before(note);
 const timer=setTimeout(()=>note.textContent='Still connecting… The server may be waking up.',7000);
 try{await handler(e)}finally{clearTimeout(timer);button.disabled=false;button.textContent=form===login?'Log in':'Create account';form.removeAttribute('aria-busy');note.remove()}
}}
submitting(login,submitLogin,'Signing in…');submitting(signup,submitSignup,'Creating account…');
}
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load '+src));document.body.appendChild(s)})}
async function loadApp(){const files=['v10-patch.js?v=31','v11-daily-fix.js?v=11','v12-pro.js?v=12','v13-install-roi.js?v=30','v14-active-passive.js?v=19','v19-profit-trend-roi.js?v=20','v27-freedom-sync.js?v=31','v28-freedom-passive.js?v=31','v29-passive-rewards.js?v=29','v31-reliability.js?v=31'];for(const f of files){busy('Loading your dashboard…');await loadScript(f)}}
function accountButton(a){setTimeout(()=>{const holder=document.querySelector('.top-right,.tr');if(!holder||document.getElementById('profitAccountBtn'))return;const b=document.createElement('button');b.id='profitAccountBtn';b.type='button';b.className='profit-account-btn';b.textContent='👤';b.title=`${a.name||a.email}\n${a.email}`;b.onclick=()=>{if(confirm(`Signed in as ${a.email}\n\nLog out?`)){const t=rawGet(CLOUD_TOKEN);if(t)fetch(API+'/logout',{method:'POST',headers:{Authorization:`Bearer ${t}`}}).catch(()=>{});rawRemove(CLOUD_TOKEN);rawRemove(CLOUD_USER);rawRemove(CLOUD_STORAGE);rawRemove(LOCAL_SESSION);location.reload()}};holder.appendChild(b)},350)}
async function start(a){
 if(window.__profitStarted)return;window.__profitStarted=true;
 const sid=storageIdFor(a,a.storageId||rawGet(CLOUD_STORAGE));rawSet(CLOUD_STORAGE,sid);
 migrateLegacy(sid);patchStorage(sid);document.getElementById('profitAuthRoot')?.remove();document.body.classList.remove('auth-locked');busy('Loading your dashboard…');
 try{await loadApp();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js?v=31',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});accountButton(a);ready();window.__profitAppReady=true;window.dispatchEvent(new Event('profit:ready'))}
 catch(e){console.error(e);busy('Profit could not finish loading. Your saved data is still on this device.');const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=()=>location.reload();document.getElementById('profitBootStatus').appendChild(retry)}
}
function cachedCloudUser(){try{const u=JSON.parse(rawGet(CLOUD_USER)||'null');return u&&u.id&&u.email?u:null}catch{return null}}
async function boot(){
 const token=rawGet(CLOUD_TOKEN),cached=cachedCloudUser();
 if(cached){
  // Open the saved dashboard immediately. A network error or expired cloud token
  // must not erase account-to-storage mapping or hide the user's local records.
  const opening=start({...cached,storageId:rawGet(CLOUD_STORAGE)||cached.id});
  if(token)request('/me',{method:'GET'}).then(data=>{rawSet(CLOUD_USER,JSON.stringify(data.user));window.__profitCloudAuthRequired=false}).catch(ex=>{window.__profitCloudAuthRequired=ex.status===401||ex.status===403;window.dispatchEvent(new Event('profit:cloudstatus'))});
  return opening;
 }
 if(token){busy('Checking your saved account…');try{const data=await request('/me',{method:'GET'});rawSet(CLOUD_USER,JSON.stringify(data.user));return start({...data.user,storageId:rawGet(CLOUD_STORAGE)||data.user.id})}catch{}}
 const localSid=rawGet(LOCAL_SESSION),local=localAccounts().find(x=>x.id===localSid);gate(local?.email||'',!!local);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
