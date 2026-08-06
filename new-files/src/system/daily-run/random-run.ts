import { getCurrentDailyRunMetadata } from "./daily-run-types";

export const RANDOM_RUN_ALGORITHM_VERSION = "SilverShadow-RandomRun-v2";
export const LEGACY_RANDOM_50_ALGORITHM_VERSION = "SilverShadow-Random50-v1";
export const RANDOM_RUN_WAVE_COUNTS = [5, 10, 20, 30, 50, 100] as const;
export type RandomRunWaveCount = (typeof RANDOM_RUN_WAVE_COUNTS)[number];

export interface RandomRunConfig {
  waveCount: RandomRunWaveCount;
  displayName: `Random${RandomRunWaveCount}`;
  generatorVersion: typeof RANDOM_RUN_ALGORITHM_VERSION;
  bossHealthSegments: 2;
}

export function normalizeRandomRunWaveCount(value: unknown): RandomRunWaveCount {
  const numeric = typeof value === "string" ? Number(value) : value;
  return RANDOM_RUN_WAVE_COUNTS.includes(numeric as RandomRunWaveCount) ? (numeric as RandomRunWaveCount) : 50;
}

export function getRandomRunWaveCount(): RandomRunWaveCount {
  const metadata = getCurrentDailyRunMetadata();
  if (metadata?.mode !== "random") {
    return 50;
  }
  return normalizeRandomRunWaveCount(
    metadata.randomRunWaveCount
      ?? metadata.seededRunCompatibility?.settings?.waveCount
      ?? metadata.seededRunCompatibility?.variant,
  );
}

export function getRandomRunConfig(waveCount = getRandomRunWaveCount()): RandomRunConfig {
  return {
    waveCount,
    displayName: `Random${waveCount}`,
    generatorVersion: RANDOM_RUN_ALGORITHM_VERSION,
    bossHealthSegments: 2,
  };
}

export function isRandomRunMode(): boolean {
  return getCurrentDailyRunMetadata()?.mode === "random";
}

export function isRandomRunFinalWave(waveIndex: number, waveCount = getRandomRunWaveCount()): boolean {
  return waveIndex === waveCount;
}

/** Wild bosses appear every ten waves and the final wave is always a one-shield boss. */
export function isRandomRunBossWave(waveIndex: number, waveCount = getRandomRunWaveCount()): boolean {
  return isRandomRunFinalWave(waveIndex, waveCount) || waveIndex % 10 === 0;
}

/** Keep Daily-style trainers at X5 and use every second intermediate boss as a trainer boss. */
export function isRandomRunTrainerWave(waveIndex: number, waveCount = getRandomRunWaveCount()): boolean {
  if (isRandomRunFinalWave(waveIndex, waveCount)) {
    return false;
  }
  return waveIndex % 10 === 5 || waveIndex % 20 === 0;
}

export function isRandomRunTrainerBossWave(waveIndex: number, waveCount = getRandomRunWaveCount()): boolean {
  return !isRandomRunFinalWave(waveIndex, waveCount) && waveIndex % 20 === 0;
}
