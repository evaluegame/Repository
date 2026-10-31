(()=>{'use strict';
const button=document.getElementById('profitApkDownload'),status=document.getElementById('profitDownloadStatus'),info=document.getElementById('profitReleaseInfo');
let downloading=false;
async function release(){
 const r=await fetch('downloads/release.json',{cache:'no-store'});
 if(!r.ok)throw new Error('Download information is unavailable. Please try again.');
 const d=await r.json();
 if(!/^[A-Za-z0-9._-]+\.apk$/.test(d.file)||!Number.isInteger(d.size)||d.size<1024||d.size>100000000||!/^[a-f0-9]{64}$/.test(d.sha256))throw new Error('Download information could not be verified.');
 return d;
}
release().then(d=>{button.href='downloads/'+d.file;button.download=d.file;info.textContent='Profit '+d.version+' · '+d.size.toLocaleString()+' bytes · checked before saving';}).catch(()=>{});
button.addEventListener('click',async event=>{
 event.preventDefault();if(downloading)return;downloading=true;button.setAttribute('aria-disabled','true');status.textContent='Downloading and checking the APK…';
 try{
  const d=await release(),r=await fetch('downloads/'+d.file,{cache:'no-store'});
  if(!r.ok)throw new Error('The APK could not be downloaded. Please try again.');
  const bytes=await r.arrayBuffer(),data=new Uint8Array(bytes);
  if(bytes.byteLength!==d.size||data[0]!==0x50||data[1]!==0x4b||data[2]!==3||data[3]!==4)throw new Error('The download was incomplete. No file was saved. Please try again.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==d.sha256)throw new Error('The download did not match the verified APK. No file was saved. Please try again.');
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.android.package-archive'})),link=document.createElement('a');
  link.href=url;link.download=d.file;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent='Download verified. Open '+d.file+' from your Downloads folder to install the update.';
 }catch(e){status.textContent=e.message||'The download failed. Please try again.'}
 finally{downloading=false;button.removeAttribute('aria-disabled')}
});
})();
