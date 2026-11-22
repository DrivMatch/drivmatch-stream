/**
 * STAGED ONLY — NOT DEPLOYED.
 * Dedicated route for drivmatch.com/stream* to the SAME GitHub Pages origin as Stream:
 * https://drivmatch.github.io/drivmatch-stream/
 *
 * Cloudflare setup (owner action):
 * 1. Deploy this as its own Worker, NOT a replacement for drivmatch-stream-proxy.
 * 2. Attach route drivmatch.com/stream* to this Worker.
 * 3. Add Cloudflare Access owner-only policy to /TV* as defense in depth.
 * 4. Enable Supabase private-tv-access function/owner check separately.
 *
 * GitHub Pages remains a public HTML origin. The app MUST fail closed without
 * the server-side owner allowlist; Cloudflare Access alone cannot protect the
 * GitHub Pages URL from direct access.
 */
const SOURCE = "https://drivmatch.github.io/drivmatch-stream/";
const PATHS = Object.freeze({
  "/stream": "index.html",
  "/stream/": "index.html",
  "/stream/index.html": "index.html",
  "/stream/app.js": "app.js",
  "/stream/tv.css": "tv.css",
  "/stream/config.js": "config.js",
});
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {status:405,headers:{"Allow":"GET, HEAD"}});
    }
    const file = PATHS[url.pathname];
    if (!file || url.hostname !== "drivmatch.com") {
      return new Response("Not Found", {status:404});
    }
    const upstream = await fetch(SOURCE + file, {method:request.method,redirect:"manual"});
    if (!upstream.ok) return new Response("TV indisponível", {status:upstream.status===404?404:502});
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Type": upstream.headers.get("Content-Type")
        || (file.endsWith(".js") ? "text/javascript; charset=utf-8"
          : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8"),
    });
    return new Response(request.method==="HEAD"?null:upstream.body, {status:200,headers});
  }
};
