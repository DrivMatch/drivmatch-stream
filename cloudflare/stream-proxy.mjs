/**
 * DrivMatch Stream private viewer — standalone Cloudflare Worker candidate.
 * ONLY drivmatch.com/stream and its known assets.
 * Never route /news, /TV or any other DrivMatch product through this Worker.
 * Deploy only after enabling GitHub Pages and Cloudflare Access owner-only.
 */
const ORIGIN = "https://drivmatch.github.io/drivmatch-stream/";
const FILES = Object.freeze({
  "/stream/": "index.html",
  "/stream/index.html": "index.html",
  "/stream/stream.css": "stream.css",
  "/stream/stream.js": "stream.js",
  "/stream/config.js": "config.js",
});
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== "drivmatch.com") {
      return new Response("Not Found", {status:404});
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {status:405,headers:{"Allow":"GET, HEAD"}});
    }
    if (url.pathname === "/stream") {
      return Response.redirect("https://drivmatch.com/stream/", 308);
    }
    const file = FILES[url.pathname];
    if (!file) return new Response("Not Found", {status:404});
    try {
      const upstream = await fetch(ORIGIN + file, {method:request.method,redirect:"manual"});
      if (!upstream.ok) {
        return new Response("Stream indisponível", {status:upstream.status===404?404:502});
      }
      const kind = file.endsWith(".js") ? "text/javascript; charset=utf-8"
        : file.endsWith(".css") ? "text/css; charset=utf-8"
        : "text/html; charset=utf-8";
      const headers = new Headers({
        "Content-Type":kind,
        "Cache-Control":"no-store",
        "X-Content-Type-Options":"nosniff",
        "X-Frame-Options":"DENY",
        "Referrer-Policy":"no-referrer",
        "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
      });
      return new Response(request.method==="HEAD"?null:upstream.body, {status:200,headers});
    } catch {
      return new Response("Stream temporariamente indisponível", {status:502});
    }
  },
};
