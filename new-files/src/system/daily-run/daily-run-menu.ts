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
    .then(loaded => {
      showAcknowledgement(loaded.notice, () => showOfficialDateList(context, loaded));
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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function historyLabel(entry: DailySeedHistoryEntry): string {
  const identity = entry.mode === "official" || entry.mode === "offline"
    ? entry.selectedDate ?? "UTC"
    : entry.mode === "custom-text"
      ? `“${Array.from(entry.friendlyTextSeed ?? "").slice(0, 16).join("")}”`
      : entry.canonicalSeed.slice(0, 8);
  return `${historyTimestamp(entry.usedAt)}  ${historyModeLabel(entry)}  ${identity}`;
}

function historyHelp(entry: DailySeedHistoryEntry): string {
  const detail = entry.mode === "official"
    ? t("shadowDailyPreviousOfficialDetail", { date: entry.selectedDate })
    : entry.mode === "offline"
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
  showOptions(
    options,
    historyHelp(entries[safeCursor]),
    safeCursor,
    HISTORY_VISIBLE_LIST_ROWS,
    HISTORY_LIST_PAGE_STEP,
  );
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
    { label: t("cancel"), handler: () => (showDailyRunTypeMenu(context), true) },
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
    { label: t("cancel"), handler: () => (inCleanMessageMode(context.cancel), true) },
  ];
  showOptions(options, t("shadowDailyOfficialDescription"));
}
