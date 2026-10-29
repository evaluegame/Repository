(()=>{'use strict';
const API='https://profit-auth-api.onrender.com';
const TOKEN='profit_cloud_token_v1',USER='profit_cloud_user_v1',STORAGE='profit_cloud_storage_v1';
function install(){
  const root=document.getElementById('profitAuthRoot');
  if(!root)return;
  const err=root.querySelector('#paLoginError');
  if(!err||err.__profitActivationObserved)return;
  err.__profitActivationObserved=true;
  const addButton=()=>{
    if(err.textContent.trim()!=='Account not found.')return;
    if(root.querySelector('#paActivateCloud'))return;
    err.textContent='This account has not been activated in the cloud yet.';
    const btn=document.createElement('button');
    btn.id='paActivateCloud';
    btn.type='button';
    btn.className='pa-main';
    btn.style.background='#eaff59';
    btn.style.color='#111';
    btn.style.marginTop='0';
    btn.textContent='Activate existing account in cloud';
    const note=document.createElement('div');
    note.id='paActivateNote';
    note.style.cssText='font-size:11px;color:#777;line-height:1.4;margin:-2px 2px 6px';
    note.textContent='Use the same email and password. This creates the cloud copy of your existing login; it does not delete your browser data.';
    const loginForm=root.querySelector('#paLogin');
    const submit=loginForm?.querySelector('button[type="submit"]');
    if(submit){submit.before(note,btn)}
    btn.onclick=async()=>{
      const email=root.querySelector('#paLoginEmail')?.value.trim().toLowerCase();
      const password=root.querySelector('#paLoginPassword')?.value||'';
      if(!email||!password){err.textContent='Enter your email and password first.';return}
      btn.disabled=true;btn.textContent='Activating…';err.textContent='';
      try{
        let r=await fetch(API+'/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,name:''}),cache:'no-store'});
        let data={};try{data=await r.json()}catch{}
        if(r.status===409){
          r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password}),cache:'no-store'});
          try{data=await r.json()}catch{}
        }
        if(!r.ok)throw new Error(data.error||'Could not activate account.');
        localStorage.setItem(TOKEN,data.token);
        localStorage.setItem(USER,JSON.stringify(data.user));
        localStorage.setItem(STORAGE,data.user.id);
        err.style.color='#16803a';err.textContent='Cloud account activated. Opening Profit…';
        setTimeout(()=>location.reload(),350);
      }catch(e){btn.disabled=false;btn.textContent='Activate existing account in cloud';err.style.color='#c93434';err.textContent=e.message||'Could not activate account.'}
    };
  };
  const mo=new MutationObserver(addButton);mo.observe(err,{childList:true,characterData:true,subtree:true});addButton();
}
const bodyObs=new MutationObserver(install);bodyObs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
