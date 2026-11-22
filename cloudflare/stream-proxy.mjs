/**
 * DrivMatch Stream — owner-only Cloudflare Access Worker.
 *
 * Deploy this code ONLY to the independent drivmatch-stream-proxy Worker.
 * Configure Worker-level Cloudflare Access (owner's email only), and set
 * STREAM_OWNER_EMAIL as a Worker environment variable (not in GitHub Pages).
 *
 * Every request fails CLOSED unless Cloudflare Access authenticated it.
 * Never route /news or /TV through this Worker.
 *
 * GitHub Pages is a public code origin, NOT an access control system.
 * This Worker alone is the authenticated application gateway.
 */
const ORIGIN = "https://drivmatch.github.io/drivmatch-stream/";
const FILES = Object.freeze({
  "/stream/": "index.html",
  "/stream/index.html": "index.html",
  "/stream/stream.css": "stream.css",
  "/stream/stream.js": "stream.js",
});

const deny = () => new Response("Acesso pessoal não autorizado", {
  status: 403,
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

const securityHeaders = Object.freeze({
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; " +
    "connect-src 'self' https:; media-src 'self' https: blob:; worker-src blob:; " +
    "img-src 'self' https: data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "drivmatch.com" &&
        hostname !== "drivmatch-stream-proxy.drivmatch.workers.dev") {
      return new Response("Not Found", { status:404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status:405, headers:{"Allow":"GET, HEAD"},
      });
    }
    const target = url.pathname === "/" && hostname.endsWith(".workers.dev")
      ? "/stream/" : url.pathname;
    if (target !== "/stream" && target !== "/stream/session" && !FILES[target]) {
      return new Response("Not Found", { status:404 });
    }

    // ctx.access comes from verified Cloudflare Access authentication, not
    // a client-controlled request header. If Access isn't enabled, it is undefined.
    const email = typeof env?.STREAM_OWNER_EMAIL === "string"
      ? env.STREAM_OWNER_EMAIL.trim().toLowerCase() : "";
    if (!email || !email.includes("@") || !ctx?.access?.getIdentity) return deny();
    let identity;
    try {
      identity = await ctx.access.getIdentity();
    } catch {
      return deny();
    }
    if (typeof identity?.email !== "string" ||
        identity.email.trim().toLowerCase() !== email) return deny();

    if (target === "/stream") {
      return Response.redirect(new URL("/stream/", url.origin), 308);
    }
    if (target === "/stream/session") {
      return new Response(JSON.stringify({allowed:true}), {
        status:200, headers:{
          "Content-Type":"application/json; charset=utf-8",
          ...securityHeaders,
        },
      });
    }

    const file = FILES[target];
    try {
      const originResponse = await fetch(ORIGIN + file, {
        method:request.method,
        redirect:"manual",
      });
      if (!originResponse.ok) {
        return new Response("Stream temporariamente indisponível", {
          status:originResponse.status === 404 ? 404 : 502,
          headers:securityHeaders,
        });
      }
      const contentType = file.endsWith(".js") ? "text/javascript; charset=utf-8"
        : file.endsWith(".css") ? "text/css; charset=utf-8"
        : "text/html; charset=utf-8";
      return new Response(request.method === "HEAD" ? null : originResponse.body, {
        status:200, headers:{"Content-Type":contentType, ...securityHeaders},
      });
    } catch {
      return new Response("Stream temporariamente indisponível", {
        status:502, headers:securityHeaders,
      });
    }
  },
};
