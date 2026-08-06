# Boss Rush manual validation

Use a clean save slot and keep the generated seed visible for replay checks.

## Normal

1. Open **Daily Run**. Confirm **Boss Rush** is above **Custom Run**, select it, and confirm the Normal/Hard screen appears.
2. Select **Normal**. Confirm the save and resume labels say **Boss Rush** and the party contains exactly three level-100 Pokemon.
3. Win bosses 1-9. After each boss, confirm there are five free Great-or-better rewards and a separate five-item purchasable shop.
4. Confirm neither row contains balls, lures, maps, an IV scanner, recovery items, encounter-only items, or items that cannot affect the party.
5. Damage, faint, consume PP, and inflict a major status before winning. Confirm HP, fainting, PP, and major status are fully restored before the next boss.
6. Give a type-boosting held item to a specific Pokemon. Confirm its party display/owner, save and resume, then use matching and nonmatching move types in the next boss. The development console reports modifier ID, Pokemon ID, and stack count at boss creation.
7. Select **Run**. Confirm the mysterious-force message appears, the boss does not act, no resource changes, and command selection returns.
8. Win boss 10. Confirm there is no reward/shop phase or boss 11, the active save is cleaned up, and run history and Previous Seeds say **Boss Rush**.

## Hard

1. Replay the flow and select **Hard**. Confirm save and resume labels say **Boss Rush (H)**.
2. Win bosses 1-9 after taking damage, losing a party member, consuming PP, and receiving a major status. Confirm all four states carry into the next boss while temporary encounter effects clear.
3. Confirm five free Great-or-better rewards and five separate shop items appear. Balls, lures, maps, IV scanning, and encounter-only items must remain absent.
4. Confirm strong recovery such as Max Potion, Full Restore, Max Revive, Max Ether, or Max Elixir can appear when it can affect the party; Potion, Super Potion, Ether, Elixir, and Revive must not be used as level-100 shop filler.
5. Buy an item and confirm normal pricing, money deduction, target selection, and application. Reroll and replay the seed to verify deterministic choices.
6. Repeat the held-item and Run checks from Normal.
7. Win boss 10. Confirm there is no reward/shop phase or boss 11 and history/Previous Seeds say **Boss Rush (H)**.

## Compatibility

1. Replay an existing unversioned Previous Seeds entry. It must load safely; legacy Boss Rush entries are interpreted as v1 Normal.
2. Replay saved Normal and Hard entries with the same canonical seed. Each must retain its variant and manifest and must not collide.
3. Replay an older generator-version entry after a newer generator is installed. Confirm the recorded generator or stored manifest is used.
4. Confirm the official Daily Run still says **Daily Run** and an existing Custom 50 Wave save remains accessible under the display name **Custom Run**.

## Daily completion eggs

1. Complete any Official, Offline, Custom, Random, or Boss Rush Daily mode for the first time.
2. Confirm exactly four event eggs are added for one starter species: non-shiny, standard shiny, rare shiny, and epic shiny.
3. With locked starters remaining, confirm the target species is locked and a different unqueued locked species is preferred.
4. With every starter unlocked, confirm the target is a species missing at least one game-supported shiny tier.
5. Complete two variants that share a canonical seed and confirm their first-clear records do not collide.

## Random Run variants

1. Select **Random Run** and confirm 5, 10, 20, 30, 50, and 100-wave options appear.
2. Confirm saves, resume, Previous Seeds, and completion history use **Random5**, **Random10**, **Random20**, **Random30**, **Random50**, or **Random100**.
3. Confirm the selected final wave ends the run and is a one-shield boss using the naturally generated wave species.
4. On longer runs, confirm bosses appear every ten waves, X5 trainers remain, and every second intermediate boss is a trainer boss.
5. Confirm an old unversioned Random entry still replays as the original 50-wave variant under the **Random50** name.
