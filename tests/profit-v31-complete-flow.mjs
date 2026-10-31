import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PROFIT_CHROME?{executablePath:process.env.PROFIT_CHROME}:{})});
const root=process.cwd();
const users={a:{id:'cloud-a',email:'a@example.test',name:'Alice'},b:{id:'cloud-b',email:'b@example.test',name:'Bob'}};
const date=new Date().toISOString().slice(0,10);
const entry=(id,n)=>({id,date,mode:'daily',incomeType:'active',revenue:n,expenses:0,title:id});
const states={a:{profitEntries_v8:JSON.stringify([entry('cloud-progress',200)])},b:{profitEntries_v8:JSON.stringify([entry('bob-only',300)])}};
let loginUser='a',wrong=false,meStatus=200,loginDelay=0,loginCount=0;
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:915},userAgent:'Mozilla/5.0 (Linux; Android 15) ProfitNative/1.6.3'});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>{errors.push(e.stack||e.message);console.error('PAGEERROR',e.stack||e.message)});
 await page.route('https://profit-auth-api.onrender.com/**',async route=>{
  const req=route.request(),url=new URL(req.url()),key=req.headers().authorization==='Bearer token-b'?'b':'a';
  const reply=(status,body)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify(body)});
  if(req.method()==='OPTIONS')return reply(204,{});
  if(url.pathname==='/login'){loginCount++;if(loginDelay)await new Promise(r=>setTimeout(r,loginDelay));return wrong?reply(401,{error:'Incorrect password.'}):reply(200,{token:'token-'+loginUser,user:users[loginUser]})}
  if(url.pathname==='/me')return reply(meStatus,meStatus===200?{user:users[key]}:{error:'Cloud temporarily unavailable'});
  if(url.pathname==='/data'){
   if(meStatus===401)return reply(401,{error:'Not signed in.'});
   if(req.method()==='POST'){states[key]=JSON.parse(req.postData()).data;return reply(200,{ok:true})}
   return reply(200,{data:states[key],updatedAt:1});
  }
  return reply(200,{});
 });
 await page.route('https://profit.test/**',async route=>{
  const u=new URL(route.request().url()),name=u.pathname==='/'?'index.html':u.pathname.slice(1);
  try{const body=await fs.readFile(path.join(root,name));return route.fulfill({status:200,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html',body})}
  catch{return route.fulfill({status:404,body:'Missing '+name})}
 });
 await page.goto('https://profit.test/');
 await page.evaluate(row=>localStorage.setItem('simpleProfit_v3',JSON.stringify([row])),entry('device-progress',100));
 await page.locator('#paLoginEmail').fill(users.a.email);await page.locator('#paLoginPassword').fill('wrong-password');wrong=true;loginDelay=700;
 await page.locator('#paLogin button[type=submit]').click();
 await page.getByRole('button',{name:'Signing in…'}).waitFor();
 assert.equal(await page.locator('#paLogin button[type=submit]').isDisabled(),true);
 await page.locator('#paLoginError').filter({hasText:'Incorrect password.'}).waitFor();
 assert.equal(await page.locator('#paLogin button[type=submit]').isEnabled(),true);
 // Regression: a user who spends over 20 seconds at login used to lose optional features.
 await page.waitForTimeout(21000);wrong=false;loginDelay=150;
 await page.locator('#paLoginPassword').fill('correct-password');await page.locator('#paLogin button[type=submit]').click();
 await page.locator('#profitReliabilitySettings').waitFor({state:'attached'});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length===2);
 await page.waitForFunction(()=>window.__profitReliability&&document.querySelector('#gear'));
 await page.waitForFunction(()=>document.querySelector('#hist')?.textContent.includes('cloud-progress'));
 await page.locator('#gear').click();
 await page.locator('#profitSyncNow').waitFor({state:'visible'});
 assert.equal(await page.locator('#pf28Enabled').count(),1);
 assert.equal(await page.locator('#install').evaluate(el=>getComputedStyle(el).display),'none');
 assert.equal(await page.locator('#profitFreedomPopup').count(),0,'optional popup is off by default');
 await page.locator('#pf28Enabled').check();await page.locator('#pf28Target').fill('1000');await page.locator('#pf28Invested').fill('500');await page.locator('#pf28Save').click();
 await page.locator('#pf28FreedomCard').waitFor({state:'attached'});
 assert.match(await page.locator('#pf28FreedomCard').textContent(),/50%/);
 await page.locator('#profitFreedomPopupSetting').check();await page.reload();
 await page.locator('#profitFreedomPopup').waitFor({state:'visible'});
 assert.match(await page.locator('#profitFreedomSummary').textContent(),/50.0%/);
 await page.locator('#profitPopupEnabled').uncheck();await page.locator('#profitPopupClose').click();
 await page.reload();await page.waitForFunction(()=>window.__profitReliability);
 assert.equal(await page.locator('#profitAuthRoot').count(),0);assert.equal(await page.locator('#profitFreedomPopup').count(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')).length),2);
 // An outage and an expired cloud session must not erase the account mapping or local progress.
 for(const code of [500,401]){
  meStatus=code;await page.reload();await page.waitForFunction(()=>window.__profitReliability);
  assert.equal(await page.locator('#profitAuthRoot').count(),0,'saved dashboard stays open');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')).length),2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('profit_cloud_storage_v1')),'cloud-a');
 }
 meStatus=200;await page.evaluate(()=>window.__profitReliability.sync(false));
 // Saving new progress must sync automatically and keep restored cloud history.
 await page.locator('#rev').fill('75');await page.locator('#cat').fill('automatic-sync-check');await page.locator('#save').click();
 await page.waitForTimeout(2500);
 assert.equal(JSON.parse(states.a.profitEntries_v8).length,3,'automatic sync includes the new entry');
 assert.ok(JSON.parse(states.a.profitEntries_v8).some(e=>e.id==='cloud-progress'));
 // Deleted rows should not return from a stale cloud copy.
 const deleted=JSON.parse(states.a.profitEntries_v8).find(x=>x.title==='automatic-sync-check');
 await page.locator(`[data-del="${deleted.id}"]`).click();await page.waitForTimeout(2500);
 assert.equal(JSON.parse(states.a.profitEntries_v8).length,2);
 await page.locator('#gear').click();
 assert.ok(await page.locator('#profitRecoveryCopies option').count()>0);
 // Signing into a second account must never attach Alice's device or cloud rows.
 page.once('dialog',d=>d.accept());await page.locator('#profitExplicitLogout').click();
 await page.locator('#paLoginEmail').waitFor();loginUser='b';
 await page.locator('#paLoginEmail').fill(users.b.email);await page.locator('#paLoginPassword').fill('correct-password');await page.locator('#paLogin button[type=submit]').click();
 await page.waitForFunction(()=>window.__profitReliability&&JSON.parse(localStorage.getItem('profitEntries_v8')||'[]').length===1);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('profitEntries_v8')).map(e=>e.id)),['bob-only']);
 await fs.mkdir('test-results',{recursive:true});await page.locator('#gear').click();await page.screenshot({path:'test-results/profit-v31-settings.png',fullPage:true});
 assert.deepEqual(errors,[],'full startup should have no uncaught JavaScript errors');
 assert.equal(loginCount,3,'reopening or network failures must not require another login');
 console.log('PASS: real login bootstrap, late login, loading/errors, cloud restore/merge, automatic sync, deletion, persisted session, expired-session recovery, optional popup and account isolation');
 await context.close();
}finally{await browser.close()}
