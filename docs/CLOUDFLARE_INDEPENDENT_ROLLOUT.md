# DrivMatch Stream — implantação independente para teste residencial

**Status:** implementation branch, **NOT DEPLOYED**, **NOT CERTIFIED**.
**Scope:** two invited users, separate homes, Android test APK, user-private favorites.

## Boundaries

- Reuse the founder-authorized existing Cloudflare account, but create **exclusive Stream Worker and Stream D1 database**. Do not share routes, databases, sessions or secrets with DrivMatch main or News. Lovable is not used.
- Dedicated Supabase **project** only for identity and transactional email. Do not use the DrivMatch main project's database/auth.
- Existing GitHub repository `DrivMatch/drivmatch-stream` is reused. No duplicate repository. No production change until review.
- Catalog remains static via GitHub Pages; the new Cloudflare Worker controls the independent HTTPS entry point.
- The media is **not retransmitted** through our infrastructure. Availability, rights and concurrent access depend on the sources.
- No feature logs what an individual watches. Viewing history is not stored on the server.

## One-time owner setup (requires access to accounts; do NOT paste secrets into chat)

1. In the **existing founder-authorized Cloudflare account**, enable or verify the workers.dev subdomain. Do not modify existing Workers or DNS routes.
2. Create the D1 database `drivmatch-stream-users`; copy its actual UUID into a new local `wrangler.independent.toml` copied from `wrangler.independent.toml.example`. Never commit this private deployment file.
3. Apply `migrations/0001_stream_identities.sql` using Wrangler D1 migrations against the **correct new database**. Review the target before applying.
4. In **your own Supabase account**, create a *dedicated* project for Stream. Configure Auth email/password, *disable open public signup*, and configure the invitation/recovery email delivery. Use a verified SMTP provider for a reliable professional deployment; default delivery may have quotas.
5. Configure Supabase Auth **Site URL** to the independent Cloudflare address; add `https://<your-worker-host>/stream/activate` to its allowed redirect URLs. Note that provider invite/recovery behavior must be verified in a real inbox; test emails are not evidence of delivery.
6. Set Cloudflare Worker secrets (never in GitHub source):
   - `SUPABASE_URL` (dedicated project URL)
   - `SUPABASE_PUBLIC_KEY` (public/publishable project key)
   - `SUPABASE_SECRET_KEY` (private administrative key; NEVER put in browser/APK)
   - `STREAM_ACCESS_PASSWORD` (random 32+ character internal legacy adapter key, **not** the old shared PIN)
7. Configure rate limiting binding `STREAM_LOGIN_LIMITER`. Deploy `cloudflare/independent-access.mjs` with Wrangler using the real local configuration.
8. Create the founder's Auth user **in the dedicated Supabase Auth dashboard** using a unique password chosen by the founder. Find its real Auth UID and insert the admin row into the dedicated D1 database:

   ```sql
   INSERT INTO stream_users(user_id,email,role,status)
   VALUES('<REAL_SUPABASE_AUTH_USER_UUID>','<FOUNDER_EMAIL>','admin','active');
   ```

   Do not use example IDs or email addresses; confirm the UID and account identity match.
9. Log in at `https://<your-worker-host>/stream/login` and open `/stream/admin`. Invite the brother using **only his email**. He receives a one-time activation link, sets his own password, then signs in.
10. Use `/stream/admin` to suspend/reactivate; the panel cannot display passwords, favorites or history.

## Preserving existing favorites (critical)

- The classic mobile and Samsung/desktop apps currently save favorites in browser `localStorage`. This is not user-private storage.
- For the **admin** only, updated clients can import old favorites **additively** into D1 **only when the old and new app share the exact same browser origin**. The old localStorage key is **never deleted** during migration.
- **Critical: the independent Cloudflare workers.dev hostname is a different origin from drivmatch.com. The new app CANNOT read localStorage on drivmatch.com.** The current favorites must be exported from the old origin and imported via a separate, user-authorized migration process, or the old origin must be temporarily maintained during a verified cutover. Until this procedure is implemented and tested on the founder's Samsung, classify favorite migration as BLOCKED, never PASS.
- For a **viewer** account, no old global localStorage favorites are imported or shown. Each account's D1 favorites are separate.
- A failed import leaves the original browser records intact and must be reported, never claimed as successful.
- Samsung/desktop saves favorites in D1 in multiuser mode and keeps recent channel history in memory only (no server viewing history). On legacy entry it retains the prior behavior.
- Verify the founder's actual Samsung browser and original web origin. Running updated code on a DIFFERENT hostname will NOT migrate existing browser favorites. Do not delete or switch off the original domain until the founder has explicitly verified a complete backup and migration.
- Before switching production, export or screenshot the original favorites, confirm import counts, and verify recovery from backup.
- Do not clear browser storage, force a reset, or delete the legacy Worker during migration.

## Daily updates

In this implementation branch the known catalog autopilot GitHub Action runs at `05:00 UTC = 02:00 America/Sao_Paulo`. GitHub Actions may start late.
The action updates only shared channel catalog artifacts; the D1 favorites table is separate. It does **not** update the installed APK binary.
Do not assume all sources remain available or allow simultaneous playback.

## Android test

The Android native wrapper is in `android/`. GitHub Actions `Android debug APK` compiles a **debug-signed** installable APK (not Play Store). The APK setup screen takes the independent Cloudflare workers.dev URL for the first run; user passwords are typed only on the Cloudflare login page and are not known by the admin.

Until the dedicated Cloudflare Worker exists, the APK cannot be end-to-end tested, even if it compiles successfully.

## Acceptance gates (must PASS with evidence)

- Stream-only Worker deployed in the authorized existing Cloudflare account, HTTPS and separate D1 migrations applied.
- Invitation received by brother, password set without founder ever seeing it, login and recovery tested.
- Founder account's existing favorites backed up and migrated, unchanged after next 02:00 catalog update.
- Brother favorites not visible to founder and vice versa (API authorization tests).
- Separate account sessions and suspension/revocation tested.
- APK installs on the brother's actual phone and opens from his cellular or home Internet.
- Founder views channel A and brother independently views channel B; verify whether **each source** allows simultaneous connections.
- Brother password never shown in logs, admin UI or stored in Android; admin secrets absent from GitHub.
- Cloudflare admin ownership, key isolation and rollback procedures verified.

## Known blockers before production

**Cloudflare authentication BLOCKED (2026-11-23):** Existing GitHub Actions Cloudflare account ID/token were found, but Cloudflare D1 API request returned HTTP 401 Unauthorized. No D1 or Worker was created. A valid, appropriately scoped Cloudflare API token must be set in GitHub Actions secrets; the workflow stays manual-only until repaired. Also not configured: Supabase project/key, invitation email/SMTP, founder Auth account, brother invitation and real device acceptance.
**Not yet proven:** build and physical channel playback, user isolation on live accounts, delivery of recovery email, failure mode under source outage.
**Rollback:** do not merge the branch into `main` before separate worker passes all stages. Current live PIN gate and favorites stay untouched until authorized cutover.

## Verified GitHub deployment evidence (2026-11-23)

- GitHub Actions run `45240140875` (staging): credentials present but Cloudflare API answered `401` at D1 list; no migration or deploy step executed.
- CI tests for `stream_worker` and `independent_access` have passed in prior PR builds; this does not prove a live deployment.
- No production update, no loss of legacy favorites.

## References

- Cloudflare D1: https://developers.cloudflare.com/d1/get-started/
- Cloudflare rate limit binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Supabase Auth invite users: https://supabase.com/docs/guides/auth/users

## Verified Cloudflare staging transition — 2026-11-23

- **API token authentication fixed and deployment successful**: GitHub Actions run [45252298588](https://github.com/DrivMatch/drivmatch-stream/actions/runs/45252298588), conclusion `success`.
- **Dedicated Cloudflare D1**: `drivmatch-stream-users-test`; migration `0001_stream_identities.sql` executed remotely and reported PASS.
- **Dedicated Worker**: `drivmatch-stream-v2-test`, deployed with 17 static assets at `https://drivmatch-stream-v2-test.drivmatch.workers.dev`.
- **No changes to production routes** for DrivMatch main, News, or original Stream; new Worker remains separate.
- Authentication will **fail closed / 503** until dedicated Supabase Auth project and Worker secrets are configured. This is not a functional multiuser release yet.
- The production migration of browser-local favorites remains **BLOCKED** until cross-origin export/import is implemented and verified.
- The deployment workflow was returned to **manual-only** following the successful staging run.
