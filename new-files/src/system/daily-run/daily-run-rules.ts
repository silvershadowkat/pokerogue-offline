import { globalScene } from "#app/global-scene";
import { IS_TEST, isDev } from "#constants/app-constants";
import { BOSS_RUSH_CONFIG, isBossRushMode } from "./boss-rush";

/**
 * Daily-derived runs may not escape their final encounter. Boss Rush is
 * stricter: every encounter is a boss, so none of its battles are escapable.
 */
export function shouldBlockDailyRunEscape(isDaily: boolean, isBossRush: boolean, isFinalWave: boolean): boolean {
  return isBossRush || (isDaily && isFinalWave);
}

/**
 * One authoritative paid-shop decision. Stock modes keep their native status;
 * Boss Rush alone opts into a shop on its non-final reward screens.
 */
export function shouldEnablePaidShop(
  nativeShopEnabled: boolean,
  bossRush: boolean,
  waveIndex: number,
  bossCount = BOSS_RUSH_CONFIG.bossCount,
): boolean {
  return bossRush ? waveIndex > 0 && waveIndex < bossCount : nativeShopEnabled;
}

export function isPaidShopEnabled(waveIndex = globalScene.currentBattle?.waveIndex ?? 0): boolean {
  return shouldEnablePaidShop(globalScene.gameMode?.getShopStatus() ?? false, isBossRushMode(), waveIndex);
}

/** Claim All adds a fifth argument and the stable paid-shop handoff adds a sixth. */
export function isModifierSelectUiArgumentCountSupported(argumentCount: number): boolean {
  return argumentCount >= 4 && argumentCount <= 6;
}

export function logPostBattleTransition(
  stage: string,
  details: Record<string, boolean | number | string | undefined>,
  error = false,
): void {
  if (!isDev || IS_TEST) {
    return;
  }
  const payload = {
    stage,
    mode: globalScene.gameMode?.modeId,
    bossRush: isBossRushMode(),
    wave: globalScene.currentBattle?.waveIndex,
    ...details,
  };
  if (error) {
    console.error("Post-battle modifier transition failed", payload);
  } else {
    console.info("Post-battle modifier transition", payload);
  }
}

/** Shared guard for both the Run command and enemy-forcing phazing moves. */
export function isDailyRunEscapeBlocked(waveIndex = globalScene.currentBattle?.waveIndex ?? 0): boolean {
  return shouldBlockDailyRunEscape(
    globalScene.gameMode?.isDaily ?? false,
    isBossRushMode(),
    globalScene.gameMode?.isWaveFinal(waveIndex) ?? false,
  );
}
