import { globalScene } from "#app/global-scene";
import { parseDailySeed } from "#data/daily-seed/daily-seed-utils";
import { UiMode } from "#enums/ui-mode";
import type { OptionSelectItem } from "#types/ui-types";
import type { DailySeedKeyboardConfig } from "#ui/handlers/daily-seed-keyboard-ui-handler";
import i18next from "i18next";
import {
  loadOfficialDailyArchive,
  serializeSpecialDailyEntry,
  type DailyArchiveEntry,
  type LoadedDailyArchive,
} from "./daily-run-archive";
import { readDailySeedHistory, type DailySeedHistoryEntry } from "./daily-run-history";
import {
  createCustomTextSeed,
  createOfflineDailySeed,
  createRandomDailySeed,
  CUSTOM_TEXT_ALGORITHM_VERSION,
  getUtcDateKey,
  OFFLINE_DAILY_ALGORITHM_VERSION,
  RANDOM_DAILY_ALGORITHM_VERSION,
} from "./daily-run-seed-utils";
import type { DailyRunLaunchRequest } from "./daily-run-types";

export interface DailyRunMenuContext {
  launch: (request: DailyRunLaunchRequest) => void;
  cancel: () => void;
}

const MAX_VISIBLE_LIST_ROWS = 8;
const LIST_PAGE_STEP = 6;

function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(`menu:${key}`, options);
}

function showOptions(options: OptionSelectItem[], initialCursor = 0, largeList = false): void {
  globalScene.ui.refreshOverlayMode(UiMode.OPTION_SELECT, {
    options,
    initialCursor,
    maxOptions: largeList ? MAX_VISIBLE_LIST_ROWS : undefined,
    measureVisibleOptionsOnly: largeList,
    pageStep: largeList ? LIST_PAGE_STEP : undefined,
    supportHover: true,
    wrapNavigation: false,
  });
}

/** Errors advance automatically instead of leaving input trapped in the previous option handler. */
function showError(message: string, callback: () => void): void {
  console.warn("Daily Run menu error:", message);
  globalScene.ui.showText(`${t("shadowDailyError")}\n${message}`, null, callback);
}

function confirm(message: string, yes: () => void, no: () => void): void {
  globalScene.ui.showText(message, null, () => {
    globalScene.ui.setOverlayMode(UiMode.CONFIRM, yes, no);
  });
}

/** Show the generated seed and a live Yes/No overlay at the same time. */
function confirmGeneratedSeed(seed: string, yes: () => void, no: () => void): void {
  globalScene.ui.showText(t("shadowDailyGeneratedSeed", { seed }), 0);
  globalScene.ui.setOverlayMode(UiMode.CONFIRM, yes, no);
}

function archiveEntryHelp(entry: DailyArchiveEntry, loaded: LoadedDailyArchive): string {
  return [
    `${entry.date} · ${entry.format === "daily-config" ? t("shadowDailySpecialType") : t("shadowDailyStandardType")}`,
    `${t("shadowDailySeedValue", { seed: entry.seed })} · ${t("shadowDailyArchiveSource", {
      source: t(`shadowDailySource${loaded.source}`),
    })}`,
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
    onHover: () => globalScene.ui.showText(archiveEntryHelp(entry, loaded), 0),
  }));
  options.push({
    label: t("cancel"),
    handler: () => (showDailyRunTypeMenu(context), true),
    onHover: () => globalScene.ui.showText(t("shadowDailyCancelDateHelp"), 0),
  });
  globalScene.ui.showText(archiveEntryHelp(loaded.archive.entries[cursor], loaded), 0);
  showOptions(options, cursor, true);
}

function openOfficialArchive(context: DailyRunMenuContext): void {
  globalScene.ui.showText(t("shadowDailyLoadingArchive"), 0);
  void loadOfficialDailyArchive()
    .then(loaded => {
      // This is deliberately not a prompt. The old prompt left input routed to
      // a cleared OPTION_SELECT handler and softlocked before the date list.
      globalScene.ui.showText(loaded.notice, null, () => showOfficialDateList(context, loaded));
    })
    .catch(error => {
      showError(error instanceof Error ? error.message : t("shadowDailyUnknownError"), () =>
        showDailyRunTypeMenu(context),
      );
    });
}

function openOfflineRun(context: DailyRunMenuContext): void {
  const selectedInstant = new Date();
  const date = getUtcDateKey(selectedInstant);
  confirm(
    t("shadowDailyOfflineConfirm", { date }),
    () => {
      const canonicalSeed = createOfflineDailySeed(selectedInstant);
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
    () => showDailyRunTypeMenu(context),
  );
}

function openRandomRun(context: DailyRunMenuContext): void {
  confirm(
    t("shadowDailyRandomConfirm"),
    () => {
      const canonicalSeed = createRandomDailySeed();
      confirmGeneratedSeed(
        canonicalSeed,
        () => context.launch({
          seedOrConfig: canonicalSeed,
          metadata: {
            mode: "random",
            canonicalSeed,
            algorithmVersion: RANDOM_DAILY_ALGORITHM_VERSION,
            specialDailyConfig: false,
          },
        }),
        () => showDailyRunTypeMenu(context),
      );
    },
    () => showDailyRunTypeMenu(context),
  );
}

function historyModeLabel(entry: DailySeedHistoryEntry): string {
  return t(`shadowDailyHistoryMode${entry.mode}`);
}

function historyTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function historyLabel(entry: DailySeedHistoryEntry): string {
  const identity = entry.mode === "offline"
    ? entry.selectedDate ?? "UTC"
    : entry.mode === "custom-text"
      ? `“${Array.from(entry.friendlyTextSeed ?? "").slice(0, 16).join("")}”`
      : entry.canonicalSeed.slice(0, 8);
  return `${historyTimestamp(entry.usedAt)}  ${historyModeLabel(entry)}  ${identity}`;
}

function historyHelp(entry: DailySeedHistoryEntry): string {
  const detail = entry.mode === "offline"
    ? t("shadowDailyPreviousOfflineDetail", { date: entry.selectedDate })
    : entry.mode === "custom-text"
      ? t("shadowDailyPreviousTextDetail", { text: entry.friendlyTextSeed })
      : t("shadowDailyPreviousRandomDetail");
  return `${detail}\n${t("shadowDailySeedValue", { seed: entry.canonicalSeed })}`;
}

function showPreviousSeedList(context: DailyRunMenuContext, cursor = 0): void {
  const entries = readDailySeedHistory();
  if (!entries.length) {
    showError(t("shadowDailyPreviousEmpty"), () => showCustomRunMenu(context));
    return;
  }
  const safeCursor = Math.min(cursor, entries.length - 1);
  const options: OptionSelectItem[] = entries.map((entry, index) => ({
    label: historyLabel(entry),
    handler: () => {
      context.launch({
        seedOrConfig: entry.canonicalSeed,
        metadata: {
          mode: "previous",
          canonicalSeed: entry.canonicalSeed,
          selectedDate: entry.selectedDate,
          friendlyTextSeed: entry.friendlyTextSeed,
          algorithmVersion: entry.algorithmVersion,
          specialDailyConfig: false,
        },
      });
      return true;
    },
    onHover: () => globalScene.ui.showText(historyHelp(entry), 0),
  }));
  options.push({
    label: t("cancel"),
    handler: () => (showCustomRunMenu(context), true),
    onHover: () => globalScene.ui.showText(t("shadowDailyPreviousDescription"), 0),
  });
  globalScene.ui.showText(historyHelp(entries[safeCursor]), 0);
  showOptions(options, safeCursor, true);
}

function openTextSeedKeyboard(context: DailyRunMenuContext): void {
  const config: DailySeedKeyboardConfig = {
    onConfirm: value => {
      const result = createCustomTextSeed(value);
      confirmGeneratedSeed(
        result.canonicalSeed,
        () => context.launch({
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
  globalScene.ui.refreshOverlayMode(UiMode.DAILY_SEED_KEYBOARD, config);
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
    { label: t("cancel"), handler: () => (showDailyRunTypeMenu(context), true) },
  ];
  globalScene.ui.showText(t("shadowDailyPreviousDescription"), 0);
  showOptions(options);
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
      handler: () => (openOfflineRun(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyOfflineDescription"), 0),
    },
    {
      label: t("shadowDailyRandom"),
      handler: () => (openRandomRun(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyRandomDescription"), 0),
    },
    {
      label: t("shadowDailyCustom"),
      handler: () => (showCustomRunMenu(context), true),
      onHover: () => globalScene.ui.showText(t("shadowDailyCustomDescription"), 0),
    },
    { label: t("cancel"), handler: () => (context.cancel(), true) },
  ];
  globalScene.ui.showText(t("shadowDailyOfficialDescription"), 0);
  showOptions(options);
}
