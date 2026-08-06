export const SEEDED_RUN_COMPATIBILITY_SCHEMA_VERSION = 1;

export type SeededRunGeneratorId =
  | "official-daily"
  | "offline-daily"
  | "random-daily"
  | "custom-text-daily"
  | "boss-rush";

/**
 * Stable reconstruction data stored with every custom seeded run. `snapshot`
 * is intentionally generic: generators whose output is expensive to keep
 * backwards-compatible can persist their compact deterministic manifest here.
 */
export interface SeededRunCompatibility<TSnapshot = unknown> {
  schemaVersion: typeof SEEDED_RUN_COMPATIBILITY_SCHEMA_VERSION;
  generatorId: SeededRunGeneratorId;
  generatorVersion: string;
  variant: string;
  settings?: Record<string, string | number | boolean | null> | undefined;
  snapshot?: TSnapshot | undefined;
}

export interface SeededRunCompatibilitySource<TSnapshot = unknown> {
  mode: string;
  algorithmVersion?: string | undefined;
  bossRushVariant?: string | undefined;
  selectedDate?: string | undefined;
  specialDailyConfig?: boolean | undefined;
  serializedDailyConfig?: string | undefined;
  seededRunCompatibility?: SeededRunCompatibility<TSnapshot> | undefined;
  bossRushManifest?: TSnapshot | undefined;
}

const LEGACY_GENERATOR_DEFAULTS: Readonly<Record<string, { id: SeededRunGeneratorId; version: string }>> = {
  official: { id: "official-daily", version: "SilverShadow-OfficialDaily-v1" },
  offline: { id: "offline-daily", version: "SilverShadow-Daily-v1" },
  random: { id: "random-daily", version: "SilverShadow-Random50-v1" },
  "custom-text": { id: "custom-text-daily", version: "SilverShadow-CustomSeed-v1" },
  "boss-rush": { id: "boss-rush", version: "SilverShadow-BossRush-v1" },
};

/** Migrate old seed-only records to the generator that created their historical behavior. */
export function normalizeSeededRunCompatibility<TSnapshot>(
  source: SeededRunCompatibilitySource<TSnapshot>,
): SeededRunCompatibility<TSnapshot> | undefined {
  if (source.seededRunCompatibility) {
    return cloneSeededRunCompatibility(source.seededRunCompatibility);
  }
  const legacy = LEGACY_GENERATOR_DEFAULTS[source.mode];
  if (!legacy) {
    return;
  }
  return {
    schemaVersion: SEEDED_RUN_COMPATIBILITY_SCHEMA_VERSION,
    generatorId: legacy.id,
    generatorVersion: source.algorithmVersion ?? legacy.version,
    variant: source.mode === "boss-rush" ? (source.bossRushVariant ?? "normal") : "standard",
    settings: {
      selectedDate: source.selectedDate ?? null,
      specialDailyConfig: source.specialDailyConfig ?? false,
      serializedDailyConfig: source.serializedDailyConfig ?? null,
    },
    snapshot: source.bossRushManifest,
  };
}

export type VersionedSeedGenerator<T> = (canonicalSeed: string, compatibility: SeededRunCompatibility) => T;

/** Route a saved seed through its recorded generator, never the current one. */
export function generateVersionedSeededContent<T>(
  canonicalSeed: string,
  compatibility: SeededRunCompatibility,
  generators: Readonly<Record<string, VersionedSeedGenerator<T>>>,
): T {
  const generator = generators[compatibility.generatorVersion];
  if (!generator) {
    throw new Error(`Unsupported ${compatibility.generatorId} generator version ${compatibility.generatorVersion}.`);
  }
  return generator(canonicalSeed, compatibility);
}

export function cloneSeededRunCompatibility<T>(
  compatibility?: SeededRunCompatibility<T>,
): SeededRunCompatibility<T> | undefined {
  if (!compatibility) {
    return;
  }
  return JSON.parse(JSON.stringify(compatibility)) as SeededRunCompatibility<T>;
}
