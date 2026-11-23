# DrivMatch Stream — implantação independente para teste residencial

**Status:** implementation branch, **NOT DEPLOYED**, **NOT CERTIFIED**.
**Scope:** two invited users, separate homes, Android test APK, user-private favorites.

## Boundaries

- Dedicated Cloudflare account for Stream. Do not reuse Ricardo's account, credentials, database, or deployment routes.
- Dedicated Supabase **project** only for identity and transactional email. Do not use the DrivMatch main project's database/auth.
- Existing GitHub repository `DrivMatch/drivmatch-stream` is reused. No duplicate repository. No production change until review.
- Catalog remains static via GitHub Pages; the new Cloudflare Worker controls the independent HTTPS entry point.
- The media is **not retransmitted** through our infrastructure. Availability, rights and concurrent access depend on the sources.
- No feature logs what an individual watches. Viewing history is not stored on the server.

## One-time owner setup (requires access to accounts; do NOT paste secrets into chat)

1. In **your own Cloudflare account**, enable the workers.dev subdomain.
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
- For the **admin** only, updated clients import the old favorites **additively** into D1, and then load the authoritative D1 list. The old localStorage key is **never deleted** during migration.
- For a **viewer** account, no old global localStorage favorites are imported or shown. Each account's D1 favorites are separate.
- A failed import leaves the original browser records intact and must be reported, never claimed as successful.
- Samsung/desktop saves favorites in D1 in multiuser mode and keeps recent channel history in memory only (no server viewing history). On legacy entry it retains the prior behavior.
- Verify the founder's actual Samsung browser: favorites in that browser do not exist on the server automatically until the updated client runs **on that same device** while the founder is logged in.
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

- Worker deployed on **own account**, HTTPS and D1 migrations applied.
- Invitation received by brother, password set without founder ever seeing it, login and recovery tested.
- Founder account's existing favorites backed up and migrated, unchanged after next 02:00 catalog update.
- Brother favorites not visible to founder and vice versa (API authorization tests).
- Separate account sessions and suspension/revocation tested.
- APK installs on the brother's actual phone and opens from his cellular or home Internet.
- Founder views channel A and brother independently views channel B; verify whether **each source** allows simultaneous connections.
- Brother password never shown in logs, admin UI or stored in Android; admin secrets absent from GitHub.
- Cloudflare admin ownership, key isolation and rollback procedures verified.

## Known blockers before production

**Not yet connected:** Cloudflare account, D1 ID, Supabase project/key, reliable invitation email, founder Auth account, brother invitation, private worker hostname, and real Android device.
**Not yet proven:** build and physical channel playback, user isolation on live accounts, delivery of recovery email, failure mode under source outage.
**Rollback:** do not merge the branch into `main` before separate worker passes all stages. Current live PIN gate and favorites stay untouched until authorized cutover.

## References

- Cloudflare D1: https://developers.cloudflare.com/d1/get-started/
- Cloudflare rate limit binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Supabase Auth invite users: https://supabase.com/docs/guides/auth/users
