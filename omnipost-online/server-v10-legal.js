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
const tiktokVerificationPath='/tiktokLQZZTTX1IROK2PyrMSSvLMF4oC6Nm3dA.txt';
const tiktokVerification='tiktok-developers-site-verification=LQZZTTX1IROK2PyrMSSvLMF4oC6Nm3dA\n';
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
      const file=legalPages[u.pathname];
      if((req.method==='GET'||req.method==='HEAD')&&file){
        const body=fs.readFileSync(file);
        res.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'content-length':body.length,
          'cache-control':'public, max-age=300',
          'x-aipost-legal':'true'
        });
        if(req.method==='HEAD')return res.end();
        return res.end(body);
      }
    }catch(e){}
    return listener(req,res);
  });
};
require('./server-v10');
