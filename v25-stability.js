(()=>{'use strict';
if(window.__profitV25Stable)return;window.__profitV25Stable=true;
const $=id=>document.getElementById(id);
document.addEventListener('click',async e=>{
  const b=e.target.closest('#v25SaveFreedom');
  if(!b||!window.__profitV25)return;
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
},true);
})();