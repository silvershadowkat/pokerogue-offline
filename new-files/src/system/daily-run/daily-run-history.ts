import type { BossRushManifest, BossRushVariant } from "./boss-rush";
import type { DailyRunMetadata } from "./daily-run-types";
import { normalizeSeededRunCompatibility, type SeededRunCompatibility } from "./seeded-run-compatibility";

export const DAILY_SEED_HISTORY_STORAGE_KEY = "silvershadow_daily_seed_history_v1";
export const MAX_DAILY_SEED_HISTORY_ENTRIES = 1000;

export type DailySeedHistoryMode = "official" | "offline" | "random" | "custom-text" | "boss-rush";

export interface DailySeedHistoryEntry {
  canonicalSeed: string;
  mode: DailySeedHistoryMode;
  usedAt: number;
  useCount: number;
  selectedDate?: string | undefined;
  friendlyTextSeed?: string | undefined;
  algorithmVersion?: string | undefined;
  archiveSource?: DailyRunMetadata["archiveSource"];
  archiveDownloadedAt?: number | undefined;
  specialDailyConfig?: boolean | undefined;
  serializedDailyConfig?: string | undefined;
  bossRushVariant?: BossRushVariant | undefined;
  bossRushManifest?: BossRushManifest | undefined;
  seededRunCompatibility: SeededRunCompatibility<BossRushManifest>;
}

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return;
  }
}

function isHistoryMode(value: unknown): value is DailySeedHistoryMode {
  return (
    value === "official"
    || value === "offline"
    || value === "random"
    || value === "custom-text"
    || value === "boss-rush"
  );
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
  const archiveSource: DailyRunMetadata["archiveSource"] =
    candidate.archiveSource === "downloaded"
    || candidate.archiveSource === "cached"
    || candidate.archiveSource === "built-in"
      ? candidate.archiveSource
      : undefined;
  const raw = {
    canonicalSeed: candidate.canonicalSeed,
    mode: candidate.mode,
    usedAt: Number(candidate.usedAt),
    useCount:
      Number.isSafeInteger(candidate.useCount) && Number(candidate.useCount) > 0 ? Number(candidate.useCount) : 1,
    selectedDate: typeof candidate.selectedDate === "string" ? candidate.selectedDate : undefined,
    friendlyTextSeed: typeof candidate.friendlyTextSeed === "string" ? candidate.friendlyTextSeed : undefined,
    algorithmVersion: typeof candidate.algorithmVersion === "string" ? candidate.algorithmVersion : undefined,
    archiveSource,
    archiveDownloadedAt: Number.isFinite(candidate.archiveDownloadedAt)
      ? Number(candidate.archiveDownloadedAt)
      : undefined,
    specialDailyConfig: typeof candidate.specialDailyConfig === "boolean" ? candidate.specialDailyConfig : undefined,
    serializedDailyConfig:
      typeof candidate.serializedDailyConfig === "string" ? candidate.serializedDailyConfig : undefined,
    bossRushVariant: candidate.bossRushVariant === "hard" ? ("hard" as BossRushVariant) : undefined,
    bossRushManifest:
      typeof candidate.bossRushManifest === "object" && candidate.bossRushManifest != null
        ? (candidate.bossRushManifest as unknown as BossRushManifest)
        : undefined,
    seededRunCompatibility:
      typeof candidate.seededRunCompatibility === "object" && candidate.seededRunCompatibility != null
        ? (candidate.seededRunCompatibility as unknown as SeededRunCompatibility<BossRushManifest>)
        : undefined,
  };
  const compatibility = normalizeSeededRunCompatibility<BossRushManifest>(raw);
  return compatibility ? { ...raw, seededRunCompatibility: compatibility } : undefined;
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
  const next: DailySeedHistoryEntry = {
    canonicalSeed: metadata.canonicalSeed,
    mode: metadata.mode,
    usedAt,
    useCount: 1,
    selectedDate: metadata.selectedDate,
    friendlyTextSeed: metadata.friendlyTextSeed,
    algorithmVersion: metadata.algorithmVersion,
    archiveSource: metadata.archiveSource,
    archiveDownloadedAt: metadata.archiveDownloadedAt,
    specialDailyConfig: metadata.specialDailyConfig,
    serializedDailyConfig: metadata.serializedDailyConfig,
    bossRushVariant: metadata.bossRushVariant,
    bossRushManifest: metadata.bossRushManifest,
    seededRunCompatibility: normalizeSeededRunCompatibility<BossRushManifest>(metadata)!,
  };
  // This is a run history, not a favorites list. Replaying the same seed is a
  // new event and deliberately creates another timestamped row.
  const updated = [next, ...history].slice(0, MAX_DAILY_SEED_HISTORY_ENTRIES);
  try {
    storage.setItem(DAILY_SEED_HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn("Could not persist Daily seed history.", error);
  }
}
