import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const port = Number(process.argv[2]);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const endpoint = 'http://127.0.0.1:' + port;
const origin = 'https://streamnow-2o1.pages.dev';

async function evaluate(socketUrl, expression) {
  const socket = new WebSocket(socketUrl);
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebView inspection timed out.')), 4000);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression, returnByValue:true}}));
      }, {once:true});
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error || message.result?.exceptionDetails) {
          reject(new Error('WebView evaluation failed.'));
        } else {
          resolve(message.result.result.value);
        }
      });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('WebView inspection connection failed.'));
      }, {once:true});
    });
  } finally {
    socket.close();
  }
}

async function read(expression) {
  const response = await fetch(endpoint + '/json/list', {signal:AbortSignal.timeout(2000)});
  const targets = await response.json();
  const webView = targets.find(target => target.type === 'page' && target.url.startsWith(origin + '/'));
  if (!webView?.webSocketDebuggerUrl) throw new Error('Stream Now WebView target is still unavailable.');
  return evaluate(webView.webSocketDebuggerUrl, expression);
}

async function waitFor(expression, name) {
  let result;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      result = await read(expression);
      if (result === true) return;
    } catch (error) {
      result = error.message;
    }
    await delay(2000);
  }
  throw new Error(name + ' was not confirmed. Last result: ' + JSON.stringify(result));
}

const login = `(() => ({
  heading: document.querySelector('h1')?.textContent,
  email: Boolean(document.querySelector('input[type=email]')),
  password: Boolean(document.querySelector('input[type=password]')),
  logo: (document.querySelector('img[alt="Stream Now"]')?.naturalWidth ?? 0) > 0
}))()`;
await waitFor(`(() => {
  const page = ${login};
  return location.origin === '${origin}' && page.heading === 'Entrar' &&
    page.email && page.password && page.logo || page;
})()`, 'Official Stream Now login');
console.log('APK v0.3.2 renders the official branded HTTPS login in Android WebView.');
