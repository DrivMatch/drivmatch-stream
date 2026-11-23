/* Mocked private-browser coverage for the independent playlist library.
 * No real broadcast availability or copyright authorization is asserted.
 */
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const ROOT=path.resolve(__dirname,"../site");
const origin="http://127.0.0.1:18765";
const paths={
  "/stream/listas/":"listas.html",
  "/stream/listas/listas.js":"listas.js",
  "/stream/listas/listas.css":"listas.css",
  "/stream/listas/sources.json":"playlist-sources.json",
  "/stream/listas/brasil-servicos.json":"brasil-servicos.json"
};
const aliasPlaylist=[
  '#EXTM3U',
  '#EXTINF:-1 tvg-country="BR" group-title="Geral",TV Guará',
  'https://mock.example/guara.m3u8'
].join("\n");
const playlist=[
  "#EXTM3U",
  '#EXTINF:-1 tvg-id="NewsTV.br" group-title="Notícias" tvg-country="BR",Canal Notícias Brasil',
  "https://mock.example/news.m3u8",
  '#EXTINF:-1 tvg-id="SportsUS.us" group-title="Sports" tvg-country="US",Free Sports US',
  "https://mock.example/sports.m3u8",
  '#EXTINF:-1 tvg-id="Paywall.us" group-title="Sports",ESPN Premium',
  "https://mock.example/espn.m3u8",
  '#EXTINF:-1 group-title="News",Bad HTTP Stream',
  "http://mock.example/bad.m3u8"
].join("\n");
async function main(){
  let authorized=false;
  const server=http.createServer((req,res)=>{
    if(req.url==="/stream/countries?list=lista-2"){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify({countries:[{code:"MX",name:"México"}],loaded:7,total:7}));return;
    }
    if(req.url && req.url.startsWith("/stream/catalog?list=lista-2")){
      if(!authorized){res.writeHead(403);res.end();return;}
      const country=new URL(req.url,origin).searchParams.get("country");
      const br=['#EXTM3U','#DM_MERGED:LISTAS-1-8',
        '#EXTINF:-1 dm-country="BR" dm-source="lista-2" group-title="Geral",TV Guará',
        'https://mock.example/guara.m3u8',
        '#EXTINF:-1 dm-country="BR" dm-source="lista-1" group-title="Geral",Canal Brasil da Lista 1',
        'https://mock.example/br-from-one.m3u8'].join("\n");
      const mx=['#EXTM3U','#DM_MERGED:LISTAS-1-8',
        '#EXTINF:-1 dm-country="MX" dm-source="lista-7" group-title="Geral",Canal México',
        'https://mock.example/mx.m3u8'].join("\n");
      res.writeHead(200,{"Content-Type":"text/plain"});
      res.end(country==="MX"?mx:country==="ALL"?br+"\n"+mx:br);return;
    }
    if(req.url==="/stream/session"){
      res.writeHead(authorized?200:403,{"Content-Type":"application/json"});
      res.end(JSON.stringify({allowed:authorized}));
      return;
    }
    const file=paths[req.url];
    if(!file){res.writeHead(404);res.end();return;}
    const kind=file.endsWith(".html")?"text/html":file.endsWith(".css")?"text/css":
      file.endsWith(".json")?"application/json":"text/javascript";
    res.writeHead(200,{"Content-Type":kind,"Cache-Control":"no-store"});
    fs.createReadStream(path.join(ROOT,file)).pipe(res);
  });
  await new Promise(resolve=>server.listen(18765,"127.0.0.1",resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const newContext=async(mobile=false)=>{
      const context=await browser.newContext(mobile?{viewport:{width:375,height:780},isMobile:true,hasTouch:true}:{});
      await context.addInitScript(()=>{
        HTMLMediaElement.prototype.canPlayType=function(t){
          return /mpegurl/i.test(t)?"probably":"";
        };
        HTMLMediaElement.prototype.play=function(){
          return Promise.reject(new Error("Mock video is not live"));
        };
      });
      await context.route("https://raw.githubusercontent.com/**",route=>
        route.fulfill({status:200,contentType:"application/x-mpegURL",
          headers:{"Access-Control-Allow-Origin":"*"},body:playlist}));
      await context.route("https://iptv-org.github.io/**",route=>
        route.fulfill({status:200,contentType:"application/x-mpegURL",
          headers:{"Access-Control-Allow-Origin":"*"},
          body:route.request().url().includes("/countries/br.m3u")?aliasPlaylist:playlist}));
      await context.route("https://mock.example/**",route=>route.abort());
      return context;
    };
    {
      authorized=false;
      const context=await newContext(),page=await context.newPage();
      await page.goto(origin+"/stream/listas/");
      await page.locator("#access-error").waitFor({state:"visible"});
      assert.equal(await page.locator("#library").isVisible(),false);
      await context.close();
    }
    {
      authorized=true;
      const context=await newContext(),page=await context.newPage();
      await page.goto(origin+"/stream/listas/");
      await page.locator("#source-list .source").first().waitFor();
      assert.equal(await page.locator("#source-list .source").count(),11);
      await page.locator('#country option[value="MX"]').waitFor({state:"attached"});
      assert.equal(await page.locator("#country option").count(),15);
      await page.getByRole("button",{name:/Lista 1/}).click();
      await page.getByText("Canal Notícias Brasil").first().waitFor();
      assert.equal(await page.locator("#channel-list .channel").count(),3);
      assert.match(await page.locator("#channel-list").textContent(),/ESPN Premium/);
      await page.locator("#channel-list .pick").filter({hasText:"ESPN Premium"}).click();
      assert.match(await page.locator("#player-error").textContent(),/direito de transmissão/);
      assert.equal(await page.locator("#video").getAttribute("src"),null);
      await page.locator("#country").selectOption("BR");
      assert.equal(await page.locator("#channel-list .channel").count(),1);
      await page.locator("#genre").selectOption("sports");
      assert.equal(await page.locator("#channel-list .channel").count(),0);
      await page.locator("#genre").selectOption("all");
      await page.locator("#country").selectOption("ALL");
      await page.getByText("Canal Notícias Brasil").first().click();
      await page.locator('video[src="https://mock.example/news.m3u8"]').waitFor();
      assert.equal(await page.locator('a[target="_blank"]').count(),0);
      await page.locator("#source-list .source").nth(1).click();
      await page.getByText("Record News",{exact:true}).first().waitFor();
      assert.match(await page.locator("#channel-list").textContent(),/Nome da fonte: TV Guará/);
      assert.match(await page.locator("#channel-list").textContent(),/Origens: Lista 1/);
      await page.locator("#country").selectOption("MX");
      await page.getByText("Canal México",{exact:true}).first().waitFor();
      assert.equal(await page.getByText("Record News",{exact:true}).count(),0);
      await page.locator("#country").selectOption("BR");
      await page.getByText("Record News",{exact:true}).first().waitFor();
      await page.locator("#search").fill("TV Guará");
      await page.getByText("Record News",{exact:true}).first().waitFor();
      await page.locator("#search").fill("Record News");
      await page.getByText("Record News",{exact:true}).first().waitFor();
      assert.equal(await page.locator("#source-list .source").count(),11);
      await page.locator(".add-source summary").click();
      await page.locator("#custom-file").setInputFiles({
        name:"meus-canais.m3u",
        mimeType:"audio/x-mpegURL",
        buffer:Buffer.from(playlist)
      });
      await page.getByText(/Lista 12 • meus-canais.m3u/).first().waitFor();
      assert.equal(await page.locator("#source-list .source").count(),12);
      await page.locator("#source-list .source").nth(7).click();
      assert.equal(await page.getByText("DAZN",{exact:true}).count(),0);
      assert.equal(await page.locator("#official-access").count(),0);
      await context.close();
    }
    // On a narrow mobile device, choosing a playlist moves to its actual channels
    // and choosing a channel takes the user back to the visible player.
    {
      authorized=true;
      const context=await newContext(true),page=await context.newPage();
      await page.goto(origin+"/stream/listas/");
      await page.locator("#source-list .source").first().waitFor();
      await page.locator("#source-list .source").first().click();
      await page.locator("#channel-list .channel").first().waitFor();
      await page.waitForFunction(()=>{
        const r=document.getElementById("channel-catalog").getBoundingClientRect();
        return r.top>=-24 && r.top<window.innerHeight/2;
      });
      assert.match(await page.locator("#catalog-status").textContent(),/3 neste filtro/);
      await page.locator("#channel-list .pick").first().click();
      await page.waitForFunction(()=>{
        const r=document.querySelector(".viewer").getBoundingClientRect();
        return r.top>=-24 && r.top<window.innerHeight/2;
      });
      await page.locator("#now-name").getByText(/Canal Notícias Brasil|Free Sports US/).waitFor();
      await page.getByRole("button",{name:/Escolher outra lista/}).click();
      await page.waitForFunction(()=>{
        const r=document.getElementById("sources-title").getBoundingClientRect();
        return r.top>=-24 && r.top<window.innerHeight/2;
      });
      await context.close();
    }
    // Unreachable playlist shows a local retry action, not an apparent dead tap.
    {
      authorized=true;
      const context=await newContext(true);
      await context.route("https://raw.githubusercontent.com/**",r=>r.abort());
      const page=await context.newPage();
      await page.goto(origin+"/stream/listas/");
      await page.locator("#source-list .source").first().click();
      await page.locator("#retry-catalog").waitFor({state:"visible"});
      assert.match(await page.locator("#catalog-status").textContent(),/0 canais carregados/);
      assert.match(await page.locator("#load-error").textContent(),/Não conseguimos ler a playlist/);
      await context.close();
    }
    process.stdout.write("IPTV library browser smoke PASS (auth, 7 playlists, filters, import, player mock).\n");
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(err=>{console.error(err);process.exit(1);});
