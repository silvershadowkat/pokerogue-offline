import i18next from "i18next";
import { globalScene } from "#app/global-scene";
import { parseDailySeed } from "#data/daily-seed/daily-seed-utils";
import { UiMode } from "#enums/ui-mode";
import type { OptionSelectItem } from "#types/ui-types";
import type { DailySeedKeyboardConfig } from "#ui/handlers/daily-seed-keyboard-ui-handler";
import { BOSS_RUSH_ALGORITHM_VERSION, BossRushVariant, generateBossRushManifest } from "./boss-rush";
import {
  type DailyArchiveEntry,
  type LoadedDailyArchive,
  loadOfficialDailyArchive,
  serializeSpecialDailyEntry,
} from "./daily-run-archive";
import { type DailySeedHistoryEntry, readDailySeedHistory } from "./daily-run-history";
import {
  CUSTOM_TEXT_ALGORITHM_VERSION,
  createCustomTextSeed,
  createOfflineDailySeed,
  createOfflineDailySeedForDate,
  createRandomCanonicalSeed,
  getUtcDateKey,
  OFFLINE_DAILY_ALGORITHM_VERSION,
} from "./daily-run-seed-utils";
import { type DailyRunLaunchRequest, getDailyRunDisplayMetadata } from "./daily-run-types";
import {
  formatCalendarDate,
  getOfflineDailyDays,
  getOfflineDailyMonths,
  getOfflineDailyYears,
  getPreviousLocalCalendarDate,
} from "./offline-daily-date";
import {
  normalizeRandomRunWaveCount,
  RANDOM_RUN_ALGORITHM_VERSION,
  RANDOM_RUN_WAVE_COUNTS,
  type RandomRunWaveCount,
} from "./random-run";
import { normalizeSeededRunCompatibility } from "./seeded-run-compatibility";

export interface DailyRunMenuContext {
  launch: (request: DailyRunLaunchRequest) => void;
  cancel: () => void;
}

const OFFICIAL_VISIBLE_LIST_ROWS = 6;
const OFFICIAL_LIST_PAGE_STEP = 4;
const HISTORY_VISIBLE_LIST_ROWS = 6;
const HISTORY_LIST_PAGE_STEP = 4;

function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(`menu:${key}`, options);
}

/** Remove every previous overlay before presenting the next Daily Run screen. */
function inCleanMessageMode(callback: () => void): void {
  globalScene.ui.resetModeChain();
  if (globalScene.ui.getMode() === UiMode.MESSAGE) {
    const handler = globalScene.ui.getHandler();
    handler.clear();
    handler.show([]);
    globalScene.ui.clearText();
    callback();
    return;
  }
  void globalScene.ui.setMode(UiMode.MESSAGE).then(() => {
    globalScene.ui.clearText();
    callback();
  });
}

function showOptions(
  options: OptionSelectItem[],
  help: string,
  initialCursor = 0,
  maxOptions?: number,
  pageStep?: number,
): void {
  inCleanMessageMode(() => {
    globalScene.ui.showText(help, 0);
    void globalScene.ui.setOverlayMode(UiMode.OPTION_SELECT, {
      options,
      initialCursor,
      maxOptions,
      measureVisibleOptionsOnly: maxOptions != null,
      pageStep,
      supportHover: true,
      wrapNavigation: false,
    });
  });
}

function cancelOption(handler: () => void, helpKey = "shadowDailyCancelHelp"): OptionSelectItem {
  return {
    label: t("cancel"),
    handler: () => {
      handler();
      return true;
    },
    onHover: () => globalScene.ui.showText(t(helpKey), 0),
  };
}

function showAcknowledgement(message: string, callback: () => void): void {
  inCleanMessageMode(() => globalScene.ui.showText(message, null, callback, null, true));
}

function showError(message: string, callback: () => void): void {
  console.warn("Daily Run menu error:", message);
  showAcknowledgement(`${t("shadowDailyError")}\n${message}`, callback);
}

function confirm(message: string, yes: () => void, no: () => void): void {
  inCleanMessageMode(() => {
    globalScene.ui.showText(message, null, () => {
      void globalScene.ui.setOverlayMode(UiMode.CONFIRM, yes, no);
    });
  });
}

function confirmGeneratedSeed(seed: string, yes: () => void, no: () => void): void {
  confirm(t("shadowDailyGeneratedSeed", { seed }), yes, no);
}

function archiveEntryHelp(entry: DailyArchiveEntry): string {
  return [
    `${entry.date} - ${entry.format === "daily-config" ? t("shadowDailySpecialType") : t("shadowDailyStandardType")}`,
    t("shadowDailySeedValue", { seed: entry.seed }),
  ].join("\n");
}

function requestForArchiveEntry(entry: DailyArchiveEntry, loaded: LoadedDailyArchive): DailyRunLaunchRequest {
  if (entry.format === "seed") {
    return {
      seedOrConfig: entry.seed,
      metadata: {
        mode: "official",
        canonicalSeed: entry.seed,
        selectedDate: entry.date,
        archiveSource: loaded.source,
        archiveDownloadedAt: loaded.downloadedAt,
        specialDailyConfig: false,
      },
    };
  }
  const serializedDailyConfig = serializeSpecialDailyEntry(entry);
  if (!parseDailySeed(serializedDailyConfig)) {
    throw new Error(t("shadowDailyInvalidSpecialConfig", { date: entry.date }));
  }
  return {
    seedOrConfig: serializedDailyConfig,
    metadata: {
      mode: "official",
      canonicalSeed: entry.seed,
      selectedDate: entry.date,
      archiveSource: loaded.source,
      archiveDownloadedAt: loaded.downloadedAt,
      specialDailyConfig: true,
      serializedDailyConfig,
    },
  };
}

function showOfficialDateList(context: DailyRunMenuContext, loaded: LoadedDailyArchive, cursor = 0): void {
  const options: OptionSelectItem[] = loaded.archive.entries.map((entry, index) => ({
    label: `${entry.date}${entry.format === "daily-config" ? `  ${t("shadowDailySpecialIndicator")}` : ""}`,
    handler: () => {
      try {
        context.launch(requestForArchiveEntry(entry, loaded));
      } catch (error) {
        showError(error instanceof Error ? error.message : t("shadowDailyUnknownError"), () =>
          showOfficialDateList(context, loaded, index),
        );
      }
      return true;
    },
    onHover: () => globalScene.ui.showText(archiveEntryHelp(entry), 0),
  }));
  options.push({
    label: t("cancel"),
    handler: () => (showDailyRunTypeMenu(context), true),
    onHover: () => globalScene.ui.showText(t("shadowDailyCancelDateHelp"), 0),
  });
  showOptions(
    options,
    archiveEntryHelp(loaded.archive.entries[cursor]),
    cursor,
    OFFICIAL_VISIBLE_LIST_ROWS,
    OFFICIAL_LIST_PAGE_STEP,
  );
}

function openOfficialArchive(context: DailyRunMenuContext): void {
  inCleanMessageMode(() => globalScene.ui.showText(t("shadowDailyLoadingArchive"), 0));
  void loadOfficialDailyArchive()
    .then((loaded) => {
      showAcknowledgement(loaded.notice, () => showOfficialDateList(context, loaded));
    })
    .catch((error) => {
      showError(error instanceof Error ? error.message : t("shadowDailyUnknownError"), () =>
        showDailyRunTypeMenu(context),
      );
    });
}

function launchOfflineDate(context: DailyRunMenuContext, date: string, canonicalSeed: string, back: () => void): void {
  confirm(
    t("shadowDailyOfflineConfirm", { date }),
    () => {
      context.launch({
        seedOrConfig: canonicalSeed,
        metadata: {
          mode: "offline",
          canonicalSeed,
          selectedDate: date,
          algorithmVersion: OFFLINE_DAILY_ALGORITHM_VERSION,
          specialDailyConfig: false,
        },
      });
    },
    back,
  );
}

function openOfflineToday(context: DailyRunMenuContext): void {
  const selectedInstant = new Date();
  const date = getUtcDateKey(selectedInstant);
  launchOfflineDate(context, date, createOfflineDailySeed(selectedInstant), () => showOfflineRunMenu(context));
}

function openOfflineDate(context: DailyRunMenuContext, year: number, month: number, day: number): void {
  const date = formatCalendarDate({ year, month, day });
  launchOfflineDate(context, date, createOfflineDailySeedForDate(date), () => showOfflineDayMenu(context, year, month));
}

const OFFLINE_DATE_VISIBLE_ROWS = 7;
const OFFLINE_YEAR_PAGE_STEP = 10;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function showOfflineYearMenu(context: DailyRunMenuContext): void {
  const years = getOfflineDailyYears();
	const options: OptionSelectItem[] = years.map((year) => ({
    label: String(year),
    handler: () => {
      showOfflineMonthMenu(context, year);
      return true;
    },
    onHover: () => globalScene.ui.showText(t("shadowDailyOfflineYearHelp"), 0),
  }));
  options.push(cancelOption(() => showOfflineRunMenu(context)));
  showOptions(options, t("shadowDailyOfflineYearHelp"), 0, OFFLINE_DATE_VISIBLE_ROWS, OFFLINE_YEAR_PAGE_STEP);
}

function showOfflineMonthMenu(context: DailyRunMenuContext, year: number): void {
	const options: OptionSelectItem[] = getOfflineDailyMonths(year).map((month) => ({
    label: `${String(month).padStart(2, "0")}-${MONTH_LABELS[month - 1]}`,
    handler: () => {
      showOfflineDayMenu(context, year, month);
      return true;
    },
    onHover: () => globalScene.ui.showText(t("shadowDailyOfflineMonthHelp"), 0),
  }));
  options.push(cancelOption(() => showOfflineYearMenu(context)));
  showOptions(options, t("shadowDailyOfflineMonthHelp"), 0, OFFLINE_DATE_VISIBLE_ROWS, 6);
}

function showOfflineDayMenu(context: DailyRunMenuContext, year: number, month: number): void {
	const options: OptionSelectItem[] = getOfflineDailyDays(year, month).map((day) => ({
    label: String(day).padStart(2, "0"),
    handler: () => {
      openOfflineDate(context, year, month, day);
      return true;
    },
    onHover: () => globalScene.ui.showText(t("shadowDailyOfflineDayHelp"), 0),
  }));
  options.push(cancelOption(() => showOfflineMonthMenu(context, year)));
  showOptions(options, t("shadowDailyOfflineDayHelp"), 0, OFFLINE_DATE_VISIBLE_ROWS, 7);
}

export function showOfflineRunMenu(context: DailyRunMenuContext): void {
  const yesterday = formatCalendarDate(getPreviousLocalCalendarDate());
  showOptions(
    [
      {
        label: t("shadowDailyOfflineToday"),
        handler: () => {
          openOfflineToday(context);
          return true;
        },
        onHover: () => globalScene.ui.showText(t("shadowDailyOfflineTodayDescription"), 0),
      },
      {
        label: t("shadowDailyOfflineYesterday"),
        handler: () => {
          launchOfflineDate(context, yesterday, createOfflineDailySeedForDate(yesterday), () =>
            showOfflineRunMenu(context),
          );
          return true;
        },
        onHover: () => globalScene.ui.showText(t("shadowDailyOfflineYesterdayDescription"), 0),
      },
      {
        label: t("shadowDailyOfflineChooseDate"),
        handler: () => {
          showOfflineYearMenu(context);
          return true;
        },
        onHover: () => globalScene.ui.showText(t("shadowDailyOfflineChooseDateDescription"), 0),
      },
      cancelOption(() => showDailyRunTypeMenu(context)),
    ],
    t("shadowDailyOfflineMenuHelp"),
  );
}

function createRandomRunRequest(
  canonicalSeed: string,
  waveCount: RandomRunWaveCount,
  generatorVersion = RANDOM_RUN_ALGORITHM_VERSION,
): DailyRunLaunchRequest {
  return {
    seedOrConfig: canonicalSeed,
    metadata: {
      mode: "random",
      canonicalSeed,
      randomRunWaveCount: waveCount,
      algorithmVersion: generatorVersion,
      specialDailyConfig: false,
      seededRunCompatibility: {
        schemaVersion: 1,
        generatorId: "random-daily",
        generatorVersion,
        variant: String(waveCount),
        settings: { waveCount },
      },
    },
  };
}

function openRandomRun(context: DailyRunMenuContext, waveCount: RandomRunWaveCount): void {
  const back = () => showRandomRunVariantMenu(context);
  confirm(
    t("shadowDailyRandomConfirm", { waves: waveCount }),
    () => {
      const canonicalSeed = createRandomCanonicalSeed(`${RANDOM_RUN_ALGORITHM_VERSION}|${waveCount}`);
      confirmGeneratedSeed(canonicalSeed, () => context.launch(createRandomRunRequest(canonicalSeed, waveCount)), back);
    },
    back,
  );
}

export function showRandomRunVariantMenu(context: DailyRunMenuContext): void {
  const options: OptionSelectItem[] = RANDOM_RUN_WAVE_COUNTS.map((waveCount) => ({
    label: t("shadowDailyRandomWaveOption", { waves: waveCount }),
    handler: () => (openRandomRun(context, waveCount), true),
    onHover: () => globalScene.ui.showText(t("shadowDailyRandomWaveDescription", { waves: waveCount }), 0),
  }));
  options.push(cancelOption(() => showDailyRunTypeMenu(context)));
  showOptions(options, t("shadowDailyRandomVariantHelp"));
}

function createBossRushRequest(
  canonicalSeed: string,
  variant: BossRushVariant,
  generatorVersion = BOSS_RUSH_ALGORITHM_VERSION,
  savedManifest?: DailySeedHistoryEntry["bossRushManifest"],
): DailyRunLaunchRequest {
  const manifest = savedManifest ?? generateBossRushManifest(canonicalSeed, variant, generatorVersion);
  return {
    seedOrConfig: canonicalSeed,
    metadata: {
      mode: "boss-rush",
      canonicalSeed,
      algorithmVersion: generatorVersion,
      bossRushVariant: variant,
      specialDailyConfig: false,
      bossRushManifest: manifest,
      seededRunCompatibility: {
        schemaVersion: 1,
        generatorId: "boss-rush",
        generatorVersion,
        variant,
        snapshot: manifest,
      },
    },
  };
}

function openBossRushVariant(context: DailyRunMenuContext, variant: BossRushVariant): void {
  const back = () => showBossRushVariantMenu(context);
  confirm(
    t(variant === BossRushVariant.HARD ? "shadowDailyBossRushHardConfirm" : "shadowDailyBossRushConfirm"),
    () => {
      const canonicalSeed = createRandomCanonicalSeed(BOSS_RUSH_ALGORITHM_VERSION);
      confirmGeneratedSeed(canonicalSeed, () => context.launch(createBossRushRequest(canonicalSeed, variant)), back);
    },
    back,
  );
}

export function showBossRushVariantMenu(context: DailyRunMenuContext): void {
  showOptions(
    [
      {
        label: t("shadowDailyBossRushNormal"),
        handler: () => (openBossRushVariant(context, BossRushVariant.NORMAL), true),
        onHover: () => globalScene.ui.showText(t("shadowDailyBossRushNormalDescription"), 0),
      },
      {
        label: t("shadowDailyBossRushHard"),
        handler: () => (openBossRushVariant(context, BossRushVariant.HARD), true),
        onHover: () => globalScene.ui.showText(t("shadowDailyBossRushHardDescription"), 0),
      },
      cancelOption(() => showDailyRunTypeMenu(context)),
    ],
    t("shadowDailyBossRushVariantHelp"),
  );
}

function historyModeLabel(entry: DailySeedHistoryEntry): string {
  return getDailyRunDisplayMetadata({
    mode: entry.mode,
    canonicalSeed: entry.canonicalSeed,
    bossRushVariant: entry.bossRushVariant,
    randomRunWaveCount: entry.randomRunWaveCount,
    seededRunCompatibility: entry.seededRunCompatibility,
    bossRushManifest: entry.bossRushManifest,
  }).compact;
}

function historyTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function historyLabel(entry: DailySeedHistoryEntry): string {
  const identity =
    entry.mode === "official" || entry.mode === "offline"
      ? (entry.selectedDate ?? "UTC")
      : entry.mode === "custom-text"
        ? `“${Array.from(entry.friendlyTextSeed ?? "")
            .slice(0, 16)
            .join("")}”`
        : entry.canonicalSeed.slice(0, 8);
  return `${historyTimestamp(entry.usedAt)}  ${historyModeLabel(entry)}  ${identity}`;
}

function historyHelp(entry: DailySeedHistoryEntry): string {
  const detail =
    entry.mode === "official"
      ? t("shadowDailyPreviousOfficialDetail", { date: entry.selectedDate })
      : entry.mode === "offline"
        ? t("shadowDailyPreviousOfflineDetail", { date: entry.selectedDate })
        : entry.mode === "custom-text"
          ? t("shadowDailyPreviousTextDetail", { text: entry.friendlyTextSeed })
          : entry.mode === "boss-rush"
            ? t("shadowDailyPreviousBossRushDetail")
            : t("shadowDailyPreviousRandomDetail");
  return `${detail}\n${t("shadowDailySeedValue", { seed: entry.canonicalSeed })}`;
}

function showPreviousSeedList(context: DailyRunMenuContext, cursor = 0): void {
  const entries = readDailySeedHistory();
  if (entries.length === 0) {
    showError(t("shadowDailyPreviousEmpty"), () => showCustomRunMenu(context));
    return;
  }
  const safeCursor = Math.min(cursor, entries.length - 1);
  const options: OptionSelectItem[] = entries.map((entry) => ({
    label: historyLabel(entry),
    handler: () => {
      if (entry.mode === "boss-rush") {
        const compatibility =
          normalizeSeededRunCompatibility<NonNullable<DailySeedHistoryEntry["bossRushManifest"]>>(entry)!;
        const variant = compatibility.variant === "hard" ? BossRushVariant.HARD : BossRushVariant.NORMAL;
        context.launch(
          createBossRushRequest(
            entry.canonicalSeed,
            variant,
            compatibility.generatorVersion,
            compatibility.snapshot ?? entry.bossRushManifest,
          ),
        );
        return true;
      }
      if (entry.mode === "random") {
        const compatibility = normalizeSeededRunCompatibility(entry)!;
        const waveCount = normalizeRandomRunWaveCount(
          entry.randomRunWaveCount ?? compatibility.settings?.waveCount ?? compatibility.variant,
        );
        context.launch(createRandomRunRequest(entry.canonicalSeed, waveCount, compatibility.generatorVersion));
        return true;
      }
      context.launch({
        seedOrConfig: entry.serializedDailyConfig ?? entry.canonicalSeed,
        metadata: {
          // Preserve the original run type. This controls both the save-slot
          // label and the new history event created for this replay.
          mode: entry.mode,
          canonicalSeed: entry.canonicalSeed,
          selectedDate: entry.selectedDate,
          friendlyTextSeed: entry.friendlyTextSeed,
          algorithmVersion: entry.algorithmVersion,
          archiveSource: entry.archiveSource,
          archiveDownloadedAt: entry.archiveDownloadedAt,
          specialDailyConfig: entry.specialDailyConfig ?? false,
          serializedDailyConfig: entry.serializedDailyConfig,
          seededRunCompatibility: entry.seededRunCompatibility,
        },
      });
      return true;
    },
    onHover: () => globalScene.ui.showText(historyHelp(entry), 0),
  }));
  options.push(cancelOption(() => showCustomRunMenu(context), "shadowDailyCancelPreviousHelp"));
  showOptions(options, historyHelp(entries[safeCursor]), safeCursor, HISTORY_VISIBLE_LIST_ROWS, HISTORY_LIST_PAGE_STEP);
}

function openTextSeedKeyboard(context: DailyRunMenuContext): void {
  const config: DailySeedKeyboardConfig = {
    onConfirm: (value) => {
      const result = createCustomTextSeed(value);
      confirmGeneratedSeed(
        result.canonicalSeed,
        () =>
          context.launch({
            seedOrConfig: result.canonicalSeed,
            metadata: {
              mode: "custom-text",
              canonicalSeed: result.canonicalSeed,
              friendlyTextSeed: result.friendlyText,
              algorithmVersion: CUSTOM_TEXT_ALGORITHM_VERSION,
              specialDailyConfig: false,
            },
          }),
        () => showCustomRunMenu(context),
      );
    },
    onCancel: () => showCustomRunMenu(context),
  };
  inCleanMessageMode(() => {
    void globalScene.ui.setOverlayMode(UiMode.DAILY_SEED_KEYBOARD, config);
  });
}

function showCustomRunMenu(context: DailyRunMenuContext): void {
  const options: OptionSelectItem[] = [
    {
      label: t("shadowDailyPreviousSeed"),
      handler: () => (showPreviousSeedList(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyPreviousDescription"), 0),
    },
    {
      label: t("shadowDailyTextSeed"),
      handler: () => (openTextSeedKeyboard(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyTextDescription"), 0),
    },
    cancelOption(() => showDailyRunTypeMenu(context)),
  ];
  showOptions(options, t("shadowDailyPreviousDescription"));
}

export function showDailyRunTypeMenu(context: DailyRunMenuContext): void {
  const options: OptionSelectItem[] = [
    {
      label: t("shadowDailyOfficial"),
      handler: () => (openOfficialArchive(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyOfficialDescription"), 0),
    },
    {
      label: t("shadowDailyOffline"),
      handler: () => (showOfflineRunMenu(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyOfflineDescription"), 0),
    },
    {
      label: t("shadowDailyBossRush"),
      handler: () => (showBossRushVariantMenu(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyBossRushDescription"), 0),
    },
    {
      label: t("shadowDailyCustom"),
      handler: () => (showCustomRunMenu(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyCustomDescription"), 0),
    },
    {
      label: t("shadowDailyRandom"),
      handler: () => (showRandomRunVariantMenu(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyRandomDescription"), 0),
    },
    cancelOption(() => inCleanMessageMode(context.cancel), "shadowDailyCancelRootHelp"),
  ];
  showOptions(options, t("shadowDailyOfficialDescription"));
}
