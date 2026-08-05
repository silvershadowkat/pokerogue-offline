import type { DailyRunMetadata } from "./daily-run-types";

export const DAILY_SEED_HISTORY_STORAGE_KEY = "silvershadow_daily_seed_history_v1";
export const MAX_DAILY_SEED_HISTORY_ENTRIES = 1000;

export type DailySeedHistoryMode = "offline" | "random" | "custom-text";

export interface DailySeedHistoryEntry {
  canonicalSeed: string;
  mode: DailySeedHistoryMode;
  usedAt: number;
  useCount: number;
  selectedDate?: string | undefined;
  friendlyTextSeed?: string | undefined;
  algorithmVersion?: string | undefined;
}

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isHistoryMode(value: unknown): value is DailySeedHistoryMode {
  return value === "offline" || value === "random" || value === "custom-text";
}

function validateEntry(value: unknown): DailySeedHistoryEntry | undefined {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.canonicalSeed !== "string"
    || !candidate.canonicalSeed
    || !isHistoryMode(candidate.mode)
    || !Number.isFinite(candidate.usedAt)
    || Number(candidate.usedAt) <= 0
  ) {
    return;
  }
  return {
    canonicalSeed: candidate.canonicalSeed,
    mode: candidate.mode,
    usedAt: Number(candidate.usedAt),
    useCount: Number.isSafeInteger(candidate.useCount) && Number(candidate.useCount) > 0
      ? Number(candidate.useCount)
      : 1,
    selectedDate: typeof candidate.selectedDate === "string" ? candidate.selectedDate : undefined,
    friendlyTextSeed: typeof candidate.friendlyTextSeed === "string" ? candidate.friendlyTextSeed : undefined,
    algorithmVersion: typeof candidate.algorithmVersion === "string" ? candidate.algorithmVersion : undefined,
  };
}

export function readDailySeedHistory(): DailySeedHistoryEntry[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  try {
    const parsed = JSON.parse(storage.getItem(DAILY_SEED_HISTORY_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Daily seed history root is not an array.");
    }
    return parsed
      .map(validateEntry)
      .filter((entry): entry is DailySeedHistoryEntry => entry != null)
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, MAX_DAILY_SEED_HISTORY_ENTRIES);
  } catch (error) {
    console.warn("Ignoring invalid Daily seed history.", error);
    return [];
  }
}

export function recordDailySeedHistory(metadata: DailyRunMetadata, usedAt = Date.now()): void {
  if (!isHistoryMode(metadata.mode) || !metadata.canonicalSeed || !Number.isFinite(usedAt) || usedAt <= 0) {
    return;
  }
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const history = readDailySeedHistory();
  const previous = history.find(entry => entry.canonicalSeed === metadata.canonicalSeed);
  const next: DailySeedHistoryEntry = {
    canonicalSeed: metadata.canonicalSeed,
    mode: metadata.mode,
    usedAt,
    useCount: (previous?.useCount ?? 0) + 1,
    selectedDate: metadata.selectedDate,
    friendlyTextSeed: metadata.friendlyTextSeed,
    algorithmVersion: metadata.algorithmVersion,
  };
  const updated = [next, ...history.filter(entry => entry.canonicalSeed !== metadata.canonicalSeed)]
    .slice(0, MAX_DAILY_SEED_HISTORY_ENTRIES);
  try {
    storage.setItem(DAILY_SEED_HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn("Could not persist Daily seed history.", error);
  }
}
