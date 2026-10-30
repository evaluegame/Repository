import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const html=`<!doctype html><html><body>
<div class="sw"><button>Daily</button><button>Monthly</button></div>
<section id="pf27FreedomCard">old wrong freedom</section>
<div class="rw"><div><strong id="rhead">Build your passive income</strong><div id="rsub"></div></div><div id="pav"></div><div id="nxt"></div><div class="bar"><i id="prog"></i></div><div id="badges"></div><div id="chals"></div><div id="rnote"></div></div>
<div id="modal"><div class="box"><section id="pf27Section">old wrong settings</section><div class="auto"></div></div></div>
<div id="toast"></div>
</body></html>`;

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  page.setDefaultTimeout(7000);
  await page.route('https://profit.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('https://profit.test/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    window.__profitStarted=true;
    window.__profitV27={uploadDevice:async()=>true,restoreCloud:async()=>true,mergeSafe:async()=>true};
    const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const entries=[];
    const now=new Date();
    for(let i=0;i<21;i++){
      const d=new Date(now);d.setDate(d.getDate()-i);
      const amount=i<7?40:(i<14?20:10);
      entries.push({id:`p${i}`,mode:'daily',date:iso(d),revenue:amount,expenses:0,incomeType:'passive'});
    }
    localStorage.setItem('profitEntries_v8',JSON.stringify(entries));
    localStorage.setItem('profitRewards_v1',JSON.stringify({p1:{at:1},p10:{at:1},p25:{at:1}}));
    localStorage.setItem('profitPrefs_v8',JSON.stringify({currency:'USD',lang:'en'}));
    localStorage.setItem('profitFreedomGoal_v3',JSON.stringify({enabled:true,basis:'passive',target:1000000,invested:250000,monthlyContribution:5000,annualReturn:7,passiveTargetMonthly:3000}));
  });
  await page.addScriptTag({path:path.resolve('v28-freedom-passive.js')});
  await page.waitForFunction(()=>window.__profitV28&&document.getElementById('pf28FreedomSettings'));
  await page.addScriptTag({path:path.resolve('v29-passive-rewards.js')});
  await page.waitForFunction(()=>window.__profitV29&&document.getElementById('pf29PassiveProgress'));

  const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v3')));
  assert.equal(migrated.basis,'assets','Freedom must always use investment/assets mode');
  assert.equal(migrated.enabled,false,'Freedom must be hidden on v28 upgrade until user opts in');
  assert.equal(await page.locator('#pf28FreedomCard').count(),0,'Freedom card should be hidden after migration');
  assert.equal(await page.locator('#pf27Section').evaluate(el=>getComputedStyle(el).display),'none','old passive Freedom settings should be hidden');
  assert.equal((await page.locator('#pf28FreedomSettings').innerText()).includes('Base freedom on passive income'),false,'Freedom settings must not contain passive-income mode');

  const nextText=await page.locator('#nxt').innerText();
  const rewardBox=await page.locator('#pf29PassiveProgress').innerText();
  assert.match(nextText,/Bills Helper/);
  assert.match(nextText,/\$50(?:\.00)?\/day for 7 days/);
  assert.match(rewardBox,/80%/);
  assert.match(rewardBox,/\$40(?:\.00)?\/day/);
  assert.match(rewardBox,/\$10(?:\.00)?\/day/);
  assert.match(rewardBox,/\+\$20(?:\.00)?\/day/);
  assert.match(rewardBox,/~4 days/);
  assert.match(rewardBox,/previous 7-day average/);

  await page.check('#pf28Enabled');
  await page.click('#pf28Save');
  await page.waitForSelector('#pf28FreedomCard');
  const freedom=await page.locator('#pf28FreedomCard').innerText();
  assert.match(freedom,/Investment freedom/);
  assert.doesNotMatch(freedom,/Passive-income freedom/);
  assert.match(freedom,/25%/);

  console.log('Profit Freedom separation and passive reward progress tests passed');
} finally {
  await browser.close();
}
