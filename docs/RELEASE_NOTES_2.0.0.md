# v1.12.0.10-2.0.0

SilverShadow 2.0.0 is the largest update to this fork so far. It is the second
Nintendo Switch release and promotes the Switch port to Beta, while also adding
a much larger set of offline sandbox
options, a full Pokémon Editor, new Daily Run variants, Google Drive backups,
and a redesigned touchscreen control system.

> [!IMPORTANT]
> Testing was limited. Most testing was performed by one person on an Android
> phone, with additional testing on a Nintendo Switch. The new Daily Run modes
> and Pokémon Editor were tested only on Android. Other packaged platforms have
> not received the same hands-on coverage, so bugs should be expected.

Before updating, export both your user data and active run locally. Google
Drive is useful as a second backup on configured builds, but it should not be
your only backup.

## Available builds

This release supports the existing Android, iOS, Windows, macOS, and Linux
packaging, and adds an experimental Nintendo Switch homebrew package.

- **Android** received the majority of gameplay and feature testing.
- **Nintendo Switch** received focused startup, memory, rendering, controller,
  save, audio, battle, and reward optimizations for this second, Beta release.
- **iOS, Windows, macOS, and Linux** are included, but were not personally
  tested to the same extent for this release.

## Nintendo Switch Beta

The Switch release was a major focus of 2.0.0. The package uses a self-contained
nx.js NRO and four uncompressed random-access asset packs so the game can load
its large offline data set without extracting tens of thousands of loose files
to the SD card.

Real-hardware testing reached the title screen, starter selection, Pokédex,
battles, rewards, catching, saving, continuing a run, menus, readable fonts,
BGM playback, and attached-controller input. A large amount of work went into
reducing memory pressure and avoiding crashes during longer runs.

The Switch build is now **Beta**, but it can still stall or crash, and long
runs are not guaranteed to finish. The release playability testing was performed with
all optional gameplay mods disabled. Daily Run variants, the Pokémon Editor,
and individual sandbox combinations were not validated on Switch. Use
title-override/application-memory mode, keep backups, and report reproducible
problems with the newest diagnostic log.

The Switch build is fully offline. Network features, including Google Drive,
are intentionally unavailable there.

## New Daily Run menu and modes

Choosing **Daily Run** now opens a mode menu. Each custom mode keeps its own
save, resume, Previous Seeds, and run-history name.

### Official Daily Run

Browse available official Daily Runs by date, including marked special
configurations. The game can use a freshly updated archive, a validated local
cache, or the archive packaged with the app, so previously included dates
remain available offline.

### Offline Daily Run

Choose **Today**, **Yesterday**, or select a calendar date. A date always maps
to the same deterministic Offline Daily Run, making it easy to replay or share
a date without requiring the official daily service.

### Boss Rush

Boss Rush is ten consecutive level-100 boss battles with three level-100
starters, deterministic legal movesets, no catching, no running, escalating
shields, five free Great-or-better rewards, and five separate purchasable shop
items after bosses 1 through 9.

- **Boss Rush** fully restores HP, fainted Pokémon, PP, and major status before
  every new boss. Its rewards and shop omit recovery and other items that have
  no practical use in this variant.
- **Boss Rush (H)** preserves HP, fainting, used PP, and major status between
  bosses. Its rewards and shop can provide strong level-100 recovery,
  revival, status, and PP-management items.

Both variants use the same ten-boss structure, boss order rules, levels,
moveset quality, and shield progression. Weak but valid starters are allowed;
Ditto, Smeargle, Shedinja, and Unown remain eligible and use normal supported
game data rather than invented mechanics.

### Random Run

Choose **Random5**, **Random10**, **Random20**, **Random30**, **Random50**, or
**Random100**. These use Daily-style generation and shops but end at the chosen
length. The final wave is always a one-shield boss using the Pokémon generated
for that encounter. Longer variants keep Daily-style trainers at waves ending
in 5, add bosses every ten waves, and use a trainer boss for every second
intermediate ten-wave milestone.

### Custom Run, Text Seed, and Previous Seeds

**Custom Run** contains **Text Seed** and **Previous Seeds**.

Text Seed uses an in-game controller/touch keyboard with lowercase, uppercase,
number, and symbol pages, four-direction navigation, Backspace, Clear, Confirm,
and Cancel. The exact text deterministically produces the same canonical seed.

Previous Seeds remembers the mode, variant, canonical seed, generator version,
and required generation settings or manifest. Replaying an older entry keeps
its original behavior instead of silently changing when a future generator is
updated. Older unversioned entries are interpreted using their compatible
legacy behavior.

### Completion egg quartet

Completing any Daily Run mode—including Text Seed runs—awards four eggs for one
species: normal, standard shiny, rare shiny, and epic shiny. Locked starter
species are prioritized. Once every starter is unlocked, the reward targets a
species with missing supported shiny forms. If a species does not have separate
rare or epic assets, the normal Egg system safely produces repeated supported
shiny forms instead of skipping that species.

## Full Pokémon Editor

Open **Settings → Offline → Team → Pokémon Editor**. This feature was tested
only on Android.

- **Off** hides editor actions without deleting existing builds or rewriting
  Pokémon already in a run.
- **Use Saved Builds** allows saved builds to be loaded on the starter screen
  or onto the active party between battles.
- **Full Editor** enables editing, unrestricted move management, build
  creation, restore, and undo actions.

The editor works on selected starters and on the active party during safe
between-battle reward/shop phases. It can edit a safe permanent form, level,
nature, ability, gender, shiny tier, all IVs, friendship, Pokérus, and one to
four moves. It does not permit active-party mutation during battle.

The unrestricted move browser is built from the game's initialized move data.
It supports browsing all safe implemented moves, type/category/effect filters,
name search, sorting by name/power/accuracy/PP, full move details, and
controller-friendly paging. **Quick Edit Moves** remains limited to the
Pokémon's legitimate Move Relearner pool.

Saved builds support multiple builds per species/form, duplicate names,
preferred builds, rename, duplicate, update, delete, filtering, export/import,
and independent duplicate starter copies. Normal evolution, move learning,
form changes, and battle rules continue after a build is applied.

## Offline sandbox additions

The Offline settings menu is now grouped so the expanded list remains usable.
All options default to normal game behavior.

| Group | Added options |
| --- | --- |
| Shop | Free Shop Items, Free Rerolls, Money Multiplier |
| Rewards | Reward Claim Mode (Default, Claim All, Infinite), Max Luck (SSS) |
| Progress | EXP Multiplier, Candy Jar Count, Pokémon Candy Multiplier, Candy Costs |
| Team | 60 Starter Points, Allow Duplicate Starters, Starting Level, Unlock Starter on Select, All Starters Have Pokérus, Pokémon Editor |
| Generation / Gacha | Free Egg Gacha Pulls, Rare Eggs, Instant Hatch, Shiny Rate, Always Shiny, Form Change Items |
| Capture | Guaranteed Capture, Unlimited Poké Balls, Catch Trainer Pokémon, Catch Pokémon in Double Battles, Catch Bosses Through Shields |
| Battle | Infinite Player HP, Infinite Player PP, Player OHKO, Never Miss, Always Critical Hit, Always Move First, No Charge / Recharge Turns, Run Never Fails, Full Heal After Every Battle |
| Evolution / TM | Ignore Evolution Requirements, Unlimited TM Compatibility |

The General settings also include **Shop Animations**, allowing normal
reward/shop reveal animations to be turned off for faster presentation on
supported platforms.

## Touch controls

The touchscreen overlay now uses a custom SilverShadow D-pad with continuous
thumb sliding, multi-touch ownership, a subtle directional tilt/rocking pose,
and working native vibration on Android. The visual system is shared with the
action buttons for a more consistent look.

Touch Controls can **Fade**, **Always Appear**, or be **Disabled**. **Move Touch
Controls** can independently reposition and resize the D-pad and action-button
groups for portrait and landscape layouts.

## Backup and quality-of-life features

- Manual Google Drive backup and restore in **Settings → Offline**, with an
  option to include the active run and a locally displayed last-backup time.
  This was tested on Android only. It is intended to work on configured
  Android, iOS, Windows, macOS, and Linux builds, but is excluded from Switch.
  Backup and restore work, but the Google OAuth application is still in
  **Testing** mode, so only the maintainer's allowlisted account can currently
  connect. Public access will be enabled when the OAuth application is moved to
  production.
- Read-only **Gacha Calendar** showing the Legendary Gacha boost by date.
- Release update notices and optional changelog pop-ups.
- Mobile local save import/export fixes and a clearly warned **Clear All Data**
  action.
- Android background-audio pause/resume handling.
- Improved Offline settings navigation for touch and controller shoulder
  buttons.
- SilverShadow menus, build labels, Community links, release metadata, main
  and development Android identities, and consistent packaged icons.

## Known issues

- Boss Rush and Boss Rush (H) sell rotating items that are not normally
  purchasable. Some unusual purchases may not behave correctly. Please open an
  issue with the item, mode, wave, and steps if you find one.
- Rare Candy purchases are fast while selecting a Pokémon, but after leaving
  the shop the game may play individual level-up messages and show incorrect
  intermediate stat screens for each queued level. This is currently a
  presentation issue in the level-up flow rather than a reason to remove Rare
  Candy from the Boss Rush shop.
- The Switch Beta can still stall or crash, especially during long sessions.
  Some move effects or button prompts may also display incorrectly.

## Thanks

- The PokéRogue developers, artists, translators, and community contributors.
- Scooom and all PokéRogue Offline contributors for the project this fork is
  based on.
- **Scooom** for the Google Drive integration and for the Daily Seed idea. This
  fork uses its own implementation and presents the expanded choices through
  the new in-game Daily Run menu.
- **Futuba** for the concept behind several sandbox modifiers. SilverShadow's
  implementations were adapted independently to the current game source.
- Nathan Rajlich and the **nx.js** contributors for the Switch JavaScript
  runtime and NRO tooling.
- **BOIS CLUB GAMES / Gen1Recomp** for the touch-control behavior reference.
- Nicolae Berbece / **Those Awesome Guys** for the CC0 controller-prompt art
  used as a D-pad visual reference.
- Phaser and its contributors, plus everyone who reports bugs and helps make
  this experimental offline fork more reliable.

This is an unofficial fan project and is not affiliated with or endorsed by
the official PokéRogue team, Nintendo, Game Freak, Creatures Inc., or The
Pokémon Company.
