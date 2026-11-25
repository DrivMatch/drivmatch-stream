# Stream Now — Mandatory developer / agent instructions

**USER DATA PROTECTION IS A RELEASE-BLOCKING REQUIREMENT.** Before changing UI, routing, storage, player, catalog, login, updates, or deploy, read `docs/STREAMNOW_FAVORITES_DATA_CONSTITUTION.md` and preserve its invariants. Never reset or discard user favorites or their local backups. Changes that put any saved list at risk must fail closed; do not merge/deploy without regression tests, backward-compatibility analysis and verified recovery.

Do not claim that favorites were restored based solely on their on-screen count. Do not say cross-device persistence is supported until authenticated server-side synchronization has been implemented and verified. Always distinguish a user's manual rebuilding from automatic recovery.

The approved Stream Now canonical identity is the red/magenta brand in `00_CANONICO/`; never change its mark by inference. Preserve the channel catalog, user identities and all existing data.

## Mandatory universal scope
Every change must consider **all** Stream Now delivery surfaces: Android APK, Android AAB/Google Play, Android TV / Google TV (if introduced), Samsung Tizen and Samsung TV browser, LG webOS and LG browser, desktop browsers, iPad/iPadOS, iPhone/iOS, Android mobile browser, and future mobile/tablet/TV applications. No favorites, history, watchlist or user preference migration may be treated as safe merely because it works on one surface. Run `node --test tests/streamnow_favorites_data_safety.test.mjs tests/streamnow_universal_favorites_scope.test.mjs` as a mandatory gate in every packaging/deployment workflow. Never claim real-device validation from simulated tests; never claim synchronized favorites across devices until it exists on the server.
