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
const paths = {'/stream/':'index.html','/stream/index.html':'index.html','/stream/stream.js':'stream.js','/stream/stream.css':'stream.css'};
const m3uES = ['#EXTM3U','#EXTINF:-1 group-title="News",24 Horas (720p)',
  'https://mock.example/24horas.m3u8',
  ...Array.from({length:45},(_,i)=>['#EXTINF:-1 group-title="General",Canal Teste '+(i+1),
   'https://mock.example/test'+(i+1)+'.m3u8']).flat()].join('\n');
const m3uGlobal = ['#EXTM3U','#EXTINF:-1 tvg-id="NHKWorldJapan.jp@HD" group-title="Culture;News",NHK World-Japan',
  'https://mock.example/nhk.m3u8'].join('\n');

async function main(){
  let authorized=false;
  const server=http.createServer((req,res)=>{
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
    process.stdout.write('Stream browser smoke: Cloudflare Access fail-closed, denied session, in-page selection PASS.\n');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(err=>{console.error(err);process.exit(1);});
