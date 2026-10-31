import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const watchdog=setTimeout(()=>{console.error('SMOKE-FAIL watchdog timeout');process.exit(124)},20000);
let cloudState={};
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
const html=`<!doctype html><html><body><div class="app"><div class="switch"><button>Daily</button><button>Monthly</button></div><div class="hero"></div></div><div id="settingsModal"><div class="modal"><div class="settings-grid"></div><div class="auto-section"></div><button id="saveSettings">Save settings</button><button id="exportBtn">Export backup</button><button id="importBtn">Import backup</button></div></div><div id="toast"></div></body></html>`;
const mark=x=>console.log(`CHECKPOINT:${x}`);
async function prep(page){
  page.setDefaultTimeout(5000);
  page.on('pageerror',e=>console.error('PAGEERROR',e.message));
  await page.route('https://profit.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.route('https://profit-auth-api.onrender.com/**',async r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:cors});const u=new URL(req.url());if(u.pathname==='/data'&&req.method()==='GET')return r.fulfill({status:200,headers:cors,body:JSON.stringify({data:cloudState})});if(u.pathname==='/data'&&req.method()==='POST'){cloudState=req.postDataJSON()?.data||{};return r.fulfill({status:200,headers:cors,body:JSON.stringify({ok:true})})}return r.fulfill({status:200,headers:cors,body:'{}'})});
  await page.goto('https://profit.test/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.setItem('profit_cloud_token_v1','test-token');localStorage.setItem('simpleProfit_v3',JSON.stringify([{id:'old1',mode:'daily',date:'2026-10-29',revenue:100,expenses:20,incomeType:'passive'}]));});
  await page.addScriptTag({path:path.resolve('v27-freedom-sync.js')});
  await page.waitForFunction(()=>window.__profitV27&&document.getElementById('pf27Section'));
}
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PROFIT_CHROME?{executablePath:process.env.PROFIT_CHROME}:{})});
  const ctx=await browser.newContext({timezoneId:'Asia/Bangkok',acceptDownloads:true});const page=await ctx.newPage();await prep(page);mark('boot');
  assert.equal(await page.locator('#pf27FreedomCard').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length),1);mark('hidden-default');
  await page.check('#pf27Enabled');await page.fill('#pf27Target','1000000');await page.fill('#pf27Invested','250000');await page.fill('#pf27Monthly','5000');await page.fill('#pf27Return','7');await page.click('#pf27Save');await page.waitForSelector('#pf27FreedomCard');
  let g=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v3')));assert.equal(g.enabled,true);assert.equal(g.target,1000000);assert.equal(g.invested,250000);mark('asset-save');
  await page.check('#pf27Passive');await page.fill('#pf27PassiveTarget','3000');await page.click('#pf27Save');g=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v3')));assert.equal(g.basis,'passive');assert.equal(g.passiveTargetMonthly,3000);mark('passive-save');
  cloudState={profitEntries_v8:JSON.stringify([{id:'cloud2',mode:'daily',date:'2026-10-28',revenue:50,expenses:0}]),simpleProfit_v3:JSON.stringify([{id:'cloud2',mode:'daily',date:'2026-10-28',revenue:50,expenses:0}])};
  await page.evaluate(()=>window.__profitV27.mergeSafe(false));await page.waitForFunction(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length===2);assert.equal(JSON.parse(cloudState.profitEntries_v8).length,2);mark('merge');
  await page.uncheck('#pf27Enabled');await page.click('#pf27Save');await page.waitForFunction(()=>!document.getElementById('pf27FreedomCard'));mark('hide');
  await ctx.close();await browser.close();clearTimeout(watchdog);mark('PASS');process.exit(0);
}catch(e){console.error('SMOKE-FAIL',e);try{await browser?.close()}catch{}clearTimeout(watchdog);process.exit(1)}