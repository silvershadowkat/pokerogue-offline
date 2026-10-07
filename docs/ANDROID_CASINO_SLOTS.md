# Android Casino Slots

An original offline slots game inspired by the supplied screenshots. It is not
RaFa's source code: no public source for that casino was located. Multiplayer,
blackjack, roulette, crash, exchanges, upgrades and hidden-ability gacha are not
included in this first implementation.

## Play

Android: open **Egg Gacha**, select **Casino**, then **Spin**. Up/Down selects an
action; Left/Right changes the bet; Confirm starts a spin and then stops each reel
from left to right. Cancel returns to Egg Gacha. The casino also has direct touch
targets. Reels keep spinning until stopped: they do not stop automatically.

One coin activates the center line, two coins activate all three horizontal
lines, and three coins activate those lines plus both diagonals.

The wallet starts with 150 amusement coins. A free 150-coin refill is available only
at zero. Coins have no exchange into run money, eggs, vouchers or game items.

| Three identical symbols | Coins per winning line |
| --- | ---: |
| Oran Berry | 8 |
| Sitrus Berry | 8 |
| Poke Ball | 15 |
| Great Ball | 15 |
| Ultra Ball | 15 |
| Rare Candy | 100 |
| Master Ball | 300 |

An Oran Berry on the left pays 2 coins, two consecutive Oran Berries starting on
the left pay 6, and three pay 8. These rewards do not double count on the same
line. Active winning lines add together; the wager does not multiply the payout.
The highest symbol payout is 300 per line; multiple lines can pay in one spin.

The controls and short reel slips are inspired by FireRed/LeafGreen's
[Game Corner](https://bulbapedia.bulbagarden.net/wiki/Slot_machine).
This is an original implementation, not an exact recreation of Nintendo's RNG,
reel strips or animation timing. Each reel has a fixed 21-symbol cyclic strip;
visible rows are adjacent positions on that strip. The actual position when
Confirm is pressed determines the stop, followed by a saved random slip of zero,
one or two symbols. Timing matters but does not guarantee a win. No hidden pity
counter, loss compensation or forced near-miss logic changes the result.

## Save and run isolation

The casino uses `silvershadow.casino.slots.v1` in the existing localStorage backend.
The wallet format is version 2; the storage key stays unchanged for migration.
A spin first saves its deducted wager, starting positions and slips. Each stop
is saved in order. The third stop and payout are committed in one localStorage
write, so reopening cannot pay the prize twice. Leaving during a spin preserves
the paid wager and stopped reels; reopening resumes without charging again or
rerolling the slips. A pending spin cannot receive a free refill. Failed writes
leave the previous saved state intact; corrupt/future data is not overwritten.
A short input guard prevents a stop input from immediately starting another spin.

This wallet belongs to the installation, not a run slot. Existing `.prsv` exports
do not include it. The existing Google Drive full-localStorage backup does include
it, including any pending spin, and restoring that backup restores its saved
balance. No automatic cloud sync was added. Clearing app storage clears
the wallet. The casino does not read or modify game saves, daily metadata, run
history, vouchers, unlocks, or the game's seeded RNG. Its independent randomness
uses Web Crypto, independent of the game's temporary `Math.random` overrides;
animated reel frames do not draw more random values.

## Platform boundary

Only `patches/android/node/casino-slots.js` installs the new source and hooks.
`scripts/apply-patches.sh` calls it inside its Android-only conditional. Shared
payload files in `new-files` are inert on other platforms: they are copied only
by that Android patch. No existing enum or handler index is shifted. Voucher
rows 0–4 retain their meanings, Casino is row 5, and Cancel becomes row 6.

## Local validation and preview

```sh
node --test scripts/casino-slots.test.mjs
bash scripts/apply-patches.sh android
node scripts/build-casino-preview.mjs pokerogue-src /path/to/pinned/assets /path/to/preview.html
```

The preview bundles the actual slots handler with Phaser and existing item/window
art. Its small scene adapter substitutes for the battle scene; it is not a full
Android app test. It makes no network requests after opening the standalone HTML.

Use Node 24 and the game's installed Vite/esbuild dependencies. Build and test
locally; do not dispatch the workflow recipes or re-enable GitHub Actions.

## Android main packaging

Use the native, local main-build procedure in [ANDROID_LOCAL_BUILD.md](ANDROID_LOCAL_BUILD.md).
The APK keeps `com.silvershadow.pkr`, uses the existing main signing key, and raises
both the official game version and Android versionCode. No dev APK is delivered.
