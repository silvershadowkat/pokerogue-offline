# SilverShadow Daily Run modes

## Architecture

`New Game -> Daily Run` opens one type menu for Official, Offline, Random
50-Wave, Boss Rush, and Custom 50-Wave runs. The type/date/input menus do not initialize
or consume gameplay RNG. They produce one pending `DailyRunLaunchRequest`, and
`TitlePhase.startDailyRunWithSeed()` holds it unchanged while the stock
save-slot UI is open.

After a slot is chosen, the four 50-wave modes enter the original Daily Run generator. Each
still selects `GameModes.DAILY`, calls `trySetCustomDailyConfig`, seeds and
resets the scene RNG, generates the rental party, installs Daily starting
items, and starts the existing 50-wave ruleset. No Daily gameplay rules are
duplicated.

Boss Rush also uses `GameModes.DAILY` and the standard save-slot, phase, reward,
save/resume, completion, and run-history systems. Its launch metadata contains a
fully generated manifest, so gameplay never has to reroll its party or encounters.
It replaces the ordinary 50-wave progression with ten consecutive wild boss
battles.

Session saves retain the canonical scene seed, the existing serialized custom
Daily config, and optional `dailyRunMetadata`. The metadata records the launch
mode, official date/source, friendly Text Seed, algorithm version, and the
complete special configuration. Legacy saves without metadata still load.

## Official archive

Runtime URL:

`https://raw.githubusercontent.com/silvershadowkat/pokerogue-offline/seed/docs/daily-seeds.json`

The runtime validates schema version 1, real and unique ISO dates, both known
entry formats, non-empty seeds, special configuration objects, matching inner
and outer special seeds, and consistent declared archive metadata. It computes
the real bounds/count and sorts newest first rather than trusting input order.

Source priority is:

1. fresh validated download;
2. last validated persistent `localStorage` cache;
3. `/daily-seeds.json`, embedded in the packaged static assets.

The persistent keys are `silvershadow_daily_archive_v1` and a temporary
`silvershadow_daily_archive_v1_tmp`. The value is JSON containing
`downloadedAt` plus the validated archive. The temporary value is read back
and validated before the current cache is replaced. The Switch runtime marker
skips the remote request and loads the embedded archive directly.

The checked-in build fallback is `assets/daily-seeds-fallback.json`. Run:

```sh
node scripts/sync-daily-seed-archive.mjs
```

This writes the validated build input to `work/generated/daily-seeds.json`.
The shared patch copies it to `pokerogue-src/assets/daily-seeds.json`; upstream's
JSON asset plugin emits it as `/daily-seeds.json` in the compiled game. When a
fresh download is unavailable, the synchronizer validates and copies the
checked-in snapshot instead. Android, iOS, Windows, AppImage, macOS, and Switch
build entry points run the synchronizer before packaging. Android/iOS copy the
compiled `dist/` tree into their Capacitor package, and all desktop builders
include `dist/**/*`. Switch deliberately deploys it as the separate loose file
`game/daily-seeds.json`; it is not stored inside an `.sspack` asset pack. Every
platform workflow validates the final compiled archive before packaging.

## Seed algorithms

- Offline: UTF-8 SHA-256 of
  `SilverShadow-Daily-v1|YYYY-MM-DD` using the UTC date.
- Random: UTF-8 SHA-256 of
  `SilverShadow-Random50-v1|<UTC ISO milliseconds>|<secure random or monotonic fallback>|<session counter>`.
- Boss Rush: UTF-8 SHA-256 of
  `SilverShadow-BossRush-v1|<UTC ISO milliseconds>|<secure random or monotonic fallback>|<session counter>`.
- Custom Text: UTF-8 SHA-256 of
  `SilverShadow-CustomSeed-v1|<trimmed exact text>`.
- Each digest is truncated to its first 16 bytes and encoded as standard
  Base64. A dependency-free implementation is used on every runtime.
- Previous Seed lists the newest 1,000 canonical seeds launched from Text,
  Offline, Random, and Boss Rush modes. Rows include launch time and source details; using
  a Previous Seed does not add another history entry.
- Text Seed uses a controller-first naming-screen grid with lowercase,
  uppercase, number, and symbol pages. It includes every printable ASCII
  character, four-direction navigation, and no clipboard-only action.

Official `daily-config` entries are expanded to
`{ ...entry.dailyConfig, seed: entry.seed }`, serialized, validated by the
game's existing custom Daily parser, and passed to `trySetCustomDailyConfig`.

## Boss Rush Mode

Boss Rush creates one canonical seed and derives the complete run manifest from
that seed before the save slot is selected. Reusing the seed recreates the same
three starters, ten bosses, forms, abilities, natures, IVs, and movesets. The
manifest is also serialized in the session save so a resumed run cannot drift
if future generator logic changes.

The player receives three distinct level 100 Pokémon with perfect IVs. Eligible
starters are fully evolved species, single-stage species, and safe persistent
power forms with at least 450 base-stat total. Ditto, Smeargle, Shedinja, and
Unown are excluded. The first three bosses are ordinary evolving or
single-stage Pokémon; bosses four through six are ordinary fully evolved or
single-stage Pokémon, with a 450 base-stat floor for the single-stage pool;
bosses seven through ten are Legendary, Mythical, Paradox, or safe transformed
Pokémon with at least 500 base-stat total. Base species are unique across the
entire player party and boss sequence.

Mega Evolutions, Primal Reversions, and Gigantamax forms are eligible because
the game represents them as persistent species forms with their real stats,
types, abilities, and sprites. Regular Dynamax and Terastallization are not used
in version 1 because they are temporary battle states rather than persistent
forms; silently substituting a cosmetic form would make the manifest misleading.

Movesets are chosen from each exact form's legal level-up and TM pool. The
deterministic scorer favors accurate damaging moves, STAB, useful coverage,
priority, recovery, setup, and strong secondary effects while penalizing
redundant weak filler, self-KO moves, and severe drawbacks. It never manufactures
a move outside the species' available level-100 pool.

Boss health segments and held modifiers increase by encounter:

| Bosses | Shield breakpoints | Health segments | Held modifiers |
| --- | ---: | ---: | ---: |
| 1-3 | 1 | 2 | 0 |
| 4-6 | 2 | 3 | 1 |
| 7-9 | 3 | 4 | 2 |
| 10 | 4 | 5 | 3 |

After each victory the player chooses from exactly five guaranteed Ultra-tier
or better reward options (the game's Rare-equivalent reward tier), then the
party is fully healed, including PP and status, before the next boss. Poké Balls
cannot be used in Boss Rush, so catching does not bypass the fixed encounter
sequence. Defeating boss ten flows through the stock Daily Run completion and
cleanup path.

Balance constants, exclusions, form policy, encounter categories, shield
progression, modifier counts, and reward settings are centralized in
`src/system/daily-run/boss-rush.ts`. Development builds log the generated
manifest, per-boss configuration, and reward-tier requests for seed verification.

## Manual Android test plan

1. With internet enabled, open Official Daily Run and confirm the downloaded
   source notice. Confirm today's UTC date is first if the archive contains it.
2. Select an ordinary historical date, choose a slot, and start the run.
3. Select 2026-07-08 and verify the special Eevee starter, boss, biome, forced
   wave, mystery encounter, and trainer manipulation.
4. After one successful download, disable internet and reopen Official. Verify
   the cached-source message includes its download time and newest date.
5. Clear app data (or install the DEV identity fresh), stay offline, and verify
   the built-in-source message and actual newest embedded date.
6. Use Left and Right throughout the date list. Confirm each jump advances six
   rows (one-row overlap in the approximately seven-row view) and clamps at the
   list boundaries.
7. Start Offline twice on the same UTC day in separate slots. Make identical
   choices and compare the initial rental team/encounters.
8. Start Random twice and record the displayed canonical seeds; they must
   differ and remain unchanged while selecting a slot.
9. Open Previous Seed and verify Offline, Random, Boss Rush, and Text runs are newest
   first with timestamps/source details. Select one and confirm it is not added
   to the list again.
10. Enter `ABCDEFG` twice as Text Seed and compare canonical seeds and initial
    results. Enter `ABCDEF` and verify it differs. Repeat with capitalization,
    spaces, apostrophes, and punctuation.
11. Operate the naming-screen grid using only the controller/touch controls:
    four-direction movement, pages, characters, Backspace, Clear, Confirm, and
    Cancel. Check `+`, `/`, `=`, spaces, and punctuation on the symbol page.
12. Resume one run from each mode. Verify its original official date,
    canonical seed, friendly text, and special configuration remain intact.
13. In airplane mode, repeatedly enter/leave Official and verify there is no
    freeze or long-lived loading state.
14. Start Boss Rush twice with different generated seeds and verify both the
    three-member party and boss sequence differ. Replay one seed from Previous
    Seed and verify its party and sequence match exactly.
15. Confirm every Boss Rush starter and enemy is level 100, each party has three
    distinct species, each boss species is unique, and boss categories follow
    the 1-3, 4-6, and 7-10 progression documented above.
16. Defeat consecutive bosses and verify shield segments and enemy modifier
    counts escalate, five high-tier rewards are offered, and the full party is
    healed (HP, PP, fainting, and status) before the next battle.
17. Save and resume during a Boss Rush. Verify the mode label, seed, manifest,
    current encounter, party, and completion behavior remain intact.
18. Confirm Poké Balls cannot be used, boss ten completes the run, and the save
    slot is cleaned up by the normal Daily completion flow.
19. Start Classic, Challenge, Endless, and Spliced Endless where unlocked and
    verify their existing flows are unchanged.

Historical seeds are deterministic only relative to compatible game data and
RNG call order. This feature does not emulate older game versions. Switch UI,
text entry, and the new Daily modes still require real-hardware validation.
