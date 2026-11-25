/* Offline browser smoke of DrivMatch /stream. All feeds/auth are simulated.
 * This DOES NOT claim any broadcaster stream works in production.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../site');
const origin = 'http://127.0.0.1:18764';
const paths = {'/stream/':'index.html','/stream/index.html':'index.html','/stream/stream.js':'stream.js','/stream/stream.css':'stream.css','/stream/graphite.css':'streamnow-graphite.css','/stream/brand.webp':'streamnow-brand.webp','/stream/stream-boot.js':'stream-boot.js','/stream/stream-tv.js':'stream-tv.js','/stream/tv/':'tv.html','/stream/tv/tv.css':'tv.css','/stream/tv/tv.js':'tv.js','/stream/listas/sources.json':'playlist-sources.json','/stream/listas/brasil-servicos.json':'brasil-servicos.json','/stream/official-access.json':'official-access.json','/stream/favorites-safety.js':'favorites-safety.js'};
const m3uES = ['#EXTM3U','#EXTINF:-1 group-title="News",24 Horas (720p)',
  'https://mock.example/24horas.m3u8',
  '#EXTINF:-1 group-title="Geral",TV Globo','https://mock.example/globo.m3u8',
  '#EXTINF:-1 group-title="Esportes",SporTV','https://mock.example/sportv.m3u8',
  '#EXTINF:-1 group-title="Esportes",ESPN Brasil','https://mock.example/espn.m3u8',
  '#EXTINF:-1 tvg-country="BR" group-title="Geral",TV Guará',
  'https://mock.example/guara.m3u8',
  ...Array.from({length:75},(_,i)=>['#EXTINF:-1 group-title="General",Canal Teste '+(i+1),
   'https://mock.example/test'+(i+1)+'.m3u8']).flat()].join('\n');
const m3uGlobal = ['#EXTM3U','#EXTINF:-1 tvg-id="NHKWorldJapan.jp@HD" group-title="Culture;News",NHK World-Japan',
  'https://mock.example/nhk.m3u8'].join('\n');

async function main(){
  let authorized=false,contextSequence=0;
  const accounts=new Map();
  const cookieAccount=req=>{
    const cookie=(req.headers.cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("test_stream_user="));
    return cookie?cookie.slice("test_stream_user=".length):"";
  };
  const server=http.createServer((req,res)=>{
    const current=cookieAccount(req);
    if(req.url==="/stream/favorites"){
      if(!authorized||!current||!accounts.has(current)){
        res.writeHead(401);res.end("Unauthorized");return;
      }
      const entries=accounts.get(current);
      if(req.method==="GET"){
        res.writeHead(200,{"Content-Type":"application/json"});
        res.end(JSON.stringify({favorites:[...entries]}));return;
      }
      if(req.method==="POST"){
        let text="";
        req.on("data",x=>{text+=x;});
        req.on("end",()=>{
          let data={};try{data=JSON.parse(text);}catch{}
          if(data.operation==="remove"){res.writeHead(423);res.end();return;}
          if(data.operation==="add"&&typeof data.key==="string")entries.add(data.key);
          else if(data.operation==="import"&&Array.isArray(data.keys)&&data.keys.length<=20){
            for(const key of data.keys)entries.add(key);
          }else{res.writeHead(400);res.end();return;}
          res.writeHead(200,{"Content-Type":"application/json"});
          res.end(JSON.stringify({ok:true}));
        });return;
      }
      res.writeHead(405);res.end();return;
    }
    if(req.url==="/stream/listas/sources.json"){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({sources:[{id:"lista-1",title:"Lista 1 • Free-TV"},{id:"lista-2",title:"Lista 2 • Canais por país (Listas 1–8)"},{id:"lista-3",title:"Lista 3 • Notícias"},{id:"lista-4",title:"Lista 4 • Esportes"},{id:"lista-5",title:"Lista 5 • Nexonic"},{id:"lista-6",title:"Lista 6 • Open Legal"},{id:"lista-7",title:"Lista 7 • FreeCastHub"},{id:"lista-8",title:"Lista 8 • Brasil: canais abertos"},{id:"lista-9",title:"Lista 9 • Brasil: canais públicos recentes"},
        {id:"lista-10",title:"Lista 10 • Filmes livres internacionais"},
        {id:"lista-11",title:"Lista 11 • Notícias livres internacionais"},
        {id:"lista-12",title:"Lista 12 • Autopiloto diário"},
        {id:"lista-13",title:"Lista 13 • ColdOpen"},
        {id:"lista-14",title:"Lista 14 • Broadcast Atlas"}]}));return;
    }
    if(req.url==="/stream/countries?list=lista-2"){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify({countries:[{code:"MX",name:"México"}],loaded:7,total:7}));return;
    }
    if(req.url && req.url.startsWith("/stream/catalog?list=")){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"text/plain"});
      if(req.url.includes("list=lista-2")){
        const code=new URL(req.url,origin).searchParams.get("country");
        const mx=['#EXTM3U','#DM_MERGED:LISTAS-1-8',
          '#EXTINF:-1 dm-country="MX" dm-source="lista-7",Canal México',
          'https://mock.example/mexico.m3u8'].join("\n");
        const other=['#EXTM3U','#DM_MERGED:LISTAS-1-8',
          '#EXTINF:-1 dm-country="OTHER" dm-source="lista-6",Sem País',
          'https://mock.example/unknown.m3u8'].join("\n");
        const br=m3uES.replace(
          '#EXTINF:-1 group-title="News",24 Horas (720p)',
          '#EXTINF:-1 dm-country="BR" dm-source="lista-1" group-title="News",24 Horas (720p)');
        res.end(code==="MX"?mx:code==="OTHER"?other:
          code==="ALL"?br+"\n"+mx:br);return;
      }
      res.end(req.url.includes("lista-8")?
    ['#EXTM3U','#EXTINF:-1 tvg-country="BR" group-title="News",Record News',
      'https://mock.example/record-news.m3u8'].join("\n"):
    req.url.includes("lista-9")?
    ['#EXTM3U','#EXTINF:-1 tvg-country="BR" group-title="Público",TV Brasil',
      'https://mock.example/tvbrasil.m3u8'].join("\n"):m3uES);return;
    }
    if(req.url && req.url.startsWith("/stream/search?q=")){
      if(!authorized){res.writeHead(403);res.end();return;}
      const term=new URL(req.url,origin).searchParams.get("q").toLowerCase();
      const rows=[
        ['CNN Brasil','BR','cnn-br','News'],
        ['CNN Portugal','PT','cnn-pt','News'],
        ['CNN EUA','US','cnn-us','News'],
        ['Canal Teste 10','BR','test10','General']
      ].filter(([name])=>name.toLowerCase().includes(term));
      res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});
      res.end(["#EXTM3U","#DM_SEARCH:"+term,"#DM_SOURCES_LOADED:25/25",
        "#DM_MATCHED_CHANNELS:"+rows.length,
        ...rows.flatMap(([name,country,slug,group])=>[
          '#EXTINF:-1 dm-country="'+country+'" dm-source="lista-2" group-title="'+group+'",'+name,
          "https://mock.example/"+slug+".m3u8"])].join("\n"));return;
    }
    if(req.url && req.url.startsWith("/stream/catalog?country=")){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});
      res.end(req.url.endsWith("BR")?m3uES:'#EXTM3U');
      return;
    }
    if(req.url==="/stream/session"||
       (req.url&&req.url.startsWith("/stream/session?connectivity="))){
      res.writeHead(authorized?200:403,{"Content-Type":"application/json","Cache-Control":"no-store"});
      res.end(JSON.stringify({allowed:authorized,user_id:current}));
      return;
    }
    // Versioned Samsung assets must resolve to the same file, ignoring query.
    const file=paths[new URL(req.url,origin).pathname];
    if(!file){res.writeHead(404);res.end();return;}
    res.writeHead(200,{"Content-Type":file.endsWith(".html")?"text/html":file.endsWith(".css")?"text/css":"text/javascript"});
    fs.createReadStream(path.join(ROOT,file)).pipe(res);
  });
  await new Promise(resolve=>server.listen(18764,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const setup=async allowed=>{
      authorized=allowed;
      const context=await browser.newContext();
      const userId="test-account-"+(++contextSequence);
      accounts.set(userId,new Set());
      await context.addCookies([{name:"test_stream_user",value:userId,url:origin}]);
      await context.addInitScript(() => {
        HTMLMediaElement.prototype.canPlayType = function(type){return type.includes('mpegurl') ? 'probably' : '';};
        HTMLMediaElement.prototype.play = function(){return Promise.reject(new Error('Simulated media disabled'));};
      });
      await context.route('https://iptv-org.github.io/**',route=>{
        const u=route.request().url();
        route.fulfill({status:200,contentType:'audio/x-mpegurl',headers:{'Access-Control-Allow-Origin':'*'},
          body:u.endsWith('/es.m3u')?m3uES:u.endsWith('/jp.m3u')?m3uGlobal:'#EXTM3U'});
      });
      await context.route('https://mock.example/**',route=>route.abort());
      return context;
    };
    // TV-specific smoke must emulate a real Samsung user agent, not desktop Chromium.
    const samsungPage=async context=>{
      const page=await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator,'userAgent',{get:() =>
          'Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4) AppleWebKit/538.1 SamsungBrowser/1.0 TV Safari/538.1'});
      });
      return page;
    };
    // Missing Cloudflare owner session must not reveal player or playlist.
    {
      const context=await setup(false);
      const page=await context.newPage();
      await page.goto(origin+'/stream/?layout=classic');
      await page.getByText(/Acesso pessoal indisponível/).waitFor();
      assert.equal(await page.locator('#tv').isVisible(),false);
      await context.close();
    }
    // Denied server session must not reveal any channels.
    {
      const context=await setup(false);
      const page=await context.newPage();
      await page.goto(origin+'/stream/?layout=classic');
      await page.getByText(/Acesso pessoal indisponível/).waitFor();
      assert.equal(await page.locator('#tv').isVisible(),false);
      await context.close();
    }
    // Approved account: world news appears; selecting a stream stays in the page.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.goto(origin+'/stream/?layout=classic');
      await page.getByText('NHK World-Japan').first().waitFor();
      assert.equal(await page.locator('#countries button').count(),13);
      await page.getByRole('button',{name:/Pay-per-view/}).click();
      await page.getByText(/Não há eventos PPV integrados/).waitFor();
      assert.equal(await page.locator('#channels .channel').count(),0);
      await page.getByRole('button',{name:'Todos',exact:true}).click();
      await page.getByText('24 Horas (720p)').first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      assert.equal(await page.locator('a[target="_blank"]').count(),0);
      assert.equal(await page.locator('#current-channel').textContent(),'24 Horas (720p)');
      assert.equal(await page.locator('.viewer').evaluate(el=>getComputedStyle(el).position),'sticky');
      assert.equal(await page.locator('#player-favorite').isEnabled(),true);
      assert.equal(await page.locator('#retry-channel').isEnabled(),true);
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(() => window.scrollTo(0,1300));
      await page.waitForTimeout(300);
      const stickyRect=await page.locator('#viewer').boundingBox();
      assert(stickyRect && stickyRect.y >= -2 && stickyRect.y <= 25,
        'Mobile TV player must remain visibly pinned while the channel list scrolls: '+JSON.stringify(stickyRect));
      assert((await page.locator('#viewer').boundingBox()).height < 370,
        'Mobile sticky player must leave room to browse the channel list');
      await context.close();
    }
    // Desktop computers now use the very same Samsung three-column layout.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.setViewportSize({width:1366,height:768});
      await page.clock.install();
      await page.addInitScript(() => {
        window.__hlsLoads=[];
        function FakeHls(){this.handlers={};}
        FakeHls.Events={MEDIA_ATTACHED:'attached',MANIFEST_PARSED:'parsed',ERROR:'error'};
        FakeHls.isSupported=()=>true;
        FakeHls.prototype.on=function(type,fn){this.handlers[type]=fn;};
        FakeHls.prototype.attachMedia=function(){
          if(this.handlers.attached)this.handlers.attached();
        };
        FakeHls.prototype.loadSource=function(url){
          window.__hlsLoads.push(url);
          if(this.handlers.parsed)this.handlers.parsed();
        };
        FakeHls.prototype.destroy=function(){};
        window.Hls=FakeHls;
      });
      await page.goto(origin+'/stream/');
      const brazil=page.locator('.tree-country-btn[data-country="BR"]');
      await brazil.waitFor();
      assert.equal(await brazil.getAttribute('aria-expanded'),'false');
      await page.locator('#channel-items .channel-btn').first().waitFor();
      assert((await page.locator('#channel-items .channel-btn').count())>=5,
        'Official channels must appear before a country is selected');
      assert.equal(await page.locator('.tree-genre-btn').count(),0,
        'Brazil must start folded like every other country on desktop');
      assert.equal(await page.locator('#catalog-title').textContent(),'Canais oficiais para assistir');
      await brazil.click();
      await page.locator('#channel-items .channel-btn').first().waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/tv/');
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dm-desktop-compact')),true,
        'Desktop must receive the compact typographic class');
      const fontSizes=await page.evaluate(() => {
        const px=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
        return {country:px('.tree-country-btn'),genre:px('.tree-genre-btn'),
          channel:px('.channel-row .channel-btn .channel-title'),
          player:px('.now-playing h2')};
      });
      assert(fontSizes.country>=15&&fontSizes.country<=18,'Desktop country font: '+fontSizes.country);
      assert(fontSizes.genre>=14&&fontSizes.genre<=17,'Desktop category font: '+fontSizes.genre);
      assert(fontSizes.channel>=14&&fontSizes.channel<=17,'Desktop channel font: '+fontSizes.channel);
      assert(fontSizes.player>=18&&fontSizes.player<=22,'Desktop player heading: '+fontSizes.player);
      const left=await page.locator('.sidebar').boundingBox();
      const middle=await page.locator('.catalog').boundingBox();
      const right=await page.locator('.player-column').boundingBox();
      assert(left&&middle&&right,'All three columns must be visible on desktop');
      assert(left.width>250&&middle.width>250&&right.width>250,
        'Desktop columns must be comfortably sized');
      assert(left.x+left.width<=middle.x&&middle.x+middle.width<=right.x,
        'Columns must follow Samsung order: countries, channels, player');
      await page.locator('#channel-items .channel-btn').first().click();
      await page.waitForFunction(() => window.__hlsLoads.length===1);
      assert.deepEqual(await page.evaluate(()=>window.__hlsLoads),
        ['https://mock.example/24horas.m3u8'],
        'Desktop must use HLS.js rather than give the .m3u8 URL to the native video element');
      assert.equal(await page.locator('#video').getAttribute('src'),null,
        'HLS.js is responsible for the media source on desktop');
      await page.clock.fastForward(60000);
      assert.equal(await page.locator('#restore-hidden').isVisible(),false,
        'Unsupported desktop playback must not hide channels as offline');
      assert.equal(await page.locator('#channel-items .channel-btn').first().count(),1);
      await page.locator('#provider-toggle').click();
      const netflixLink=page.locator('#provider-items a.provider-entry').filter({hasText:'Netflix'}).first();
      await netflixLink.waitFor();
      assert.equal(await netflixLink.getAttribute('href'),'https://www.netflix.com/br/');
      assert.equal(await netflixLink.getAttribute('target'),'_blank',
        'Desktop provider must open via a user-activated external link');
      assert.match(await netflixLink.textContent(),/Abrir site oficial/);
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)',
        'Showing provider links must not change or interrupt the channel');
      await brazil.click();
      assert.equal(await brazil.getAttribute('aria-expanded'),'false');
      assert((await page.locator('#channel-items .channel-btn').count())>=5,
        'Closing Brazil must return to the official channel home without clearing the playing channel');
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)',
        'Collapsing the country must not clear the currently selected channel');
      await brazil.click();
      await page.locator('#channel-items .channel-btn').first().waitFor();
      assert.equal(await brazil.getAttribute('aria-expanded'),'true');
      await context.close();
    }

    // Search must cover all countries even with the country tree fully folded.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.setViewportSize({width:1366,height:768});
      await page.goto(origin+'/stream/tv/');
      const brazil=page.locator('.tree-country-btn[data-country="BR"]');
      await brazil.waitFor();
      assert.equal(await brazil.getAttribute('aria-expanded'),'false');
      await page.locator('#search').fill('CNN');
      await page.waitForFunction(()=>
        document.getElementById('catalog-status').textContent.includes('Fontes consultadas'));
      for(const [name,countryName] of [
        ['CNN Brasil','Brasil'],['CNN Portugal','Portugal'],['CNN EUA','Estados Unidos']
      ]){
        const btn=page.locator('#channel-items .channel-btn').filter({hasText:name}).first();
        await btn.waitFor();
        assert.match(await btn.textContent(),new RegExp(countryName));
      }
      assert.match(await page.locator('#result-count').textContent(),/3 países/);
      assert.equal(await brazil.getAttribute('aria-expanded'),'false',
        'Searching should not require opening Brazil first');
      await page.locator('#channel-items .channel-btn').filter({hasText:'CNN EUA'}).click();
      assert.equal(await page.locator('#now-name').textContent(),'CNN EUA');
      await page.locator('#clear-search').click();
      assert.equal(await page.locator('#catalog-title').textContent(),'Canais oficiais para assistir');
      assert((await page.locator('#channel-items .channel-btn').count())>=5);
      assert.equal(await page.locator('#now-name').textContent(),'CNN EUA',
        'Clearing search must not stop or reset the selected channel');

      // Search globally also when a single country is currently expanded.
      await brazil.click();
      await page.locator('#channel-items .channel-btn').first().waitFor();
      await page.locator('#search').fill('CNN');
      await page.waitForFunction(()=>
        document.getElementById('catalog-status').textContent.includes('Fontes consultadas'));
      assert.match(await page.locator('#result-count').textContent(),/3 países/);
      await page.locator('#search').fill('');
      await page.locator('#channel-items .channel-btn').first().waitFor();
      assert.equal(await page.locator('#catalog-title').textContent(),'Brasil');
      await context.close();
    }
    // Android/iOS share Samsung's country tree and the same guide, with the
    // player fixed above independently scrollable mobile tabs.
    for(const agent of [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    ]){
      const context=await setup(true);
      const page=await context.newPage();
      await page.setViewportSize({width:390,height:844});
      await page.addInitScript(ua => {
        Object.defineProperty(navigator,'userAgent',{get:() => ua});
        window.__hlsLoads=[];
        function FakeHls(){this.handlers={};}
        FakeHls.Events={MEDIA_ATTACHED:'attached',MANIFEST_PARSED:'parsed',ERROR:'error'};
        FakeHls.isSupported=()=>true;
        FakeHls.prototype.on=function(type,fn){this.handlers[type]=fn;};
        FakeHls.prototype.attachMedia=function(){
          if(this.handlers.attached)this.handlers.attached();
        };
        FakeHls.prototype.loadSource=function(url){
          window.__hlsLoads.push(url);
          if(this.handlers.parsed)this.handlers.parsed();
        };
        FakeHls.prototype.destroy=function(){};
        window.Hls=FakeHls;
      },agent);
      await page.goto(origin+'/stream/');
      const brazil=page.locator('.tree-country-btn[data-country="BR"]');
      await brazil.waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/tv/');
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dm-mobile-guide')),true);
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dm-desktop-compact')),false);
      assert.equal(await page.locator('#mobile-countries').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#mobile-countries-panel').isVisible(),true);
      assert.equal(await page.locator('#mobile-guide-panel').isVisible(),false);
      assert.equal(await brazil.getAttribute('aria-expanded'),'false');
      const viewport=await page.evaluate(()=>({
        inner:innerHeight,scroll:document.scrollingElement.scrollHeight,
        body:getComputedStyle(document.body).overflow,columns:
          getComputedStyle(document.getElementById('tv-layout')).gridTemplateColumns
      }));
      assert(viewport.scroll<=viewport.inner+3,
        'Phone page itself must remain fixed: '+JSON.stringify(viewport));
      assert.equal(viewport.body,'hidden');
      const playerBefore=await page.locator('.player-column').boundingBox();
      await page.locator('.sidebar').evaluate(el=>{el.scrollTop=600;});
      assert((await page.locator('.sidebar').evaluate(el=>el.scrollTop))>0,
        'Phone country tree must scroll independently');
      const playerAfter=await page.locator('.player-column').boundingBox();
      assert(Math.abs(playerBefore.y-playerAfter.y)<2,
        'Phone player must remain at fixed position during country browsing');
      assert(playerBefore.height<360,'Phone player must leave space for channel browsing');
      await brazil.click();
      await page.locator('#channel-items .channel-btn').first().waitFor();
      assert.equal(await page.locator('#mobile-guide').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#mobile-guide-panel').isVisible(),true);
      assert.equal(await page.locator('#mobile-countries-panel').isVisible(),false);
      await page.locator('#channel-items .channel-btn').first().click();
      await page.waitForFunction(()=>
        window.__hlsLoads.length>0||
        document.querySelector('#video').getAttribute('src')==='https://mock.example/24horas.m3u8');
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      const selected=await page.locator('.player-column').boundingBox();
      await page.locator('.catalog').evaluate(el=>{el.scrollTop=400;});
      assert(Math.abs((await page.locator('.player-column').boundingBox()).y-selected.y)<2);
      await page.locator('#search').fill('CNN');
      await page.waitForFunction(() =>
        document.getElementById('catalog-status').textContent.includes('Fontes consultadas'));
      assert.match(await page.locator('#result-count').textContent(),/3 países/);
      for(const country of ['Brasil','Portugal','Estados Unidos'])
        assert((await page.locator('#channel-items').textContent()).includes(country),
          'Global mobile guide should include '+country);
      await page.locator('#mobile-countries').click();
      assert.equal(await page.locator('#mobile-countries-panel').isVisible(),true);
      assert.equal(await page.locator('#mobile-guide-panel').isVisible(),false);
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      await page.locator('#mobile-guide').click();
      assert.equal(await page.locator('#mobile-guide-panel').isVisible(),true);
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      await context.close();
    }
    // The classic viewer remains an explicit opt-in for support.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.goto(origin+'/stream/?layout=classic');
      await page.locator('#countries button').first().waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/');
      await context.close();
    }
    // Tizen/Samsung TV user agents require an ES5-compatible private guide.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.setExtraHTTPHeaders({'X-Client-Check':'samsung-legacy'});
      await page.addInitScript(() => {
        Object.defineProperty(navigator,'userAgent',{get:() =>
          'Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4) AppleWebKit/538.1 SamsungBrowser/1.0 TV Safari/538.1'});
      });
      await page.goto(origin+'/stream/');
      await page.locator('.tree-country-btn[data-country="BR"]').waitFor();
      assert.equal(await page.locator('.tree-country-btn[data-country="BR"]').getAttribute('aria-expanded'),'false');
      assert((await page.locator('#channel-items .channel-btn').count())>=5);
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      await page.getByText('24 Horas (720p)').first().waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/tv/');
      assert.equal(await page.locator('#source-items .source-btn').first().isVisible(),false);
      await page.locator('.tree-country-btn[data-country="MX"]').waitFor();
      assert.equal(await page.locator('#country-items .country-btn').count(),15);
      assert.equal(await page.locator('.tree-country-btn[data-country="BR"]').getAttribute('aria-expanded'),'true');
      await page.locator('#channel-items .channel-btn').first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dm-desktop-compact')),false,
        'Samsung user-agent must never receive desktop font overrides');
      const samsungCountrySize=await page.locator('.tree-country-btn').first()
        .evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
      assert(samsungCountrySize>=22,'Samsung must retain large sofa-distance typography');
      await context.close();
    }
    // Samsung: country > category > channel tree, with hidden source lists.
    {
      const context=await setup(true);
      const page=await samsungPage(context);
      await page.setViewportSize({width:1440,height:900});
      await page.goto(origin+'/stream/tv/');
      await page.locator('.tree-country-btn[data-country="BR"]').waitFor();

      assert.equal(await page.locator('link[href*="/stream/graphite.css"]').count(),1,
        'Samsung must load final graphite stylesheet');
      const bg=await page.locator('.topbar').evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(bg,'rgb(11, 11, 11)','No legacy green/blue header allowed');
      const panel=await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(panel,'rgb(20, 20, 20)','Guide must use graphite, not green');

      // Compact header without tagline, source label, or the "Privado" text.
      const top=page.locator('.topbar');
      assert((await top.boundingBox()).height<=43,'Header must be truly compact');
      assert((await page.locator('.topbar .streamnow-wordmark').boundingBox()).width<=160);
      assert.equal(await top.getByText('TV INTERNACIONAL · ACESSO PESSOAL').count(),0);
      assert.equal(await top.getByText('Países e categorias').count(),0);
      assert.equal(await top.getByText('Privado',{exact:true}).count(),0);
      assert.equal(await page.locator('#connection-status').count(),0,
        'No unnecessary ON/OFF indicator should occupy the header');
      assert.equal(await page.locator('#connection-label').count(),0);

      // Four requested countries remain pinned, even with new detected countries.
      await page.locator('.tree-country-btn[data-country="MX"]').waitFor();
      const firstFour=await page.locator('.tree-country-btn .tree-label').allTextContents();
      assert.deepEqual(firstFour.slice(0,4),['Brasil','Portugal','Espanha','Estados Unidos']);

      await page.setViewportSize({width:960,height:720});
      assert((await top.boundingBox()).height<=41,'Tizen header must actually be shorter');
      await page.setViewportSize({width:1440,height:900});
      assert.equal(await page.locator('#source-items').isVisible(),false);
      assert.equal(await page.locator('#source-items .source-btn').first().isVisible(),false);
      assert.equal(await page.locator('#category-items').isVisible(),false);
      assert.equal(await page.locator('.tree-country-btn[data-country="BR"]').getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('.tree-genre-btn[data-country="BR"]').count(),0);
      assert((await page.locator('#channel-items .channel-btn').count())>=5);
      assert.equal(await page.locator('#catalog-title').textContent(),'Canais oficiais para assistir');
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      assert.equal(await page.locator('.tree-country-btn[data-country="BR"]').getAttribute('aria-expanded'),'true');
      const sportsCategory=page.locator('.tree-genre-btn[data-genre="sports"][data-country="BR"]');
      const newsCategory=page.locator('.tree-genre-btn[data-genre="news"][data-country="BR"]');
      await sportsCategory.waitFor();
      await newsCategory.waitFor();
      assert.equal(await sportsCategory.getAttribute('aria-expanded'),'false');
      assert.equal(await newsCategory.getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('.tree-genre-btn[data-country="BR"][aria-expanded="true"]').count(),0,
        "Every Brazil category must start closed");
      await page.locator('#refresh').click();
      await newsCategory.waitFor();
      assert.equal(await page.locator('.tree-genre-btn[data-country="BR"][aria-expanded="true"]').count(),0,
        "Refreshing must close all Brazil category rows");

      assert.equal(await page.locator('.tree-channel-btn[data-country="BR"]').count(),0,
        'No channels should be expanded initially');

      // Opening Notícias automatically closes Esportes and vice versa.
      await sportsCategory.click();
      assert.equal(await sportsCategory.getAttribute('aria-expanded'),'true');
      assert.equal(await newsCategory.getAttribute('aria-expanded'),'false');
      await newsCategory.click();
      assert.equal(await sportsCategory.getAttribute('aria-expanded'),'false');
      assert.equal(await newsCategory.getAttribute('aria-expanded'),'true');
      const news=page.locator('.tree-channel-btn[data-country="BR"]').filter({hasText:'24 Horas'});
      await news.first().waitFor();
      // Different, brighter panels and readable channel names (not low-contrast).
      const theme=await page.evaluate(()=>{
        const css=x=>getComputedStyle(document.querySelector(x));
        const color=el=>css(el).backgroundColor;
        const foreground=el=>css(el).color;
        return {sidebar:color('.sidebar'),guide:color('.catalog'),
          player:color('.player-column'),
          row:color('.channel-row'),
          text:foreground('.channel-row .channel-title'),
          selected:foreground('.tree-country-btn.active'),
          guideFont:parseFloat(css('.channel-row .channel-title').fontSize),
          treeFont:parseFloat(css('.tree-channel-btn').fontSize),
          focusRing:css('.tree-country-btn').outlineColor};
      });
      assert.notEqual(theme.sidebar,theme.guide,'The columns require visible separation');
      assert.notEqual(theme.guide,theme.player,'The player must be visually distinct');
      assert.equal(theme.guideFont,theme.treeFont,'Keep text size equal in both columns');
      const rgba=x=>(x.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
      const luminance=x=>{
        const v=rgba(x).map(n=>n/255).map(n=>n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4));
        return v[0]*.2126+v[1]*.7152+v[2]*.0722;
      };
      const contrast=(a,b)=>{
        const x=luminance(a),y=luminance(b);
        return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
      };
      assert(contrast(theme.text,theme.row)>=7,'Channel text needs strong contrast');
      assert.equal(await page.locator('.tree-genre-btn[aria-expanded="true"]').count(),1);
      assert((await page.locator('.tree-country-btn[data-country="BR"]').evaluate(
        el=>parseFloat(getComputedStyle(el).fontSize)))>=23,'Country font must read from sofa');
      const small=await page.locator('.tree-genre-btn[data-genre="news"][data-country="BR"]').evaluate(
        el=>el.getBoundingClientRect().height);
      assert(small<=65,'Category buttons must remain compact');
      await page.setViewportSize({width:960,height:720});
      assert((await page.locator('.tree-channel-btn').first().evaluate(
        el=>parseFloat(getComputedStyle(el).fontSize)))>=20,'Tizen small viewport text must stay readable');
      await page.setViewportSize({width:1440,height:900});

      // Left tree plays a listed open channel, keeping focus on the tree.
      await news.first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      assert.match(await page.locator('#channel-items .channel-btn').first().getAttribute('title'),/Origem: Lista 1/);
      // Channel names match exactly across left and middle; rows use a
      // separate inline classification rather than a second metadata row.
      const metrics=await page.evaluate(()=>{
        const left=document.querySelector('.tree-channel-btn .tree-channel-name');
        const middle=document.querySelector('.channel-row .channel-title');
        const right=document.querySelector('.channel-row .channel-classification');
        const row=document.querySelector('.channel-row');
        const a=middle.getBoundingClientRect(),b=right.getBoundingClientRect();
        return {leftFont:parseFloat(getComputedStyle(left).fontSize),
          middleFont:parseFloat(getComputedStyle(middle).fontSize),
          rowHeight:row.getBoundingClientRect().height,
          leftY:a.y,rightY:b.y,rightX:b.x,nameRight:a.right,
          label:right.textContent};
      });
      assert.equal(metrics.leftFont,metrics.middleFont);
      assert(metrics.leftFont>=23);
      assert(metrics.rowHeight<=53,'Compact guide row should fit more channels');
      assert(metrics.rightX>=metrics.nameRight-2,'Classification is a right-hand column');
      assert(Math.abs(metrics.rightY-metrics.leftY)<14,'Classification stays on the same line');
      assert.equal(metrics.label,'Brasil');
      assert.equal(await page.evaluate(()=>document.activeElement.className.includes('tree-channel-btn')),true);

      // Multiple countries remain visible and expand independently.
      await page.locator('.tree-country-btn[data-country="PT"]').click();
      await page.locator('.tree-genre-btn[data-country="PT"]').first().waitFor();
      assert.equal(await page.locator('.tree-country-btn[data-country="BR"]').getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('.tree-genre-btn[aria-expanded="true"]').count(),0,
        'Opening another country collapses prior channel categories');
      await page.locator('.tree-country-btn[data-country="MX"]').click();
      await page.locator('.tree-genre-btn[data-country="MX"]').first().waitFor();
      assert.equal(await page.locator('.tree-country-btn[data-country="MX"]').getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('#channel-items').getByText('24 Horas (720p)',{exact:true}).count(),0);
      const mxCategory=page.locator('.tree-genre-btn[data-country="MX"][data-genre="other"]');
      await mxCategory.click();
      await page.locator('.tree-channel-btn[data-country="MX"]').getByText('Canal México',{exact:true}).waitFor();
      assert.equal(await page.locator('.tree-genre-btn[aria-expanded="true"]').count(),1);
      await page.locator('.tree-country-btn[data-country="MX"]').click();
      assert.equal(await page.locator('.tree-genre-btn[data-country="MX"]').count(),0,'Collapsed country should hide category rows');
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      assert.equal(await page.locator('.tree-genre-btn[data-country="BR"]').count(),0);
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      await page.locator('.tree-genre-btn[data-country="BR"]').first().waitFor();

      // Many channels stay grouped with incremental "Mostrar mais" in the tree.
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="other"]').click();
      const before=await page.locator('.tree-channel-btn[data-country="BR"]').count();
      const more=page.locator('.tree-more-btn[data-country="BR"]').first();
      await more.click();
      const after=await page.locator('.tree-channel-btn[data-country="BR"]').count();
      assert(after>before,'Showing more must grow only the requested tree category');
      const sidebar=page.locator('.sidebar');
      await page.locator('.tree-country-btn[data-country="BR"]').focus();
      for(let i=0;i<35;i++)await page.keyboard.press('ArrowDown');
      assert((await sidebar.evaluate(el=>el.scrollTop))>0,
        'Samsung remote DOWN must scroll the country tree');

      // Center guide still works, scrolls independently, and video stays fixed.
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="other"]').click();
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="other"]').click();
      await page.locator('#channel-items .channel-btn').first().waitFor();
      const playerBefore=await page.locator('.player-column').boundingBox();
      const sidebarScroll=await sidebar.evaluate(el=>el.scrollTop);
      await page.locator('.catalog').evaluate(el=>{el.scrollTop=500;});
      await page.waitForTimeout(120);
      assert.equal(await sidebar.evaluate(el=>el.scrollTop),sidebarScroll);
      const playerAfter=await page.locator('.player-column').boundingBox();
      assert(Math.abs(playerBefore.y-playerAfter.y)<2);
      await page.locator('#search').fill('Canal Teste 10');
      await page.locator('#channel-items').getByText('Canal Teste 10',{exact:true}).first().waitFor();

      // Free sites must never be confused with a playable HLS stream.
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="movies_pt"]').waitFor();
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="movies_pt"]').click();
      await page.locator('.tree-channel-btn[data-country="BR"]').filter({hasText:'NetMovies'}).click();
      assert.equal(await page.locator('#video').getAttribute('src'),null);
      assert.equal(await page.locator('#official-open').isVisible(),true);
      assert.match(await page.locator('#play-status').textContent(),/Acesso oficial externo/);
      assert.equal(await page.locator('#official-embed').isVisible(),false,
        'Generic official websites must remain external rather than being framed');

      // The published GOAT channel ID allows an official YouTube live widget.
      // A frame loading does not prove the channel is broadcasting now.
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="sports"]').click();
      await page.locator('#search').fill('Canal GOAT — lives oficiais');
      const goat=page.locator('#channel-items .channel-btn').filter({hasText:'Canal GOAT — lives oficiais'});
      await goat.click();
      const frame=page.locator('#official-embed');
      await frame.waitFor({state:'visible'});
      assert.equal(await frame.getAttribute('src'),
        'https://www.youtube.com/embed/live_stream?channel=UC_oToDrJ6uca7d1dFVBmLtg');
      assert.match(await page.locator('#play-status').textContent(),/live não verificada/);
      assert.equal(await page.locator('#video').isVisible(),false);
      assert.equal(await page.locator('#official-open').isVisible(),true);
      assert.equal(await page.locator('#now-name').textContent(),'Canal GOAT — lives oficiais');
      // Switching back to HLS must tear down the YouTube iframe.
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="news"]').click();
      await page.locator('#search').fill('24 Horas');
      await page.locator('#channel-items .channel-btn').filter({hasText:'24 Horas'}).first().click();
      assert.equal(await frame.isVisible(),false);
      assert.equal(await frame.getAttribute('src'),null);
      assert.equal(await page.locator('.sidebar > :last-child').getAttribute('class'),'technical-footer');

      // Subscription providers must have a visible real official URL.
      // Their destination is external: inspecting the href must not start
      // a stream, navigate the test page or claim free premium access.
      assert.equal(await page.locator('#provider-items').isVisible(),false);
      await page.locator('#provider-toggle').click();
      const netflix=page.locator('#provider-items a.provider-entry').filter({hasText:'Netflix'}).first();
      await netflix.waitFor();
      assert.equal(await netflix.getAttribute('href'),'https://www.netflix.com/br/');
      assert.match(await netflix.textContent(),/Abrir site oficial/);
      assert.equal(await netflix.getAttribute('target'),null,
        'Samsung should use same-tab navigation when user chooses a provider');
      assert.match(await page.locator('.provider-note').textContent(),/assinatura/);
      assert.equal(await page.locator('#video').getAttribute('src'),
        'https://mock.example/24horas.m3u8',
        'Showing subscription links must preserve the chosen native HLS source');
      await page.locator('#technical-toggle').click();
      assert.equal(await page.locator('#technical-items .technical-source-name').count(),14);
      await context.close();
    }
    // Samsung private TV: priority recent history, persistent uncategorized favorites.
    {
      const context=await setup(true);
      const page=await samsungPage(context);
      await page.goto(origin+'/stream/tv/');
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      await page.locator('#channel-items .channel-btn').filter({hasText:'Canal Teste 26'}).waitFor();
      assert.equal(await page.locator('.sidebar > :first-child').getAttribute('class'),'quick-section');
      assert.equal(await page.locator('.sidebar > :nth-child(2)').getAttribute('class'),'quick-section');
      assert.equal(await page.locator('.sidebar > :last-child').getAttribute('class'),'technical-footer');
      try{
        await page.waitForFunction(()=>document.querySelector('#favorite-count')?.textContent==='0 (verificar)',null,{timeout:6000});
      }catch(e){
        const details=await page.evaluate(async()=>{
          const session=await fetch('/stream/session').then(x=>x.json()).catch(()=>null);
          const f=await fetch('/stream/favorites').then(async x=>({status:x.status,body:await x.text()})).catch(x=>({error:String(x)}));
          return {count:document.querySelector('#favorite-count')?.textContent,
            accountStatus:document.querySelector('#account-favorites-status')?.textContent,
            session,favoritesRequest:f,local:localStorage.getItem('drivmatch-tv-guide-favorites-v1')};
        });
        throw new Error("Account favorites initial hydration did not finish: "+JSON.stringify(details));
      }
      assert.equal(await page.locator('#recent-count').textContent(),'0/25');
      assert.equal(await page.locator('#favorite-items').isVisible(),false);
      assert.equal(await page.locator('#recent-items').isVisible(),false);
      assert.equal(await page.locator('#favorite-toggle').getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('#recent-toggle').getAttribute('aria-expanded'),'false');

      // Click one favorite and twenty-six distinct channels in sequence.
      await page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 2"]').click();
      await page.locator('#player-favorite').click();
      await page.waitForFunction(()=>document.querySelector('#favorite-count')?.textContent==='1');
      assert.match(await page.locator('#favorite-items').textContent(),/★ Canal Teste 2/);
      const testNames=await page.evaluate(()=>
        [...document.querySelectorAll('#channel-items .channel-btn strong')]
          .map(el=>el.textContent).filter(x=>x.startsWith('Canal Teste ')).slice(0,26));
      assert.equal(testNames.length,26);
      await page.evaluate(names=>{
        for(const name of names){
          const b=[...document.querySelectorAll('#channel-items .channel-btn')]
            .find(el=>el.querySelector('strong')?.textContent===name);
          if(!b)throw new Error('test channel not found: '+name);
          b.click();
        }
      },testNames);
      assert.equal(await page.locator('#recent-count').textContent(),'25/25');
      assert.equal(await page.locator('#recent-items .quick-entry-btn').count(),25);
      assert.equal(await page.locator('#recent-items').isVisible(),false,'Recent list stays folded as it fills');
      await page.locator('#recent-toggle').click();
      assert.equal(await page.locator('#recent-items').isVisible(),true);
      assert.equal(await page.locator('#recent-toggle').getAttribute('aria-expanded'),'true');
      assert((await page.locator('#recent-items .quick-entry-btn').first().textContent()).includes(testNames[25]));
      await page.locator('#recent-toggle').click();
      assert.equal(await page.locator('#recent-items').isVisible(),false);
      assert.equal(await page.locator('#recent-items').getByText(testNames[0],{exact:true}).count(),0);
      assert.equal(await page.locator('#favorite-count').textContent(),'1');
      assert.equal(await page.locator('#favorite-items .quick-entry-btn').count(),1);
      const persisted=await page.evaluate(()=>({
        recent:JSON.parse(localStorage.getItem('drivmatch-tv-recent-25-v1')),
        oldFavorites:JSON.parse(localStorage.getItem('drivmatch-tv-guide-favorites-v1'))
      }));
      assert.equal(persisted.recent.length,25);
      // Account-scoped favorites are saved to D1; never assume localStorage is the source of truth.
      assert.equal(persisted.oldFavorites,null);

      // Country-crossing favorites are flat, not grouped by country or genre.
      await page.locator('.tree-country-btn[data-country="MX"]').click();
      await page.locator('.tree-genre-btn[data-country="MX"]').first().waitFor();
      await page.locator('#channel-items .channel-btn').filter({hasText:'Canal México'}).click();
      await page.locator('#player-favorite').click();
      await page.waitForFunction(()=>document.querySelector('#favorite-count')?.textContent==='2');
      assert.match(await page.locator('#favorite-items').textContent(),/Canal México/);
      assert.match(await page.locator('#favorite-items').textContent(),/Canal Teste 2/);
      const before=await page.locator('#favorite-items .quick-entry-btn').count();
      assert.equal(await page.locator('#favorite-items').isVisible(),false,'Favorites stay folded when new stars added');

      // Tizen browser reload keeps all starred channels and recent order.
      await page.reload();
      await page.locator('.tree-country-btn[data-country="BR"]').waitFor();
      assert.equal(await page.locator('#recent-count').textContent(),'25/25');
      assert.equal(await page.locator('#recent-items').isVisible(),false);
      assert.equal(await page.locator('#favorite-items').isVisible(),false);
      assert.equal(await page.locator('#favorite-items .quick-entry-btn').count(),before);
      await page.locator('#favorite-toggle').click();
      assert.equal(await page.locator('#favorite-items').isVisible(),true);
      await page.locator('#favorite-items .quick-entry-btn').filter({hasText:'Canal México'}).click();
      await page.locator('video[src="https://mock.example/mexico.m3u8"]').waitFor();
      assert.equal(await page.locator('#now-name').textContent(),'Canal México');
      assert.equal(await page.locator('#favorite-count').textContent(),'2');

      // P0 incident freeze: clicking an existing favorite may NOT delete it.
      await page.locator('#player-favorite').click();
      await page.waitForFunction(()=>/bloqueada/.test(document.querySelector('#account-favorites-status')?.textContent||""));
      assert.equal(await page.locator('#favorite-count').textContent(),'2');
      assert.equal(await page.locator('#recent-count').textContent(),'25/25');
      await context.close();
    }
    // Only channels actually selected for native playback can be hidden after
    // 60 seconds. Never delete a playlist or silently remove favorites.
    {
      const context=await setup(true);
      const page=await samsungPage(context);
      await page.clock.install();
      await page.goto(origin+'/stream/tv/');
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      const second=page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 2"]');
      const third=page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 3"]');
      await second.waitFor();
      assert.equal(await page.locator('.tree-genre-btn[data-country="BR"][aria-expanded="true"]').count(),0);
      assert.equal(await page.locator('#restore-hidden').isVisible(),false);
      // A channel that doesn't play is still present at 59 seconds.
      await second.click();
      await page.locator('#player-favorite').click();
      await page.clock.fastForward(59000);
      assert.equal(await second.count(),1);
      assert.equal(await page.locator('#restore-hidden').isVisible(),false);
      await page.clock.fastForward(1200);
      await page.locator('#restore-hidden').waitFor();
      assert.equal(await second.count(),0);
      assert.equal(await page.locator('#restore-hidden').textContent(),'↺ Restaurar canais ocultos (1)');
      assert.match(await page.locator('#player-error').textContent(),/ocultado apenas nesta TV por 24 horas/);
      assert.equal(await page.locator('#favorite-count').textContent(),'1');
      const stored=await page.evaluate(()=>JSON.parse(
        localStorage.getItem('drivmatch-tv-hidden-failed-60s-v1')));
      assert.equal(Object.keys(stored).length,1);

      // A reload keeps the channel hidden until user explicitly restores it.
      await page.reload();
      await page.locator('#restore-hidden').waitFor();
      assert.equal(await page.locator('.tree-country-btn[data-country="BR"]').getAttribute('aria-expanded'),'false');
      await page.locator('.tree-country-btn[data-country="BR"]').click();
      await page.locator('#channel-items .channel-btn').first().waitFor();
      assert.equal(await page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 2"]').count(),0);
      assert.equal(await page.locator('#favorite-count').textContent(),'1');
      await page.locator('#restore-hidden').click();
      await page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 2"]').waitFor();
      assert.equal(await page.locator('#restore-hidden').isVisible(),false);
      assert.equal(await page.locator('#favorite-count').textContent(),'1');

      // A real 'playing' event cancels the failure countdown.
      await third.click();
      await page.evaluate(()=>document.querySelector('#video').dispatchEvent(new Event('playing')));
      await page.clock.fastForward(61000);
      assert.equal(await page.locator('#restore-hidden').isVisible(),false);
      assert.equal(await page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 3"]').count(),1);

      // Switching channels cancels any older 60s countdown.
      await second.click();
      await page.clock.fastForward(30000);
      await third.click();
      await page.clock.fastForward(31000);
      assert.equal(await page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 2"]').count(),1);
      await page.locator('#restore-hidden').count();
      await context.close();
    }
    process.stdout.write('Stream browser smoke: Cloudflare Access fail-closed, denied session, in-page selection PASS.\n');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(err=>{console.error(err);process.exit(1);});
