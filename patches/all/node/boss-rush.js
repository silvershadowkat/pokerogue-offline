#!/usr/bin/env node

/** Install the SilverShadow seeded Boss Rush Daily Run variant. */

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

copyShared(path.join("src", "system", "daily-run", "boss-rush.ts"));
copyShared(path.join("src", "system", "daily-run", "boss-rush-items.ts"));
copyShared(path.join("src", "system", "daily-run", "daily-run-rules.ts"));
copyShared(
  path.join("test", "tests", "system", "daily-run", "boss-rush.test.ts"),
  path.join("test", "tests", "system", "daily-run", "boss-rush.test.ts"),
);

const gameModePath = path.join(gameRoot, "src", "game-mode.ts");
let gameMode = read(gameModePath);
if (!gameMode.includes("getBossRushBossConfig")) {
  gameMode = replaceRequired(
    gameMode,
    'import { parseDailySeed } from "#data/daily-seed/daily-seed-utils";',
    `import { parseDailySeed } from "#data/daily-seed/daily-seed-utils";
import {
  BOSS_RUSH_CONFIG,
  getBossRushBossConfig,
  isBossRushMode,
} from "#system/daily-run/boss-rush";`,
    "Boss Rush GameMode imports",
  );
  gameMode = replaceRequired(
    gameMode,
    `  getStartingLevel(): number {
    if (activeOverrides.STARTING_LEVEL_OVERRIDE > 0) {`,
    `  getStartingLevel(): number {
    if (isBossRushMode()) {
      return BOSS_RUSH_CONFIG.startingLevel;
    }
    if (activeOverrides.STARTING_LEVEL_OVERRIDE > 0) {`,
    "Boss Rush starting level",
  );
  gameMode = replaceRequired(
    gameMode,
    `  getStartingMoney(): number {
    if (activeOverrides.STARTING_MONEY_OVERRIDE > 0) {`,
    `  getStartingMoney(): number {
    if (isBossRushMode()) {
      return BOSS_RUSH_CONFIG.startingMoney;
    }
    if (activeOverrides.STARTING_MONEY_OVERRIDE > 0) {`,
    "Boss Rush starting money",
  );
  gameMode = replaceRequired(
    gameMode,
    `  getWaveForDifficulty(waveIndex: number, ignoreCurveChanges = false): number {
    switch (this.modeId) {`,
    `  getWaveForDifficulty(waveIndex: number, ignoreCurveChanges = false): number {
    if (isBossRushMode()) {
      return BOSS_RUSH_CONFIG.bossLevel + (waveIndex - 1) * 10;
    }
    switch (this.modeId) {`,
    "Boss Rush difficulty curve",
  );
  gameMode = replaceRequired(
    gameMode,
    `  public isWaveTrainer(waveIndex: number): boolean {
    const { arena, offsetGym } = globalScene;`,
    `  public isWaveTrainer(waveIndex: number): boolean {
    if (isBossRushMode()) {
      return false;
    }
    const { arena, offsetGym } = globalScene;`,
    "Boss Rush trainer exclusion",
  );
  gameMode = replaceRequired(
    gameMode,
    `  isTrainerBoss(waveIndex: number, biomeType: BiomeId, offsetGym: boolean): boolean {
    switch (this.modeId) {`,
    `  isTrainerBoss(waveIndex: number, biomeType: BiomeId, offsetGym: boolean): boolean {
    if (isBossRushMode()) {
      return false;
    }
    switch (this.modeId) {`,
    "Boss Rush trainer boss exclusion",
  );
  gameMode = replaceRequired(
    gameMode,
    `  getOverrideSpecies(waveIndex: number): PokemonSpecies | null {
    if (this.isDaily && this.isWaveFinal(waveIndex)) {`,
    `  getOverrideSpecies(waveIndex: number): PokemonSpecies | null {
    if (isBossRushMode()) {
      const boss = getBossRushBossConfig(waveIndex);
      return boss ? speciesDataRegistry.getSpecies(boss.speciesId) : null;
    }
    if (this.isDaily && this.isWaveFinal(waveIndex)) {`,
    "Boss Rush species override",
  );
  gameMode = replaceRequired(
    gameMode,
    `      case GameModes.DAILY:
        return waveIndex === 50;`,
    `      case GameModes.DAILY:
        return waveIndex === (isBossRushMode() ? BOSS_RUSH_CONFIG.bossCount : 50);`,
    "Boss Rush final wave",
  );
  gameMode = replaceRequired(
    gameMode,
    `  isBoss(waveIndex: number): boolean {
    return waveIndex % 10 === 0;`,
    `  isBoss(waveIndex: number): boolean {
    return isBossRushMode() || waveIndex % 10 === 0;`,
    "Boss Rush boss wave rule",
  );
  write(gameModePath, gameMode);
}

const battlePath = path.join(gameRoot, "src", "battle.ts");
let battle = read(battlePath);
if (!battle.includes("BOSS_RUSH_CONFIG")) {
  battle = replaceRequired(
    battle,
    'import { isDailyFinalBoss } from "#data/daily-seed/daily-seed-utils";',
    `import { isDailyFinalBoss } from "#data/daily-seed/daily-seed-utils";
import { BOSS_RUSH_CONFIG, isBossRushMode } from "#system/daily-run/boss-rush";`,
    "Boss Rush Battle imports",
  );
  battle = replaceRequired(
    battle,
    `  public getLevelForWave(): number {
    if (isDailyFinalBoss(this.waveIndex)) {`,
    `  public getLevelForWave(): number {
    if (isBossRushMode()) {
      return BOSS_RUSH_CONFIG.bossLevel;
    }
    if (isDailyFinalBoss(this.waveIndex)) {`,
    "Boss Rush enemy level",
  );
  write(battlePath, battle);
}

const dailyRunPath = path.join(gameRoot, "src", "data", "daily-seed", "daily-run.ts");
let dailyRun = read(dailyRunPath);
if (!dailyRun.includes("getBossRushStarterConfigs")) {
  dailyRun = replaceRequired(
    dailyRun,
    'import type { DailySeedBoss } from "#types/daily-run";',
    `import { getBossRushStarterConfigs, isBossRushMode } from "#system/daily-run/boss-rush";
import type { DailySeedBoss } from "#types/daily-run";`,
    "Boss Rush Daily starter imports",
  );
  dailyRun = replaceRequired(
    dailyRun,
    `    () => {
      const eventStarters = getDailyEventSeedStarters();`,
    `    () => {
      if (isBossRushMode()) {
        for (const config of getBossRushStarterConfigs()) {
          const starter = getDailyRunStarter(speciesDataRegistry.getSpecies(config.speciesId), {
            speciesId: config.speciesId,
            formIndex: config.formIndex,
            nature: config.nature,
          });
          starter.abilityIndex = config.abilityIndex;
          starter.moveset = [...config.moveset] as StarterMoveset;
          starter.ivs = [...config.ivs];
          starters.push(starter);
        }
        return;
      }
      const eventStarters = getDailyEventSeedStarters();`,
    "Boss Rush Daily starter generation",
  );
  write(dailyRunPath, dailyRun);
}

const starterPhasePath = path.join(gameRoot, "src", "phases", "select-starter-phase.ts");
let starterPhase = read(starterPhasePath);
if (!starterPhase.includes("isBossRushMode")) {
  starterPhase = replaceRequired(
    starterPhase,
    'import type { PokemonEditorMode } from "#system/pokemon-editor/pokemon-editor-types";',
    `import { isBossRushMode } from "#system/daily-run/boss-rush";
import type { PokemonEditorMode } from "#system/pokemon-editor/pokemon-editor-types";`,
    "Boss Rush SelectStarter import",
  );
  starterPhase = replaceRequired(
    starterPhase,
    `      } else if (starter.moveset) {
        starterPokemon.tryPopulateMoveset(starter.moveset);`,
    `      } else if (starter.moveset) {
        starterPokemon.tryPopulateMoveset(starter.moveset, isBossRushMode());`,
    "Boss Rush legal custom movesets",
  );
  write(starterPhasePath, starterPhase);
}

const scenePath = path.join(gameRoot, "src", "battle-scene.ts");
let scene = read(scenePath);
if (!scene.includes("getBossRushBossConfig")) {
  scene = replaceRequired(
    scene,
    'import { GameData } from "#system/game-data";',
    `import { getBossRushBossConfig, isBossRushMode } from "#system/daily-run/boss-rush";
import { GameData } from "#system/game-data";`,
    "Boss Rush BattleScene imports",
  );
  scene = replaceRequired(
    scene,
    `  getEncounterBossSegments(waveIndex: number, level: number, species?: PokemonSpecies, forceBoss = false): number {
    if (activeOverrides.ENEMY_HEALTH_SEGMENTS_OVERRIDE > 1) {`,
    `  getEncounterBossSegments(waveIndex: number, level: number, species?: PokemonSpecies, forceBoss = false): number {
    if (isBossRushMode()) {
      return getBossRushBossConfig(waveIndex)?.healthSegments ?? 2;
    }
    if (activeOverrides.ENEMY_HEALTH_SEGMENTS_OVERRIDE > 1) {`,
    "Boss Rush native shield segments",
  );
  scene = replaceRequired(
    scene,
    `    const resetArenaState =
      isNewBiome`,
    `    const resetArenaState =
      isBossRushMode()
      || isNewBiome`,
    "Boss Rush temporary state cleanup",
  );
  scene = replaceRequired(
    scene,
    `          if (isBoss) {
            count = Math.max(count, Math.floor(chances / 2));
          }
          getEnemyModifierTypesForWave(`,
    `          const bossRushModifierCount = getBossRushBossConfig()?.enemyModifierCount;
          if (bossRushModifierCount != null) {
            count = bossRushModifierCount;
          } else if (isBoss) {
            count = Math.max(count, Math.floor(chances / 2));
          }
          getEnemyModifierTypesForWave(`,
    "Boss Rush enemy modifier count",
  );
  write(scenePath, scene);
}

const pokemonPath = path.join(gameRoot, "src", "field", "pokemon.ts");
let pokemon = read(pokemonPath);
if (!pokemon.includes("applyBossRushEnemyConfig")) {
  pokemon = replaceRequired(
    pokemon,
    'import { achvs } from "#system/achv";',
    `import { achvs } from "#system/achv";
import { applyBossRushEnemyConfig, isBossRushMode } from "#system/daily-run/boss-rush";`,
    "Boss Rush Pokemon imports",
  );
  pokemon = replaceRequired(
    pokemon,
    `      if (isDailyFinalBoss()) {
        this.applyCustomDailyBossConfig();
      } else {`,
    `      if (isBossRushMode()) {
        applyBossRushEnemyConfig(this);
      } else if (isDailyFinalBoss()) {
        this.applyCustomDailyBossConfig();
      } else {`,
    "Boss Rush enemy configuration",
  );
  write(pokemonPath, pokemon);
}

const victoryPath = path.join(gameRoot, "src", "phases", "victory-phase.ts");
let victory = read(victoryPath);
if (!victory.includes("getBossRushRewardSettings")) {
  victory = replaceRequired(
    victory,
    'import { PokemonPhase } from "#phases/pokemon-phase";',
    `import { PokemonPhase } from "#phases/pokemon-phase";
import {
  getBossRushRewardSettings,
  getBossRushVariantConfig,
  isBossRushMode,
} from "#system/daily-run/boss-rush";`,
    "Boss Rush Victory imports",
  );
  victory = replaceRequired(
    victory,
    `        if (currentWaveIndex % 10) {
          globalScene.phaseManager.pushNew(
            "SelectModifierPhase",
            undefined,
            undefined,
            gameMode.getFixedBattle(currentWaveIndex)?.customModifierRewardSettings,
          );
        } else if (gameMode.isDaily) {`,
    `        if (isBossRushMode()) {
          globalScene.phaseManager.pushNew(
            "SelectModifierPhase",
            undefined,
            undefined,
            getBossRushRewardSettings(),
          );
        } else if (currentWaveIndex % 10) {
          globalScene.phaseManager.pushNew(
            "SelectModifierPhase",
            undefined,
            undefined,
            gameMode.getFixedBattle(currentWaveIndex)?.customModifierRewardSettings,
          );
        } else if (gameMode.isDaily) {`,
    "Boss Rush five-choice reward phase",
  );
  victory = replaceRequired(
    victory,
    `        if (gameMode.hasRandomBiomes || globalScene.isNewBiome()) {
          globalScene.phaseManager.pushNew("SelectBiomePhase");
        }

        globalScene.phaseManager.pushNew("NewBattlePhase");`,
    `        if (!isBossRushMode() && (gameMode.hasRandomBiomes || globalScene.isNewBiome())) {
          globalScene.phaseManager.pushNew("SelectBiomePhase");
        }
        if (isBossRushMode() && getBossRushVariantConfig().healBetweenBosses) {
          globalScene.phaseManager.pushNew("PartyHealPhase", false);
        }

        globalScene.phaseManager.pushNew("NewBattlePhase");`,
    "Boss Rush between-boss healing",
  );
  write(victoryPath, victory);
}

const commandPath = path.join(gameRoot, "src", "phases", "command-phase.ts");
let command = read(commandPath);
if (!command.includes("BOSS_RUSH_CONFIG")) {
  command = replaceRequired(
    command,
    'import { isDailyFinalBoss } from "#data/daily-seed/daily-seed-utils";',
    `import { isDailyFinalBoss } from "#data/daily-seed/daily-seed-utils";
import { BOSS_RUSH_CONFIG, isBossRushMode } from "#system/daily-run/boss-rush";
import { isDailyRunEscapeBlocked } from "#system/daily-run/daily-run-rules";`,
    "Boss Rush Command imports",
  );
  command = replaceRequired(
    command,
    `    const isCatchableDailyBoss = isDailyFinalBoss() && (getDailyEventSeedBoss()?.catchable ?? false);

    if (biomeId === BiomeId.END && battleType === BattleType.WILD) {`,
    `    const isCatchableDailyBoss = isDailyFinalBoss() && (getDailyEventSeedBoss()?.catchable ?? false);

    if (isBossRushMode() && !BOSS_RUSH_CONFIG.bossesCatchable) {
      this.queueShowText("battle:noPokeballForceFinalBoss");
      return false;
    }

    if (biomeId === BiomeId.END && battleType === BattleType.WILD) {`,
    "Boss Rush capture rule",
  );
  command = replaceRequired(
    command,
    `  private handleRunCommand(): boolean {
    const { currentBattle, arena } = globalScene;`,
    `  private handleRunCommand(): boolean {
    if (isDailyRunEscapeBlocked()) {
      this.queueShowText("battle:shadowBossRushNoRun");
      return false;
    }
    const { currentBattle, arena } = globalScene;`,
    "Boss Rush no-cost run prevention",
  );
  write(commandPath, command);
}

const rewardPath = path.join(gameRoot, "src", "phases", "select-modifier-phase.ts");
let reward = read(rewardPath);
if (!reward.includes("getBossRushRewardOptions")) {
  reward = replaceRequired(
    reward,
    'import { clearPendingClaimAllReward, setPendingClaimAllReward } from "#system/offline/claim-all-rewards-state";',
    `import { isBossRushMode, logBossRushRewards } from "#system/daily-run/boss-rush";
import { getBossRushRewardOptions, getBossRushShopOptions } from "#system/daily-run/boss-rush-items";
import { isPaidShopEnabled, logPostBattleTransition } from "#system/daily-run/daily-run-rules";
import { clearPendingClaimAllReward, setPendingClaimAllReward } from "#system/offline/claim-all-rewards-state";`,
    "Boss Rush reward diagnostics import",
  );
  reward = replaceRequired(
    reward,
    `    this.typeOptions = this.getModifierTypeOptions(modifierCount);

    const modifierSelectCallback`,
    `    this.typeOptions = this.getModifierTypeOptions(modifierCount);
    const paidShopEnabled = isPaidShopEnabled();
    if (paidShopEnabled && this.shopOptions.length === 0) {
      const baseShopCost = new NumberHolder(globalScene.getWaveMoneyAmount(1));
      globalScene.applyModifier(HealShopCostModifier, true, baseShopCost);
      this.shopOptions = isBossRushMode()
        ? getBossRushShopOptions(globalScene.getPlayerParty(), globalScene.currentBattle.waveIndex, baseShopCost.value)
        : getPlayerShopModifierTypeOptionsForWave(globalScene.currentBattle.waveIndex, baseShopCost.value);
    }
    if (isBossRushMode()) {
      logBossRushRewards(this.typeOptions.map(option => option.type.tier));
    }
    logPostBattleTransition("phase-prepared", {
      rewardEnabled: this.typeOptions.length > 0,
      paidShopEnabled,
      rewardOptionCount: this.typeOptions.length,
      paidShopOptionCount: this.shopOptions.length,
      copiedPhase: this.isCopy,
    });

    const modifierSelectCallback`,
    "Boss Rush reward diagnostics",
  );
  reward = replaceRequired(
    reward,
    `    const shopOptions = getPlayerShopModifierTypeOptionsForWave(
      globalScene.currentBattle.waveIndex,
      globalScene.getWaveMoneyAmount(1),
    );`,
    `    const shopOptions = this.shopOptions;`,
    "stable shop purchase options",
  );
  reward = replaceRequired(
    reward,
    `    const modifierType = shopOption.type;
    // Apply Black Sludge to healing item cost
    const healingItemCost = new NumberHolder(shopOption.cost);
    globalScene.applyModifier(HealShopCostModifier, true, healingItemCost);
    const cost = healingItemCost.value;`,
    `    const modifierType = shopOption.type;
    // The cached option already contains the displayed, modifier-adjusted cost.
    const cost = shopOption.cost;`,
    "stable displayed shop cost",
  );
  reward = replaceRequired(
    reward,
    `  private typeOptions: ModifierTypeOption[];`,
    `  private typeOptions: ModifierTypeOption[];
  private shopOptions: ModifierTypeOption[] = [];`,
    "stable shop option field",
  );
  reward = replaceRequired(
    reward,
    `    isCopy = false,
    claimedRewardIndices: number[] = [],
  ) {`,
    `    isCopy = false,
    claimedRewardIndices: number[] = [],
    shopOptions: ModifierTypeOption[] = [],
  ) {`,
    "stable shop constructor argument",
  );
  reward = replaceRequired(
    reward,
    `    this.isCopy = isCopy;
    this.claimedRewardIndices = new Set(claimedRewardIndices);`,
    `    this.isCopy = isCopy;
    this.claimedRewardIndices = new Set(claimedRewardIndices);
    this.shopOptions = shopOptions;`,
    "stable shop constructor assignment",
  );
  reward = replaceRequired(
    reward,
    `      this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[],
    );`,
    `      this.typeOptions.map(o => o.type?.tier).filter(t => t !== undefined) as ModifierTier[],
      undefined,
      false,
      [],
      this.shopOptions,
    );`,
    "stable shop reroll handoff",
  );
  reward = replaceRequired(
    reward,
    `      [...this.claimedRewardIndices],
    );`,
    `      [...this.claimedRewardIndices],
      this.shopOptions,
    );`,
    "stable shop UI handoff",
  );
  reward = replaceRequired(
    reward,
    `      [...claimedRewardIndices],
    );`,
    `      [...claimedRewardIndices],
      this.shopOptions,
    );`,
    "stable shop copied-phase handoff",
  );
  reward = replaceRequired(
    reward,
    `    const modifierType = shopOption.type;
    // The cached option already contains the displayed, modifier-adjusted cost.`,
    `    if (!shopOption) {
      logPostBattleTransition(
        "shop-selection",
        {
          paidShopEnabled: isPaidShopEnabled(),
          paidShopOptionCount: shopOptions.length,
          requestedShopRow: rowCursor,
          requestedShopColumn: cursor,
        },
        true,
      );
      globalScene.ui.playError();
      return false;
    }
    const modifierType = shopOption.type;
    // The cached option already contains the displayed, modifier-adjusted cost.`,
    "invalid cached shop selection guard",
  );
  reward = replaceRequired(
    reward,
    `  getModifierTypeOptions(modifierCount: number): ModifierTypeOption[] {
    return getPlayerModifierTypeOptions(`,
    `  getModifierTypeOptions(modifierCount: number): ModifierTypeOption[] {
    if (isBossRushMode()) {
      return getBossRushRewardOptions(globalScene.getPlayerParty());
    }
    return getPlayerModifierTypeOptions(`,
    "Boss Rush useful reward generation",
  );
  write(rewardPath, reward);
}

const modifierSelectPath = path.join(gameRoot, "src", "ui", "handlers", "modifier-select-ui-handler.ts");
let modifierSelect = read(modifierSelectPath);
if (!modifierSelect.includes("isModifierSelectUiArgumentCountSupported")) {
  modifierSelect = replaceRequired(
    modifierSelect,
    'import type { ModifierSelectCallback } from "#phases/select-modifier-phase";\n',
    "",
    "relocate modifier callback type import",
  );
  modifierSelect = replaceRequired(
    modifierSelect,
    'import { getPlayerShopModifierTypeOptionsForWave, TmModifierType } from "#modifiers/modifier-type";',
    `import { TmModifierType } from "#modifiers/modifier-type";
import type { ModifierSelectCallback } from "#phases/select-modifier-phase";
import {
  isModifierSelectUiArgumentCountSupported,
  isPaidShopEnabled,
  logPostBattleTransition,
} from "#system/daily-run/daily-run-rules";`,
    "Boss Rush modifier shop UI imports",
  );
  modifierSelect = replaceRequired(
    modifierSelect,
    'import { HealShopCostModifier, LockModifierTiersModifier, PokemonHeldItemModifier } from "#modifiers/modifier";',
    'import { LockModifierTiersModifier, PokemonHeldItemModifier } from "#modifiers/modifier";',
    "remove obsolete UI shop-cost import",
  );
  modifierSelect = replaceRequired(
    modifierSelect,
    'import { formatMoney, NumberHolder } from "#utils/common";',
    'import { formatMoney } from "#utils/common";',
    "remove obsolete UI number-holder import",
  );
  modifierSelect = replaceRequired(
    modifierSelect,
    `    const hasShop = globalScene.gameMode.getShopStatus();
    const baseShopCost = new NumberHolder(globalScene.getWaveMoneyAmount(1));
    globalScene.applyModifier(HealShopCostModifier, true, baseShopCost);
    const shopTypeOptions = hasShop
      ? getPlayerShopModifierTypeOptionsForWave(globalScene.currentBattle.waveIndex, baseShopCost.value)
      : [];`,
    `    const hasShop = isPaidShopEnabled();
    const shopTypeOptions = hasShop ? ((args[5] as ModifierTypeOption[] | undefined) ?? []) : [];
    logPostBattleTransition("ui-show", {
      rewardEnabled: typeOptions.length > 0,
      paidShopEnabled: hasShop,
      rewardOptionCount: typeOptions.length,
      paidShopOptionCount: shopTypeOptions.length,
      uiSetupCompleted: true,
    });`,
    "stable five-item shop UI",
  );
  modifierSelect = replaceRequired(
    modifierSelect,
    `      (args.length !== 4 && args.length !== 5)
      || !Array.isArray(args[1])
      || !(args[2] instanceof Function)`,
    `      !isModifierSelectUiArgumentCountSupported(args.length)
      || !Array.isArray(args[1])
      || !(args[2] instanceof Function)`,
    "stable shop UI argument validation",
  );
  modifierSelect = replaceRequired(
    modifierSelect,
    `      || !(args[2] instanceof Function)
    ) {
      return false;
    }

    super.show(args);`,
    `      || !(args[2] instanceof Function)
    ) {
      logPostBattleTransition(
        "ui-invalid-arguments",
        {
          argumentCount: args.length,
          rewardArrayPresent: Array.isArray(args[1]),
          callbackPresent: args[2] instanceof Function,
          uiSetupCompleted: false,
        },
        true,
      );
      return false;
    }

    super.show(args);`,
    "stable shop UI argument diagnostics",
  );
  write(modifierSelectPath, modifierSelect);
}

for (const [file, marker] of [
  [gameModePath, "BOSS_RUSH_CONFIG.bossCount"],
  [battlePath, "BOSS_RUSH_CONFIG.bossLevel"],
  [dailyRunPath, "getBossRushStarterConfigs"],
  [scenePath, "bossRushModifierCount"],
  [pokemonPath, "applyBossRushEnemyConfig(this)"],
  [victoryPath, "getBossRushRewardSettings"],
  [commandPath, "BOSS_RUSH_CONFIG.bossesCatchable"],
]) {
  if (!read(file).includes(marker)) fail(`Missing Boss Rush marker ${marker} in ${file}.`);
}

const battleLocalePath = path.join(gameRoot, "locales", "en", "battle.json");
const battleLocale = JSON.parse(read(battleLocalePath));
battleLocale.shadowBossRushNoRun = "A mysterious force is preventing you from running!";
write(battleLocalePath, `${JSON.stringify(battleLocale, null, 2)}\n`);

console.log("SilverShadow Boss Rush applied successfully.");
