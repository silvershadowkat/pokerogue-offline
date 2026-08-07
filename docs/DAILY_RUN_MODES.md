# SilverShadow Daily Run modes

## Player-facing menu

**New Game → Daily Run** opens one type menu:

1. Official Daily Run
2. Offline Daily Run
3. Boss Rush
4. Custom Run
5. Random Run
6. Cancel

The menu and seed-entry screens do not consume gameplay RNG. A chosen mode
creates one launch request, waits for the normal save-slot selection, then
starts through the game's existing Daily Run initialization.

## Official Daily Run

Official Daily Run opens a dated archive. Special configurations are marked in
the list and are launched with their complete validated configuration rather
than reducing them to a seed alone.

The archive source priority is:

1. a freshly downloaded and validated archive;
2. the last validated local cache;
3. the archive embedded in the packaged app.

The runtime validates the schema, real and unique ISO dates, supported entry
formats, non-empty seeds, and complete special configurations. It computes the
actual bounds and sorts newest first rather than trusting declared metadata.
Switch skips the network request and uses the packaged archive because its
runtime is intentionally fully offline.

## Offline Daily Run

Offline Daily Run offers:

- **Today**;
- **Yesterday**;
- **Choose Date**.

Choose Date uses nested year, month, and day lists. Only valid dates up to the
current day are shown, with years available back to 1900. The lists reserve
space for visible scroll arrows and page by the number of actual choices that
fit between them, so Left/Right cannot skip a hidden date or move beyond
Cancel.

The chosen `YYYY-MM-DD` value deterministically maps to the same Offline Daily
seed. The calendar choice is stored with the run for save, resume, history, and
Previous Seeds display.

## Random Run

Random Run opens a length selector:

- Random5
- Random10
- Random20
- Random30
- Random50
- Random100

Each variant follows Daily-style generation, rewards, and paid shops but ends
at the selected wave count. The final wave is always a wild one-shield boss
using the Pokémon naturally generated for that encounter. It cannot be escaped
with Run or forced-switch moves.

For longer variants:

- trainer encounters remain on waves ending in 5;
- a boss appears every ten waves;
- every second intermediate ten-wave boss is a trainer boss;
- the selected final wave always remains the wild one-shield finale.

Random Run saves, resume screens, Previous Seeds, and completion history use
the exact Random5/10/20/30/50/100 name. Historical unversioned Random entries
retain the original 50-wave behavior and display as Random50.

## Boss Rush

Choosing Boss Rush opens **Normal** and **Hard**. Their persisted names are:

- **Boss Rush**
- **Boss Rush (H)**

Both variants generate a complete deterministic manifest before save-slot
selection. The manifest contains the three starters and all ten bosses,
including species, safe persistent form, ability, nature, IVs, and legal
moveset. It is serialized with active saves and seed history so future
generator updates cannot alter an existing run.

### Shared rules

- exactly three level-100 starters;
- ten consecutive level-100 wild bosses;
- the existing shield progression: one breakpoint for bosses 1–3, two for
  bosses 4–6, three for bosses 7–9, and four for boss 10;
- increasingly strong boss eligibility groups and held modifiers;
- deterministic legal level-up/TM movesets with strong STAB, coverage, and
  useful support choices;
- no catching and no escaping through Run or forced-switch moves;
- exactly five free Great-or-better rewards after bosses 1–9;
- a separate five-item paid shop after bosses 1–9;
- no reward or shop after boss 10;
- 10,000 starting money;
- normal Daily completion, save cleanup, history, and egg rewards.

There is no starter base-stat-total floor. Any species that satisfies the
intended final-evolution, single-stage, legendary/mythical/paradox, or safe
persistent-form rules can appear even when it is weak. Ditto, Smeargle,
Shedinja, and Unown are directly supported through valid game data: Transform,
legal Sketch behavior, Shedinja's one-HP/Wonder Guard data, and Hidden Power.
No invented mechanics are added to strengthen them.

### Boss Rush Normal

Before every new boss, the full party is restored:

- HP is restored;
- fainted Pokémon are revived;
- PP is restored;
- major status conditions are removed.

Earned held items and permanent modifiers remain attached. Rewards and the paid
shop exclude catching, encounter, map, IV-scanning, recovery, PP, status, money
boosting, and other unusable choices. The shop focuses on permanent party
improvements and battle-relevant items.

### Boss Rush Hard

Between bosses, Hard preserves:

- current HP;
- fainted state;
- consumed PP;
- major status conditions.

Temporary encounter effects still clear normally. Rewards and the paid shop
may include strong level-100 healing, Full Restore-style recovery, revival,
status recovery, and PP recovery. Weak early-game recovery is excluded when
stronger valid options exist. Catching, encounter, map, IV-scanning, and money
boosting items remain excluded.

### Rewards and shops

The five free choices and five paid choices are separate systems. Selecting a
free reward does not purchase it; buying a shop item uses normal pricing and
money deduction. Choices are generated deterministically, prefer distinct
useful items, and remain stable when a targeted TM or move-selection screen is
cancelled. Only an actual reroll regenerates the appropriate choices.

Boss Rush shop purchases are prevented when the resulting modifier is already
at its normal stack cap, avoiding conversion into irrelevant Poké Balls.

Known presentation issue: Rare Candy can be purchased and targeted quickly,
then produce individual level-up messages and incorrect intermediate stat
screens after leaving the shop. Other unusual normally-unpurchasable items may
also expose untested follow-up behavior and should be reported.

## Custom Run, Text Seed, and Previous Seeds

Custom Run contains:

- **Previous Seeds**;
- **Text Seed**.

Text Seed opens a controller/touch naming grid with lowercase, uppercase,
number, and symbol pages. Every printable ASCII character is available, along
with Backspace, Clear, Confirm, and Cancel. Four-direction navigation works
without a system keyboard or clipboard.

The trimmed exact text is deterministically converted into a canonical seed.
Capitalization and punctuation remain meaningful. The friendly text and
canonical seed are both retained in history metadata.

Previous Seeds stores up to the newest 1,000 seeded launches. Each entry keeps:

- mode type;
- mode variant;
- generator identifier and version;
- canonical seed;
- settings needed to reconstruct the run;
- a compact manifest/snapshot when regeneration would be unsafe.

Generator changes receive a new version instead of silently changing old
entries. Boss Rush uses its stored manifest; Random Run stores its selected
length and version. Existing unversioned entries are normalized to their
compatible historical behavior. Replaying an entry does not duplicate it in
the list.

## Save and history names

One shared metadata source controls save slots, resume UI, Previous Seeds, and
completion history:

| Mode | Persisted name |
| --- | --- |
| Official | Official Daily Run |
| Offline | Offline Daily Run |
| Random | Random5 / Random10 / Random20 / Random30 / Random50 / Random100 |
| Boss Rush Normal | Boss Rush |
| Boss Rush Hard | Boss Rush (H) |
| Text Seed | Custom Run |

The official Daily Run is not renamed to a custom mode. Old Custom 50 Wave and
unversioned Random saves remain loadable through display-name compatibility.

## Completion egg quartet

Completing any Daily mode, including Text Seed, adds exactly four event eggs
for one deterministic species:

1. normal;
2. standard shiny;
3. rare shiny;
4. epic shiny.

The selector first targets a species that is not unlocked as a starter. Once
all starters are unlocked, it targets a species missing a supported shiny
form. A species is never skipped merely because it lacks separate rare or epic
assets; the normal Egg engine safely normalizes unsupported tiers to that
species' supported shiny, so all species can eventually be unlocked.

Every successful completion can award another quartet. Mode variants use
distinct completion identities even when they share the same canonical seed.

## Testing status

The Daily Run modes in 2.0.0 were manually tested only on Android. Automated
coverage verifies seed determinism, history/version compatibility, menu labels,
Random Run lengths, Boss Rush generation and variants, item filtering, shops,
modifier persistence/damage, escape blocking, completion, and egg selection.

Switch, iOS, Windows, macOS, and Linux require additional hands-on validation
of these mode-specific interfaces and long-run behavior.
