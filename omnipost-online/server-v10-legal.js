const http=require('http');
const fs=require('fs');
const path=require('path');
const {URL}=require('url');
const originalCreateServer=http.createServer.bind(http);
const legalPages={
  '/terms':path.join(__dirname,'terms.html'),
  '/terms/':path.join(__dirname,'terms.html'),
  '/privacy':path.join(__dirname,'privacy.html'),
  '/privacy/':path.join(__dirname,'privacy.html')
};
const publishFix=path.join(__dirname,'publish-fix-v11.js');
const tiktokVerificationPath='/tiktokLQZZTTX1IROK2PyrMSSvLMF4oC6Nm3dA.txt';
const tiktokVerification='tiktok-developers-site-verification=LQZZTTX1IROK2PyrMSSvLMF4oC6Nm3dA\n';

function serveFile(res,file,type,head=false,extra={}){
  const body=fs.readFileSync(file);
  res.writeHead(200,{
    'content-type':type,
    'content-length':body.length,
    'cache-control':'no-store, no-cache, must-revalidate, max-age=0',
    ...extra
  });
  if(head)return res.end();
  return res.end(body);
}

http.createServer=function(listener){
  return originalCreateServer((req,res)=>{
    try{
      const u=new URL(req.url,'http://localhost');
      if((req.method==='GET'||req.method==='HEAD')&&u.pathname===tiktokVerificationPath){
        const body=Buffer.from(tiktokVerification,'utf8');
        res.writeHead(200,{
          'content-type':'text/plain; charset=utf-8',
          'content-length':body.length,
          'cache-control':'public, max-age=300',
          'x-aipost-tiktok-verification':'true'
        });
        if(req.method==='HEAD')return res.end();
        return res.end(body);
      }
      if((req.method==='GET'||req.method==='HEAD')&&u.pathname==='/publish-fix-v11.js'){
        return serveFile(res,publishFix,'text/javascript; charset=utf-8',req.method==='HEAD',{'x-aipost-publish-fix':'v11'});
      }
      const file=legalPages[u.pathname];
      if((req.method==='GET'||req.method==='HEAD')&&file){
        return serveFile(res,file,'text/html; charset=utf-8',req.method==='HEAD',{'x-aipost-legal':'true'});
      }

      if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html')){
        const realWriteHead=res.writeHead.bind(res);
        const realEnd=res.end.bind(res);
        let capturedStatus=200;
        let capturedHeaders={};
        let wroteHead=false;
        res.writeHead=(status,headers={})=>{
          capturedStatus=status;
          capturedHeaders={...headers};
          wroteHead=true;
          return res;
        };
        res.end=(chunk,encoding,cb)=>{
          if(wroteHead&&capturedStatus===200&&chunk){
            let html=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk);
            if(html.includes('</body>')&&!html.includes('/publish-fix-v11.js')){
              html=html.replace('</body>','<script type="module" src="/publish-fix-v11.js?v=11"></script></body>');
            }
            const body=Buffer.from(html,'utf8');
            delete capturedHeaders['content-length'];
            delete capturedHeaders['Content-Length'];
            capturedHeaders['content-length']=body.length;
            capturedHeaders['cache-control']='no-store, no-cache, must-revalidate, max-age=0';
            capturedHeaders['x-aipost-publish-fix']='v11';
            realWriteHead(capturedStatus,capturedHeaders);
            return realEnd(body,undefined,cb);
          }
          if(wroteHead)realWriteHead(capturedStatus,capturedHeaders);
          return realEnd(chunk,encoding,cb);
        };
      }
    }catch(e){}
    return listener(req,res);
  });
};
require('./server-v10');
