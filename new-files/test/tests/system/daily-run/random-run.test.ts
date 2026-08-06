import { DexAttr } from "#enums/dex-attr";
import { SpeciesId } from "#enums/species-id";
import { VariantTier } from "#enums/variant-tier";
import {
  getDailyCompletionEggSpecs,
  selectDailyCompletionRewardSpecies,
} from "#system/daily-run/daily-completion-reward";
import { shouldBlockDailyRunEscape, shouldEnableDailyShop } from "#system/daily-run/daily-run-rules";
import { getDailyRunCompletionKey, getDailyRunDisplayMetadata } from "#system/daily-run/daily-run-types";
import {
  getRandomRunConfig,
  isRandomRunBossWave,
  isRandomRunFinalWave,
  isRandomRunTrainerBossWave,
  isRandomRunTrainerWave,
  normalizeRandomRunWaveCount,
  RANDOM_RUN_WAVE_COUNTS,
} from "#system/daily-run/random-run";
import { describe, expect, it } from "vitest";

describe("Random Run variants", () => {
  it("supports every requested length with a one-shield final boss", () => {
    expect(RANDOM_RUN_WAVE_COUNTS).toEqual([5, 10, 20, 30, 50, 100]);
    for (const waveCount of RANDOM_RUN_WAVE_COUNTS) {
      const config = getRandomRunConfig(waveCount);
      expect(config.displayName).toBe(`Random${waveCount}`);
      expect(config.bossHealthSegments).toBe(2);
      expect(isRandomRunFinalWave(waveCount, waveCount)).toBe(true);
      expect(isRandomRunBossWave(waveCount, waveCount)).toBe(true);
      expect(isRandomRunTrainerWave(waveCount, waveCount)).toBe(false);
      expect(isRandomRunFinalWave(waveCount + 1, waveCount)).toBe(false);
    }
  });

  it("uses wild bosses every ten waves and trainer bosses every twenty before the finale", () => {
    expect(isRandomRunBossWave(10, 100)).toBe(true);
    expect(isRandomRunTrainerBossWave(20, 100)).toBe(true);
    expect(isRandomRunTrainerWave(20, 100)).toBe(true);
    expect(isRandomRunTrainerWave(15, 100)).toBe(true);
    expect(isRandomRunTrainerBossWave(100, 100)).toBe(false);
    expect(isRandomRunTrainerWave(100, 100)).toBe(false);
  });

  it("migrates invalid and unversioned lengths to the historical 50-wave behavior", () => {
    expect(normalizeRandomRunWaveCount(undefined)).toBe(50);
    expect(normalizeRandomRunWaveCount("50")).toBe(50);
    expect(normalizeRandomRunWaveCount(12)).toBe(50);
  });

  it("uses length-specific save/history names and first-clear identities", () => {
    const random10 = {
      mode: "random" as const,
      canonicalSeed: "same",
      randomRunWaveCount: 10 as const,
      algorithmVersion: "SilverShadow-RandomRun-v2",
    };
    const random50 = { ...random10, randomRunWaveCount: 50 as const };
    expect(getDailyRunDisplayMetadata(random10).history).toBe("Random10");
    expect(getDailyRunDisplayMetadata(random50).history).toBe("Random50");
    expect(getDailyRunCompletionKey("same", random10)).not.toBe(getDailyRunCompletionKey("same", random50));
  });

  it("blocks escaping only the finale outside Boss Rush", () => {
    expect(shouldBlockDailyRunEscape(true, false, false)).toBe(false);
    expect(shouldBlockDailyRunEscape(true, false, true)).toBe(true);
    expect(shouldBlockDailyRunEscape(true, true, false)).toBe(true);
    expect(shouldBlockDailyRunEscape(false, true, false)).toBe(true);
    expect(shouldBlockDailyRunEscape(false, false, true)).toBe(false);
  });

  it("restores the standard shop for every Daily-derived run", () => {
    expect(shouldEnableDailyShop(false, true)).toBe(true);
    expect(shouldEnableDailyShop(true, false)).toBe(true);
    expect(shouldEnableDailyShop(false, false)).toBe(false);
  });
});

describe("Daily completion egg quartet", () => {
  const completeShinyAttr =
    DexAttr.NON_SHINY | DexAttr.SHINY | DexAttr.DEFAULT_VARIANT | DexAttr.VARIANT_2 | DexAttr.VARIANT_3;

  it("targets a locked starter before missing shiny variants and avoids already queued targets", () => {
    const states = [
      { speciesId: SpeciesId.BULBASAUR, caughtAttr: 0n, hasVariants: true },
      { speciesId: SpeciesId.CHARMANDER, caughtAttr: 0n, hasVariants: true },
      { speciesId: SpeciesId.SQUIRTLE, caughtAttr: DexAttr.NON_SHINY, hasVariants: true },
    ];
    const queued = new Set([SpeciesId.BULBASAUR]);
    expect(selectDailyCompletionRewardSpecies(states, "seed", queued)).toBe(SpeciesId.CHARMANDER);
    expect(selectDailyCompletionRewardSpecies(states, "seed", queued)).toBe(SpeciesId.CHARMANDER);
  });

  it("falls back to a species missing a supported shiny after all starters are unlocked", () => {
    const states = [
      { speciesId: SpeciesId.BULBASAUR, caughtAttr: completeShinyAttr, hasVariants: true },
      {
        speciesId: SpeciesId.CHARMANDER,
        caughtAttr: DexAttr.NON_SHINY | DexAttr.SHINY | DexAttr.DEFAULT_VARIANT,
        hasVariants: true,
      },
    ];
    expect(selectDailyCompletionRewardSpecies(states, "seed")).toBe(SpeciesId.CHARMANDER);
  });

  it("does not choose a no-variant species while a full shiny quartet is supported", () => {
    const states = [
      { speciesId: SpeciesId.VANILLITE, caughtAttr: 0n, hasVariants: false },
      { speciesId: SpeciesId.BULBASAUR, caughtAttr: 0n, hasVariants: true },
    ];
    expect(selectDailyCompletionRewardSpecies(states, "variant-safe-seed")).toBe(SpeciesId.BULBASAUR);
  });

  it("creates normal, common-shiny, rare-shiny, and epic-shiny eggs for one species", () => {
    expect(getDailyCompletionEggSpecs(SpeciesId.BULBASAUR)).toEqual([
      { species: SpeciesId.BULBASAUR, isShiny: false, variantTier: VariantTier.STANDARD },
      { species: SpeciesId.BULBASAUR, isShiny: true, variantTier: VariantTier.STANDARD },
      { species: SpeciesId.BULBASAUR, isShiny: true, variantTier: VariantTier.RARE },
      { species: SpeciesId.BULBASAUR, isShiny: true, variantTier: VariantTier.EPIC },
    ]);
  });
});
