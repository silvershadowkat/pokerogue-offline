#!/usr/bin/env node

/** Install the SilverShadow four-mode Daily Run system into the pinned game source. */

const fs = require("fs");
const path = require("path");

const repositoryRoot = path.join(__dirname, "..", "..", "..");
const gameRoot = path.join("pokerogue-src");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Could not find ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function write(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    fail(`Could not find ${label}.`);
  }
  return source.replace(search, replacement);
}

function copyShared(relativePath, targetPath = relativePath) {
  const sourcePath = path.join(repositoryRoot, "new-files", relativePath);
  const destinationPath = path.join(gameRoot, targetPath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  console.log(`Written: ${destinationPath}`);
}

for (const name of [
  "daily-run-types.ts",
  "daily-run-seed-utils.ts",
  "daily-run-archive.ts",
  "daily-run-history.ts",
  "daily-run-keyboard-model.ts",
  "daily-run-menu.ts",
]) {
  copyShared(path.join("src", "system", "daily-run", name));
}
copyShared(path.join("src", "ui", "handlers", "daily-seed-keyboard-ui-handler.ts"));
copyShared(
  path.join("test", "tests", "system", "daily-run", "daily-run-system.test.ts"),
  path.join("test", "tests", "system", "daily-run", "daily-run-system.test.ts"),
);

const generatedArchive = path.join(repositoryRoot, "work", "generated", "daily-seeds.json");
const fallbackArchive = path.join(repositoryRoot, "assets", "daily-seeds-fallback.json");
const selectedArchive = fs.existsSync(generatedArchive) ? generatedArchive : fallbackArchive;
if (!fs.existsSync(selectedArchive)) {
  fail("No generated or checked-in Daily archive exists.");
}
// Upstream disables Vite's publicDir during packaging, but its JSON asset
// plugin copies files from assets/ to the compiled game root.
const embeddedArchiveTarget = path.join(gameRoot, "assets", "daily-seeds.json");
fs.mkdirSync(path.dirname(embeddedArchiveTarget), { recursive: true });
fs.copyFileSync(selectedArchive, embeddedArchiveTarget);
console.log(`Embedded Daily archive: ${embeddedArchiveTarget}`);

const uiModePath = path.join(gameRoot, "src", "enums", "ui-mode.ts");
let uiMode = read(uiModePath);
if (!uiMode.includes("DAILY_SEED_KEYBOARD")) {
  uiMode = replaceRequired(
    uiMode,
    "  AUTO_COMPLETE,",
    `  DAILY_SEED_KEYBOARD,
  AUTO_COMPLETE,`,
    "Daily seed keyboard UI mode anchor",
  );
  write(uiModePath, uiMode);
}

const uiPath = path.join(gameRoot, "src", "ui", "ui.ts");
let ui = read(uiPath);
if (!ui.includes("DailySeedKeyboardUiHandler")) {
  ui = replaceRequired(
    ui,
    'import { GameStatsUiHandler } from "#ui/game-stats-ui-handler";',
    `import { GameStatsUiHandler } from "#ui/game-stats-ui-handler";
import { DailySeedKeyboardUiHandler } from "#ui/handlers/daily-seed-keyboard-ui-handler";`,
    "Daily seed keyboard handler import anchor",
  );
  ui = replaceRequired(
    ui,
    "  UiMode.AUTO_COMPLETE,",
    `  UiMode.DAILY_SEED_KEYBOARD,
  UiMode.AUTO_COMPLETE,`,
    "Daily seed keyboard no-transition anchor",
  );
  ui = replaceRequired(
    ui,
    "      new AutoCompleteUiHandler(),",
    `      new DailySeedKeyboardUiHandler(),
      new AutoCompleteUiHandler(),`,
    "Daily seed keyboard handler registration anchor",
  );
  write(uiPath, ui);
}

const titlePhasePath = path.join(gameRoot, "src", "phases", "title-phase.ts");
let title = read(titlePhasePath);
if (!title.includes("showDailyRunTypeMenu")) {
  title = title.replace('import { pokerogueApi } from "#api/api";\n', "");
  title = title.replace('import { bypassLogin } from "#constants/app-constants";\n', "");
  title = title.replace('import { isLocalServerConnected } from "#utils/common";\n', "");
  title = replaceRequired(
    title,
    'import { vouchers } from "#system/voucher";',
    `import { showDailyRunTypeMenu } from "#system/daily-run/daily-run-menu";
import {
  clearDailyRunMetadata,
  clearPendingDailyRunLaunch,
  commitPendingDailyRunLaunch,
  getPendingDailyRunLaunch,
  setPendingDailyRunLaunch,
  type DailyRunLaunchRequest,
} from "#system/daily-run/daily-run-types";
import {
  createOfflineDailySeed,
  getUtcDateKey,
  OFFLINE_DAILY_ALGORITHM_VERSION,
} from "#system/daily-run/daily-run-seed-utils";
import { vouchers } from "#system/voucher";`,
    "title Daily Run import anchor",
  );

  const newGameStart = title.indexOf(`      {
        label: i18next.t("menu:newGame"),`);
  const loadGameStart = title.indexOf(`      {
        label: i18next.t("menu:loadGame"),`, newGameStart);
  if (newGameStart < 0 || loadGameStart < 0) {
    fail("Could not isolate the New Game title option.");
  }
  title =
    title.slice(0, newGameStart)
    + `      {
        label: i18next.t("menu:newGame"),
        handler: () => this.showNewGameOptions(),
      },
`
    + title.slice(loadGameStart);

  const loadSlotAnchor = `  // TODO: Make callers actually wait for the save slot to load
  private async loadSaveSlot(slotId: number): Promise<void> {`;
  const newGameMethod = `  private showNewGameOptions(): boolean {
    const setModeAndEnd = (gameMode: GameModes) => {
      this.gameMode = gameMode;
      clearDailyRunMetadata();
      globalScene.ui.setMode(UiMode.MESSAGE);
      globalScene.ui.clearText();
      this.end();
    };
    const { gameData } = globalScene;
    const options: OptionSelectItem[] = [
      {
        label: GameMode.getModeName(GameModes.CLASSIC),
        handler: () => (setModeAndEnd(GameModes.CLASSIC), true),
      },
      {
        label: i18next.t("menu:dailyRun"),
        handler: () => {
          if (activeOverrides.DAILY_RUN_SEED_OVERRIDE != null) {
            const seedOrConfig =
              typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE === "string"
                ? activeOverrides.DAILY_RUN_SEED_OVERRIDE
                : JSON.stringify(activeOverrides.DAILY_RUN_SEED_OVERRIDE);
            const configuredSeed =
              typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE === "string"
                ? activeOverrides.DAILY_RUN_SEED_OVERRIDE
                : activeOverrides.DAILY_RUN_SEED_OVERRIDE.seed;
            this.startDailyRunWithSeed({
              seedOrConfig,
              metadata: {
                mode: "custom-exact",
                canonicalSeed: configuredSeed,
                specialDailyConfig: typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE !== "string",
                serializedDailyConfig:
                  typeof activeOverrides.DAILY_RUN_SEED_OVERRIDE === "string" ? undefined : seedOrConfig,
              },
            });
          } else {
            this.showDailyRunTypeSelection();
          }
          return true;
        },
      },
    ];
    if (gameData.isUnlocked(Unlockables.ENDLESS_MODE)) {
      options.push(
        {
          label: GameMode.getModeName(GameModes.CHALLENGE),
          handler: () => (setModeAndEnd(GameModes.CHALLENGE), true),
        },
        {
          label: GameMode.getModeName(GameModes.ENDLESS),
          handler: () => (setModeAndEnd(GameModes.ENDLESS), true),
        },
      );
      if (gameData.isUnlocked(Unlockables.SPLICED_ENDLESS_MODE)) {
        options.push({
          label: GameMode.getModeName(GameModes.SPLICED_ENDLESS),
          handler: () => (setModeAndEnd(GameModes.SPLICED_ENDLESS), true),
        });
      }
    }
    options.push({
      label: i18next.t("menu:cancel"),
      handler: () => {
        globalScene.phaseManager.toTitleScreen();
        super.end();
        return true;
      },
    });
    globalScene.ui.showText(i18next.t("menu:selectGameMode"), null, () =>
      globalScene.ui.setOverlayMode(UiMode.OPTION_SELECT, { options }),
    );
    return true;
  }

  /** Direct deterministic entry retained for the game's Daily-mode test helper. */
  public initDailyRun(): void {
    const override = activeOverrides.DAILY_RUN_SEED_OVERRIDE;
    if (override != null) {
      const seedOrConfig = typeof override === "string" ? override : JSON.stringify(override);
      this.startDailyRunWithSeed({
        seedOrConfig,
        metadata: {
          mode: "custom-exact",
          canonicalSeed: typeof override === "string" ? override : override.seed,
          specialDailyConfig: typeof override !== "string",
          serializedDailyConfig: typeof override === "string" ? undefined : seedOrConfig,
        },
      });
      return;
    }
    const selectedInstant = new Date();
    const canonicalSeed = createOfflineDailySeed(selectedInstant);
    this.startDailyRunWithSeed({
      seedOrConfig: canonicalSeed,
      metadata: {
        mode: "offline",
        canonicalSeed,
        selectedDate: getUtcDateKey(selectedInstant),
        algorithmVersion: OFFLINE_DAILY_ALGORITHM_VERSION,
        specialDailyConfig: false,
      },
    });
  }

  private showDailyRunTypeSelection(): void {
    clearPendingDailyRunLaunch();
    showDailyRunTypeMenu({
      launch: request => this.startDailyRunWithSeed(request),
      cancel: () => this.showNewGameOptions(),
    });
  }

${loadSlotAnchor}`;
  title = replaceRequired(title, loadSlotAnchor, newGameMethod, "title load-slot method anchor");

  const dailyMethodStart = title.indexOf("  initDailyRun(): void {");
  const dailyMethodEnd = title.indexOf("\n  // TODO: Refactor this", dailyMethodStart);
  if (dailyMethodStart < 0 || dailyMethodEnd < 0) {
    fail("Could not isolate the existing Daily Run method.");
  }
  let dailyMethod = title.slice(dailyMethodStart, dailyMethodEnd);
  dailyMethod = replaceRequired(
    dailyMethod,
    `  initDailyRun(): void {
    globalScene.ui.clearText();`,
    `  private startDailyRunWithSeed(request: DailyRunLaunchRequest): void {
    setPendingDailyRunLaunch(request);
    globalScene.ui.resetModeChain();
    globalScene.ui.clearText();`,
    "Daily Run method signature",
  );
  dailyMethod = replaceRequired(
    dailyMethod,
    `      if (slotId === -1) {
        globalScene.phaseManager.toTitleScreen();
        super.end();
        return;
      }
      globalScene.phaseManager.clearPhaseQueue();`,
    `      if (slotId === -1) {
        clearPendingDailyRunLaunch();
        globalScene.ui.resetModeChain();
        void globalScene.ui.setMode(UiMode.MESSAGE).then(() => this.showDailyRunTypeSelection());
        return;
      }
      const pendingLaunch = getPendingDailyRunLaunch();
      if (!pendingLaunch) {
        console.error("Daily Run launch failed: pending seed/configuration was lost.");
        globalScene.ui.showText(i18next.t("menu:shadowDailyLaunchFailed"), null, () =>
          this.showDailyRunTypeSelection(),
        );
        return;
      }
      globalScene.phaseManager.clearPhaseQueue();`,
    "Daily Run save-slot cancellation",
  );
  dailyMethod = replaceRequired(
    dailyMethod,
    `        seed = globalScene.gameMode.trySetCustomDailyConfig(seed);

        // Daily runs don't support all challenges yet`,
    `        const seedOrConfig = seed;
        seed = globalScene.gameMode.trySetCustomDailyConfig(seed);
        if (pendingLaunch.metadata.specialDailyConfig && seed === seedOrConfig) {
          throw new Error("The selected special Daily Run configuration is invalid.");
        }
        commitPendingDailyRunLaunch();

        // Daily runs don't support all challenges yet`,
    "Daily Run custom configuration parser",
  );
  dailyMethod = replaceRequired(
    dailyMethod,
    `          globalScene.sessionPlayTime = 0;
          globalScene.lastSavePlayTime = 0;
          this.end();`,
    `          globalScene.sessionPlayTime = 0;
          globalScene.lastSavePlayTime = 0;
          try {
            const saved = await globalScene.gameData.saveAll(true, false);
            if (!saved) {
              console.warn("The new Daily Run could not be verified after its initial slot save.");
            }
          } catch (error) {
            console.error("Failed to save the new Daily Run to its selected slot:", error);
          }
          this.end();`,
    "initial Daily Run slot save",
  );
  const seedSelectionStart = dailyMethod.indexOf("      // If Online, calls seed fetch from db");
  const callbackEnd = dailyMethod.lastIndexOf("    });\n  }");
  if (seedSelectionStart < 0 || callbackEnd < 0) {
    fail("Could not isolate the old Daily Run seed selection.");
  }
  dailyMethod =
    dailyMethod.slice(0, seedSelectionStart)
    + `      try {
        generateDaily(pendingLaunch.seedOrConfig);
      } catch (error) {
        console.error("Failed to launch Daily Run:", error);
        clearDailyRunMetadata();
        globalScene.ui.showText(i18next.t("menu:shadowDailyLaunchFailed"), null, () =>
          this.showDailyRunTypeSelection(),
        );
      }
`
    + dailyMethod.slice(callbackEnd);
  title = title.slice(0, dailyMethodStart) + dailyMethod + title.slice(dailyMethodEnd);
  write(titlePhasePath, title);
  console.log(`Patched: ${titlePhasePath}`);
}

const saveTypesPath = path.join(gameRoot, "src", "@types", "save-data.ts");
let saveTypes = read(saveTypesPath);
if (!saveTypes.includes("dailyRunMetadata?: DailyRunMetadata")) {
  saveTypes = replaceRequired(
    saveTypes,
    'import type { ModifierData } from "#system/modifier-data";',
    'import type { ModifierData } from "#system/modifier-data";\nimport type { DailyRunMetadata } from "#system/daily-run/daily-run-types";',
    "save metadata import",
  );
  saveTypes = replaceRequired(
    saveTypes,
    `  dailyConfig?: SerializedDailyRunConfig;`,
    `  dailyConfig?: SerializedDailyRunConfig;
  /** SilverShadow Daily Run mode/provenance; absent in legacy saves. */
  dailyRunMetadata?: DailyRunMetadata;`,
    "session Daily config field",
  );
  write(saveTypesPath, saveTypes);
}

const gameDataPath = path.join(gameRoot, "src", "system", "game-data.ts");
let gameData = read(gameDataPath);
if (!gameData.includes("getCurrentDailyRunMetadata")) {
  gameData = replaceRequired(
    gameData,
    'import { GameStats } from "#system/game-stats";',
    `import { GameStats } from "#system/game-stats";
import {
  getCurrentDailyRunMetadata,
  restoreDailyRunMetadata,
} from "#system/daily-run/daily-run-types";`,
    "game data Daily metadata import",
  );
  gameData = replaceRequired(
    gameData,
    `      dailyConfig: getSerializedDailyRunConfig(),`,
    `      dailyConfig: getSerializedDailyRunConfig(),
      dailyRunMetadata: getCurrentDailyRunMetadata(),`,
    "session save Daily config",
  );
  gameData = replaceRequired(
    gameData,
    `    globalScene.gameMode = getGameMode(fromSession.gameMode || GameModes.CLASSIC);
    if (fromSession.challenges) {`,
    `    globalScene.gameMode = getGameMode(fromSession.gameMode || GameModes.CLASSIC);
    restoreDailyRunMetadata(fromSession.dailyRunMetadata);
    if (fromSession.challenges) {`,
    "session load game mode",
  );
  gameData = replaceRequired(
    gameData,
    `    globalScene.gameMode.trySetCustomDailyConfig(JSON.stringify(fromSession.dailyConfig));`,
    `    globalScene.gameMode.trySetCustomDailyConfig(
      fromSession.dailyRunMetadata?.serializedDailyConfig ?? JSON.stringify(fromSession.dailyConfig),
    );`,
    "session load custom Daily config",
  );
  write(gameDataPath, gameData);
}

const saveSlotPath = path.join(gameRoot, "src", "ui", "handlers", "save-slot-select-ui-handler.ts");
let saveSlot = read(saveSlotPath);
if (!saveSlot.includes("getDailyRunSaveLabels")) {
  saveSlot = replaceRequired(
    saveSlot,
    'import type { PokemonData } from "#system/pokemon-data";',
    'import { getDailyRunSaveLabels } from "#system/daily-run/daily-run-types";\nimport type { PokemonData } from "#system/pokemon-data";',
    "save-slot Daily Run label import",
  );
  saveSlot = replaceRequired(
    saveSlot,
    `    let fallbackName = \`\${GameMode.getModeName(data.gameMode)}\`;`,
    `    const dailyLabels = getDailyRunSaveLabels(data.dailyRunMetadata);
    let fallbackName = data.gameMode === GameModes.DAILY
      ? dailyLabels.short
      : \`\${GameMode.getModeName(data.gameMode)}\`;`,
    "save-slot fallback mode name",
  );
  saveSlot = replaceRequired(
    saveSlot,
    `    const hasName = data?.name;
    this.remove(this.loadingLabel, true);`,
    `    const legacyDailyName =
      data.gameMode === GameModes.DAILY && data.name?.startsWith("Daily Run (");
    const hasName = data?.name && !legacyDailyName;
    this.remove(this.loadingLabel, true);`,
    "legacy Daily Run automatic name migration",
  );
  saveSlot = replaceRequired(
    saveSlot,
    `    const gameModeLabel = addTextObject(
      8,
      19,
      \`\${GameMode.getModeName(data.gameMode) || i18next.t("gameMode:unknown")} - \${i18next.t("saveSlotSelectUiHandler:wave")} \${data.waveIndex}\`,`,
    `    const displayedModeName = data.gameMode === GameModes.DAILY
      ? getDailyRunSaveLabels(data.dailyRunMetadata).long
      : GameMode.getModeName(data.gameMode) || i18next.t("gameMode:unknown");
    const gameModeLabel = addTextObject(
      8,
      19,
      \`\${displayedModeName} - \${i18next.t("saveSlotSelectUiHandler:wave")} \${data.waveIndex}\`,`,
    "save-slot detailed Daily Run mode name",
  );
  write(saveSlotPath, saveSlot);
}

const localePath = path.join(gameRoot, "locales", "en", "menu.json");
const locale = JSON.parse(read(localePath));
Object.assign(locale, {
  shadowDailyOfficial: "Official Daily Run",
  shadowDailyOffline: "Offline Daily Run",
  shadowDailyRandom: "Random 50-Wave Run",
  shadowDailyCustom: "Custom 50-Wave Run",
  shadowDailyOfficialDescription: "Download and browse official seed dates. Uses a cached or built-in archive if download fails.",
  shadowDailyOfflineDescription: "Play today's shared offline run. The same game version and UTC date use the same seed.",
  shadowDailyRandomDescription: "Generate a new random 50-wave Daily Run. A different seed is created each time.",
  shadowDailyCustomDescription: "Reuse a previous seed or create a repeatable run from memorable text.",
  shadowDailyPreviousSeed: "Previous Seed",
  shadowDailyTextSeed: "Text Seed",
  shadowDailyPreviousDescription: "Replay one of your last 1,000 Daily Run seeds. Newest runs appear first.",
  shadowDailyTextDescription: "Enter any memorable text. The same text will always create the same 50-wave run.",
  shadowDailyOfflineConfirm: "Start Offline Daily Run for {{date}} (UTC)?",
  shadowDailyRandomConfirm: "Generate a new random 50-wave Daily Run?",
  shadowDailyGeneratedSeed: "Generated: {{seed}}\nStart this run?",
  shadowDailyLoadingArchive: "Loading the official Daily Run archive...",
  shadowDailySpecialIndicator: "[Special]",
  shadowDailySelectedDate: "Selected date: {{date}}",
  shadowDailySpecialType: "Special Daily Run",
  shadowDailyStandardType: "Standard Daily Run",
  shadowDailySeedValue: "Seed: {{seed}}",
  shadowDailyArchiveSource: "Archive source: {{source}}",
  "shadowDailySourcedownloaded": "downloaded",
  "shadowDailySourcecached": "cached",
  "shadowDailySourcebuilt-in": "built-in",
  shadowDailyCancelDateHelp: "Return to Daily Run type selection.",
  shadowDailyError: "Daily Run error",
  shadowDailyUnknownError: "An unknown Daily Run error occurred.",
  shadowDailyInvalidSpecialConfig: "The special Daily Run configuration for {{date}} is invalid.",
  shadowDailyEmptyTextSeed: "Text Seed cannot be empty.",
  shadowDailyPreviousEmpty: "No previous Daily Run seeds have been used yet.",
  shadowDailyPreviousOfficialDetail: "Official Daily Run · {{date}}",
  shadowDailyPreviousOfflineDetail: "Offline Daily Run · UTC {{date}}",
  shadowDailyPreviousTextDetail: "Text Seed · {{text}}",
  shadowDailyPreviousRandomDetail: "Random 50-Wave Run",
  shadowDailyHistoryModeoffline: "Offline",
  shadowDailyHistoryModeofficial: "Official",
  shadowDailyHistoryModerandom: "Random",
  "shadowDailyHistoryModecustom-text": "Text",
  shadowDailyLaunchFailed: "The Daily Run could not be started. No save was changed.",
  shadowDailyKeyboardEmpty: "(empty)",
  shadowDailyKeyboardTitle: "TEXT SEED?",
  shadowDailyKeyboardPagelowercase: "LOWER CASE",
  shadowDailyKeyboardPageuppercase: "UPPER CASE",
  shadowDailyKeyboardPagenumbersSymbols: "NUMBERS / SYMBOLS",
  shadowDailyKeyboardGridHelp: "D-pad: Move · A: Select · B: Delete",
  shadowDailyKeyboardSpaceShort: "SPC",
  shadowDailyKeyboardBackspaceShort: "DEL",
  shadowDailyKeyboardClearShort: "CLR",
  shadowDailyKeyboardNextUpper: "UPPER",
  shadowDailyKeyboardNextNumbers: "NUM",
  shadowDailyKeyboardNextLower: "LOWER",
  shadowDailyKeyboardConfirmShort: "OK",
  shadowDailyKeyboardTooLong: "Input is limited to {{max}} characters.",
  shadowDailyKeyboardControlCharacters: "Control characters and newlines are not allowed.",
});
write(localePath, `${JSON.stringify(locale, null, 2)}\n`);

console.log("SilverShadow four-mode Daily Run system applied.");
