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
const paths = {'/stream/':'index.html','/stream/index.html':'index.html','/stream/stream.js':'stream.js','/stream/stream.css':'stream.css','/stream/stream-boot.js':'stream-boot.js','/stream/stream-tv.js':'stream-tv.js','/stream/tv/':'tv.html','/stream/tv/tv.css':'tv.css','/stream/tv/tv.js':'tv.js','/stream/listas/sources.json':'playlist-sources.json'};
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
  let authorized=false;
  const server=http.createServer((req,res)=>{
    if(req.url==="/stream/listas/sources.json"){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({sources:[{id:"lista-1",title:"Lista 1 • Free-TV"},{id:"lista-2",title:"Lista 2 • IPTV-org 12 países"},{id:"lista-3",title:"Lista 3 • Notícias"},{id:"lista-4",title:"Lista 4 • Esportes"},{id:"lista-5",title:"Lista 5 • Nexonic"},{id:"lista-6",title:"Lista 6 • Open Legal"},{id:"lista-7",title:"Lista 7 • FreeCastHub"}]}));return;
    }
    if(req.url && req.url.startsWith("/stream/catalog?list=")){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"text/plain"});
      res.end(m3uES);return;
    }
    if(req.url && req.url.startsWith("/stream/catalog?country=")){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});
      res.end(req.url.endsWith("BR")?m3uES:'#EXTM3U');
      return;
    }
    if(req.url==="/stream/session"){
      res.writeHead(authorized?200:403,{"Content-Type":"application/json","Cache-Control":"no-store"});
      res.end(JSON.stringify({allowed:authorized}));
      return;
    }
    const file=paths[req.url];
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
    // Missing Cloudflare owner session must not reveal player or playlist.
    {
      const context=await setup(false);
      const page=await context.newPage();
      await page.goto(origin+'/stream/');
      await page.getByText(/Acesso pessoal indisponível/).waitFor();
      assert.equal(await page.locator('#tv').isVisible(),false);
      await context.close();
    }
    // Denied server session must not reveal any channels.
    {
      const context=await setup(false);
      const page=await context.newPage();
      await page.goto(origin+'/stream/');
      await page.getByText(/Acesso pessoal indisponível/).waitFor();
      assert.equal(await page.locator('#tv').isVisible(),false);
      await context.close();
    }
    // Approved account: world news appears; selecting a stream stays in the page.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.goto(origin+'/stream/');
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
      await page.getByText('24 Horas (720p)').first().waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/tv/');
      assert.equal(await page.locator('#source-items .source-btn').count(),7);
      assert.equal(await page.locator('#country-items .country-btn').count(),14);
      await page.locator('#channel-items .channel-btn').first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      await context.close();
    }
    // IBO-style Samsung TV guide: seven public sources, country and category filters and fixed player.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.setViewportSize({width:1440,height:900});
      await page.goto(origin+'/stream/tv/');
      await page.locator('#source-items .source-btn').first().waitFor();
      assert.equal(await page.locator('#source-items .source-btn').count(),7);
      assert.match(await page.locator('#source-items .source-btn').nth(1).innerText(),/Lista 2/);
      assert((await page.locator('#source-items .source-btn').first().evaluate(
        el=>parseFloat(getComputedStyle(el).fontSize)))>=20,'TV source text must be large');
      await page.setViewportSize({width:960,height:720});
      assert((await page.locator('#source-items .source-btn').first().evaluate(
        el=>parseFloat(getComputedStyle(el).fontSize)))>=20,
        'Samsung 960px browser must not shrink the source text');
      await page.setViewportSize({width:1440,height:900});
      await page.locator('#find-globo').click();
      assert.equal(await page.locator('#search').inputValue(),'Globo');
      assert.equal(await page.locator('#source-items .source-btn.active').getAttribute('data-source'),'lista-2');
      assert.equal(await page.locator('#country-items .country-btn.active').getAttribute('data-country'),'BR');
      await page.locator('#find-globo').click();
      await page.getByText('TV Globo',{exact:true}).first().waitFor();
      await page.locator('#find-sportv').click();
      await page.getByText('SporTV',{exact:true}).first().waitFor();
      await page.locator('#channel-items .channel-btn').first().click();
      assert.match(await page.locator('#player-error').textContent(),/autorização/);
      assert.equal(await page.locator('#video').getAttribute('src'),null);
      assert.equal(await page.locator('#player-retry').isDisabled(),true);
      await page.locator('#find-espn').click();
      await page.getByText('ESPN Brasil',{exact:true}).first().waitFor();
      await page.locator('#search').fill('Record News');
      await page.getByText('Record News',{exact:true}).first().waitFor();
      assert.match(await page.locator('#channel-items .channel-btn small').first().innerText(),/Fonte: TV Guará/);
      await page.locator('#search').fill('TV Guará');
      await page.getByText('Record News',{exact:true}).first().waitFor();
      await page.locator('#source-items .source-btn').first().click();
      await page.locator('#search').fill('TV Guará');
      await page.getByText('TV Guará',{exact:true}).first().waitFor();
      assert.equal(await page.getByText('Record News',{exact:true}).count(),0);
      await page.locator('#source-items .source-btn').nth(2).click();
      await page.getByText('24 Horas (720p)').first().waitFor();

      // Samsung remote DOWN must traverse the same sidebar through its last country.
      const sidebar=page.locator('.sidebar');
      await page.locator('#source-items .source-btn').first().focus();
      for(let i=0;i<20;i++)await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-country')),'OTHER');
      assert((await sidebar.evaluate(el=>el.scrollTop))>0,'Sidebar must scroll to the last country');

      // Guide DOWN scrolls only the guide: do not move the sidebar or fixed video.
      await page.locator('#channel-items .channel-btn').first().focus();
      const sidebarScroll=await sidebar.evaluate(el=>el.scrollTop);
      const videoBefore=await page.locator('.player-column').boundingBox();
      for(let i=0;i<50;i++)await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('.catalog').evaluate(el=>el.contains(document.activeElement)),true);
      assert((await page.locator('.catalog').evaluate(el=>el.scrollTop))>0,'Guide must scroll with TV remote DOWN');
      assert.equal(await sidebar.evaluate(el=>el.scrollTop),sidebarScroll,
        'Navigating the guide must not scroll the source sidebar');
      const videoAfter=await page.locator('.player-column').boundingBox();
      assert(Math.abs(videoBefore.y-videoAfter.y)<2,'Player must stay fixed when guide scrolls');

      // Reaching "Mostrar mais" and pressing DOWN adds the next batch automatically.
      await page.locator('#show-more').focus();
      await page.keyboard.press('ArrowDown');
      assert((await page.locator('#channel-items .channel-btn').count())>60);
      assert.equal(await page.locator('.catalog').evaluate(el=>el.contains(document.activeElement)),true);

      await page.locator('[data-category="news"]').click();
      assert(await page.locator('#channel-items .channel-row').count()>0);
      assert.equal(await page.locator('.filter-btn.active').getAttribute('data-category'),'news');
      await page.locator('[data-category="all"]').click();
      await page.locator('#channel-items .channel-btn').first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      assert.equal(await page.locator('#player-favorite').isEnabled(),true);
      const before=await page.locator('.player-column').boundingBox();
      await page.locator('.catalog').evaluate(el=>{el.scrollTop=600;});
      await page.waitForTimeout(150);
      const after=await page.locator('.player-column').boundingBox();
      assert(Math.abs(before.y-after.y)<2,'TV video player must remain fixed while guide scrolls');
      await context.close();
    }
    process.stdout.write('Stream browser smoke: Cloudflare Access fail-closed, denied session, in-page selection PASS.\n');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(err=>{console.error(err);process.exit(1);});
