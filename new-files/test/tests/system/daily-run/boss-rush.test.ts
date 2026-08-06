import { speciesDataRegistry } from "#app/global-species-data-registry";
import { ModifierTier } from "#enums/modifier-tier";
import { SpeciesFormKey } from "#enums/species-form-key";
import {
  BOSS_RUSH_CONFIG,
  canStillEvolve,
  generateBossRushManifest,
  getBossRushLegalMovePool,
  getBossRushRewardSettings,
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
import { canonicalSeedFromText } from "#system/daily-run/daily-run-seed-utils";
import {
  clearDailyRunMetadata,
  getCurrentDailyRunMetadata,
  restoreDailyRunMetadata,
} from "#system/daily-run/daily-run-types";
import { GameManager } from "#test/framework/game-manager";
import { MockContainer } from "#test/mocks/mocks-container/mock-container";
import { beforeAll, describe, expect, it } from "vitest";

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

  it("generates three strong level-100 eligible starters with legal moves", () => {
    for (let sample = 0; sample < 32; sample++) {
      const manifest = generateBossRushManifest(canonicalSeedFromText(`boss-rush-starters-${sample}`));
      expect(manifest.starters).toHaveLength(BOSS_RUSH_CONFIG.startingPartySize);
      expect(new Set(manifest.starters.map(starter => starter.speciesId)).size).toBe(
        BOSS_RUSH_CONFIG.startingPartySize,
      );
      for (const starter of manifest.starters) {
        const species = speciesDataRegistry.getSpecies(starter.speciesId);
        const form = species.forms[starter.formIndex];
        expect((form ?? species).baseTotal).toBeGreaterThanOrEqual(BOSS_RUSH_CONFIG.minimumStarterBaseTotal);
        expect(
          isFinalEvolution(species)
            || isSingleStage(species)
            || isLegendary(species)
            || isMythical(species)
            || isParadox(species)
            || isSafeBossRushTransformation(form),
        ).toBe(true);
        expect(starter.ivs).toEqual(new Array(6).fill(BOSS_RUSH_CONFIG.highIvs));
        expect(starter.moveset.length).toBeGreaterThanOrEqual(2);
        const legalMoves = getBossRushLegalMovePool(starter.speciesId, starter.formIndex);
        for (const move of starter.moveset) {
          expect(legalMoves).toContain(move);
          expect(isBossRushWeakFillerMove(move, legalMoves)).toBe(false);
        }
      }
    }
    expect(BOSS_RUSH_CONFIG.startingLevel).toBe(100);
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
    expect(BOSS_RUSH_CONFIG.healBetweenBosses).toBe(true);
  });

  it("makes boss ten stronger and offers exactly five Rare-equivalent-or-better rewards", () => {
    const manifest = generateBossRushManifest(canonicalSeedFromText("boss-rush-final"));
    const bossNine = manifest.bosses[8];
    const finalBoss = manifest.bosses[9];
    expect(finalBoss.finalBoss).toBe(true);
    expect(finalBoss.shieldBreakpoints).toBe(bossNine.shieldBreakpoints + BOSS_RUSH_CONFIG.finalBossShieldBonus);
    expect(finalBoss.enemyModifierCount).toBeGreaterThan(bossNine.enemyModifierCount);
    const rewardSettings = getBossRushRewardSettings();
    expect(rewardSettings.guaranteedModifierTiers).toHaveLength(BOSS_RUSH_CONFIG.rewardOptionCount);
    expect(rewardSettings.guaranteedModifierTiers?.every(tier => tier >= ModifierTier.ULTRA)).toBe(true);
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
