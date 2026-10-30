import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const watchdog=setTimeout(()=>{console.error('SMOKE-FAIL watchdog timeout');process.exit(124)},20000);
let cloudState={};
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
const html=`<!doctype html><html><body><div class="app"><div class="switch"><button id="dailyBtn" class="active">Daily</button><button id="monthlyBtn">Monthly</button></div><div class="hero"></div></div><div id="settingsModal"><div class="modal"><div class="settings-grid"></div><div class="auto-section"></div><button id="saveSettings">Save settings</button><button id="exportBtn">Export backup</button><button id="importBtn">Import backup</button><button id="resetBtn">Reset</button></div></div><div id="toast"></div></body></html>`;
const mark=x=>console.log(`CHECKPOINT:${x}`);

async function prep(page,seed=true){
  page.setDefaultTimeout(5000); mark('prep-start');
  await page.route('https://profit.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.route('https://profit-auth-api.onrender.com/**',async r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:cors});const u=new URL(req.url());if(u.pathname==='/data'&&req.method()==='GET')return r.fulfill({status:200,headers:cors,body:JSON.stringify({data:cloudState})});if(u.pathname==='/data'&&req.method()==='POST'){cloudState=req.postDataJSON()?.data||{};return r.fulfill({status:200,headers:cors,body:JSON.stringify({ok:true})})}return r.fulfill({status:200,headers:cors,body:'{}'})});
  mark('routes'); await page.goto('https://profit.test/',{waitUntil:'domcontentloaded'}); mark('goto');
  await page.evaluate(seed=>{localStorage.setItem('profit_cloud_token_v1','test-token');if(seed)localStorage.setItem('simpleProfit_v3',JSON.stringify([{id:'old1',mode:'daily',date:'2026-10-29',revenue:100,expenses:20,incomeType:'passive'}]));},seed); mark('seed');
  await page.addScriptTag({path:path.resolve('v26-freedom-sync.js')}); mark('script');
  await page.waitForFunction(()=>window.__profitV26&&document.getElementById('pf26Section')); mark('ready');
}

let browser;
try{
  mark('before-launch'); browser=await chromium.launch({headless:true,args:['--no-sandbox']}); mark('after-launch');
  const ctx=await browser.newContext({timezoneId:'Asia/Bangkok',acceptDownloads:true}); mark('context');
  const page=await ctx.newPage(); mark('page');
  await prep(page,true); mark('boot');
  assert.equal(await page.locator('#pf26FreedomCard').count(),0); assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length),1); mark('hidden-default-and-legacy');
  await page.check('#pf26Enabled'); await page.fill('#pf26Target','1000000'); await page.fill('#pf26Invested','250000'); await page.fill('#pf26Monthly','5000'); await page.fill('#pf26Return','7'); await page.click('#pf26Save'); await page.waitForSelector('#pf26FreedomCard');
  let g=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v2'))); assert.equal(g.enabled,true); assert.equal(g.target,1000000); assert.equal(g.invested,250000); mark('asset-save');
  await page.check('#pf26Passive'); await page.fill('#pf26PassiveTarget','3000'); await page.click('#pf26Save'); g=await page.evaluate(()=>JSON.parse(localStorage.getItem('profitFreedomGoal_v2'))); assert.equal(g.basis,'passive'); assert.equal(g.passiveTargetMonthly,3000); mark('passive-save');
  cloudState={profitEntries_v8:JSON.stringify([{id:'cloud2',mode:'daily',date:'2026-10-28',revenue:50,expenses:0}]),simpleProfit_v3:JSON.stringify([{id:'cloud2',mode:'daily',date:'2026-10-28',revenue:50,expenses:0}])};
  await page.evaluate(()=>Promise.race([window.__profitV26.safeMerge(false),new Promise((_,rej)=>setTimeout(()=>rej(new Error('merge timeout')),5000))]));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length===2); assert.equal(JSON.parse(cloudState.profitEntries_v8).length,2); mark('safe-merge');
  await page.uncheck('#pf26Enabled'); await page.click('#pf26Save'); await page.waitForFunction(()=>!document.getElementById('pf26FreedomCard')); mark('hide-again');
  await ctx.close(); await browser.close(); clearTimeout(watchdog); mark('PASS'); process.exit(0);
}catch(e){console.error('SMOKE-FAIL',e);try{await browser?.close()}catch{}clearTimeout(watchdog);process.exit(1)}
