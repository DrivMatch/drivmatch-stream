/* Integration QA with the production Worker and UI, local SQLite and synthetic Supabase/media. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync} = require('node:fs');
const http = require('node:http');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {chromium, devices} = require('playwright');

const root = path.join(__dirname, '..');
const accounts = ['test@example.test', 'other@example.test'];
const testPassword = 'StreamNow-fixture-password';
const mediaOrigin = 'https://media.example.test';
const playlist = '#EXTM3U\n#EXTINF:-1 tvg-country="BR" group-title="News",Canal QA\n' +
  mediaOrigin + '/clip.m3u8\n';
const contentTypes = {
  '.html':'text/html; charset=utf-8', '.css':'text/css',
  '.js':'text/javascript', '.json':'application/json',
  '.woff2':'font/woff2', '.webp':'image/webp', '.jpg':'image/jpeg'
};

function sqliteD1(db) {
  return {
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const result = await Promise.all(statements.map(statement => statement.run()));
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      let inputs = [];
      return {
        bind(...values) { inputs = values; return this; },
        async first() { return statement.get(...inputs); },
        async all() { return {results:statement.all(...inputs)}; },
        async run() { return {meta:statement.run(...inputs)}; }
      };
    }
  };
}

async function main() {
  const {default:worker} = await import('../cloudflare/independent-access.mjs');
  const media = mkdtempSync(path.join(tmpdir(), 'streamnow-media-'));
  const output = process.env.STREAMNOW_QA_OUTPUT || path.join(media, 'screenshots');
  mkdirSync(output, {recursive:true});
  const db = new DatabaseSync(':memory:');
  const migrations = path.join(root, 'migrations');
  const originalFetch = globalThis.fetch;
  let browser;
  const server = http.createServer(async (req, res) => {
    try {
      const request = new Request('http://' + req.headers.host + req.url, {
        method:req.method, headers:req.headers,
        ...(req.method === 'POST' ? {body:req, duplex:'half'} : {})
      });
      const result = await worker.fetch(request, env);
      res.writeHead(result.status, [...result.headers.entries()]);
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(500).end();
    }
  });
  const env = {
    STREAM_USERS_DB:sqliteD1(db),
    STREAM_LOGIN_LIMITER:{limit:async () => ({success:true})},
    STREAM_ACCESS_PASSWORD:'long-internal-fixture-key',
    SUPABASE_URL:'https://auth.example.test',
    SUPABASE_PUBLIC_KEY:'fixture-public-key',
    SUPABASE_SECRET_KEY:'fixture-admin-key',
    ASSETS:{async fetch(request) {
      const name = new URL(request.url).pathname.split('/').pop();
      return new Response(readFileSync(path.join(root, 'site', name)), {
        headers:{'Content-Type':contentTypes[path.extname(name)] || 'application/octet-stream'}
      });
    }}
  };
  try {
    for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
      db.exec(readFileSync(path.join(migrations, name), 'utf8'));
    }
    for (const email of accounts) {
      db.prepare("INSERT INTO stream_users(user_id,email,status) VALUES(?,?,'active')").run(email, email);
    }
    globalThis.fetch = async (request, options) => {
      const url = new URL(typeof request === 'string' ? request : request.url ?? request);
      if (url.hostname === 'auth.example.test') {
        const {email, password} = JSON.parse(options.body);
        return accounts.includes(email) && password === testPassword
          ? Response.json({user:{id:email,email}}) : Response.json({}, {status:400});
      }
      return new Response(url.pathname.endsWith('.m3u') || url.pathname.endsWith('.m3u8')
        ? playlist : '#EXTM3U\n');
    };
    execFileSync('ffmpeg', [
      '-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24',
      '-t','6','-an','-vf','hue=s=0','-pix_fmt','yuv420p','-c:v','libx264','-g','24','-f','hls',
      '-hls_time','1','-hls_playlist_type','vod',path.join(media, 'clip.m3u8')
    ]);
    const hls = require.resolve('hls.js/dist/hls.min.js');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({
      headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    });
    async function open(email, mobile) {
      const context = await browser.newContext(mobile ? devices['Pixel 7'] : {
        viewport:{width:1440,height:900}
      });
      await context.route('https://cdn.jsdelivr.net/npm/hls.js@*/dist/hls.min.js',
        route => route.fulfill({path:hls, contentType:'text/javascript'}));
      await context.route(mediaOrigin + '/**', route => {
        const name = new URL(route.request().url()).pathname.slice(1);
        return route.fulfill({path:path.join(media, name),
          contentType:name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
          headers:{'Access-Control-Allow-Origin':origin}});
      });
      const page = await context.newPage();
      await page.goto(origin + '/stream/');
      await page.getByRole('heading', {name:'Acesso individual'}).waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.getByRole('img', {name:'Stream Now'}).evaluate(img => img.naturalWidth > 0), true);
      if (mobile && email === accounts[0]) {
        await page.screenshot({path:path.join(output, 'login-mobile.png')});
      }
      await page.getByLabel('E-mail').fill(email);
      await page.getByLabel('Senha').fill(testPassword);
      const signIn = page.waitForResponse(response =>
        response.url().endsWith('/stream/login') && response.request().method() === 'POST');
      await page.getByRole('button', {name:'Entrar'}).click();
      const result = await signIn;
      assert.equal(result.status(), 303, 'Sign-in returned ' + result.status() + ' at ' + page.url() +
        (result.status() === 303 ? '' : ' — ' + await page.locator('body').innerText()));
      await page.waitForURL('**/stream/tv/');
      await page.locator('#account-identity').filter({hasText:email}).waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('#admin-link').isVisible(), false);
      assert.equal(await page.locator('.streamnow-wordmark').evaluate(img => img.naturalWidth > 0), true);
      return page;
    }
    async function findChannel(page, mobile) {
      if (mobile) await page.getByRole('button', {name:'Guia e busca'}).click();
      await page.locator('#search').fill('Canal QA');
      const channel = page.getByRole('button', {name:/^Canal QA · Brasil/}).first();
      await channel.click();
      await page.locator('#now-name').filter({hasText:'Canal QA'}).waitFor();
    }
    const desktop = await open(accounts[0], false);
    const mobile = await open(accounts[0], true);
    const other = await open(accounts[1], true);
    await findChannel(desktop, false);
    await desktop.locator('#player-favorite').click();
    await desktop.getByRole('button', {name:'★ Favoritado'}).waitFor();
    await findChannel(mobile, true);
    await mobile.evaluate(() => window.dispatchEvent(new Event('focus')));
    await mobile.getByRole('button', {name:'★ Favoritado'}).waitFor();
    await findChannel(other, true);
    assert.equal(await other.locator('#favorite-count').textContent(), '0');
    for (const [page, viewport] of [[desktop,'desktop'],[mobile,'mobile']]) {
      const info = await page.waitForFunction(() => {
        const player = document.getElementById('video');
        return player.currentTime > 0.15 && player.videoWidth > 0 && {
          time:player.currentTime,width:player.videoWidth
        };
      });
      assert.equal((await info.jsonValue()).width, 320);
      await page.screenshot({path:path.join(output, 'reproducao-' + viewport + '.png')});
    }
    await mobile.getByRole('button', {name:'★ Favoritado'}).click();
    await mobile.getByRole('button', {name:'☆ Favoritar'}).waitFor();
    await desktop.evaluate(() => window.dispatchEvent(new Event('focus')));
    await desktop.getByRole('button', {name:'☆ Favoritar'}).waitFor();
    await mobile.getByRole('button', {name:'Sair'}).click();
    await mobile.getByRole('heading', {name:'Acesso individual'}).waitFor();
    assert.equal((await mobile.request.get(origin + '/stream/favorites')).status(), 401);
    console.log('Login, isolamento, favoritos sincronizados e decodificação HLS em desktop e Android emulado.');
  } finally {
    await browser?.close();
    server.close();
    globalThis.fetch = originalFetch;
    db.close();
    rmSync(media, {recursive:true, force:true});
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
