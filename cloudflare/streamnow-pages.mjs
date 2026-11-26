import legacy from "./stream-proxy.mjs";
import {filterVerifiedFailedStreams} from "./catalog-health.mjs";

const officialHost = "streamnow-2o1.pages.dev";
const previewHost = "contas-compartilhadas.streamnow-2o1.pages.dev";
const pagesAssets = new Set(["/stream/brand.webp", "/stream/icon.webp", "/daily-autopilot.m3u8"]);
const privateNoStore = {"Cache-Control":"private, no-store"};

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
