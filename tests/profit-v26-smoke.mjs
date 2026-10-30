import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

let cloudState={};
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
const html=`<!doctype html><html><body><div class="app"><div class="switch"><button id="dailyBtn" class="active">Daily</button><button id="monthlyBtn">Monthly</button></div><div class="hero"></div></div><div id="settingsModal"><div class="modal"><div class="settings-grid"></div><div class="auto-section"></div><button id="saveSettings">Save settings</button><button id="exportBtn">Export backup</button><button id="importBtn">Import backup</button><button id="resetBtn">Reset</button></div></div><div id="toast"></div></body></html>`;

async function prep(page,seed=true){
  await page.route('https://profit.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.route('https://profit-auth-api.onrender.com/**',async r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:cors,body:''});const u=new URL(req.url());if(u.pathname==='/data'&&req.method()==='GET')return r.fulfill({status:200,headers:cors,body:JSON.stringify({data:cloudState})});if(u.pathname==='/data'&&req.method()==='POST'){cloudState=req.postDataJSON()?.data||{};return r.fulfill({status:200,headers:cors,body:JSON.stringify({ok:true})})}return r.fulfill({status:200,headers:cors,body:'{}'})});
  await page.goto('https://profit.test/');
  await page.evaluate(seed=>{localStorage.setItem('profit_cloud_token_v1','test-token');if(seed){localStorage.setItem('simpleProfit_v3',JSON.stringify([{id:'old1',mode:'daily',date:'2026-10-29',revenue:100,expenses:20,incomeType:'passive'}]));}},seed);
  await page.addScriptTag({path:path.resolve('v26-freedom-sync.js')});
  await page.waitForFunction(()=>window.__profitV26&&document.getElementById('pf26Section'));
}

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({timezoneId:'Asia/Bangkok',acceptDownloads:true});
const page=await ctx.newPage();
await prep(page,true);

assert.equal(await page.locator('#pf26FreedomCard').count(),0,'Freedom card must be hidden by default');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length),1,'legacy progress was not promoted');

await page.check('#pf26Enabled');
await page.fill('#pf26Target','1000000');
await page.fill('#pf26Invested','250000');
await page.fill('#pf26Monthly','5000');
await page.fill('#pf26Return','7');
await page.click('#pf26Save');
await page.waitForSelector('#pf26FreedomCard');
let g=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v2')));
assert.equal(g.enabled,true);assert.equal(g.target,1000000);assert.equal(g.invested,250000);

await page.check('#pf26Passive');
await page.fill('#pf26PassiveTarget','3000');
await page.click('#pf26Save');
g=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v2')));
assert.equal(g.basis,'passive');assert.equal(g.passiveTargetMonthly,3000);

cloudState={profitEntries_v8:JSON.stringify([{id:'cloud2',mode:'daily',date:'2026-10-28',revenue:50,expenses:0}]),simpleProfit_v3:JSON.stringify([{id:'cloud2',mode:'daily',date:'2026-10-28',revenue:50,expenses:0}])};
await page.evaluate(()=>window.__profitV26.safeMerge(false));
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length===2);
assert.equal(JSON.parse(cloudState.profitEntries_v8).length,2,'safe merge did not preserve both local and cloud progress');

await page.uncheck('#pf26Enabled');
await page.click('#pf26Save');
await page.waitForFunction(()=>!document.getElementById('pf26FreedomCard'));

await ctx.close();await browser.close();
console.log('Profit v26 smoke tests passed');