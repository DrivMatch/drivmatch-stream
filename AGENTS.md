# Stream Now — Mandatory developer / agent instructions

**USER DATA PROTECTION IS A RELEASE-BLOCKING REQUIREMENT.** Before changing UI, routing, storage, player, catalog, login, updates, or deploy, read `docs/STREAMNOW_FAVORITES_DATA_CONSTITUTION.md` and preserve its invariants. Never reset or discard user favorites or their local backups. Changes that put any saved list at risk must fail closed; do not merge/deploy without regression tests, backward-compatibility analysis and verified recovery.

Do not claim that favorites were restored based solely on their on-screen count. Do not say cross-device persistence is supported until authenticated server-side synchronization has been implemented and verified. Always distinguish a user's manual rebuilding from automatic recovery.

The approved Stream Now canonical identity is the red/magenta brand in `00_CANONICO/`; never change its mark by inference. Preserve the channel catalog, user identities and all existing data.
