# DrivMatch Stream — Nightly Rotation Policy (proposed, PR #19)

Status: IMPLEMENTED IN FEATURE BRANCH, NOT YET DEPLOYED.

## Schedule
- Only one nightly scheduled workflow, 02:00 America/Sao_Paulo (05:00 UTC).
- Former experimental 12:48 GitHub workflow removed in this branch.
- Nightly workflow performs source discovery, candidate selection, HLS segment tests, state persistence and output update.
- 24 parallel HTTP/HLS probe workers, up to 60 seconds per candidate.
- At most 2,000 candidate checks per night. Reserve up to 300 for newly discovered/unverified candidates; unused slots return to the rotating queue.
- Stable identity cursor, persisted in site/daily-autopilot-state.json. Restarts from after the last scanned ID and wraps after the end; does not use fragile numeric row positions.
- Keep findings, last_ok, failed counts, first_failed_at, last_failed_at. A passing test resets the failure clock and count.
- A confirmed failure hides the candidate from **Lista 12** on the next successful catalog publication. It remains eligible for rechecks during the 50-day observation period.
- **Deletion policy:** after 50 calendar days since the first confirmed failure without intervening success, if a new failed probe confirms the link still fails, remove that record from the active curated catalog. Persist a lightweight deletion tombstone keyed by stable channel+URL identity, to prevent rediscovery/reimport of the same dead link. Deleted entries are not scheduled for probing. Administrative review/manual removal of tombstones can be added separately.
- A source fetch failure or incomplete nightly probe batch aborts publication instead of misclassifying the affected channels.
- Report status is ROTATING_BATCH_COMPLETED, not FULL AUDIT. Coverage is rotating; an individual day does not cover all channels.
- Realtime device playback is different from remote HLS segment validation; Samsung compatibility and licensing are not certified.

## Scope limitations
- This policy currently applies to the curated candidates used to generate Lista 12; it does NOT automatically remove links from original Listas 1–11 or the country/category merged grid.
- The currently configured feed URLs remain a predefined set. Source crawling into new domains with persistent exploration memory requires additional implementation.
- Deletion is by channel+URL identity; the same broadcaster on a different usable stream URL remains eligible.
- Current GitHub Actions job duration and availability, and actual end-to-end runs, require confirmation after merge.
