const __aipostPlatforms=['youtube','tiktok','instagram','facebook','threads','linkedin','pinterest','telegram','bluesky','x','snapchat'];
const __aipost$=s=>document.querySelector(s);

function __aipostToast(msg){
  const t=__aipost$('#toast');
  if(t){t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),5200)}
  else console.log('[AiPost]',msg);
}

async function __aipostJson(url,opt={}){
  const r=await fetch(url,opt);
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(d.error||d.job?.status||('Request failed ('+r.status+')'));
    err.data=d;
    throw err;
  }
  return d;
}

function __aipostExtractConnections(){
  const out={};
  const isVault=v=>typeof v==='string'&&v.length>45&&/^[A-Za-z0-9_-]+$/.test(v);
  const walk=(value,hint='',depth=0)=>{
    if(depth>8||value==null)return;
    if(typeof value==='string'){
      if(hint&&__aipostPlatforms.includes(hint)&&isVault(value))out[hint]=value;
      try{const p=JSON.parse(value);walk(p,hint,depth+1)}catch{}
      return;
    }
    if(Array.isArray(value)){for(const v of value)walk(v,hint,depth+1);return}
    if(typeof value!=='object')return;
    const explicit=String(value.platform||value.id||'').toLowerCase();
    const pHint=__aipostPlatforms.includes(explicit)?explicit:hint;
    if(pHint&&isVault(value.vault))out[pHint]=value.vault;
    for(const [k,v] of Object.entries(value)){
      const kl=String(k).toLowerCase();
      const childHint=__aipostPlatforms.includes(kl)?kl:pHint;
      if(__aipostPlatforms.includes(kl)&&isVault(v))out[kl]=v;
      if(kl==='vault'&&pHint&&isVault(v))out[pHint]=v;
      walk(v,childHint,depth+1);
    }
  };
  for(const store of [window.localStorage,window.sessionStorage]){
    try{
      for(let i=0;i<store.length;i++){
        const key=store.key(i)||'';
        const raw=store.getItem(key);
        const keyHint=__aipostPlatforms.find(p=>key.toLowerCase().includes(p))||'';
        walk(raw,keyHint,0);
      }
    }catch{}
  }
  return out;
}

function __aipostSelected(){
  return [...document.querySelectorAll('#channels input[type="checkbox"]:checked')]
    .map(x=>String(x.value||'').toLowerCase())
    .filter(p=>__aipostPlatforms.includes(p));
}

async function __aipostPublish(){
  const btn=__aipost$('#publish');
  if(btn){btn.disabled=true;btn.textContent='Publishing…'}
  try{
    const state=await __aipostJson('/api/state');
    const uploads=Array.isArray(state.uploads)?state.uploads:[];
    const visibleName=(__aipost$('#fn')?.textContent||'').trim();
    const upload=uploads.find(u=>visibleName&&u.name===visibleName)||uploads[0];
    if(!upload)throw new Error('No uploaded video exists on the server. Upload the video again.');

    const title=(__aipost$('#title')?.value||'').trim();
    const caption=(__aipost$('#caption')?.value||'').trim();
    if(!title&&!caption)throw new Error('AI is still analyzing. Wait for the title/caption, or enter one manually.');

    const allSelected=__aipostSelected();
    const connections=__aipostExtractConnections();
    const connectedSelected=allSelected.filter(p=>connections[p]);
    if(!connectedSelected.length){
      const connected=Object.keys(connections);
      if(connected.length)throw new Error('Select a connected destination first: '+connected.join(', '));
      throw new Error('Connect at least one social account in Accounts before publishing.');
    }

    __aipostToast('Publishing original uploaded video to '+connectedSelected.join(', ')+'…');
    const r=await __aipostJson('/api/publish',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({uploadId:upload.id,platforms:connectedSelected,title,caption,connections})
    });

    const results=r.job?.results||{};
    const ok=Object.entries(results).filter(([,v])=>v?.ok).map(([p])=>p);
    const bad=Object.entries(results).filter(([,v])=>!v?.ok).map(([p,v])=>p+': '+(v?.error||'failed'));
    if(bad.length){
      __aipostToast((ok.length?'Published: '+ok.join(', ')+'. ':'')+'Failed: '+bad.join(' | '));
    }else{
      __aipostToast('Publish submitted successfully: '+(ok.join(', ')||connectedSelected.join(', ')));
    }

    const jobs=__aipost$('#jobs');
    if(jobs&&r.job){
      const div=document.createElement('div');div.className='job';
      div.innerHTML='<b>'+(r.job.title||title||'Untitled')+'</b><small>'+r.job.status+' · '+r.job.platforms.join(', ')+'</small>';
      jobs.prepend(div);
      jobs.querySelector('.note')?.remove();
    }
  }catch(e){
    const results=e.data?.job?.results||{};
    const detail=Object.entries(results).map(([p,v])=>p+': '+(v?.error||'failed')).join(' | ');
    __aipostToast('Publish failed: '+(detail||e.message));
    console.error('[AiPost publish]',e);
  }finally{
    const btn=__aipost$('#publish');
    if(btn){btn.disabled=false;btn.textContent='Publish Direct Everywhere →'}
  }
}

function __aipostInstallPublishFix(){
  const old=__aipost$('#publish');
  if(!old||old.dataset.aipostFixed==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.aipostFixed='1';
  fresh.disabled=false;
  fresh.textContent='Publish Direct Everywhere →';
  old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();__aipostPublish()},{capture:true});
  console.log('[AiPost] publish-state bridge v11 installed');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(__aipostInstallPublishFix,1200));
else setTimeout(__aipostInstallPublishFix,1200);
setTimeout(__aipostInstallPublishFix,3500);
