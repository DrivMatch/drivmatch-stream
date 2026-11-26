import legacy from "./stream-proxy.mjs";
import {filterVerifiedFailedStreams} from "./catalog-health.mjs";

const officialHost = "streamnow-2o1.pages.dev";
const previewHost = "contas-compartilhadas.streamnow-2o1.pages.dev";
const pagesAssets = new Set(["/stream/brand.webp", "/stream/icon.webp", "/daily-autopilot.m3u8"]);
const privateNoStore = {"Cache-Control":"private, no-store"};
const tvAssets = {
  "/stream/tv/": ["tv.html","text/html; charset=utf-8"],
  "/stream/tv/index.html": ["tv.html","text/html; charset=utf-8"],
  "/stream/tv/tv.js": ["tv.js","text/javascript; charset=utf-8"],
  "/stream/tv/tv.css": ["tv.css","text/css; charset=utf-8"],
  "/stream/favorites-safety.js": ["favorites-safety.js","text/javascript; charset=utf-8"],
  "/stream/graphite.css": ["streamnow-graphite.css","text/css; charset=utf-8"],
  "/stream/streamnow-i18n.js": ["streamnow-i18n.js","text/javascript; charset=utf-8"]
};
const tvCsp = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https:; media-src 'self' https: blob:; worker-src blob:; img-src 'self' https: data:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
async function currentTvAsset(request,env,url,file) {
  const sessionURL=new URL("/stream/session",url.origin);
  const session=await env.STREAM_ACCOUNTS.fetch(new Request(sessionURL,{headers:request.headers,method:"GET"}));
  if(!session.ok) return env.STREAM_ACCOUNTS.fetch(request);
  let identity;
  try{identity=await session.json();}catch{return new Response("Sessão inválida",{status:503,headers:privateNoStore});}
  if(identity?.allowed!==true||!identity.user_id)return new Response("Autenticação necessária.",{status:401,headers:privateNoStore});
  if(!env.ASSETS?.fetch)return new Response("Arquivos indisponíveis.",{status:503,headers:privateNoStore});
  const asset=await env.ASSETS.fetch(new Request(new URL("/"+file[0],url.origin),{method:request.method}));
  if(!asset.ok)return new Response("Arquivo indisponível.",{status:502,headers:privateNoStore});
  return new Response(request.method==="HEAD"?null:asset.body,{status:200,headers:{...privateNoStore,"Content-Type":file[1],"Content-Security-Policy":tvCsp,"X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin","X-Frame-Options":"DENY","X-StreamNow-UI":"pages-p0-direct-favorites-v3"}});
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== officialHost && url.hostname !== previewHost) return legacy.fetch(request,env);

    if (url.pathname === "/" && ["GET","HEAD"].includes(request.method)) {
      return new Response(null,{status:303,headers:{...privateNoStore,Location:"/stream/"}});
    }
    if (pagesAssets.has(url.pathname)) {
      // The current Pages assets are bound to this deployment, including the
      // published brand derivatives and its verified catalog export.
      if (url.hostname === previewHost) {
        const asset = new URL(request.url);
        asset.hostname = officialHost;
        return legacy.fetch(new Request(asset,request),env);
      }
      return legacy.fetch(request,env);
    }
    if (url.pathname !== "/stream" && !url.pathname.startsWith("/stream/")) {
      return new Response("Not Found",{status:404,headers:privateNoStore});
    }
    if (!env.STREAM_ACCOUNTS?.fetch) {
      return new Response("Acesso temporariamente indisponível.",{status:503,headers:privateNoStore});
    }

    // Use the current Pages UI bundle, but authorize through the existing account authority.
    if (["GET","HEAD"].includes(request.method) && Object.hasOwn(tvAssets,url.pathname)) {
      return currentTvAsset(request,env,url,tvAssets[url.pathname]);
    }

    // Preserve the Pages origin, method and cookies. The existing Worker is the
    // sole authority for account sessions, favorites and subscription routes.
    const response=await env.STREAM_ACCOUNTS.fetch(request);
    // Apply the *Pages asset* full-audit health result to every authenticated catalog
    // response, including global search and country aggregation. Never mutate user data.
    if (response.ok && ["GET","HEAD"].includes(request.method) &&
        (url.pathname==="/stream/catalog"||url.pathname==="/stream/search")) {
      try {
        if (!env.ASSETS?.fetch) return response;
        const healthRes=await env.ASSETS.fetch(new Request(new URL("/channel-health.json",url.origin)));
        if (!healthRes.ok) return response;
        const health=await healthRes.json();
        if(health?.status!=="COMPLETE_HLS"||health.schema!==1)return response;
        const original=await response.text();
        const filtered=filterVerifiedFailedStreams(original,health);
        const headers=new Headers(response.headers);
        headers.set("Cache-Control","private, no-store");
        return new Response(request.method==="HEAD"?null:filtered,{status:response.status,headers});
      }catch{return response;}
    }
    return response;
  }
};
