(()=>{'use strict';
if(window.__profitV25Stable)return;window.__profitV25Stable=true;
const $=id=>document.getElementById(id);
const st=document.createElement('style');st.textContent='#v25Toast,#toast,.toast,.pro-toast{pointer-events:none!important}';document.head.appendChild(st);
let settingsDirty=false;
const readRules=()=>{try{const a=JSON.parse(localStorage.getItem('profitRecurring_v1')||'[]');return Array.isArray(a)?a:[]}catch{return[]}};
const writeRules=a=>localStorage.setItem('profitRecurring_v1',JSON.stringify(a));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function refreshSettings(){window.__profitV25?.openSettings?.('')}
function reloadAfterClose(){if(settingsDirty)setTimeout(()=>location.reload(),70)}
document.addEventListener('click',async e=>{
  if(!window.__profitV25)return;
  const b=e.target.closest('#v25SaveFreedom');
  if(b){
    e.preventDefault();e.stopImmediatePropagation();
    const old=window.__profitV25.goal();
    const passive=$('v25PassiveToggle')?.checked===true;
    const g={...old,
      passiveEnabled:passive,
      mode:passive?'passive':'assets',
      target:Math.max(0,Number($('v25Target')?.value??old.target)||0),
      invested:Math.max(0,Number($('v25Invested')?.value??old.invested)||0),
      monthlyContribution:Math.max(0,Number($('v25Monthly')?.value??old.monthlyContribution)||0),
      annualReturn:Math.max(0,Math.min(30,Number($('v25Return')?.value??old.annualReturn)||0)),
      passiveTargetFromExpenses:$('v25ExpenseTarget')?.checked??old.passiveTargetFromExpenses,
      passiveTargetMonthly:Math.max(0,Number($('v25PassiveTarget')?.value??old.passiveTargetMonthly)||0)
    };
    b.textContent='Saving…';
    window.__profitV25.saveGoal(g);
    try{await window.__profitV25.syncNow(true);if(document.body.contains(b)){b.textContent='Saved ✓';setTimeout(()=>{if(document.body.contains(b))b.textContent='Save Freedom Strategy'},600)}}catch{if(document.body.contains(b))b.textContent='Save Freedom Strategy'}
    return;
  }
  const add=e.target.closest('#v25AddRule');
  if(add){
    e.preventDefault();e.stopImmediatePropagation();
    const amount=Math.max(0,Number($('v25RuleAmount')?.value)||0),start=$('v25RuleStart')?.value||today(),end=$('v25RuleEnd')?.value||'';
    if(!amount){$('v25RuleAmount')?.focus();return}if(end&&end<start){$('v25RuleEnd')?.focus();return}
    const a=readRules();a.push({id:'r'+Date.now(),type:$('v25RuleType')?.value||'active',frequency:$('v25RuleFreq')?.value||'daily',amount,name:$('v25RuleName')?.value?.trim()||'',enabled:true,startDate:start,endDate:end});writeRules(a);settingsDirty=true;await window.__profitV25.syncNow(true);refreshSettings();return;
  }
  const tog=e.target.closest('[data-v25-toggle]');
  if(tog){e.preventDefault();e.stopImmediatePropagation();const id=tog.dataset.v25Toggle,a=readRules(),r=a.find(x=>String(x.id)===id);if(r)r.enabled=r.enabled===false;writeRules(a);settingsDirty=true;await window.__profitV25.syncNow(true);refreshSettings();return}
  const del=e.target.closest('[data-v25-delete]');
  if(del){e.preventDefault();e.stopImmediatePropagation();const id=del.dataset.v25Delete;writeRules(readRules().filter(x=>String(x.id)!==id));settingsDirty=true;await window.__profitV25.syncNow(true);refreshSettings();return}
  const close=e.target.closest('#v25Close');
  if(close){reloadAfterClose();return}
  if(e.target?.id==='profitV25Settings')reloadAfterClose();
},true);
})();