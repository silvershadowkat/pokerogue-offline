#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDailyArchive } from "./daily-run-archive-core.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedPath = process.argv[2] ?? path.join("pokerogue-src", "dist", "daily-seeds.json");
const archivePath = path.resolve(repositoryRoot, requestedPath);
const archive = validateDailyArchive(await readFile(archivePath, "utf8"));

console.log(
  `Validated embedded Daily archive: ${archivePath} (${archive.entryCount} entries, ${archive.earliestDate} to ${archive.latestDate}).`,
);
