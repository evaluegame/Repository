import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  {
    const page=await browser.newPage();
    page.setDefaultTimeout(7000);
    await page.route('https://profit.test/**',route=>{
      const u=route.request().url();
      if(u==='https://profit.test/'||u.endsWith('/index.html')) return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head></head><body><div class="app"></div><div class="top-right"></div><div id="welcomeModal"></div><div id="settingsModal"></div><div id="toast"></div></body></html>'});
      return route.fulfill({status:200,contentType:'application/javascript',body:''});
    });
    await page.goto('https://profit.test/',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      localStorage.setItem('profit_cloud_token_v1','test-token-that-must-survive');
      localStorage.setItem('profit_cloud_user_v1',JSON.stringify({id:'user-1',email:'user@example.com',name:'Tester'}));
      localStorage.setItem('profit_cloud_storage_v1','user-1');
      window.fetch=async url=>{
        if(String(url).includes('/me')) return new Response(JSON.stringify({error:'Server error.'}),{status:500,headers:{'Content-Type':'application/json'}});
        return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
      };
    });
    await page.addScriptTag({path:path.resolve('v21-cloud-auth.js')});
    await page.waitForFunction(()=>window.__profitStarted===true);
    assert.equal(await page.locator('#profitAuthRoot').count(),0,'temporary server failure must not show login gate');
    assert.equal(await page.evaluate(()=>localStorage.getItem('profit_cloud_token_v1')),'test-token-that-must-survive','temporary server failure must not delete saved token');
  }

  {
    const context=await browser.newContext({userAgent:'Mozilla/5.0 ProfitNative/1.5'});
    const page=await context.newPage();
    await page.setContent('<!doctype html><html><head></head><body><button id="installBtn" class="install">Install app</button><button id="installTop">APP ↓</button></body></html>');
    await page.addScriptTag({path:path.resolve('v30-native-ui.js')});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('profit-native')),true,'native app marker should be applied');
    assert.equal(await page.locator('#installBtn').evaluate(el=>getComputedStyle(el).display),'none','bottom install button must be hidden in native app');
    assert.equal(await page.locator('#installTop').evaluate(el=>getComputedStyle(el).display),'none','top install button must be hidden in native app');
    await context.close();
  }

  console.log('Profit persistent-session and native-app UI tests passed');
} finally {
  await browser.close();
}
