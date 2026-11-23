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
const paths = {'/stream/':'index.html','/stream/index.html':'index.html','/stream/stream.js':'stream.js','/stream/stream.css':'stream.css','/stream/stream-boot.js':'stream-boot.js','/stream/stream-tv.js':'stream-tv.js','/stream/tv/':'tv.html','/stream/tv/tv.css':'tv.css','/stream/tv/tv.js':'tv.js','/stream/listas/sources.json':'playlist-sources.json','/stream/listas/brasil-servicos.json':'brasil-servicos.json','/stream/official-access.json':'official-access.json'};
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
      res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({sources:[{id:"lista-1",title:"Lista 1 • Free-TV"},{id:"lista-2",title:"Lista 2 • Canais por país (Listas 1–8)"},{id:"lista-3",title:"Lista 3 • Notícias"},{id:"lista-4",title:"Lista 4 • Esportes"},{id:"lista-5",title:"Lista 5 • Nexonic"},{id:"lista-6",title:"Lista 6 • Open Legal"},{id:"lista-7",title:"Lista 7 • FreeCastHub"},{id:"lista-8",title:"Lista 8 • Brasil: canais abertos"},{id:"lista-9",title:"Lista 9 • Brasil: canais públicos recentes"},
        {id:"lista-10",title:"Lista 10 • Filmes livres internacionais"},
        {id:"lista-11",title:"Lista 11 • Notícias livres internacionais"},
        {id:"lista-12",title:"Lista 12 • Autopiloto diário"}]}));return;
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
    if(req.url && req.url.startsWith("/stream/catalog?country=")){
      if(!authorized){res.writeHead(403);res.end();return;}
      res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});
      res.end(req.url.endsWith("BR")?m3uES:'#EXTM3U');
      return;
    }
    if(req.url==="/stream/session"||
       (req.url&&req.url.startsWith("/stream/session?connectivity="))){
      res.writeHead(authorized?200:403,{"Content-Type":"application/json","Cache-Control":"no-store"});
      res.end(JSON.stringify({allowed:authorized}));
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
      await page.goto(origin+'/stream/');
      await page.locator('.tree-country-btn[data-country="BR"]').waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/tv/');
      const left=await page.locator('.sidebar').boundingBox();
      const middle=await page.locator('.catalog').boundingBox();
      const right=await page.locator('.player-column').boundingBox();
      assert(left&&middle&&right,'All three columns must be visible on desktop');
      assert(left.width>250&&middle.width>250&&right.width>250,
        'Desktop columns must be comfortably sized');
      assert(left.x+left.width<=middle.x&&middle.x+middle.width<=right.x,
        'Columns must follow Samsung order: countries, channels, player');
      await page.locator('#channel-items .channel-btn').first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      await context.close();
    }
    // Mobile phones retain the original responsive player and channel list.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator,'userAgent',{get:() =>
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
      });
      await page.goto(origin+'/stream/');
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
      await page.getByText('24 Horas (720p)').first().waitFor();
      assert.equal(new URL(page.url()).pathname,'/stream/tv/');
      assert.equal(await page.locator('#source-items .source-btn').first().isVisible(),false);
      await page.locator('.tree-country-btn[data-country="MX"]').waitFor();
      assert.equal(await page.locator('#country-items .country-btn').count(),14);
      await page.locator('#channel-items .channel-btn').first().click();
      await page.locator('video[src="https://mock.example/24horas.m3u8"]').waitFor();
      assert.equal(await page.locator('#now-name').textContent(),'24 Horas (720p)');
      await context.close();
    }
    // Samsung: country > category > channel tree, with hidden source lists.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.setViewportSize({width:1440,height:900});
      await page.goto(origin+'/stream/tv/');
      await page.locator('.tree-country-btn[data-country="BR"]').waitFor();

      // Compact header without tagline, source label, or the "Privado" text.
      const top=page.locator('.topbar');
      assert((await top.boundingBox()).height<=43,'Header must be truly compact');
      assert((await page.locator('.topbar .logo').boundingBox()).width<=29);
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
      await page.locator('#channel-items').getByText('Canal Teste 10',{exact:true}).waitFor();

      // Free sites must never be confused with a playable HLS stream.
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="movies_pt"]').waitFor();
      await page.locator('.tree-genre-btn[data-country="BR"][data-genre="movies_pt"]').click();
      await page.locator('.tree-channel-btn[data-country="BR"]').filter({hasText:'NetMovies'}).click();
      assert.equal(await page.locator('#video').getAttribute('src'),null);
      assert.equal(await page.locator('#official-open').isVisible(),true);
      assert.match(await page.locator('#play-status').textContent(),/Acesso oficial externo/);
      assert.equal(await page.locator('.sidebar > :last-child').getAttribute('class'),'technical-footer');

      // Subscription brands are only visible in the collapsed footer.
      assert.equal(await page.locator('#provider-items').isVisible(),false);
      await page.locator('#provider-toggle').click();
      await page.locator('.provider-entry').filter({hasText:'Netflix'}).first().click();
      assert.match(await page.locator('#play-status').textContent(),/Acesso oficial necessário/);
      assert.equal(await page.locator('#video').getAttribute('src'),null);
      assert.equal(await page.locator('#official-open').isVisible(),true);
      await page.locator('#technical-toggle').click();
      assert.equal(await page.locator('#technical-items .technical-source-name').count(),12);
      await context.close();
    }
    // Samsung private TV: priority recent history, persistent uncategorized favorites.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.goto(origin+'/stream/tv/');
      await page.locator('#channel-items .channel-btn').filter({hasText:'Canal Teste 26'}).waitFor();
      assert.equal(await page.locator('.sidebar > :first-child').getAttribute('class'),'quick-section');
      assert.equal(await page.locator('.sidebar > :nth-child(2)').getAttribute('class'),'quick-section');
      assert.equal(await page.locator('.sidebar > :last-child').getAttribute('class'),'technical-footer');
      assert.equal(await page.locator('#favorite-count').textContent(),'0');
      assert.equal(await page.locator('#recent-count').textContent(),'0/25');
      assert.equal(await page.locator('#favorite-items').isVisible(),false);
      assert.equal(await page.locator('#recent-items').isVisible(),false);
      assert.equal(await page.locator('#favorite-toggle').getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('#recent-toggle').getAttribute('aria-expanded'),'false');

      // Click one favorite and twenty-six distinct channels in sequence.
      await page.locator('#channel-items .channel-btn[data-channel-id="lista-2:BR|canal teste 2"]').click();
      await page.locator('#player-favorite').click();
      assert.equal(await page.locator('#favorite-count').textContent(),'1');
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
      assert(persisted.oldFavorites.some(x=>x.endsWith(':canal teste 2')));

      // Country-crossing favorites are flat, not grouped by country or genre.
      await page.locator('.tree-country-btn[data-country="MX"]').click();
      await page.locator('.tree-genre-btn[data-country="MX"]').first().waitFor();
      await page.locator('#channel-items .channel-btn').filter({hasText:'Canal México'}).click();
      await page.locator('#player-favorite').click();
      assert.equal(await page.locator('#favorite-count').textContent(),'2');
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

      // Removing a favorite does not clear the twenty-five-channel history.
      await page.locator('#player-favorite').click();
      assert.equal(await page.locator('#favorite-count').textContent(),'1');
      assert.equal(await page.locator('#recent-count').textContent(),'25/25');
      await context.close();
    }
    // Only channels actually selected for native playback can be hidden after
    // 60 seconds. Never delete a playlist or silently remove favorites.
    {
      const context=await setup(true);
      const page=await context.newPage();
      await page.clock.install();
      await page.goto(origin+'/stream/tv/');
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
