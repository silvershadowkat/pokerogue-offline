import { globalScene } from "#app/global-scene";
import { isBossRushMode } from "./boss-rush";

/**
 * Daily-derived runs may not escape their final encounter. Boss Rush is
 * stricter: every encounter is a boss, so none of its battles are escapable.
 */
export function shouldBlockDailyRunEscape(isDaily: boolean, isBossRush: boolean, isFinalWave: boolean): boolean {
  return isBossRush || (isDaily && isFinalWave);
}

/** Daily modes intentionally reuse the normal between-wave shop. */
export function shouldEnableDailyShop(baseShopEnabled: boolean, isDaily: boolean): boolean {
  return baseShopEnabled || isDaily;
}

/** Shared guard for both the Run command and enemy-forcing phazing moves. */
export function isDailyRunEscapeBlocked(waveIndex = globalScene.currentBattle?.waveIndex ?? 0): boolean {
  return shouldBlockDailyRunEscape(
    globalScene.gameMode?.isDaily ?? false,
    isBossRushMode(),
    globalScene.gameMode?.isWaveFinal(waveIndex) ?? false,
  );
}
