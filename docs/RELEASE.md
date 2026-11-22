# DrivMatch Stream — independent architecture / release

**OWNER DECISION:** same visual and hosting model as DrivMatch News, but **completely independent project**. GitHub repo: `DrivMatch/drivmatch-stream`. GitHub Pages origin: `https://drivmatch.github.io/drivmatch-stream/`. Final destination: `https://drivmatch.com/stream/`.

Do not change `drivmatch.com/news` (DrivMatch News), `drivmatch.com/TV` (original broadcast TV) or either repository/Worker. DrivMatch Stream has an independent Github Actions deployment to Pages and a dedicated Cloudflare Worker named `drivmatch-stream-proxy`. The shared pattern is **GitHub Pages + Cloudflare**, with separated identity/code/runtime.

## Visual design

Same design vocabulary seen in News: dark institutional header, bright blue #167ade filter pills, navy buttons, white panels over light background. Layout responsive for desktop/phone/Smart TV browser.

## Authentication — **Cloudflare Access only**, not Supabase

- On Cloudflare: **Workers & Pages → drivmatch-stream-proxy → Access**, enable protection for the **individual Worker**, restricted to the owner's *exact email address*, not a whole email domain.
- In **Settings → Variables and Secrets** for that Worker, add a **Text** variable `STREAM_OWNER_EMAIL` with the same verified owner email used in Cloudflare Access.
- Confirm Cloudflare has activated the protection for the Worker; the Worker runtime receives verified `ctx.access` only when Access authenticates the request. The Worker requires both verified identity and an exact email match **for every request**; otherwise returns 403.
- Worker source: `cloudflare/stream-proxy.mjs`. Replace deployed Hello World/previous unprotected Worker code with it. The Worker serves only `/stream/`, CSS, JS, and `/stream/session`, from independent GitHub Pages; rejects /news, /TV and every other path.
- GitHub Pages `https://drivmatch.github.io/drivmatch-stream/` is **public static code**, not a private site. Its UI checks `./session` before loading any playlist. This endpoint exists only on the authorized Cloudflare Worker, not on GitHub Pages. Consequently the direct public origin remains inaccessible as a working viewer. Do not publish secrets or private playlists to GitHub Pages.
- Once Access is verified and Worker deployed, connect Worker through **Workers route** `drivmatch.com/stream*`, NOT a Custom Domain at the zone apex. That route must not intercept /news or /TV. Test anonymous denied and owner allowed.

## Operational release status

- Unit and Playwright browser tests are **mocked**, not evidence of real channels playing.
- IPTV-org catalogs are community pointers, not verified broadcast licenses. No bypass of DRM/geo-blocks; some streams do not allow CORS or player embedding.
- Domain route and Access configuration remain **outside this repo** and cannot be claimed complete until dashboard configuration and real browser QA pass.
- Before release claim, test `/stream` with owner's Access session, denied for someone else, `/news` unaffected, `/TV` unaffected and stream playback of an authorized HLS channel within the webpage.

**No Supabase database, SDK, Edge Function, client config or secret is required for Stream.**
