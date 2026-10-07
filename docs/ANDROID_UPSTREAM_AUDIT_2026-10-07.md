# Android update audit — 2026-10-07

Scope: Android only. Other platform recipes and nx.js pins are unchanged.
Repository GitHub Actions remain disabled; all builds and tests run locally.

## Source identity

Canonical maintained checkout:
`C:\Users\plim\Documents\Codex\Projects\PokeRogue\source\pokerogue-offline`.
Local main, origin/main and GitHub main initially matched at
`4f338ec64c29275227cf6941025afdd479a74aa7`, with no tracked edits.

Official stable game advances from `0d94c5bbbc7a4fc67014c480e31dab1cfdf7ceb4`
(1.12.0.10) to `e4e9b5383be7c9e171d32a9daaea2658d475c521` (1.12.0.11).
All four stable commits are included: newer-save rejection, version-comparison
refactoring, legacy starter migration guards, metadata and locale updates.
The original patched generated source was preserved during development.

Both game revisions pin assets to `909b43612324622608023b3beb2f24f4ef159c1d`.
New locales are `e46279a0a511e5b6f552dfcab522644822b2908a`. Do not advance
assets independently to an unrelated development head. The complete pairing and
Android build identity are pinned in `configs/android/upstream-lock.json`.

## Offline fork selection

Reviewed `PokeRogue-Offline/pokerogue-offline` through
`a8faf35c23c775c941fbde86d490e26a8217683b`, 34 commits after baseline `71a93fa`.
This is the recorded fork parent for Scoooom's offline project.

| Change family | Android decision |
| --- | --- |
| Trigger axes (`5f64d76`) | Adopt Android shim. Tests simulate separate/combined axes, releases and native analog buttons. |
| Prerelease/build checks (`e538954`, `79c0839`, `5188207`) | Adapt to SilverShadow main APK filenames and our repository. Same-game-version rebuilds detected; dev APKs and draft/prereleases excluded. |
| Offline navigation (`238db06`, `1de1008`) | Already covered by our `offline-settings-navigation-fix.js`. |
| Native save IO consolidation (`b9566ef`) | Android import overlay/Downloads export already provided by our existing two mobile patches; preserve them. |
| Audio lifecycle | Preserve our more complete Capacitor lifecycle and visibility handling. |
| Touch opacity/quad tap | Preserve custom D-pad, visibility and customization instead of replacing our control system. |
| Auto cloud sync, Dropbox, settings split (`d45593f`, `ffed989`, `0beaa87` and related UI fixes) | Automatic cloud sync is explicitly excluded by user request. New providers/settings migration is deferred. Upstream assumes a different settings representation and would replace our custom settings/editor/cheats while changing when cloud saves are overwritten. Existing manual Drive backup/restore and Include Current Run remain intact. |
| Restore prompt fixes (`4db93ed`, `a753806`) | Apply to the new auto-restore prompt; our current manual-confirmation UI does not contain that prompt loop. |
| Damage/KO preview (`d853665`) | Optional gameplay feature deferred; needs separate RNG/boss-segment checks against our cheats. |
| Rolldown externalization (`0ee43ad`) | Desktop/Electron-specific; excluded. |
| 1.12.1.0 API changes (`2c69b38`) | Development-target migration; stable 1.12.0.11 still needs its existing constructor signatures. |
| Nightly/archive/release workflows | Excluded; no hosted workflow enabled or dispatched. |

This selective port preserves Daily modes, Pokemon Editor, sandbox settings,
controls and community features. It is not a blanket upstream merge.

## Main app identity

Nova inspected read-only at `192.168.0.132:5555` on the existing ADB server, port
5039. Main package `com.silvershadow.pkr`, installed `1.12.0.10.73-2.0.0`, code
`1200100073`. No separate pkrdev package was found.
New main build: `1.12.0.11.74-2.0.0`, code `1200110074`.

The local main keystore matches the installed APK SHA-256 certificate:
`3b84cdecd22d86b200c875e825b12511b799c3d279caadaf7da8eb5e3bc6b730`.
The reference APK provides only its public OAuth client ID. Native implementation,
manifest, launcher and web bundle are rebuilt locally. Never regenerate that key,
uninstall the main app, or clear storage to work around an upgrade issue.

## Validation and limits

Android patches apply to stable; casino/updater patch reapplication is idempotent.
Ten casino tests cover all 343 line outcomes and 9,261 reel combinations in
each bet mode, persistence, invalid/future data, failed settlement writes,
refill rules, affordability, bounds, timing/slips and platform gating. Three Android
upstream tests cover release selection and trigger normalization.

Before the Android updater adaptation, six game suites passed (101 tests): Daily
modes, Boss Rush, Random Run, game data, Pokemon Editor and inherited update API.
That API fixture describes other platforms; Android now has its own API tests.
After the adaptation, the five save/daily/editor suites passed again (93 tests).
The actual Phaser slots handler was checked in headless Edge for keyboard/pointer,
manual stops, jackpot, 1/3/5 paylines, back/resume without another wager and
persistence without another payout. This is not an Android hardware test.
Daily archive: 166 validated entries from 2026-04-25 through 2026-10-07.

The local main release build passed TypeScript and native compilation, APK ZIP
integrity, 16 KiB alignment, package/version/label checks and signature matching
against the Nova's installed main app. Packaged bundles contain the manual-stop
casino; sampled item/font assets match the pinned cache and the daily archive
matches the validated generated file. No dev APK is delivered.

No Nova installation or hardware gameplay claim is made. Before publication,
verify a copied save, export/import, daily continuation, controls and slots on
Android. Google account/cloud-write behavior was not exercised against a real account.

## Cleanup

Two stale Git worktree records referencing missing July folders were pruned.
Four old generated Pokemon Editor files nested in the pre-existing source tree
remain intact: automatic approval review blocked their archive/removal. They must
not overwrite maintained payloads. No private signing key is in Git.
