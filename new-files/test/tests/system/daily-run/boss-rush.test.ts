import { speciesDataRegistry } from "#app/global-species-data-registry";
import { AbilityId } from "#enums/ability-id";
import { ModifierTier } from "#enums/modifier-tier";
import { MoveId } from "#enums/move-id";
import { PokemonType } from "#enums/pokemon-type";
import { SpeciesFormKey } from "#enums/species-form-key";
import { SpeciesId } from "#enums/species-id";
import { AttackTypeBoosterModifier } from "#modifiers/modifier";
import { getModifierTypeFuncById, ModifierType } from "#modifiers/modifier-type";
import { CommandPhase } from "#phases/command-phase";
import {
  BOSS_RUSH_CONFIG,
  BOSS_RUSH_V1_ALGORITHM_VERSION,
  BossRushVariant,
  canStillEvolve,
  generateBossRushManifest,
  getBossRushLegalMovePool,
  getBossRushRewardSettings,
  getBossRushVariantConfig,
  isBossRushStarterEligible,
  isBossRushWeakFillerMove,
  isFinalEvolution,
  isGigantamaxForm,
  isLegendary,
  isMegaForm,
  isMythical,
  isParadox,
  isPrimalForm,
  isSafeBossRushTransformation,
  isSingleStage,
} from "#system/daily-run/boss-rush";
import { isBossRushModifierTypeUseful } from "#system/daily-run/boss-rush-items";
import { canonicalSeedFromText } from "#system/daily-run/daily-run-seed-utils";
import {
  clearDailyRunMetadata,
  getCurrentDailyRunMetadata,
  restoreDailyRunMetadata,
} from "#system/daily-run/daily-run-types";
import { GameManager } from "#test/framework/game-manager";
import { MockContainer } from "#test/mocks/mocks-container/mock-container";
import { NumberHolder } from "#utils/common";
import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Boss Rush generation", () => {
  beforeAll(() => {
    // The offline Update Available screen uses a geometry mask that the shared
    // headless Container mock does not yet implement.
    Object.assign(MockContainer.prototype, {
      createGeometryMask() {
        return this;
      },
    });
    const phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
    new GameManager(phaserGame);
  });

  it("is deterministic for the same seed and varies for another seed", () => {
    const seed = canonicalSeedFromText("boss-rush-determinism");
    expect(generateBossRushManifest(seed)).toEqual(generateBossRushManifest(seed));
    expect(generateBossRushManifest(seed)).not.toEqual(
      generateBossRushManifest(canonicalSeedFromText("boss-rush-determinism-other")),
    );
  });

  it("generates three level-100 eligible starters without a BST floor and with legal moves", () => {
    let sawBelow450 = false;
    for (let sample = 0; sample < 256; sample++) {
      const manifest = generateBossRushManifest(canonicalSeedFromText(`boss-rush-starters-${sample}`));
      expect(manifest.starters).toHaveLength(BOSS_RUSH_CONFIG.startingPartySize);
      expect(new Set(manifest.starters.map(starter => starter.speciesId)).size).toBe(
        BOSS_RUSH_CONFIG.startingPartySize,
      );
      for (const starter of manifest.starters) {
        const species = speciesDataRegistry.getSpecies(starter.speciesId);
        const form = species.forms[starter.formIndex];
        sawBelow450 ||= (form ?? species).baseTotal < 450;
        expect(
          isFinalEvolution(species)
            || isSingleStage(species)
            || isLegendary(species)
            || isMythical(species)
            || isParadox(species)
            || isSafeBossRushTransformation(form),
        ).toBe(true);
        expect(starter.ivs).toEqual(new Array(6).fill(BOSS_RUSH_CONFIG.highIvs));
        expect(starter.moveset.length).toBeGreaterThanOrEqual(1);
        const legalMoves = getBossRushLegalMovePool(starter.speciesId, starter.formIndex);
        for (const move of starter.moveset) {
          expect(legalMoves).toContain(move);
          expect(isBossRushWeakFillerMove(move, legalMoves)).toBe(false);
        }
      }
    }
    expect(sawBelow450).toBe(true);
    expect(BOSS_RUSH_CONFIG.startingLevel).toBe(100);
  });

  it.each([
    [SpeciesId.DITTO, MoveId.TRANSFORM],
    [SpeciesId.SMEARGLE, MoveId.SKETCH],
    [SpeciesId.SHEDINJA, undefined],
    [SpeciesId.UNOWN, MoveId.HIDDEN_POWER],
  ])("supports unusual starter %s with native game data", (speciesId, requiredMove) => {
    expect(isBossRushStarterEligible(speciesId)).toBe(true);
    const legal = getBossRushLegalMovePool(speciesId, 0);
    expect(legal.length).toBeGreaterThan(0);
    if (requiredMove != null) {
      expect(legal).toContain(requiredMove);
    }
  });

  it("keeps Shedinja's native one-HP stat and Wonder Guard ability data", () => {
    const shedinja = speciesDataRegistry.getSpecies(SpeciesId.SHEDINJA);
    const form = shedinja.forms[0] ?? shedinja;
    expect(form.baseStats[0]).toBe(1);
    expect([0, 1, 2].map(index => form.getAbility(index))).toContain(AbilityId.WONDER_GUARD);
  });

  it("obeys all ten boss pools, duplicate, shield, level, and modifier rules", () => {
    const highCategories = new Set(["mega", "primal", "gigantamax", "legendary", "mythical", "paradox"]);
    for (let sample = 0; sample < 32; sample++) {
      const manifest = generateBossRushManifest(canonicalSeedFromText(`boss-rush-bosses-${sample}`));
      expect(manifest.bosses).toHaveLength(BOSS_RUSH_CONFIG.bossCount);
      expect(new Set(manifest.bosses.map(boss => boss.speciesId)).size).toBe(BOSS_RUSH_CONFIG.bossCount);
      expect(new Set([...manifest.starters, ...manifest.bosses].map(config => config.speciesId)).size).toBe(
        BOSS_RUSH_CONFIG.startingPartySize + BOSS_RUSH_CONFIG.bossCount,
      );
      manifest.bosses.forEach((boss, index) => {
        const species = speciesDataRegistry.getSpecies(boss.speciesId);
        if (index < 3) {
          expect(canStillEvolve(species) || isSingleStage(species)).toBe(true);
          expect(isLegendary(species) || isMythical(species) || isParadox(species)).toBe(false);
        } else if (index < 6) {
          expect(isFinalEvolution(species) || isSingleStage(species)).toBe(true);
          expect(isLegendary(species) || isMythical(species) || isParadox(species)).toBe(false);
          if (isSingleStage(species)) {
            expect(species.baseTotal).toBeGreaterThanOrEqual(BOSS_RUSH_CONFIG.minimumMiddleSingleStageBaseTotal);
          }
        } else {
          expect(highCategories.has(boss.category)).toBe(true);
          expect((species.forms[boss.formIndex] ?? species).baseTotal).toBeGreaterThanOrEqual(
            BOSS_RUSH_CONFIG.minimumHighBossBaseTotal,
          );
        }
        expect(boss.shieldBreakpoints).toBe(BOSS_RUSH_CONFIG.shieldBreakpoints[index]);
        expect(boss.healthSegments).toBe(boss.shieldBreakpoints + 1);
        expect(boss.enemyModifierCount).toBe(BOSS_RUSH_CONFIG.enemyModifierCounts[index]);
        const legalMoves = getBossRushLegalMovePool(boss.speciesId, boss.formIndex);
        expect(boss.moveset.every(move => legalMoves.includes(move))).toBe(true);
      });
    }
    expect(BOSS_RUSH_CONFIG.bossLevel).toBe(100);
    expect(BOSS_RUSH_CONFIG.bossesCatchable).toBe(false);
    expect(getBossRushVariantConfig(BossRushVariant.NORMAL).healBetweenBosses).toBe(true);
    expect(getBossRushVariantConfig(BossRushVariant.HARD).healBetweenBosses).toBe(false);
  });

  it("keeps boss ten shields and offers exactly five Great-or-better rewards", () => {
    const manifest = generateBossRushManifest(canonicalSeedFromText("boss-rush-final"));
    const bossNine = manifest.bosses[8];
    const finalBoss = manifest.bosses[9];
    expect(finalBoss.finalBoss).toBe(true);
    expect(finalBoss.shieldBreakpoints).toBe(bossNine.shieldBreakpoints + BOSS_RUSH_CONFIG.finalBossShieldBonus);
    expect(finalBoss.enemyModifierCount).toBeGreaterThan(bossNine.enemyModifierCount);
    const rewardSettings = getBossRushRewardSettings();
    expect(rewardSettings.guaranteedModifierTiers).toHaveLength(BOSS_RUSH_CONFIG.rewardOptionCount);
    expect(rewardSettings.guaranteedModifierTiers?.every(tier => tier >= ModifierTier.GREAT)).toBe(true);
  });

  it("keeps v1 content stable after v2 and namespaces Normal and Hard", () => {
    const seed = canonicalSeedFromText("boss-rush-generator-version");
    const v1 = generateBossRushManifest(seed, BossRushVariant.NORMAL, BOSS_RUSH_V1_ALGORITHM_VERSION);
    expect(generateBossRushManifest(seed, BossRushVariant.NORMAL, BOSS_RUSH_V1_ALGORITHM_VERSION)).toEqual(v1);
    expect(generateBossRushManifest(seed, BossRushVariant.NORMAL)).not.toEqual(v1);
    expect(generateBossRushManifest(seed, BossRushVariant.NORMAL)).not.toEqual(
      generateBossRushManifest(seed, BossRushVariant.HARD),
    );
  });

  it("applies a 20 percent type boost only to its owner and matching move type", () => {
    const type = new ModifierType("test", "test", null);
    const modifier = new AttackTypeBoosterModifier(type, 7, PokemonType.FIGHTING, 20);
    const owner = { id: 7 } as never;
    const other = { id: 8 } as never;
    const matchingPower = new NumberHolder(100);
    expect(modifier.shouldApply(owner, PokemonType.FIGHTING, matchingPower)).toBe(true);
    expect(modifier.apply(owner, PokemonType.FIGHTING, matchingPower)).toBe(true);
    expect(matchingPower.value).toBe(120);
    expect(modifier.shouldApply(owner, PokemonType.FIRE, new NumberHolder(100))).toBe(false);
    expect(modifier.shouldApply(other, PokemonType.FIGHTING, new NumberHolder(100))).toBe(false);
    expect(modifier.getArgs()).toEqual([7, PokemonType.FIGHTING, 20]);
  });

  it("filters recovery by variant and rejects catching and encounter items in both", () => {
    const party = [
      {
        hp: 50,
        status: undefined,
        isFullHp: () => false,
        isFainted: () => false,
        getTag: () => undefined,
        getMoveset: () => [{ ppUsed: 5 }],
      },
    ] as never;
    const item = (id: string) => {
      const type = getModifierTypeFuncById(id)();
      type.id = id;
      type.setTier(ModifierTier.GREAT);
      return type;
    };
    expect(isBossRushModifierTypeUseful(item("MAX_POTION"), party, BossRushVariant.NORMAL)).toBe(false);
    expect(isBossRushModifierTypeUseful(item("MAX_POTION"), party, BossRushVariant.HARD)).toBe(true);
    expect(isBossRushModifierTypeUseful(item("POTION"), party, BossRushVariant.HARD)).toBe(false);
    for (const id of ["ULTRA_BALL", "LURE", "MAP", "IV_SCANNER"]) {
      expect(isBossRushModifierTypeUseful(item(id), party, BossRushVariant.NORMAL)).toBe(false);
      expect(isBossRushModifierTypeUseful(item(id), party, BossRushVariant.HARD)).toBe(false);
    }
  });

  it("rejects Run through the no-turn-cost message path", () => {
    const seed = canonicalSeedFromText("boss-rush-no-run");
    restoreDailyRunMetadata({ mode: "boss-rush", canonicalSeed: seed, bossRushVariant: BossRushVariant.HARD });
    const phase = new CommandPhase(0) as unknown as {
      handleRunCommand: () => boolean;
      queueShowText: (key: string) => void;
      tryLeaveField: () => boolean;
    };
    const message = vi.spyOn(phase, "queueShowText").mockImplementation(() => undefined);
    const leave = vi.spyOn(phase, "tryLeaveField");
    expect(phase.handleRunCommand()).toBe(false);
    expect(message).toHaveBeenCalledWith("battle:shadowBossRushNoRun");
    expect(leave).not.toHaveBeenCalled();
    clearDailyRunMetadata();
  });

  it("only treats persistent real Mega, Primal, and Gigantamax forms as safe transformations", () => {
    for (const species of speciesDataRegistry.getAllSpecies()) {
      for (const form of species.forms) {
        if (isSafeBossRushTransformation(form)) {
          expect(isMegaForm(form) || isPrimalForm(form) || isGigantamaxForm(form)).toBe(true);
          expect(form.isUnobtainable).toBe(false);
          expect(form.formKey).not.toBe(SpeciesFormKey.ETERNAMAX);
        }
      }
    }
  });

  it("preserves and defensively clones the complete manifest across resume metadata", () => {
    const seed = canonicalSeedFromText("boss-rush-resume");
    const manifest = generateBossRushManifest(seed);
    restoreDailyRunMetadata({ mode: "boss-rush", canonicalSeed: seed, bossRushManifest: manifest });
    const restored = getCurrentDailyRunMetadata();
    expect(restored?.bossRushManifest).toEqual(manifest);
    restored!.bossRushManifest!.starters[0].ivs[0] = 0;
    expect(getCurrentDailyRunMetadata()?.bossRushManifest?.starters[0].ivs[0]).toBe(BOSS_RUSH_CONFIG.highIvs);
    clearDailyRunMetadata();
  });
});
