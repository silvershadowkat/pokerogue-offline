#!/usr/bin/env node

/** Install variable-length Random Runs and shared Daily completion eggs. */

const fs = require("fs");
const path = require("path");

const repositoryRoot = path.join(__dirname, "..", "..", "..");
const gameRoot = "pokerogue-src";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) fail(`Could not find ${filePath}`);
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function write(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
  console.log(`Written: ${filePath}`);
}

function replaceRequired(source, anchor, replacement, label) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) fail(`Expected one ${label}, found ${count}.`);
  return source.replace(anchor, replacement);
}

function copyShared(relativePath, targetPath = relativePath) {
  const sourcePath = path.join(repositoryRoot, "new-files", relativePath);
  const destinationPath = path.join(gameRoot, targetPath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  console.log(`Written: ${destinationPath}`);
}

copyShared(path.join("src", "system", "daily-run", "random-run.ts"));
copyShared(path.join("src", "system", "daily-run", "daily-completion-reward.ts"));
copyShared(path.join("test", "tests", "system", "daily-run", "random-run.test.ts"));

const gameModePath = path.join(gameRoot, "src", "game-mode.ts");
let gameMode = read(gameModePath);
if (!gameMode.includes("isRandomRunBossWave")) {
  gameMode = replaceRequired(
    gameMode,
    '} from "#system/daily-run/boss-rush";',
    `} from "#system/daily-run/boss-rush";
import {
  getRandomRunWaveCount,
  isRandomRunBossWave,
  isRandomRunMode,
  isRandomRunTrainerBossWave,
  isRandomRunTrainerWave,
} from "#system/daily-run/random-run";
`,
    "Random Run GameMode imports",
  );
  gameMode = replaceRequired(
    gameMode,
    `    if (isBossRushMode()) {
      return false;
    }
    const { arena, offsetGym } = globalScene;`,
    `    if (isBossRushMode()) {
      return false;
    }
    if (isRandomRunMode()) {
      return isRandomRunTrainerWave(waveIndex);
    }
    const { arena, offsetGym } = globalScene;`,
    "Random Run trainer cadence",
  );
  gameMode = replaceRequired(
    gameMode,
    `    if (isBossRushMode()) {
      return false;
    }
    switch (this.modeId) {`,
    `    if (isBossRushMode()) {
      return false;
    }
    if (isRandomRunMode()) {
      return isRandomRunTrainerBossWave(waveIndex);
    }
    switch (this.modeId) {`,
    "Random Run trainer boss cadence",
  );
  gameMode = replaceRequired(
    gameMode,
    `    if (this.isDaily && this.isWaveFinal(waveIndex)) {`,
    `    if (this.isDaily && this.isWaveFinal(waveIndex) && !isRandomRunMode()) {`,
    "Random Run natural final species",
  );
  gameMode = replaceRequired(
    gameMode,
    `      case GameModes.DAILY:
        return waveIndex === (isBossRushMode() ? BOSS_RUSH_CONFIG.bossCount : 50);`,
    `      case GameModes.DAILY:
        return waveIndex === (isBossRushMode()
          ? BOSS_RUSH_CONFIG.bossCount
          : isRandomRunMode()
            ? getRandomRunWaveCount()
            : 50);`,
    "Random Run final wave",
  );
  gameMode = replaceRequired(
    gameMode,
    `  isBoss(waveIndex: number): boolean {
    return isBossRushMode() || waveIndex % 10 === 0;
  }`,
    `  isBoss(waveIndex: number): boolean {
    return isBossRushMode() || (isRandomRunMode() ? isRandomRunBossWave(waveIndex) : waveIndex % 10 === 0);
  }`,
    "Random Run boss cadence",
  );
  write(gameModePath, gameMode);
}

const battleScenePath = path.join(gameRoot, "src", "battle-scene.ts");
let battleScene = read(battleScenePath);
if (!battleScene.includes("getRandomRunConfig")) {
  battleScene = replaceRequired(
    battleScene,
    'import { getBossRushBossConfig, isBossRushMode } from "#system/daily-run/boss-rush";',
    `import { getBossRushBossConfig, isBossRushMode } from "#system/daily-run/boss-rush";
import { getRandomRunConfig, isRandomRunBossWave, isRandomRunMode } from "#system/daily-run/random-run";`,
    "Random Run BattleScene imports",
  );
  battleScene = replaceRequired(
    battleScene,
    `    if (isBossRushMode()) {
      return getBossRushBossConfig(waveIndex)?.healthSegments ?? 2;
    }
    if (activeOverrides.ENEMY_HEALTH_SEGMENTS_OVERRIDE > 1) {`,
    `    if (isBossRushMode()) {
      return getBossRushBossConfig(waveIndex)?.healthSegments ?? 2;
    }
    if (isRandomRunMode() && isRandomRunBossWave(waveIndex)) {
      return getRandomRunConfig().bossHealthSegments;
    }
    if (activeOverrides.ENEMY_HEALTH_SEGMENTS_OVERRIDE > 1) {`,
    "Random Run one-shield bosses",
  );
  write(battleScenePath, battleScene);
}

const dailySeedUtilsPath = path.join(gameRoot, "src", "data", "daily-seed", "daily-seed-utils.ts");
let dailySeedUtils = read(dailySeedUtilsPath);
if (!dailySeedUtils.includes("isRandomRunMode")) {
  dailySeedUtils = replaceRequired(
    dailySeedUtils,
    'import { getEnumValues } from "#utils/enums";',
    `import { getEnumValues } from "#utils/enums";
import { isRandomRunMode } from "#system/daily-run/random-run";`,
    "Random Run Daily helper import",
  );
  dailySeedUtils = replaceRequired(
    dailySeedUtils,
    `  return globalScene.gameMode.isDaily && globalScene.gameMode.isWaveFinal(wave);`,
    `  return globalScene.gameMode.isDaily && !isRandomRunMode() && globalScene.gameMode.isWaveFinal(wave);`,
    "Random Run normal final-level behavior",
  );
  write(dailySeedUtilsPath, dailySeedUtils);
}

const abilityAttrsPath = path.join(gameRoot, "src", "data", "abilities", "ab-attrs.ts");
let abilityAttrs = read(abilityAttrsPath);
if (!abilityAttrs.includes("isDailyRunEscapeBlocked")) {
  abilityAttrs = replaceRequired(
    abilityAttrs,
    'import { BerryModifierType } from "#modifiers/modifier-type";',
    `import { BerryModifierType } from "#modifiers/modifier-type";
import { isDailyRunEscapeBlocked } from "#system/daily-run/daily-run-rules";`,
    "Daily final-boss phazing import",
  );
  abilityAttrs = replaceRequired(
    abilityAttrs,
    `      if (!globalScene.currentBattle.waveIndex || globalScene.currentBattle.waveIndex % 10 === 0) {`,
    `      if (
        isDailyRunEscapeBlocked()
        || !globalScene.currentBattle.waveIndex
        || globalScene.currentBattle.waveIndex % 10 === 0
      ) {`,
    "Daily final-boss forced flee guard",
  );
  abilityAttrs = replaceRequired(
    abilityAttrs,
    `    if (
      !player
      && globalScene.currentBattle.battleType === BattleType.WILD
      && !globalScene.currentBattle.waveIndex
      && globalScene.currentBattle.waveIndex % 10 === 0
    ) {
      return false;
    }`,
    `    if (
      !player
      && globalScene.currentBattle.battleType === BattleType.WILD
      && isDailyRunEscapeBlocked()
    ) {
      return false;
    }`,
    "Daily final-boss forced switch condition",
  );
  write(abilityAttrsPath, abilityAttrs);
}

const gameDataPath = path.join(gameRoot, "src", "system", "game-data.ts");
let gameData = read(gameDataPath);
if (!gameData.includes("getDailyRunCompletionKey")) {
  gameData = replaceRequired(
    gameData,
    `  getCurrentDailyRunMetadata,
  restoreDailyRunMetadata,`,
    `  getCurrentDailyRunMetadata,
  getDailyRunCompletionKey,
  restoreDailyRunMetadata,`,
    "Daily completion identity import",
  );
  gameData = replaceRequired(
    gameData,
    `    const prevDailies = localStorage.getItem("daily");`,
    `    const completionKey = getDailyRunCompletionKey(seed, getCurrentDailyRunMetadata());
    const prevDailies = localStorage.getItem("daily");`,
    "Daily completion identity",
  );
  gameData = replaceRequired(
    gameData,
    `      localStorage.setItem("daily", btoa(JSON.stringify([seed])));`,
    `      localStorage.setItem("daily", btoa(JSON.stringify([completionKey])));`,
    "first Daily completion identity",
  );
  gameData = replaceRequired(
    gameData,
    `    if (clearedDailies.includes(seed)) {`,
    `    if (clearedDailies.includes(completionKey)) {`,
    "Daily completion lookup",
  );
  gameData = replaceRequired(
    gameData,
    `    clearedDailies.push(seed);`,
    `    clearedDailies.push(completionKey);`,
    "Daily completion storage",
  );
  write(gameDataPath, gameData);
}

const gameOverPath = path.join(gameRoot, "src", "phases", "game-over-phase.ts");
let gameOver = read(gameOverPath);
if (!gameOver.includes("awardDailyCompletionEggQuartet")) {
  gameOver = replaceRequired(
    gameOver,
    'import { getCurrentDailyRunMetadata } from "#system/daily-run/daily-run-types";',
    `import { awardDailyCompletionEggQuartet } from "#system/daily-run/daily-completion-reward";
import { getCurrentDailyRunMetadata } from "#system/daily-run/daily-run-types";`,
    "Daily completion egg import",
  );
  gameOver = replaceRequired(
    gameOver,
    `            if (this.isVictory && newClear) {
              this.handleUnlocks();`,
    `            if (this.isVictory && globalScene.gameMode.isDaily) {
              awardDailyCompletionEggQuartet();
            }
            if (this.isVictory && newClear) {
              this.handleUnlocks();`,
    "Daily completion egg award",
  );
  write(gameOverPath, gameOver);
}

const eggLocalePath = path.join(gameRoot, "locales", "en", "egg.json");
const eggLocale = JSON.parse(read(eggLocalePath));
eggLocale.shadowDailyCompletionReward = "Daily Run completion reward";
write(eggLocalePath, `${JSON.stringify(eggLocale, null, 2)}\n`);

console.log("SilverShadow Random Runs and Daily completion eggs applied successfully.");
