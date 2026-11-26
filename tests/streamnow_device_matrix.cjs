/* Stream Now device engine matrix. This is browser emulation, never hardware certification. */
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {chromium,firefox,webkit}=require("playwright");
const ROOT=path.resolve(__dirname,"../site");
const map={
 "/":"tv.html","/stream/":"index.html","/stream/tv/":"tv.html",
 "/stream/tv/tv.css":"tv.css","/stream/graphite.css":"streamnow-graphite.css",
 "/stream/tv/tv.js":"tv.js","/stream/brand.webp":"streamnow-brand.webp",
 "/stream/icon.webp":"streamnow-icon.webp",
 "/stream/streamnow-i18n.js":"streamnow-i18n.js",
 "/stream/listas/sources.json":"playlist-sources.json",
 "/stream/official-access.json":"official-access.json"
};
const hls=['#EXTM3U','#EXTINF:-1 dm-country="BR" group-title="News",Canal de teste',
 "https://invalid.example/test.m3u8"].join("\n");
const data=(u)=>{
 if(u.startsWith("/stream/session"))return [200,"application/json",JSON.stringify({allowed:true})];
 if(u.startsWith("/stream/countries"))return [200,"application/json",JSON.stringify({countries:[{code:"BR",name:"Brasil"}],loaded:1,total:1})];
 if(u.startsWith("/stream/catalog"))return [200,"text/plain",hls];
 if(u.startsWith("/stream/search"))return [200,"text/plain","#EXTM3U"];
 const filename=map[new URL(u,"http://localhost").pathname];
 if(!filename)return [404,"text/plain","Unknown fixture"];
 let body=fs.readFileSync(path.join(ROOT,filename));
 const mime=filename.endsWith(".html")?"text/html":filename.endsWith(".css")?"text/css":filename.endsWith(".js")?"text/javascript":filename.endsWith(".json")?"application/json":filename.endsWith(".webp")?"image/webp":"text/plain";
 return [200,mime,body];
};
const profiles=[
 {name:"Samsung Smart TV Tizen UA / 1080p (Chromium emulation)",browser:"chromium",size:{width:1920,height:1080},ua:"Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 Chrome/94.0.4606.31 Safari/537.36"},
 {name:"Samsung Smart TV Tizen UA / 720p (Chromium emulation)",browser:"chromium",size:{width:1280,height:720},ua:"Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 Chrome/94.0.4606.31 Safari/537.36"},
 {name:"Chrome desktop Chromium",browser:"chromium",size:{width:1440,height:900}},
 {name:"Firefox desktop Gecko",browser:"firefox",size:{width:1440,height:900}},
 {name:"Safari engine desktop WebKit Linux",browser:"webkit",size:{width:1440,height:900}},
 {name:"Android phone Chrome engine emulation",browser:"chromium",size:{width:393,height:852},mobile:true,touch:true,ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"},
 {name:"Android tablet Chrome engine emulation",browser:"chromium",size:{width:1024,height:768},mobile:true,touch:true,ua:"Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"},
 {name:"iPhone Safari engine WebKit Linux emulation",browser:"webkit",size:{width:390,height:844},mobile:true,touch:true,ua:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1"},
 {name:"iPad Safari engine WebKit Linux emulation",browser:"webkit",size:{width:1024,height:1366},mobile:true,touch:true,ua:"Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1"},
 {name:"iPad Safari landscape WebKit Linux emulation",browser:"webkit",size:{width:1366,height:1024},mobile:true,touch:true,ua:"Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1"}
];
(async()=>{
 const srv=http.createServer((req,res)=>{
  try {
   const [status,mime,body]=data(req.url||"/");
   res.writeHead(status,{"Content-Type":mime,"Cache-Control":"no-store"});
   res.end(body);
  }catch(e){res.writeHead(500);res.end("Fixture error");}
 });
 await new Promise(ok=>srv.listen(0,"127.0.0.1",ok));
 const origin="http://127.0.0.1:"+srv.address().port;
 const engines={chromium,firefox,webkit},cache={};
 try{
  for(const p of profiles){
   if(!cache[p.browser])cache[p.browser]=await engines[p.browser].launch({headless:true});
   const context=await cache[p.browser].newContext({
    viewport:p.size,
    userAgent:p.ua||undefined,
    isMobile:p.mobile||false,
    hasTouch:p.touch||false,
    deviceScaleFactor:p.mobile?2:1,
    javaScriptEnabled:true
   });
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(String(e.message||e)));
   try{
    await page.goto(origin+"/stream/tv/",{waitUntil:"domcontentloaded",timeout:20000});
    await page.waitForFunction(()=>{
      const bar=document.querySelector(".topbar");
      return bar&&getComputedStyle(bar).backgroundColor==="rgb(11, 11, 11)";
    },{timeout:12000});
    const values=await page.evaluate(()=>{
     const read=s=>getComputedStyle(document.querySelector(s)).backgroundColor;
     return {title:document.title,brand:!!document.querySelector(".streamnow-wordmark"),
        css:document.querySelectorAll('link[href*="/stream/graphite.css"]').length,
        top:read(".topbar"),side:read(".sidebar"),guide:read(".catalog"),
        player:read(".player-column"),width:document.documentElement.scrollWidth,
        viewport:window.innerWidth,app:document.querySelector("#tv-shell")!==null};
    });
    assert.match(values.title,/Stream Now/);
    assert.ok(values.brand&&values.app);
    assert.equal(values.css,1);
    assert.equal(values.top,"rgb(11, 11, 11)");
    assert.equal(values.side,"rgb(20, 20, 20)");
    assert.equal(values.guide,"rgb(24, 24, 24)");
    assert.equal(values.player,"rgb(21, 21, 21)");
    assert.ok(values.width<=values.viewport+20,
       "Unexpected horizontal overflow "+JSON.stringify(values));
    await page.locator('.tree-country-btn[data-country="BR"]').waitFor({timeout:12000});
    // Internationalization must not change the data or create horizontal overflow.
    const language=page.locator("#streamnow-language");
    await language.selectOption("en");
    assert.equal(await page.locator("#mobile-guide").textContent(),"Guide & Search");
    assert.equal(await page.locator(".catalog-header .overline").textContent(),"02 · CHANNEL GUIDE");
    assert.equal(await page.locator("html").getAttribute("lang"),"en");
    await language.selectOption("ja");
    assert.equal(await page.locator("#mobile-guide").textContent(),"ガイドと検索");
    await language.selectOption("pt");
    assert.equal(await page.locator("#mobile-guide").textContent(),"Guia e busca");
    assert.equal(await page.locator("html").getAttribute("lang"),"pt-BR");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+20),
      "Language selector caused horizontal overflow");
    assert.equal(errors.length,0,"Script error: "+errors.join(" / "));
    console.log("PASS "+p.name+" "+JSON.stringify({viewport:p.size,palette:"graphite-red",ready:true}));
   }finally{await context.close();}
  }
 }finally{
  await Promise.all(Object.values(cache).map(x=>x.close()));
  await new Promise(ok=>srv.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
