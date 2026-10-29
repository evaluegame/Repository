import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

let cloudState = {};
const html = `<!doctype html><html><body><div class="top"><b class="brand">Profit</b><button id="gear">⚙</button></div><div class="sw"><button>Daily</button><button>Monthly</button></div><div id="toast"></div></body></html>`;
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};

async function prepare(page, seed=true){
  await page.route('https://profit.test/**', route => route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.route('https://profit-auth-api.onrender.com/**', async route => {
    const req=route.request();
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors,body:''});
    const u=new URL(req.url());
    if(u.pathname==='/data' && req.method()==='GET') return route.fulfill({status:200,headers:cors,body:JSON.stringify({data:cloudState})});
    if(u.pathname==='/data' && req.method()==='POST'){
      const body=req.postDataJSON(); cloudState=body?.data||{};
      return route.fulfill({status:200,headers:cors,body:JSON.stringify({ok:true})});
    }
    if(u.pathname==='/logout') return route.fulfill({status:200,headers:cors,body:JSON.stringify({ok:true})});
    return route.fulfill({status:200,headers:cors,body:JSON.stringify({ok:true})});
  });
  await page.goto('https://profit.test/');
  await page.evaluate(seed => {
    localStorage.setItem('profit_cloud_token_v1','test-token');
    localStorage.setItem('profit_cloud_user_v1',JSON.stringify({email:'tester@example.com'}));
    if(seed){
      const d=new Date(); const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      localStorage.setItem('simpleProfit_v3',JSON.stringify([{id:'legacy-1',mode:'daily',date,revenue:100,expenses:20,incomeType:'passive',title:'Legacy passive'}]));
    }
  },seed);
  await page.addScriptTag({path:path.resolve('v25-final.js')});
  await page.addScriptTag({path:path.resolve('v25-stability.js')});
  await page.waitForFunction(()=>window.__profitV25 && document.getElementById('freedomProgressCard'));
}

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({timezoneId:'Asia/Bangkok',acceptDownloads:true});
const page=await ctx.newPage();
await prepare(page,true);

for(let i=0;i<30 && !cloudState.profitEntries_v8;i++) await new Promise(r=>setTimeout(r,100));
assert.ok(cloudState.profitEntries_v8,'legacy progress was not promoted to profitEntries_v8');
assert.equal(JSON.parse(cloudState.profitEntries_v8).length,1,'legacy entry was not uploaded');

await page.click('#gear');
await page.waitForSelector('#profitV25Settings.show');
assert.ok(await page.isVisible('#v25FreedomCard'));

await page.fill('#v25Target','1000000');
await page.fill('#v25Invested','250000');
await page.fill('#v25Monthly','5000');
await page.fill('#v25Return','7');
await page.click('#v25SaveFreedom');
await page.waitForFunction(()=>document.querySelector('#freedomPct')?.textContent?.startsWith('25'));
let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v1')));
assert.equal(saved.invested,250000);
assert.equal(saved.target,1000000);

await page.check('#v25PassiveToggle');
await page.uncheck('#v25ExpenseTarget');
await page.fill('#v25PassiveTarget','3000');
await page.click('#v25SaveFreedom');
await page.waitForFunction(()=>document.querySelector('#v25FreedomMode')?.textContent==='Passive income');
const passiveNow=await page.textContent('#freedomInvested');
assert.notEqual(passiveNow,'$0.00','passive mode did not calculate current passive income');
saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v1')));
assert.equal(saved.passiveEnabled,true);
assert.equal(saved.passiveTargetMonthly,3000);

await page.selectOption('#v25RuleType','passive');
await page.selectOption('#v25RuleFreq','daily');
await page.fill('#v25RuleAmount','10');
await page.fill('#v25RuleName','Test passive');
await page.click('#v25AddRule');
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('profitRecurring_v1')||'[]').some(r=>r.name==='Test passive'));

await page.click('#gear');
await page.waitForSelector('#profitV25Settings.show');
const downloadPromise=page.waitForEvent('download');
await page.click('#v25Export');
const download=await downloadPromise;
assert.match(download.suggestedFilename(),/^profit-backup-\d{4}-\d{2}-\d{2}\.json$/);

const ctx2=await browser.newContext({timezoneId:'Asia/Bangkok'});
const page2=await ctx2.newPage();
await prepare(page2,false);
await page2.waitForFunction(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length>0,{timeout:5000});
const restored=await page2.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length);
assert.ok(restored>=1,'fresh device did not restore cloud entries');

await ctx2.close();
await ctx.close();
await browser.close();
console.log('Profit v25 smoke tests passed');