import {
  DAILY_ARCHIVE_STORAGE_KEYS,
  loadOfficialDailyArchive,
  moveDateCursor,
  parseDailyArchive,
  serializeSpecialDailyEntry,
} from "#system/daily-run/daily-run-archive";
import {
  canonicalSeedFromText,
  createCustomTextSeed,
  createOfflineDailySeed,
  getUtcDateKey,
} from "#system/daily-run/daily-run-seed-utils";
import {
  DAILY_SEED_HISTORY_STORAGE_KEY,
  MAX_DAILY_SEED_HISTORY_ENTRIES,
  readDailySeedHistory,
  recordDailySeedHistory,
} from "#system/daily-run/daily-run-history";
import {
  DAILY_SEED_KEYBOARD_ACTION_ROW,
  buildDailySeedKeyboardRows,
  DAILY_SEED_KEYBOARD_COLUMNS,
  moveDailySeedKeyboardCursor,
  nextDailySeedKeyboardPage,
} from "#system/daily-run/daily-run-keyboard-model";
import {
  clearDailyRunMetadata,
  commitPendingDailyRunLaunch,
  getCurrentDailyRunMetadata,
  getPendingDailyRunLaunch,
  getDailyRunSaveLabels,
  restoreDailyRunMetadata,
  setPendingDailyRunLaunch,
} from "#system/daily-run/daily-run-types";
import { afterEach, describe, expect, it, vi } from "vitest";

const sampleEntries = [
  { date: "2026-07-10", format: "seed", seed: "3rqGvBfbCXh8tIgmhUCSRA==" },
  {
    date: "2026-07-08",
    format: "daily-config",
    seed: "eeveepride26-10417",
    dailyConfig: {
      starters: [{ speciesId: 133, formIndex: 1, variant: 2, moveset: [735, 24, 343, 39], nature: 3 }],
      boss: { speciesId: 133, formIndex: 2, variant: 2, moveset: [741, 737, 740, 736], nature: 13, segments: 8 },
      biome: 1,
      luck: 14,
      startingMoney: 1330,
      forcedWaves: [{ waveIndex: 23, speciesId: 243 }],
      mysteryEncounters: [{ waveIndex: 13, type: 29 }],
      trainerManipulations: [{ waveIndex: 30, isTrainer: false }],
    },
  },
] as const;

function archive(entries: readonly unknown[] = sampleEntries): Record<string, unknown> {
  const dates = entries.map(entry => (entry as { date: string }).date).sort();
  return {
    schemaVersion: 1,
    latestDate: dates.at(-1),
    earliestDate: dates[0],
    entryCount: entries.length,
    entries,
  };
}

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

describe("Daily Run archive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__SILVERSHADOW_SWITCH_RUNTIME__;
  });

  it("parses schema 1, sorts newest first, and computes its real bounds", () => {
    const parsed = parseDailyArchive(archive([...sampleEntries].reverse()));
    expect(parsed.entries.map(entry => entry.date)).toEqual(["2026-07-10", "2026-07-08"]);
    expect(parsed.latestDate).toBe("2026-07-10");
    expect(parsed.earliestDate).toBe("2026-07-08");
    expect(parsed.entryCount).toBe(2);
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported schema", { ...archive(), schemaVersion: 2 }],
    ["invalid real date", archive([{ date: "2026-02-30", format: "seed", seed: "x" }])],
    [
      "duplicate date",
      { schemaVersion: 1, entries: [sampleEntries[0], { ...sampleEntries[0], seed: "different" }] },
    ],
    ["unknown format", archive([{ date: "2026-07-10", format: "other", seed: "x" }])],
    ["empty seed", archive([{ date: "2026-07-10", format: "seed", seed: "" }])],
    ["inconsistent count", { ...archive(), entryCount: 99 }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseDailyArchive(value)).toThrow();
  });

  it("preserves standard Base64 seed strings exactly", () => {
    expect(parseDailyArchive(archive()).entries[0].seed).toBe("3rqGvBfbCXh8tIgmhUCSRA==");
  });

  it("merges the outer seed into the complete July 8 special configuration", () => {
    const parsed = parseDailyArchive(archive());
    const special = parsed.entries[1];
    expect(special.format).toBe("daily-config");
    if (special.format !== "daily-config") {
      throw new Error("expected special entry");
    }
    const complete = JSON.parse(serializeSpecialDailyEntry(special));
    expect(complete.seed).toBe("eeveepride26-10417");
    expect(complete.starters[0]).toMatchObject({ speciesId: 133, formIndex: 1, variant: 2 });
    expect(complete.boss).toMatchObject({ speciesId: 133, formIndex: 2, segments: 8 });
    expect(complete.biome).toBe(1);
    expect(complete.forcedWaves).toEqual([{ waveIndex: 23, speciesId: 243 }]);
    expect(complete.mysteryEncounters).toEqual([{ waveIndex: 13, type: 29 }]);
    expect(complete.trainerManipulations).toEqual([{ waveIndex: 30, isTrainer: false }]);
  });

  it("rejects conflicting inner and outer special seeds", () => {
    expect(() =>
      parseDailyArchive(
        archive([
          {
            ...sampleEntries[1],
            dailyConfig: { ...sampleEntries[1].dailyConfig, seed: "different" },
          },
        ]),
      ),
    ).toThrow(/conflicting/);
  });

  it("keeps a valid cache when a remote response is invalid", async () => {
    const validCached = JSON.stringify({ downloadedAt: 1_700_000_000_000, archive: archive() });
    const storage = installStorage({ [DAILY_ARCHIVE_STORAGE_KEYS.current]: validCached });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>error</html>", { headers: { "content-type": "text/html" } })));
    await expect(loadOfficialDailyArchive()).resolves.toMatchObject({ source: "cached" });
    expect(storage.get(DAILY_ARCHIVE_STORAGE_KEYS.current)).toBe(validCached);
  });

  it("uses the embedded archive when no persistent cache exists", async () => {
    installStorage();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad"))
      .mockResolvedValueOnce(new Response(JSON.stringify(archive())));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadOfficialDailyArchive()).resolves.toMatchObject({ source: "built-in" });
  });

  it("never attempts the remote request on Switch", async () => {
    installStorage();
    (globalThis as Record<string, unknown>).__SILVERSHADOW_SWITCH_RUNTIME__ = true;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(archive())));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadOfficialDailyArchive()).resolves.toMatchObject({ source: "built-in" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/daily-seeds.json");
  });
});

describe("Daily Run date navigation", () => {
  it("moves Up and Down one item and clamps", () => {
    expect(moveDateCursor(3, -1, 1, 10)).toBe(2);
    expect(moveDateCursor(3, 1, 1, 10)).toBe(4);
    expect(moveDateCursor(0, -1, 1, 10)).toBe(0);
    expect(moveDateCursor(9, 1, 1, 10)).toBe(9);
  });

  it("moves six rows per page with one-row overlap and clamps at boundaries", () => {
    expect(moveDateCursor(0, 1, 6, 103)).toBe(6);
    expect(moveDateCursor(7, 1, 6, 103)).toBe(13);
    expect(moveDateCursor(100, 1, 6, 103)).toBe(102);
  });
});

describe("Daily Run seed algorithms", () => {
  it("matches the SHA-256 first-16-bytes standard Base64 reference vector", () => {
    expect(canonicalSeedFromText("abc")).toBe("ungWv48Bz+pBQUDeXa4iIw==");
  });

  it("uses UTC dates and is deterministic across installations and timezones", () => {
    const instant = new Date("2026-08-05T00:30:00+09:00");
    expect(getUtcDateKey(instant)).toBe("2026-08-04");
    expect(createOfflineDailySeed(instant)).toBe(createOfflineDailySeed(new Date("2026-08-04T23:59:59Z")));
    expect(createOfflineDailySeed(new Date("2026-08-04T23:59:59Z"))).not.toBe(
      createOfflineDailySeed(new Date("2026-08-05T00:00:00Z")),
    );
  });

  it("distinguishes text, capitalization, punctuation, and internal spaces", () => {
    expect(createCustomTextSeed("ABCDEFG").canonicalSeed).not.toBe(createCustomTextSeed("ABCDEF").canonicalSeed);
    expect(createCustomTextSeed("SilverShadow").canonicalSeed).not.toBe(
      createCustomTextSeed("silvershadow").canonicalSeed,
    );
    expect(createCustomTextSeed("Philip's Run 123!").friendlyText).toBe("Philip's Run 123!");
    expect(createCustomTextSeed("  ABCDEFG  ")).toEqual(createCustomTextSeed("ABCDEFG"));
  });

});

describe("Daily Run Text Seed keyboard", () => {
  it("uses a nine-column naming-screen grid with three pages and only canonical-seed symbols", () => {
    expect(DAILY_SEED_KEYBOARD_COLUMNS).toBe(9);
    const characters = ["lowercase", "uppercase", "numbersSymbols"]
      .flatMap(page => buildDailySeedKeyboardRows(page as "lowercase" | "uppercase" | "numbersSymbols"))
      .flatMap(row => row)
      .filter(key => key.kind === "character")
      .map(key => key.value);
    expect(characters.join("")).toBe("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=");
  });

  it("keeps the page switcher, DEL, CLR, and OK in a fixed bottom row", () => {
    for (const page of ["lowercase", "uppercase", "numbersSymbols"] as const) {
      const rows = buildDailySeedKeyboardRows(page);
      expect(rows).toHaveLength(DAILY_SEED_KEYBOARD_ACTION_ROW + 1);
      expect(rows[DAILY_SEED_KEYBOARD_ACTION_ROW].map(key => key.kind === "action" ? key.action : null)).toEqual([
        "page", null, "backspace", null, "clear", null, null, null, "confirm",
      ]);
    }
  });

  it("supports four-direction cursor movement, skips spacers, and cycles three pages", () => {
    const rows = buildDailySeedKeyboardRows("lowercase");
    expect(moveDailySeedKeyboardCursor(rows, { row: 0, column: 0 }, "right")).toEqual({ row: 0, column: 1 });
    expect(moveDailySeedKeyboardCursor(rows, { row: 0, column: 0 }, "left")).toEqual({ row: 0, column: 8 });
    expect(moveDailySeedKeyboardCursor(rows, { row: 0, column: 8 }, "down")).toEqual({ row: 1, column: 8 });
    expect(moveDailySeedKeyboardCursor(rows, { row: 2, column: 7 }, "right")).toEqual({ row: 2, column: 0 });
    expect(moveDailySeedKeyboardCursor(rows, { row: DAILY_SEED_KEYBOARD_ACTION_ROW, column: 0 }, "left")).toEqual({
      row: DAILY_SEED_KEYBOARD_ACTION_ROW,
      column: 8,
    });
    expect(nextDailySeedKeyboardPage("lowercase")).toBe("uppercase");
    expect(nextDailySeedKeyboardPage("lowercase", -1)).toBe("numbersSymbols");
  });
});

describe("Previous Seed history", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stores every seeded Daily mode as newest-first run events", () => {
    const storage = installStorage();
    recordDailySeedHistory({
      mode: "official",
      canonicalSeed: "official",
      selectedDate: "2026-08-05",
      archiveSource: "cached",
      specialDailyConfig: true,
      serializedDailyConfig: '{"seed":"official"}',
    }, 50);
    recordDailySeedHistory({ mode: "previous", canonicalSeed: "previous" });
    recordDailySeedHistory({ mode: "random", canonicalSeed: "random" }, 100);
    recordDailySeedHistory({ mode: "offline", canonicalSeed: "offline", selectedDate: "2026-08-05" }, 200);
    recordDailySeedHistory({ mode: "custom-text", canonicalSeed: "text", friendlyTextSeed: "Monday" }, 300);
    recordDailySeedHistory({ mode: "boss-rush", canonicalSeed: "boss-rush" }, 400);
    expect(JSON.parse(storage.get(DAILY_SEED_HISTORY_STORAGE_KEY) ?? "[]")).toHaveLength(5);
    expect(readDailySeedHistory().map(entry => entry.canonicalSeed)).toEqual([
      "boss-rush",
      "text",
      "offline",
      "random",
      "official",
    ]);
    expect(readDailySeedHistory()[4]).toMatchObject({
      archiveSource: "cached",
      specialDailyConfig: true,
      serializedDailyConfig: '{"seed":"official"}',
    });
  });

  it("retains repeated runs as distinct events and caps newest-first history at 1,000", () => {
    const stored = Array.from({ length: MAX_DAILY_SEED_HISTORY_ENTRIES + 5 }, (_, index) => ({
      canonicalSeed: `seed-${index}`,
      mode: "random",
      usedAt: index + 1,
      useCount: 1,
    }));
    installStorage({ [DAILY_SEED_HISTORY_STORAGE_KEY]: JSON.stringify(stored) });
    expect(readDailySeedHistory()).toHaveLength(1000);
    expect(readDailySeedHistory()[0].canonicalSeed).toBe("seed-1004");
    recordDailySeedHistory({ mode: "random", canonicalSeed: "seed-1004" }, 2000);
    expect(readDailySeedHistory()[0]).toMatchObject({ canonicalSeed: "seed-1004", usedAt: 2000, useCount: 1 });
    expect(readDailySeedHistory().filter(entry => entry.canonicalSeed === "seed-1004")).toHaveLength(2);
    expect(readDailySeedHistory()).toHaveLength(1000);
  });
});

describe("Daily Run save labels", () => {
  it("uses compact source-specific labels and preserves the original source on replay", () => {
    expect(getDailyRunSaveLabels({ mode: "official", canonicalSeed: "a" })).toEqual({
      short: "Official",
      long: "Official Daily Run",
    });
    expect(getDailyRunSaveLabels({ mode: "offline", canonicalSeed: "b" }).long).toBe("Offline Daily Run");
    expect(getDailyRunSaveLabels({ mode: "random", canonicalSeed: "c" })).toEqual({
      short: "Random",
      long: "Random Run",
    });
    expect(getDailyRunSaveLabels({ mode: "custom-text", canonicalSeed: "d" })).toEqual({
      short: "Text",
      long: "Text Run",
    });
    expect(getDailyRunSaveLabels({ mode: "boss-rush", canonicalSeed: "e" })).toEqual({
      short: "Boss Rush",
      long: "Boss Rush Mode",
    });
  });
});

describe("Daily Run pending launch and resume metadata", () => {
  afterEach(clearDailyRunMetadata);

  it("holds one generated seed unchanged through save-slot selection", () => {
    const request = {
      seedOrConfig: "k5exW8qrITeVWzIKS+3FFg==",
      metadata: { mode: "random" as const, canonicalSeed: "k5exW8qrITeVWzIKS+3FFg==" },
    };
    setPendingDailyRunLaunch(request);
    expect(getPendingDailyRunLaunch()).toEqual(request);
    expect(getPendingDailyRunLaunch()).toEqual(request);
    expect(commitPendingDailyRunLaunch()).toEqual(request);
    expect(getCurrentDailyRunMetadata()).toEqual(request.metadata);
  });

  it("restores historical metadata instead of regenerating from current time", () => {
    const metadata = {
      mode: "offline" as const,
      canonicalSeed: "old-seed",
      selectedDate: "2026-08-04",
      algorithmVersion: "SilverShadow-Daily-v1",
    };
    restoreDailyRunMetadata(metadata);
    expect(getCurrentDailyRunMetadata()).toEqual(metadata);
  });
});
