/* Stream Now: reproducible 1920x1080 captures of the ACTUAL TV frontend.
 * Uses the source UI and test fixture catalog; no live channel reproduction.
 * These are PREVIEW captures for LG store QA review, not hardware evidence.
 */
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const ROOT=path.resolve(__dirname,"../site");
const OUT=path.resolve(process.env.DM_SCREENSHOT_DIR||"dist/lg-screenshots");
const MAP={
  "/stream/tv/":"tv.html",
  "/stream/tv/tv.css":"tv.css",
  "/stream/tv/tv.js":"tv.js",
  "/stream/graphite.css":"streamnow-graphite.css",
  "/stream/brand.webp":"streamnow-brand.webp",
  "/stream/icon.webp":"streamnow-icon.webp",
  "/stream/favorites-safety.js":"favorites-safety.js",
  "/stream/official-access.json":"official-access.json",
  "/stream/listas/sources.json":"playlist-sources.json",
  "/stream/":"index.html",
  "/stream/stream.css":"stream.css",
  "/stream/stream.js":"stream.js",
  "/stream/stream-boot.js":"stream-boot.js",
};
const ENTRIES={
  BR:[
    ["TV Brasil","News","brasil"],
    ["Record News","News","record"],
    ["Canal Gov","News","gov"],
    ["TV Câmara","News","camara"],
    ["TV Senado","News","senado"],
    ["TV Cultura","Education","cultura"],
    ["Canal Educação","Education","educacao"],
    ["TV Brasil 2","General","brasil2"],
    ["TV Justiça","News","justica"],
    ["Canal Saúde","Education","saude"]
  ],
  PT:[
    ["RTP Internacional","General","rtpi"],
    ["RTP Açores","General","acores"],
    ["RTP Madeira","General","madeira"],
    ["RTP Memória","General","memoria"]
  ],
  US:[
    ["NASA TV","Education","nasa"],
    ["Bloomberg Television","News","bloomberg"],
    ["NBC News NOW","News","nbc"]
  ]
};
const m3u=(country)=>["#EXTM3U",...(ENTRIES[country]||[]).flatMap(([name,group,slug])=>[
  '#EXTINF:-1 tvg-country="'+country+'" group-title="'+group+'",'+name,
  "https://fixture.invalid/"+slug+".m3u8"
])].join("\n");
const search=(q)=>{
 const channels=[["CNN Brasil","BR"],["CNN Portugal","PT"],["CNN International","US"]];
 const term=(q||"").toLowerCase();
 const rows=channels.filter(([name])=>name.toLowerCase().includes(term));
 return ["#EXTM3U","#DM_SEARCH:"+q,"#DM_SOURCES_LOADED:3/3",
   "#DM_MATCHED_CHANNELS:"+rows.length,
   ...rows.flatMap(([name,code],i)=>[
     '#EXTINF:-1 dm-country="'+code+'" group-title="News",'+name,
     'https://fixture.invalid/cnn'+i+'.m3u8'
   ])].join("\n");
};
function respond(req,res){
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 function send(status,kind,body){
   res.writeHead(status,{"Content-Type":kind,"Cache-Control":"no-store"});
   res.end(body);
 }
 if(pathname==="/stream/session")return send(200,"application/json",JSON.stringify({allowed:true,user_id:"lg-capture-demo"}));
 if(pathname==="/stream/favorites")return send(200,"application/json",JSON.stringify({favorites:[]}));
 if(pathname==="/stream/countries")return send(200,"application/json",JSON.stringify({countries:[
   {code:"BR",name:"Brasil"},{code:"PT",name:"Portugal"},{code:"US",name:"Estados Unidos"}
 ],loaded:3,total:3}));
 if(pathname==="/stream/catalog"){
   let params=new URL(req.url,"http://localhost").searchParams;
   const country=params.get("country")||"BR";
   return send(200,"text/plain",country==="ALL"?
     ["#EXTM3U",m3u("BR").slice(8),m3u("PT").slice(8),m3u("US").slice(8)].join("\n"):m3u(country));
 }
 if(pathname==="/stream/search"){
   const query=new URL(req.url,"http://localhost").searchParams.get("q");
   return send(200,"text/plain",search(query));
 }
 const filename=MAP[pathname];
 if(!filename)return send(404,"text/plain","Not found");
 const data=fs.readFileSync(path.join(ROOT,filename));
 const mime=filename.endsWith(".html")?"text/html":filename.endsWith(".css")?"text/css":
  filename.endsWith(".js")?"text/javascript":filename.endsWith(".json")?"application/json":
  filename.endsWith(".webp")?"image/webp":"text/plain";
 return send(200,mime,data);
}
async function main(){
 fs.mkdirSync(OUT,{recursive:true});
 const server=http.createServer(respond);
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const origin="http://127.0.0.1:"+server.address().port;
 let browser;
 try{
   browser=await chromium.launch({headless:true});
   const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,locale:"pt-BR"});
   const page=await context.newPage();
   await page.addInitScript(()=>{
     // Avoid actual media fetching and keep the player in idle state for truthful UI captures.
     HTMLMediaElement.prototype.play=function(){return Promise.reject(new Error("Media intentionally disabled in screenshot test"))};
   });
   await page.route("https://fixture.invalid/**",route=>route.abort());
   const errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.goto(origin+"/stream/tv/",{waitUntil:"domcontentloaded",timeout:20000});
   await page.locator('.tree-country-btn[data-country="BR"]').waitFor({timeout:16000});
   await page.locator('.tree-country-btn[data-country="BR"]').click();
   await page.locator(".channel-row").first().waitFor({timeout:16000});
   await page.waitForTimeout(350);
   await page.screenshot({path:path.join(OUT,"01_StreamNow_TV_Guia.png")});
   console.log("CAPTURE 01: actual TV UI, BR catalog from fixture, video idle");
   // Country navigation is a visible interaction; category filters may be hidden
   // until the official directory has loaded, so do not fabricate UI visibility.
   await page.locator('.tree-country-btn[data-country="PT"]').click();
   await page.waitForTimeout(450);
   await page.screenshot({path:path.join(OUT,"02_StreamNow_TV_Portugal.png")});
   console.log("CAPTURE 02: actual TV UI, Portugal country from fixture, video idle");
   const input=page.locator("#search");
   await input.fill("CNN");
   await page.waitForTimeout(1250);
   await page.screenshot({path:path.join(OUT,"03_StreamNow_TV_Busca_Global.png")});
   console.log("CAPTURE 03: actual TV UI, global search from fixture, video idle");
   if(errors.length)console.log("Non-fatal browser console page-errors:",errors.slice(0,6));
   const sizes=["01_StreamNow_TV_Guia.png","02_StreamNow_TV_Portugal.png","03_StreamNow_TV_Busca_Global.png"].map(x=>({name:x,bytes:fs.statSync(path.join(OUT,x)).size}));
   if(sizes.some(x=>x.bytes>5_000_000))throw Error("One screenshot exceeds LG 5 MB cap");
   fs.writeFileSync(path.join(OUT,"LEIA_ANTES.txt"),
      "Capturas PNG 1920x1080 da interface REAL do Stream Now renderizada por Chromium, com catálogo sintético de testes e reprodução não executada.\nNão são provas de funcionamento em TV LG física nem de canais ao vivo; obtenha capturas de um aparelho autenticado para a submissão final da LG.\n");
   console.log(JSON.stringify({screenshots:sizes,origin:"offline.fixture",auth:"test",media:"disabled"}));
   await context.close();
 }finally{
   if(browser)await browser.close();
   await new Promise(ok=>server.close(ok));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});