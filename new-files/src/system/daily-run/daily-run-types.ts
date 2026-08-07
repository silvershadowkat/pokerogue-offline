import type { BossRushManifest, BossRushVariant } from "./boss-rush";
import { recordDailySeedHistory } from "./daily-run-history";
import type { RandomRunWaveCount } from "./random-run";
import {
  cloneSeededRunCompatibility,
  normalizeSeededRunCompatibility,
  type SeededRunCompatibility,
} from "./seeded-run-compatibility";

export type DailyRunLaunchMode =
  | "official"
  | "offline"
  | "random"
  | "boss-rush"
  | "custom-exact"
  | "custom-text"
  | "previous";

export type DailyRunArchiveSource = "downloaded" | "cached" | "built-in";

/** Extra provenance for a Daily Run. None of these fields participate in gameplay RNG. */
export interface DailyRunMetadata {
  mode: DailyRunLaunchMode;
  canonicalSeed: string;
  selectedDate?: string | undefined;
  friendlyTextSeed?: string | undefined;
  archiveSource?: DailyRunArchiveSource | undefined;
  algorithmVersion?: string | undefined;
  specialDailyConfig?: boolean | undefined;
  /** Complete custom Daily configuration, including its outer seed, for exact resume/replay provenance. */
  serializedDailyConfig?: string | undefined;
  archiveDownloadedAt?: number | undefined;
  /** Fully generated content freezes future Boss Rush encounters across save/resume. */
  bossRushManifest?: BossRushManifest | undefined;
  /** Explicit variant prevents Normal and Hard saves from ever being confused. */
  bossRushVariant?: BossRushVariant | undefined;
  /** Random Run length; absent historical entries are the original 50-wave variant. */
  randomRunWaveCount?: RandomRunWaveCount | undefined;
  /** Generic reconstruction contract for every seeded mode. */
  seededRunCompatibility?: SeededRunCompatibility<BossRushManifest> | undefined;
}

export interface DailyRunLaunchRequest {
  /** Standard canonical seed or complete serialized custom Daily configuration. */
  seedOrConfig: string;
  metadata: DailyRunMetadata;
}

export interface DailyRunSaveLabels {
  short: string;
  long: string;
}

export interface DailyRunDisplayMetadata extends DailyRunSaveLabels {
  compact: string;
  history: string;
}

/** One naming source for saves, resume, Previous Seeds, and completion history. */
export function getDailyRunDisplayMetadata(metadata?: DailyRunMetadata): DailyRunDisplayMetadata {
  switch (metadata?.mode) {
    case "official":
      return {
        short: "Official",
        long: "Official Daily Run",
        compact: "Official Daily Run",
        history: "Official Daily Run",
      };
    case "offline":
      return {
        short: "Offline",
        long: "Offline Daily Run",
        compact: "Offline Daily Run",
        history: "Offline Daily Run",
      };
    case "random": {
      const recordedWaveCount = Number(metadata.seededRunCompatibility?.variant);
      const waveCount = metadata.randomRunWaveCount ?? (Number.isFinite(recordedWaveCount) ? recordedWaveCount : 50);
      const name = `Random${waveCount}`;
      return { short: name, long: name, compact: name, history: name };
    }
    case "boss-rush": {
      const hard =
        metadata.bossRushVariant === "hard"
        || metadata.seededRunCompatibility?.variant === "hard"
        || metadata.bossRushManifest?.variant === "hard";
      const name = hard ? "Boss Rush (H)" : "Boss Rush";
      return { short: name, long: name, compact: name, history: name };
    }
    case "custom-text":
      return { short: "Custom Run", long: "Custom Run", compact: "Custom Run", history: "Custom Run" };
    default:
      return { short: "Daily Run", long: "Daily Run", compact: "Daily Run", history: "Daily Run" };
  }
}

/** Compact names used by the two title rows in the save-slot browser. */
export function getDailyRunSaveLabels(metadata?: DailyRunMetadata): DailyRunSaveLabels {
  const { short, long } = getDailyRunDisplayMetadata(metadata);
  return { short, long };
}

/** Stable identity for first-clear tracking; variants sharing a canonical seed never collide. */
export function getDailyRunCompletionKey(seed: string, metadata?: DailyRunMetadata): string {
  const compatibility = metadata == null ? undefined : normalizeSeededRunCompatibility(metadata);
  if (!compatibility) {
    return seed;
  }
  return [compatibility.generatorId, compatibility.generatorVersion, compatibility.variant, seed].join("|");
}

let pendingDailyRunLaunch: DailyRunLaunchRequest | undefined;
let currentDailyRunMetadata: DailyRunMetadata | undefined;

function cloneMetadata(metadata: DailyRunMetadata): DailyRunMetadata {
  const manifest = metadata.bossRushManifest;
  const normalizedCompatibility = normalizeSeededRunCompatibility<BossRushManifest>(metadata);
  const normalizedVariant =
    metadata.mode === "boss-rush"
      ? ((metadata.bossRushVariant
          ?? normalizedCompatibility?.variant
          ?? manifest?.variant
          ?? "normal") as BossRushVariant)
      : undefined;
  const compatibilityWaveCount = Number(
    normalizedCompatibility?.settings?.waveCount ?? normalizedCompatibility?.variant,
  );
  const normalizedRandomWaveCount =
    metadata.mode === "random"
      ? ((metadata.randomRunWaveCount
          ?? ([5, 10, 20, 30, 50, 100].includes(compatibilityWaveCount)
            ? compatibilityWaveCount
            : 50)) as RandomRunWaveCount)
      : undefined;
  return {
    ...metadata,
    bossRushVariant: normalizedVariant,
    randomRunWaveCount: normalizedRandomWaveCount,
    seededRunCompatibility: cloneSeededRunCompatibility(normalizedCompatibility),
    bossRushManifest:
      manifest == null
        ? undefined
        : {
            ...manifest,
            starters: manifest.starters.map(starter => ({
              ...starter,
              moveset: [...starter.moveset] as BossRushManifest["starters"][number]["moveset"],
              ivs: [...starter.ivs],
            })),
            bosses: manifest.bosses.map(boss => ({
              ...boss,
              moveset: [...boss.moveset] as BossRushManifest["bosses"][number]["moveset"],
              ivs: [...boss.ivs],
            })),
          },
  };
}

export function setPendingDailyRunLaunch(request: DailyRunLaunchRequest): void {
  pendingDailyRunLaunch = {
    seedOrConfig: request.seedOrConfig,
    metadata: cloneMetadata(request.metadata),
  };
}

export function getPendingDailyRunLaunch(): DailyRunLaunchRequest | undefined {
  return pendingDailyRunLaunch == null
    ? undefined
    : { seedOrConfig: pendingDailyRunLaunch.seedOrConfig, metadata: cloneMetadata(pendingDailyRunLaunch.metadata) };
}

export function clearPendingDailyRunLaunch(): void {
  pendingDailyRunLaunch = undefined;
}

export function commitPendingDailyRunLaunch(): DailyRunLaunchRequest | undefined {
  const request = getPendingDailyRunLaunch();
  if (request) {
    currentDailyRunMetadata = cloneMetadata(request.metadata);
    // Record only after the player selected a save slot and the launch was
    // committed. Replays retain their original mode and become new events.
    recordDailySeedHistory(request.metadata);
  }
  pendingDailyRunLaunch = undefined;
  return request;
}

export function getCurrentDailyRunMetadata(): DailyRunMetadata | undefined {
  return currentDailyRunMetadata == null ? undefined : cloneMetadata(currentDailyRunMetadata);
}

export function restoreDailyRunMetadata(metadata?: DailyRunMetadata): void {
  pendingDailyRunLaunch = undefined;
  currentDailyRunMetadata = metadata == null ? undefined : cloneMetadata(metadata);
}

export function clearDailyRunMetadata(): void {
  pendingDailyRunLaunch = undefined;
  currentDailyRunMetadata = undefined;
}
